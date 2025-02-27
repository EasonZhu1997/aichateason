import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Card } from '@/components/ui/card';
import { Bot, UserCircle, Copy, MessageSquare, RefreshCw, Trash2, RotateCw, X } from 'lucide-react';
import { Message, MessageContent, isContentString } from '@/services/chat';
import select from 'select';
// @ts-ignore
import ReactMarkdown from 'react-markdown';
// @ts-ignore
import remarkGfm from 'remark-gfm';
// @ts-ignore
import rehypeHighlight from 'rehype-highlight';

interface MessageBubbleProps {
  message: Message;
  onRegenerate?: () => void;
  onDelete?: () => void;
  isRegenerating?: boolean;
}

// 简化后的文本渲染函数，支持Markdown
const renderTextContent = (text: string) => {
  return (
    <div className="whitespace-pre-wrap overflow-x-auto break-words prose dark:prose-invert prose-sm max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
};

export function MessageBubble({ message, onRegenerate, onDelete, isRegenerating }: MessageBubbleProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [renderError, setRenderError] = useState(false);
  const [enlargedImage, setEnlargedImage] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const isAssistant = message.role === 'assistant';
  
  // 只在文本内容上使用选择按钮
  const isTextOnlyContent = isContentString(message.content) || 
    (Array.isArray(message.content) && message.content.every(item => item.type === 'text'));
  
  // 获取纯文本内容用于复制
  const getTextContent = (): string => {
    if (isContentString(message.content)) {
      return message.content;
    }
    
    if (Array.isArray(message.content)) {
      return message.content
        .filter(item => item.type === 'text')
        .map(item => (item.type === 'text' ? item.text : ''))
        .join('\n');
    }
    
    return '';
  };
  
  // 辅助函数：渲染消息内容
  const renderMessageContent = (content: string | MessageContent[]) => {
    // 如果是字符串，直接显示
    if (isContentString(content)) {
      return renderTextContent(content);
    }
    
    // 否则，渲染多模态内容
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
                  onClick={() => setEnlargedImage(item.url)}
                  className="max-w-full rounded-md max-h-64 object-contain cursor-pointer hover:opacity-90 transition-opacity"
                />
              </div>
            );
          }
          return null;
        })}
      </div>
    );
  };
  
  // 当渲染错误时重置错误状态
  useEffect(() => {
    if (renderError) {
      const timer = setTimeout(() => {
        setRenderError(false);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [renderError]);
  
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node) && 
          cardRef.current && !cardRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleCopy = () => {
    const textToCopy = getTextContent();
    navigator.clipboard.writeText(textToCopy);
    setShowMenu(false);
  };

  const handleSelect = () => {
    if (cardRef.current) {
      // 先获取父元素
      const content = cardRef.current.querySelector('p');
      if (content) {
        select(content);
      }
    }
    setShowMenu(false);
  };
  
  // 安全渲染函数
  const safeRenderContent = () => {
    try {
      return renderMessageContent(message.content);
    } catch (error) {
      console.error('安全渲染失败:', error);
      setRenderError(true);
      // 渲染失败时依然使用Markdown渲染函数处理纯文本
      return renderTextContent(getTextContent());
    }
  };

  return (
    <div className="relative" ref={cardRef}>
      <div 
        onClick={() => isTextOnlyContent && setShowMenu(true)}
        className={isTextOnlyContent ? 'cursor-pointer' : ''}
      >
        <Card 
          className={`p-4 shadow-sm overflow-x-auto ${
            isAssistant ? 'bg-gray-100 dark:bg-gray-700 dark:text-gray-200' : 
            'bg-blue-50 text-gray-800 dark:bg-blue-900 dark:text-gray-100'
          } ${
            showMenu ? 'ring-2 ring-blue-500 dark:ring-blue-400' : ''
          }`}
        >
          <div className="flex flex-col w-full">
            {/* 渲染消息内容 */}
            <div className="w-full overflow-x-auto">
              {renderError ? (
                renderTextContent(getTextContent())
              ) : (
                safeRenderContent()
              )}
            </div>
            
            {/* 时间戳和操作按钮 */}
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {message.timestamp}
              </span>
              
              {isAssistant && onRegenerate && (
                <div className="flex space-x-2">
                  <button
                    onClick={onRegenerate}
                    disabled={isRegenerating}
                    className="p-1 text-gray-500 hover:text-blue-500 dark:text-gray-400 dark:hover:text-blue-400
                             disabled:opacity-50 disabled:cursor-not-allowed"
                    title="重新生成"
                  >
                    <RotateCw size={16} className={isRegenerating ? 'animate-spin' : ''} />
                  </button>
                  
                  {onDelete && (
                    <button
                      onClick={onDelete}
                      className="p-1 text-gray-500 hover:text-red-500 dark:text-gray-400 dark:hover:text-red-400"
                      title="删除消息"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              )}
              
              {message.role === 'user' && onDelete && (
                <button
                  onClick={onDelete}
                  className="p-1 text-gray-500 hover:text-red-500 dark:text-gray-400 dark:hover:text-red-400"
                  title="删除消息"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          </div>
        </Card>
      </div>
      
      {/* 图片放大模态框 */}
      {enlargedImage && createPortal(
        <div 
          className="fixed inset-0 z-50 bg-black bg-opacity-80 flex items-center justify-center p-4"
          onClick={() => setEnlargedImage(null)}
        >
          <div className="relative max-w-[90vw] max-h-[90vh]">
            <button
              className="absolute top-2 right-2 p-1 rounded-full bg-black bg-opacity-50 text-white hover:bg-opacity-70 transition-opacity"
              onClick={() => setEnlargedImage(null)}
            >
              <X size={24} />
            </button>
            <img 
              src={enlargedImage} 
              alt="放大图片" 
              className="max-w-full max-h-[90vh] object-contain"
            />
          </div>
        </div>,
        document.body
      )}
      
      {/* 上下文菜单 */}
      {showMenu && isTextOnlyContent && createPortal(
        <div 
          ref={menuRef}
          className="absolute z-50 w-56 overflow-hidden bg-white rounded-md shadow-lg dark:bg-gray-800 ring-1 ring-black ring-opacity-5"
          style={{
            top: cardRef.current ? cardRef.current.offsetTop : 0,
            left: cardRef.current ? cardRef.current.offsetLeft + cardRef.current.offsetWidth + 10 : 0,
          }}
        >
          <div className="py-1">
            <button 
              onClick={handleCopy}
              className="flex items-center w-full px-4 py-3 text-sm text-gray-700 dark:text-gray-200 
                       hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <Copy className="w-4 h-4 mr-3" />
              复制文本
            </button>
            <div className="h-[1px] bg-gray-200 dark:bg-gray-700" />
            <button 
              onClick={handleSelect}
              className="flex items-center w-full px-4 py-3 text-sm text-gray-700 dark:text-gray-200 
                       hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <MessageSquare className="w-4 h-4 mr-3" />
              选择文本
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
} 