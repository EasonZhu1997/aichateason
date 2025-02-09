'use client'

import { useState, useRef, useLayoutEffect, useEffect } from 'react';
import { Message, streamChat } from '@/services/chat';
import { Card } from '@/components/ui/card';
import { UserCircle, Bot, Trash2 } from 'lucide-react';

const MODELS = [
  {
    id: 'deepseek-chat',
    name: '原生-DeepSeek-Chat',
    useDeepseekAPI: true
  },
  {
    id: 'deepseek-ai/DeepSeek-V3',
    name: '硅基流动-DeepSeek-V3'
  },
  {
    id: 'deepseek-ai/DeepSeek-R1',
    name: '硅基流动-DeepSeek-R1'
  },
  {
    id: 'Qwen/Qwen2.5-Coder-7B-Instruct',
    name: '硅基流动-Qwen2.5-Coder'
  }
] as const;

const SYSTEM_MESSAGE: Message = {
  role: 'system',
  content: '你是一个有帮助的AI助理。请始终使用中文回复。保持友好和专业的态度。'
};

const WELCOME_MESSAGE: Omit<Message, 'timestamp'> = {
  role: 'assistant',
  content: '你好！我是AI助理。我可以帮你回答问题、编写代码、解决问题等。请告诉我你需要什么帮助？'
};

// 添加常量定义
const STORAGE_KEY = 'chat_history';
const MAX_STORED_MESSAGES = 100;

// 添加类型验证函数
const isValidMessageRole = (role: string): role is Message['role'] => {
  return ['assistant', 'system', 'user'].includes(role);
};

const isValidMessage = (message: any): message is Message => {
  return (
    typeof message === 'object' &&
    message !== null &&
    typeof message.content === 'string' &&
    typeof message.role === 'string' &&
    isValidMessageRole(message.role) &&
    (!message.timestamp || typeof message.timestamp === 'string')
  );
};

export function ChatComponent() {
  const [mounted, setMounted] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [selectedModel, setSelectedModel] = useState<string>(MODELS[0].id);
  const [currentResponse, setCurrentResponse] = useState<string>('');
  const [fullResponse, setFullResponse] = useState<string>('');
  const [currentMessage, setCurrentMessage] = useState<Message | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingSpeedRef = useRef<ReturnType<typeof setInterval>>(null);

  // 修改初始化逻辑
  useLayoutEffect(() => {
    setMounted(true);
    
    try {
      const storedMessages = localStorage.getItem(STORAGE_KEY);
      if (storedMessages) {
        const parsedData = JSON.parse(storedMessages);
        // 验证并过滤消息
        if (Array.isArray(parsedData)) {
          const validMessages = parsedData.filter(isValidMessage);
          setMessages(validMessages);
        } else {
          throw new Error('Invalid stored messages format');
        }
      } else {
        setMessages([{
          ...WELCOME_MESSAGE,
          timestamp: new Date().toLocaleTimeString()
        } as Message]);
      }
    } catch (error) {
      console.error('Failed to load chat history:', error);
      setMessages([{
        ...WELCOME_MESSAGE,
        timestamp: new Date().toLocaleTimeString()
      } as Message]);
    }
  }, []);

  // 添加消息变化监听
  useEffect(() => {
    if (messages.length > 0) {
      try {
        // 如果消息数量超过限制,只保存最新的消息
        const messagesToStore = messages.slice(-MAX_STORED_MESSAGES);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(messagesToStore));
      } catch (error) {
        console.error('Failed to save chat history:', error);
      }
    }
  }, [messages]);

  // 滚动到底部，添加偏移量
  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      const container = messagesEndRef.current.parentElement;
      if (container) {
        container.scrollTop = 0; // 重置滚动位置
      }
    }
  };

  // 清理effect
  useEffect(() => {
    return () => {
      if (typingSpeedRef.current) {
        clearInterval(typingSpeedRef.current);
      }
    };
  }, []);

  // 打字机效果函数
  const typewriterEffect = (text: string, newMessages: Message[]) => {
    let index = 0;
    
    if (typingSpeedRef.current) {
      clearInterval(typingSpeedRef.current);
    }

    typingSpeedRef.current = setInterval(() => {
      if (index < text.length) {
        setCurrentResponse(text.slice(0, index + 1));
        setCurrentMessage({
          role: 'assistant' as const,
          content: text.slice(0, index + 1),
          timestamp: new Date().toLocaleTimeString()
        });
        index++;
      } else {
        if (typingSpeedRef.current) {
          clearInterval(typingSpeedRef.current);
          typingSpeedRef.current = null;
        }
        
        setMessages([
          ...newMessages,
          {
            role: 'assistant' as const,
            content: text,
            timestamp: new Date().toLocaleTimeString()
          }
        ]);
        setCurrentMessage(null);
        setCurrentResponse('');
      }
    }, 10);
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const newMessages = [
      ...messages,
      { 
        role: 'user' as const,
        content: input,
        timestamp: new Date().toLocaleTimeString() 
      }
    ];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);
    setError(null);
    
    // 显示加载状态
    setCurrentMessage({
      role: 'assistant' as const,
      content: '•••',
      timestamp: new Date().toLocaleTimeString(),
      loading: true
    });

    try {
      let fullText = '';
      const messagesWithSystem = [SYSTEM_MESSAGE, ...newMessages];
      
      // 收集完整响应
      for await (const chunk of streamChat(messagesWithSystem, selectedModel)) {
        fullText += chunk;
        setFullResponse(fullText); // 保存完整响应
      }

      // 收集完所有响应后,开始打字机效果
      typewriterEffect(fullText, newMessages);

    } catch (err) {
      // 错误处理
      setCurrentMessage(null);
      setFullResponse('');
      setMessages([
        ...newMessages,
        {
          role: 'assistant' as const,
          content: '抱歉,我现在有点累了,请稍后再试...',
          timestamp: new Date().toLocaleTimeString()
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  // 修改清除聊天的函数
  const handleClearChat = () => {
    if (window.confirm('确定要清除所有聊天记录吗？')) {
      setMessages([{
        ...WELCOME_MESSAGE,
        timestamp: new Date().toLocaleTimeString()
      }]);
      setCurrentMessage(null);
      setError(null);
      setStatus('聊天已清除');
      
      // 清除localStorage中的聊天记录
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (error) {
        console.error('Failed to clear chat history:', error);
      }
      
      setTimeout(() => setStatus(''), 2000);
    }
  };

  if (!mounted) return null;

  return (
    <div className="flex flex-col w-full h-screen bg-white dark:bg-gray-800" suppressHydrationWarning>
      {/* 顶部工具栏 */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-2 border-b 
                      dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
        <div className="flex items-center gap-4">
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            disabled={isLoading}
            className="w-48 p-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent 
                       bg-white dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200"
          >
            {MODELS.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name}
              </option>
            ))}
          </select>
          
          <button
            onClick={handleClearChat}
            disabled={isLoading || messages.length <= 1}
            className="p-2 text-gray-500 hover:text-red-500 disabled:opacity-50 
                       disabled:cursor-not-allowed transition-colors duration-200
                       dark:text-gray-400 dark:hover:text-red-400"
            title="清除聊天记录"
          >
            <Trash2 size={20} />
          </button>
        </div>
      </div>
      
      {/* 主要内容区域 - 使用 flex-1 和 min-h-0 确保正确滚动 */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="w-full max-w-3xl mx-auto px-4 py-4 space-y-6">
          {/* 当没有消息时显示欢迎提示 */}
          {messages.length === 0 && (
            <div className="text-center text-gray-500 dark:text-gray-400 py-8">
              开始新的对话...
            </div>
          )}
          
          {/* 消息列表 */}
          {messages.map((message, i) => (
            <div key={i} className={`flex items-start gap-3 ${
              message.role === 'user' ? 'justify-end' : 'justify-start'
            }`}>
              {message.role !== 'user' && (
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center">
                  <Bot size={20} />
                </div>
              )}
              <div className={`flex-1 max-w-[80%] ${message.role === 'user' ? 'ml-12' : 'mr-12'}`}>
                <Card className={`p-4 shadow-sm ${
                  message.role === 'user' 
                    ? 'bg-blue-500 text-white dark:bg-blue-600' 
                    : 'bg-gray-100 dark:bg-gray-700 dark:text-gray-200'
                }`}>
                  <div className="flex flex-col">
                    <p className="whitespace-pre-wrap">{message.content}</p>
                    <span className={`text-xs mt-2 ${
                      message.role === 'user' 
                        ? 'text-blue-100 dark:text-blue-200' 
                        : 'text-gray-500 dark:text-gray-400'
                    }`}>
                      {message.timestamp}
                    </span>
                  </div>
                </Card>
              </div>
              {message.role === 'user' && (
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center">
                  <UserCircle size={20} className="text-gray-600 dark:text-gray-300" />
                </div>
              )}
            </div>
          ))}
          
          {/* 当前正在输入的消息 */}
          {currentMessage && (
            <div className="flex items-start gap-3 justify-start">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center">
                <Bot size={20} />
              </div>
              <div className="flex-1 max-w-[80%] mr-12">
                <Card className="p-4 shadow-sm bg-gray-100 dark:bg-gray-700 dark:text-gray-200">
                  <div className="flex flex-col">
                    {currentMessage.loading ? (
                      <div className="flex items-center space-x-1">
                        <span className="animate-bounce">•</span>
                        <span className="animate-bounce delay-100">•</span>
                        <span className="animate-bounce delay-200">•</span>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap">{currentMessage.content}</p>
                    )}
                    <span className="text-xs mt-2 text-gray-500 dark:text-gray-400">
                      {currentMessage.timestamp}
                    </span>
                  </div>
                </Card>
              </div>
            </div>
          )}
          
          {/* 滚动锚点 */}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* 底部区域 - 使用固定定位 */}
      <div className="sticky bottom-0 left-0 right-0 border-t dark:border-gray-700 bg-white dark:bg-gray-800">
        {/* 输入区域 */}
        <div className="w-full max-w-3xl mx-auto px-4 py-2">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isLoading ? "AI正在思考中..." : "输入消息..."}
              disabled={isLoading}
              className="flex-1 p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent
                         bg-white dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200
                         placeholder-gray-400 dark:placeholder-gray-500"
            />
            <button 
              type="submit"
              disabled={isLoading}
              className="px-4 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 
                         disabled:opacity-50 disabled:cursor-not-allowed
                         transition-colors duration-200
                         dark:bg-blue-600 dark:hover:bg-blue-700
                         whitespace-nowrap"
            >
              {isLoading ? '等待回复...' : '发送'}
            </button>
          </form>
        </div>

        {/* 状态栏 */}
        <div className="w-full max-w-3xl mx-auto px-4">
          <div className="text-center text-xs text-gray-500 dark:text-gray-400 py-1">
            {MODELS.find(m => m.id === selectedModel)?.name}
            {isLoading && (
              <span className="ml-2">• AI正在思考中...</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// 导出重命名的组件
export { ChatComponent as Chat }; 