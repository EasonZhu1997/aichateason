'use client'

import { useState, useRef, useLayoutEffect, useEffect } from 'react';
import { Message, MessageContent, isContentString, streamChat } from '@/services/chat';
import { Card } from '@/components/ui/card';
import { UserCircle, Bot, Upload, X, Image as ImageIcon } from 'lucide-react';
import { MessageBubble } from './message-bubble';

const MODELS = [
  {
    id: 'coze',
    name: 'Coze Bot',
    useCozeAPI: true
  }
] as const;

const SYSTEM_MESSAGE = {
  id: 'system-message',
  role: 'system' as const,
  content: '你是一个有帮助的AI助理。请始终使用中文回复。保持友好和专业的态度。',
  timestamp: new Date().toLocaleTimeString()
} satisfies Message;

const WELCOME_MESSAGE: Omit<Message, 'timestamp' | 'id'> = {
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

// 添加生成唯一ID的函数
const generateMessageId = () => {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
};

// 创建带id的欢迎消息的辅助函数
const createWelcomeMessage = () => ({
  ...WELCOME_MESSAGE,
  id: generateMessageId(),
  timestamp: new Date().toLocaleTimeString()
});

export function ChatComponent() {
  const [mounted, setMounted] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [selectedModel, setSelectedModel] = useState<typeof MODELS[number]['id']>('coze');
  const [currentResponse, setCurrentResponse] = useState<string>('');
  const [fullResponse, setFullResponse] = useState<string>('');
  const [currentMessage, setCurrentMessage] = useState<Message | null>(null);
  const [regeneratingMessageId, setRegeneratingMessageId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingSpeedRef = useRef<ReturnType<typeof setInterval>>(null);
  const [uploadedImages, setUploadedImages] = useState<Array<{url: string, name: string}>>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 修改初始化逻辑
  useLayoutEffect(() => {
    setMounted(true);
    
    try {
      const storedMessages = localStorage.getItem(STORAGE_KEY);
      if (storedMessages) {
        const parsedData = JSON.parse(storedMessages);
        if (Array.isArray(parsedData)) {
          const validMessages = parsedData.filter(isValidMessage);
          setMessages(validMessages);
        } else {
          throw new Error('Invalid stored messages format');
        }
      } else {
        setMessages([createWelcomeMessage()]);
      }
    } catch (error) {
      console.error('Failed to load chat history:', error);
      setMessages([createWelcomeMessage()]);
    }
  }, []);

  // 添加消息变化监听
  useEffect(() => {
    if (messages.length > 0) {
      try {
        // 如果消息数量超过限制,只保存最新的消息
        const messagesToStore = messages.slice(-MAX_STORED_MESSAGES);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(messagesToStore));
        
        // 添加接近限制的提示
        if (messages.length > MAX_STORED_MESSAGES * 0.8 && messages.length <= MAX_STORED_MESSAGES) {
          setStatus('提示：聊天记录接近上限，较早的消息将被自动清除');
          setTimeout(() => setStatus(''), 3000);
        }
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
        const partialMessage = {
          id: generateMessageId(), // 添加唯一id
          role: 'assistant' as const,
          content: text.slice(0, index + 1),
          timestamp: new Date().toLocaleTimeString()
        };
        setCurrentResponse(text.slice(0, index + 1));
        setCurrentMessage(partialMessage);
        index++;
      } else {
        if (typingSpeedRef.current) {
          clearInterval(typingSpeedRef.current);
          typingSpeedRef.current = null;
        }
        
        setMessages(prevMessages => {
          // 检查是否已经存在相同内容的消息
          const isDuplicate = prevMessages.some(m => 
            m.role === 'assistant' && m.content === text
          );
          if (isDuplicate) return prevMessages;
          
          return [
            ...newMessages,
            {
              id: generateMessageId(),
              role: 'assistant' as const,
              content: text,
              timestamp: new Date().toLocaleTimeString()
            }
          ];
        });
        setCurrentMessage(null);
        setCurrentResponse('');
      }
    }, 10);
  };

  // 修改重新生成的处理方式
  const handleRegenerate = async (messageId: string) => {
    if (isGenerating) return;
    
    // 找到要重新生成的消息及其之前的所有消息
    const messageIndex = messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) return;
    
    const previousMessages = messages.slice(0, messageIndex);
    
    // 设置重新生成状态
    setRegeneratingMessageId(messageId);
    setIsGenerating(true);
    setError(null);
    
    // 保存原始消息用于恢复
    const originalMessage = messages[messageIndex];
    
    // 创建新的 AbortController
    abortControllerRef.current = new AbortController();
    
    try {
      let fullText = '';
      // 包含系统消息
      const messagesWithSystem = [SYSTEM_MESSAGE, ...previousMessages];
      
      // 使用 streamChat 函数
      for await (const chunk of streamChat(messagesWithSystem, selectedModel, abortControllerRef.current.signal)) {
        if (!abortControllerRef.current) break; // 检查是否已中断
        fullText += chunk;
      }

      // 只在生成完成后更新消息内容
      if (abortControllerRef.current) {
        setMessages(prev => {
          const updated = [...prev];
          const msgIndex = updated.findIndex(m => m.id === messageId);
          if (msgIndex !== -1) {
            updated[msgIndex] = {
              ...originalMessage,
              content: fullText
            };
          }
          return updated;
        });
      }

    } catch (error: unknown) {
      if (error instanceof Error) {
        if (error.name !== 'AbortError') {
          console.error('Error regenerating message:', error);
          setError('Failed to regenerate message');
          // 恢复原始消息
          setMessages(prev => {
            const updated = [...prev];
            const msgIndex = updated.findIndex(m => m.id === messageId);
            if (msgIndex !== -1) {
              updated[msgIndex] = originalMessage;
            }
            return updated;
          });
        }
      }
    } finally {
      setIsGenerating(false);
      setRegeneratingMessageId(null);
      abortControllerRef.current = null;
    }
  };

  // 修改停止生成的处理函数
  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsGenerating(false);
      setCurrentMessage(null); // 移到外面,确保总是清除
      
      // 如果是重新生成,则清除重新生成状态
      if (regeneratingMessageId) {
        setRegeneratingMessageId(null);
      }
    }
  };

  // 添加图片上传处理函数
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    
    const file = e.target.files[0];
    setUploadError(null);
    
    // 创建FormData
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        setUploadError(data.error || '上传失败');
        return;
      }
      
      setUploadedImages(prev => [...prev, {
        url: data.fileUrl,
        name: data.fileName
      }]);
    } catch (error) {
      console.error('图片上传错误:', error);
      setUploadError('上传失败，请稍后重试');
    }
    
    // 清空文件输入，允许再次上传同一文件
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  
  // 移除已上传的图片
  const removeImage = (index: number) => {
    setUploadedImages(prev => prev.filter((_, i) => i !== index));
  };
  
  // 触发文件选择
  const triggerFileUpload = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // 修改处理提交的函数，支持发送图片
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if ((isGenerating) || (!input.trim() && uploadedImages.length === 0)) return;

    // 准备消息内容
    let messageContent: string | MessageContent[] = input.trim();
    
    // 如果有图片，创建多模态内容
    if (uploadedImages.length > 0) {
      messageContent = [] as MessageContent[];
      
      // 添加文本（如果有）
      if (input.trim()) {
        (messageContent as MessageContent[]).push({
          type: 'text',
          text: input.trim()
        });
      }
      
      // 添加图片
      uploadedImages.forEach(img => {
        (messageContent as MessageContent[]).push({
          type: 'image',
          url: img.url,
          alt: img.name
        });
      });
    }

    const newMessages = [
      ...messages,
      { 
        id: generateMessageId(),
        role: 'user' as const,
        content: messageContent,
        timestamp: new Date().toLocaleTimeString() 
      }
    ];
    
    setMessages(newMessages);
    setInput('');
    setUploadedImages([]);
    setIsGenerating(true);
    setError(null);

    // 创建一个带有加载状态的消息
    setCurrentMessage({
      id: generateMessageId(),
      role: 'assistant',
      content: '',
      loading: true,
      timestamp: new Date().toLocaleTimeString()
    });

    // 创建新的 AbortController
    abortControllerRef.current = new AbortController();
    
    try {
      let fullText = '';
      const messagesWithSystem = [SYSTEM_MESSAGE, ...newMessages];
      
      for await (const chunk of streamChat(messagesWithSystem, selectedModel, abortControllerRef.current.signal)) {
        if (!abortControllerRef.current) break; // 检查是否已中断
        fullText += chunk;
        setFullResponse(fullText);
      }

      if (abortControllerRef.current) { // 只有在未中断时才更新消息
        typewriterEffect(fullText, newMessages);
      }

    } catch (error: unknown) {
      if (error instanceof Error) {
        if (error.name !== 'AbortError') {
          setCurrentMessage(null);
          setFullResponse('');
          setMessages([
            ...newMessages,
            {
              id: generateMessageId(),
              role: 'assistant' as const,
              content: '抱歉,我现在有点累了,请稍后再试...',
              timestamp: new Date().toLocaleTimeString()
            }
          ]);
        }
      }
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  }

  // 修改清除聊天的函数
  const handleClearChat = () => {
    if (window.confirm('确定要清除所有聊天记录吗？')) {
      setMessages([createWelcomeMessage()]);
      setCurrentMessage(null);
      setError(null);
      setStatus('聊天已清除');
      
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (error) {
        console.error('Failed to clear chat history:', error);
      }
      
      setTimeout(() => setStatus(''), 2000);
    }
  };

  // 在 ChatComponent 中添加删除消息的处理函数
  const handleDeleteMessage = (index: number) => {
    setMessages(messages.filter((_, i) => i !== index));
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
            onChange={(e) => setSelectedModel(e.target.value as typeof MODELS[number]['id'])}
            disabled={isGenerating}
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
            disabled={isGenerating || messages.length <= 1}
            className="px-3 py-1.5 text-sm text-white bg-red-500 hover:bg-red-600 
                       disabled:opacity-50 disabled:cursor-not-allowed 
                       transition-colors duration-200
                       dark:bg-red-600 dark:hover:bg-red-700
                       rounded"
            title="清除聊天记录"
          >
            重新聊天
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
                <MessageBubble 
                  message={message}
                  onRegenerate={() => {
                    setRegeneratingMessageId(message.id);
                    handleRegenerate(message.id);
                  }}
                  onDelete={() => {
                    if (window.confirm('确定要删除这条消息吗？')) {
                      handleDeleteMessage(i);
                    }
                  }}
                  isRegenerating={regeneratingMessageId === message.id}
                />
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
        {/* 上传错误提示 */}
        {uploadError && (
          <div className="w-full max-w-3xl mx-auto px-4 py-1">
            <div className="text-red-500 text-sm">{uploadError}</div>
          </div>
        )}
        
        {/* 上传图片预览区域 */}
        {uploadedImages.length > 0 && (
          <div className="w-full max-w-3xl mx-auto px-4 py-2">
            <div className="flex flex-wrap gap-2">
              {uploadedImages.map((img, index) => (
                <div key={index} className="relative">
                  <img 
                    src={img.url} 
                    alt={img.name} 
                    className="h-20 w-20 object-cover rounded border border-gray-300 dark:border-gray-600" 
                  />
                  <button 
                    onClick={() => removeImage(index)}
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1"
                    title="移除图片"
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* 输入区域 */}
        <div className="w-full max-w-3xl mx-auto px-4 py-2">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <div className="flex-1 flex border rounded-lg 
                          bg-white dark:bg-gray-800 dark:border-gray-600
                          focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={isGenerating ? "AI正在思考中..." : "输入消息..."}
                disabled={isGenerating}
                className="flex-1 p-3 rounded-lg
                         bg-white dark:bg-gray-800 dark:text-gray-200
                         placeholder-gray-400 dark:placeholder-gray-500
                         border-0 focus:ring-0"
              />
              <input 
                type="file" 
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="hidden"
              />
              <button
                type="button"
                onClick={triggerFileUpload}
                disabled={isGenerating}
                className="p-3 text-gray-500 hover:text-blue-500 dark:text-gray-400 dark:hover:text-blue-400"
                title="上传图片"
              >
                <ImageIcon size={20} />
              </button>
            </div>
            
            {isGenerating ? (
              <button
                type="button"
                onClick={handleStopGeneration}
                className="px-4 py-3 bg-red-500 text-white rounded-lg hover:bg-red-600 
                          transition-colors duration-200
                          dark:bg-red-600 dark:hover:bg-red-700
                          whitespace-nowrap"
              >
                停止生成
              </button>
            ) : (
              <button 
                type="submit"
                disabled={!input.trim() && uploadedImages.length === 0}
                className="px-4 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 
                          disabled:opacity-50 disabled:cursor-not-allowed
                          transition-colors duration-200
                          dark:bg-blue-600 dark:hover:bg-blue-700
                          whitespace-nowrap"
              >
                发送
              </button>
            )}
          </form>
        </div>
        
        {/* 状态栏 */}
        <div className="w-full max-w-3xl mx-auto px-4">
          <div className="text-center text-xs text-gray-500 dark:text-gray-400 py-1">
            {MODELS.find(m => m.id === selectedModel)?.name}
            {isGenerating && (
              <span className="ml-2">• AI正在思考中...</span>
            )}
            <span className="ml-2">
              • 消息记录: {messages.length}/{MAX_STORED_MESSAGES}
              {messages.length > MAX_STORED_MESSAGES * 0.8 && (
                <span className="text-yellow-500 ml-1">
                  (接近上限，将自动清除较早消息)
                </span>
              )}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// 导出重命名的组件
export { ChatComponent as Chat }; 