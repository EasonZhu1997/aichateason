'use client'

import { useState, useRef, useLayoutEffect, useEffect } from 'react';
import { Message, MessageContent, isContentString, streamChat } from '@/services/chat';
import { Card } from '@/components/ui/card';
import { UserCircle, Bot, Upload, X, Image as ImageIcon } from 'lucide-react';
import { MessageBubble } from './message-bubble';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
// 添加数学公式支持
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import Link from 'next/link';

// 添加KaTeX相关的CSS样式
const globalStyles = `
  /* KaTeX数学公式相关样式 */
  .katex-display {
    overflow-x: auto;
    overflow-y: hidden;
    padding: 0.5rem 0;
  }
  
  .katex {
    font-size: 1.1em;
  }
  
  /* 移除了所有与math相关的样式 */
`;

const MODELS = [
  {
    id: 'coze',
    name: '分掌门AI答疑老师',
    useCozeAPI: true
  }
] as const;

const SYSTEM_MESSAGE = {
  id: 'system-message',
  role: 'system' as const,
  content: '你是一个分掌门的AI答疑老师，可以帮助学生回答问题，请始终使用中文回复。保持热心、友好和专业的态度。',
  timestamp: new Date().toLocaleTimeString()
} satisfies Message;

const WELCOME_MESSAGE: Omit<Message, 'timestamp' | 'id'> = {
  role: 'assistant',
  content: '你好！我是分掌门AI答疑老师。我可以帮你解决问题等。请告诉我你需要什么帮助？'
};

// 添加常量定义
const STORAGE_KEY = 'chat_history';
const MAX_STORED_MESSAGES = 100;

// 添加类型验证函数
const isValidMessageRole = (role: string): role is Message['role'] => {
  return ['assistant', 'system', 'user'].includes(role);
};

// 判断两条消息内容是否相同
const isSameMessageContent = (content1: string | MessageContent[], content2: string | MessageContent[]): boolean => {
  // 如果两者都是字符串，直接比较
  if (typeof content1 === 'string' && typeof content2 === 'string') {
    return content1 === content2;
  }
  
  // 如果两者都是数组，比较JSON字符串
  if (Array.isArray(content1) && Array.isArray(content2)) {
    return JSON.stringify(content1) === JSON.stringify(content2);
  }
  
  // 一个是字符串，一个是数组，不相同
  return false;
};

// 判断两条消息是否相同（基于角色和内容）
const isSameMessage = (msg1: Message, msg2: Message): boolean => {
  return msg1.role === msg2.role && isSameMessageContent(msg1.content, msg2.content);
};

// 检查消息是否已存在于消息数组中
const messageExistsInArray = (messages: Message[], messageToCheck: Message): boolean => {
  return messages.some(msg => isSameMessage(msg, messageToCheck));
};

// 修改消息验证函数，支持多模态内容
const isValidMessage = (message: any): message is Message => {
  return (
    typeof message === 'object' &&
    message !== null &&
    (typeof message.content === 'string' || Array.isArray(message.content)) &&
    typeof message.role === 'string' &&
    isValidMessageRole(message.role) &&
    (!message.timestamp || typeof message.timestamp === 'string') &&
    typeof message.id === 'string'
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

// 添加预处理函数，将文本中的各种数学表达式转换为标准LaTeX格式
const preprocessMathExpressions = (text: string): string => {
  let processedText = text;
  
  // 处理通用的数学符号
  
  // 处理分数表示法: (a:b) 或 (a/b)
  processedText = processedText.replace(/\((\d+):(\d+)\)/g, '$\\frac{$1}{$2}$');
  processedText = processedText.replace(/\((\d+)\/(\d+)\)/g, '$\\frac{$1}{$2}$');
  
  // 处理\frac表达式，确保它们被$包围
  processedText = processedText.replace(/\(\(\\frac\{([^{}]+)\}\{([^{}]+)\}\)\)/g, '$\\frac{$1}{$2}$');
  processedText = processedText.replace(/\(\\frac\{([^{}]+)\}\{([^{}]+)\}\)/g, '$\\frac{$1}{$2}$');
  
  // 处理已有的\frac表达式，但没有被$包围的情况
  processedText = processedText.replace(/(^|[^$])\\frac\{([^{}]+)\}\{([^{}]+)\}([^$]|$)/g, (match, before, p1, p2, after) => {
    // 检查是不是已经被$包围了
    if (before.endsWith('$') && after.startsWith('$')) {
      return match; // 已经被包围，保持不变
    }
    return `${before}$\\frac{${p1}}{${p2}}$${after}`;
  });
  
  // 处理平方表示法，如 cm^{2} 或 cm^2
  processedText = processedText.replace(/(\w+)\^{?(\d+)}?/g, (match, base, exponent) => {
    // 排除已经在数学环境中的情况
    const prevChar = processedText.charAt(processedText.indexOf(match) - 1);
    const nextChar = processedText.charAt(processedText.indexOf(match) + match.length);
    if (prevChar === '$' && nextChar === '$') {
      return match;
    }
    return `$${base}^{${exponent}}$`;
  });

  // 处理常见的圆周率表示
  processedText = processedText.replace(/\bpai\b/g, '\\pi');
  processedText = processedText.replace(/\bpi\b/g, '\\pi');
  processedText = processedText.replace(/π/g, '\\pi');
  
  // 处理乘法符号
  processedText = processedText.replace(/(\d+)×(\d+)/g, '$1 \\times $2');
  processedText = processedText.replace(/(\d+)\s*×\s*(\d+)/g, '$1 \\times $2');
  processedText = processedText.replace(/(\w+)\s*×\s*(\w+)/g, '$1 \\times $2');
  // 处理\Times乘法符号，转换为LaTeX的\times
  processedText = processedText.replace(/\\Times/g, '\\times');
  // 确保\times被包含在数学环境中
  processedText = processedText.replace(/(^|[^$])\\times([^$]|$)/g, '$1$\\times$$2');
  
  // 处理\times$\frac{}{}$这种情况，将它们合并到一个数学环境中
  processedText = processedText.replace(/\\times\$\\frac\{([^{}]+)\}\{([^{}]+)\}\$/g, '\\times\\frac{$1}{$2}');
  
  // 额外处理公式中同时出现\times和\frac的多种情况
  // 1. 处理"$\times$\frac{a}{b}$"这种格式
  processedText = processedText.replace(/\$\\times\$\\frac\{([^{}]+)\}\{([^{}]+)\}\$/g, '$\\times\\frac{$1}{$2}$');
  
  // 2. 处理数字后面接\times$\frac的情况
  processedText = processedText.replace(/(\d+)\s*\$\\times\$\s*\$\\frac\{([^{}]+)\}\{([^{}]+)\}\$/g, '$1 $\\times\\frac{$2}{$3}$');
  
  // 3. 处理格式为"...=48\times$\frac{23}{12}$=..."的情况
  processedText = processedText.replace(/(\d+)\\times\$\\frac\{([^{}]+)\}\{([^{}]+)\}\$/g, '$1 $\\times\\frac{$2}{$3}$');
  
  // 4. 精确处理图片中的格式："\\times$\\frac{23}{12}$"
  processedText = processedText.replace(/\\times\$\\frac\{(\d+)\}\{(\d+)\}\$/g, '$\\times\\frac{$1}{$2}$');

  // 5. 处理多种变体格式
  processedText = processedText.replace(/(^|[^\$])\\times\$(\\frac\{[^{}]+\}\{[^{}]+\})\$/g, '$1$\\times $2$');
  
  // 处理除法符号 ÷
  processedText = processedText.replace(/(\d+)÷(\d+)/g, '$\\frac{$1}{$2}$');
  
  // 处理一般的数学表达式，如 a/b
  processedText = processedText.replace(/(\d+)\/(\d+)(?![^\s.,:;!?)])/g, (match, p1, p2) => {
    // 检查是否已在数学环境中
    const index = processedText.indexOf(match);
    const prevChar = index > 0 ? processedText.charAt(index - 1) : '';
    const nextChar = index + match.length < processedText.length ? processedText.charAt(index + match.length) : '';
    
    if ((prevChar === '$' && nextChar === '$') || 
        (prevChar === '\\' && match.includes('frac'))) {
      return match;
    }
    return `$\\frac{${p1}}{${p2}}$`;
  });
  
  // 处理括号中的复杂表达式，使用更通用的方式
  // 原来的正则表达式可能有问题，修改为更安全的版本
  try {
    processedText = processedText.replace(/\((\d+[+\-×÷*/][\d+\-×÷*/\s()]+=[^)]+)\)/g, '($1$)');
  } catch (error) {
    console.error('处理复杂表达式时出错:', error);
    // 错误处理时不修改文本
  }
  
  return processedText;
};

// 简化后的文本渲染函数，支持Markdown和数学公式
const renderTextContent = (text: string) => {
  // 预处理文本中的数学表达式
  const processedText = preprocessMathExpressions(text);
  
  return (
    <div className="markdown-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeHighlight, rehypeKatex]}
      >
        {processedText}
      </ReactMarkdown>
      <style jsx global>{`
        .markdown-content p {
          margin: 0 0 0.5rem 0;
        }
        .markdown-content p:last-child {
          margin-bottom: 0;
        }
        .markdown-content ul, .markdown-content ol {
          margin: 0.5rem 0;
          padding-left: 1.5rem;
        }
        .markdown-content li {
          margin: 0;
          padding: 0;
        }
        .markdown-content li > p {
          margin: 0;
        }
        .markdown-content li + li {
          margin-top: 0.25rem;
        }
        .markdown-content pre {
          margin: 0.75rem 0;
          padding: 0.75rem;
          background-color: #f1f1f1;
          border-radius: 0.25rem;
          overflow-x: auto;
        }
        .markdown-content code {
          font-family: monospace;
          font-size: 0.875rem;
        }
        .markdown-content code:not(pre code) {
          padding: 0.1rem 0.25rem;
          background-color: #f1f1f1;
          border-radius: 0.25rem;
        }
        .markdown-content blockquote {
          margin: 0.75rem 0;
          padding-left: 1rem;
          border-left: 4px solid #e2e8f0;
          color: #4a5568;
        }
        .markdown-content a {
          color: #3182ce;
          text-decoration: none;
        }
        .markdown-content a:hover {
          text-decoration: underline;
        }
        .markdown-content img {
          max-width: 100%;
          height: auto;
          border-radius: 0.25rem;
          cursor: pointer;
        }
        .dark .markdown-content pre {
          background-color: #2d3748;
        }
        .dark .markdown-content code:not(pre code) {
          background-color: #2d3748;
          color: #e2e8f0;
        }
        .dark .markdown-content blockquote {
          border-color: #4a5568;
          color: #e2e8f0;
        }
        .dark .markdown-content a {
          color: #63b3ed;
        }
        /* 数学公式样式 */
        .markdown-content .math-inline {
          padding: 0 0.25rem;
        }
        .markdown-content .math-display {
          margin: 0.5rem 0;
        }
      `}</style>
    </div>
  );
};

// 辅助函数：渲染消息内容
const renderMessageContent = (content: MessageContent[]) => {
  return (
    <div className="space-y-2">
      {content.map((item, index) => {
        if (item.type === 'text') {
          return <div key={index}>{renderTextContent(item.text)}</div>;
        } else if (item.type === 'image') {
          // 处理图片URL已被优化替换的情况
          if (item.url === '[图片数据已优化存储]') {
            return (
              <div key={index} className="my-2">
                <div className="max-w-full rounded-md max-h-64 bg-gray-200 dark:bg-gray-700 flex items-center justify-center p-4">
                  <span className="text-gray-500 dark:text-gray-400">
                    [图片数据已从历史记录中移除]
                  </span>
                </div>
              </div>
            );
          }
          
          return (
            <div key={index} className="my-2">
              <img 
                src={item.url} 
                alt={item.alt || '图片'} 
                className="max-w-full rounded-md max-h-64 object-contain cursor-pointer"
              />
            </div>
          );
        }
        return null;
      })}
    </div>
  );
};

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
  const [isInitializing, setIsInitializing] = useState(true);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingSpeedRef = useRef<ReturnType<typeof setInterval>>(null);
  const [uploadedImages, setUploadedImages] = useState<Array<{url: string, name: string, fileId?: string}>>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 修改初始化逻辑
  useLayoutEffect(() => {
    setMounted(true);
    setIsInitializing(true);
    
    // 创建一个带有加载指示的初始消息
    setCurrentMessage({
      id: generateMessageId(),
      role: 'assistant',
      content: '',
      loading: true,
      timestamp: new Date().toLocaleTimeString()
    });
    
    // 使用setTimeout模拟加载过程，给用户更好的视觉反馈
    setTimeout(() => {
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
      
      // 初始化完成，清除加载状态
      setIsInitializing(false);
      setCurrentMessage(null);
    }, 1000); // 设置一个短暂的延迟，确保加载动画可见
  }, []);

  // 添加消息变化监听
  useEffect(() => {
    if (messages.length > 0) {
      try {
        // 如果消息数量超过限制,只保存最新的消息
        const messagesToStore = messages.slice(-MAX_STORED_MESSAGES);
        
        // 优化存储，移除图片的大型数据URL
        const optimizedMessages = messagesToStore.map(msg => {
          // 对于字符串内容，直接保留
          if (typeof msg.content === 'string') {
            return msg;
          }
          
          // 对于多模态内容，处理图片
          if (Array.isArray(msg.content)) {
            return {
              ...msg,
              content: msg.content.map(item => {
                // 如果是图片，只保留必要信息，不保存base64数据
                if (item.type === 'image') {
                  return {
                    type: 'image',
                    alt: item.alt || '图片',
                    fileId: item.fileId, // 保留文件ID用于API
                    // 不保存完整url，只记录这是一个图片
                    url: item.url && item.url.startsWith('data:') 
                      ? '[图片数据已优化存储]' 
                      : item.url
                  };
                }
                return item;
              })
            };
          }
          
          return msg;
        });
        
        // 存储优化后的消息
        localStorage.setItem(STORAGE_KEY, JSON.stringify(optimizedMessages));
        
        // 添加接近限制的提示
        if (messages.length > MAX_STORED_MESSAGES * 0.8 && messages.length <= MAX_STORED_MESSAGES) {
          setStatus('提示：聊天记录接近上限，较早的消息将被自动清除');
          setTimeout(() => setStatus(''), 3000);
        }
      } catch (error) {
        console.error('Failed to save chat history:', error);
        // 如果存储失败，尝试清除部分历史记录
        try {
          // 保留最近的少量消息
          const reducedMessages = messages.slice(-10);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(reducedMessages));
          setStatus('由于存储空间限制，部分历史记录已被清除');
          setTimeout(() => setStatus(''), 3000);
        } catch (secondError) {
          // 如果还是失败，只能清空存储
          console.error('Failed to save reduced chat history:', secondError);
          localStorage.removeItem(STORAGE_KEY);
          setStatus('聊天历史无法保存，已清空存储');
          setTimeout(() => setStatus(''), 3000);
        }
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
    // 先检查消息数组中是否已存在相同内容的助手消息
    const assistantMessage = {
      id: generateMessageId(),
      role: 'assistant' as const,
      content: text,
      timestamp: new Date().toLocaleTimeString()
    };
    
    // 如果已存在，直接返回，不执行打字机效果
    if (messageExistsInArray(messages, assistantMessage)) {
      setCurrentMessage(null);
      setCurrentResponse('');
      return;
    }
    
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
        
        // 使用函数形式的setState确保我们使用最新的messages状态
        setMessages(prevMessages => {
          // 再次检查是否已经有相同内容的消息存在
          // 这是一个安全措施，以防在打字机效果过程中添加了相同的消息
          if (messageExistsInArray(prevMessages, assistantMessage)) {
            // 已经存在相同内容的消息，不添加新消息
            return prevMessages;
          }

          // 找到最后一条用户消息
          const lastUserMessage = newMessages[newMessages.length - 1];
          if (!lastUserMessage || lastUserMessage.role !== 'user') {
            // 如果没有用户消息或最后一条不是用户消息，直接返回当前消息列表
            return prevMessages;
          }

          const lastUserMessageIndex = prevMessages.findIndex(m => 
            m.role === 'user' && m.id === lastUserMessage.id
          );

          // 检查最后一条用户消息后是否已有助手回复
          if (lastUserMessageIndex !== -1 && lastUserMessageIndex < prevMessages.length - 1 && 
              prevMessages[lastUserMessageIndex + 1].role === 'assistant') {
            // 已有回复，更新现有消息而不添加新的
            return prevMessages;
          }

          // 没有找到重复，添加新的助手消息
          return [
            ...prevMessages,
            assistantMessage
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
    
    // 如果已经有图片，显示错误信息
    if (uploadedImages.length > 0) {
      setUploadError('每次只能上传一张图片，请先删除已有图片');
      // 清空文件输入，允许再次上传
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }
    
    const file = e.target.files[0];
    setUploadError(null);
    
    // 创建FormData
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      // 显示上传中状态
      setUploadError('图片上传中，请稍候...');
      
      // 使用Coze上传API端点
      const response = await fetch('/api/coze-upload', {
        method: 'POST',
        body: formData,
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        setUploadError(data.error || '上传失败');
        return;
      }
      
      setUploadError(null);
      setUploadedImages(prev => [...prev, {
        url: data.fileUrl,
        name: data.fileName,
        fileId: data.fileId // 保存Coze文件ID
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

  // 修改处理提交的函数，确保有图片时必须有文本才能发送
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // 修改验证逻辑：无内容时不能发送，或者有图片但无文本时也不能发送
    if (isGenerating || !input.trim() && uploadedImages.length === 0 || (uploadedImages.length > 0 && !input.trim())) return;

    // 准备消息内容
    let messageContent: string | MessageContent[] = input.trim();
    
    // 如果有图片，创建多模态内容
    if (uploadedImages.length > 0) {
      messageContent = [] as MessageContent[];
      
      // 添加文本（一定会有文本，因为我们在验证逻辑中确保了这一点）
      (messageContent as MessageContent[]).push({
        type: 'text',
        text: input.trim()
      });
      
      // 添加图片
      uploadedImages.forEach(img => {
        (messageContent as MessageContent[]).push({
          type: 'image',
          url: img.url,
          alt: img.name,
          fileId: img.fileId // 添加文件ID
        });
      });
    }

    // 创建用户消息对象
    const userMessage = {
      id: generateMessageId(),
      role: 'user' as const,
      content: messageContent,
      timestamp: new Date().toLocaleTimeString() 
    };

    // 检查是否重复提交相同的消息内容
    if (messageExistsInArray(messages, userMessage)) {
      setStatus('相同的消息已发送，请不要重复提交');
      setTimeout(() => setStatus(''), 2000);
      return;
    }

    const newMessages = [
      ...messages,
      userMessage
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
      
      // 创建一个标记变量，用于跟踪是否已经添加了响应
      let responseAdded = false;
      
      // 创建实时响应的消息对象
      const assistantMessageId = generateMessageId();
      const liveMessage = {
        id: assistantMessageId,
        role: 'assistant' as const,
        content: '',
        loading: true,
        timestamp: new Date().toLocaleTimeString()
      };
      
      // 首先添加一个空的响应消息，然后在接收数据时实时更新
      setCurrentMessage(liveMessage);
      
      for await (const chunk of streamChat(messagesWithSystem, selectedModel, abortControllerRef.current.signal)) {
        if (!abortControllerRef.current) break; // 检查是否已中断
        fullText += chunk;
        
        // 实时更新消息内容
        const updatedMessage = {
          ...liveMessage,
          content: fullText,
          loading: false
        };
        setCurrentMessage(updatedMessage);
        setFullResponse(fullText);
      }

      if (abortControllerRef.current && !responseAdded) { // 只有在未中断且未添加响应时才更新消息
        // 检查是否已存在相同内容的消息
        const finalAssistantMessage = {
          id: assistantMessageId,
          role: 'assistant' as const,
          content: fullText,
          timestamp: new Date().toLocaleTimeString()
        };
        
        const duplicateExists = messageExistsInArray(messages, finalAssistantMessage);
        
        if (!duplicateExists) {
          // 直接添加到消息列表，不再使用打字机效果
          setMessages(prevMessages => [...prevMessages, finalAssistantMessage]);
          responseAdded = true;
        }
        
        setCurrentMessage(null);
        setFullResponse('');
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
      {/* 添加全局样式 */}
      <style dangerouslySetInnerHTML={{ __html: globalStyles }} />
      
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
              <div className={`flex-1 max-w-[85%] ${message.role === 'user' ? 'ml-12' : 'mr-12'}`}>
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
              <div className="flex-1 max-w-[85%] mr-12">
                <Card className="p-4 shadow-sm bg-gray-100 dark:bg-gray-700 dark:text-gray-200">
                  <div className="flex flex-col">
                    {currentMessage.loading ? (
                      <div className="flex items-center space-x-1">
                        <span className="animate-bounce">•</span>
                        <span className="animate-bounce delay-100">•</span>
                        <span className="animate-bounce delay-200">•</span>
                      </div>
                    ) : (
                      <div className="whitespace-pre-wrap overflow-x-auto">
                        {typeof currentMessage.content === 'string' 
                          ? currentMessage.content 
                          : currentMessage.content.map((item, i) => {
                              if (item.type === 'text') {
                                return item.text;
                              } else if (item.type === 'image') {
                                return '[图片]';
                              }
                              return '';
                            }).join(' ')}
                      </div>
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
            <div className="flex flex-col gap-2">
              <div className="text-xs text-gray-500 dark:text-gray-400">
                仅允许上传一张图片，发送后可再次上传
              </div>
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
                disabled={isGenerating || uploadedImages.length > 0}
                className={`p-3 ${uploadedImages.length > 0 ? 'text-gray-400 cursor-not-allowed' : 'text-gray-500 hover:text-blue-500 dark:text-gray-400 dark:hover:text-blue-400'}`}
                title={uploadedImages.length > 0 ? "已上传图片，请先删除" : "上传图片"}
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
                disabled={!input.trim() || (uploadedImages.length > 0 && !input.trim())}
                className={`px-4 py-3 rounded-lg whitespace-nowrap ${
                  !input.trim() || (uploadedImages.length > 0 && !input.trim())
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed dark:bg-gray-700 dark:text-gray-500' 
                    : 'bg-blue-500 text-white hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700'
                } transition-colors duration-200`}
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