import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Card } from '@/components/ui/card';
import { Bot, UserCircle, Copy, MessageSquare, RefreshCw, Trash2, RotateCw } from 'lucide-react';
import { Message, MessageContent, isContentString } from '@/services/chat';
import select from 'select';

interface MessageBubbleProps {
  message: Message;
  onRegenerate?: () => void;
  onDelete?: () => void;
  isRegenerating?: boolean;
}

// 辅助函数：渲染消息内容
const renderMessageContent = (content: string | MessageContent[]) => {
  // 如果是字符串，直接渲染
  if (isContentString(content)) {
    return <p className="whitespace-pre-wrap">{content}</p>;
  }
  
  // 否则，渲染多模态内容
  return (
    <div className="space-y-2">
      {content.map((item, index) => {
        if (item.type === 'text') {
          return <p key={index} className="whitespace-pre-wrap">{item.text}</p>;
        } else if (item.type === 'image') {
          return (
            <div key={index} className="my-2">
              <img 
                src={item.url} 
                alt={item.alt || '图片'} 
                className="max-w-full rounded-md max-h-64 object-contain"
              />
              {item.alt && (
                <p className="text-xs text-gray-500 mt-1">{item.alt}</p>
              )}
            </div>
          );
        }
        return null;
      })}
    </div>
  );
};

export function MessageBubble({ message, onRegenerate, onDelete, isRegenerating }: MessageBubbleProps) {
  const [showMenu, setShowMenu] = useState(false);
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

  return (
    <div className="relative" ref={cardRef}>
      <div 
        onClick={() => isTextOnlyContent && setShowMenu(true)}
        className={isTextOnlyContent ? 'cursor-pointer' : ''}
      >
        <Card 
          className={`p-4 shadow-sm ${
            isAssistant ? 'bg-gray-100 dark:bg-gray-700 dark:text-gray-200' : 
            'bg-blue-50 text-gray-800 dark:bg-blue-900 dark:text-gray-100'
          } ${
            showMenu ? 'ring-2 ring-blue-500 dark:ring-blue-400' : ''
          }`}
        >
          <div className="flex flex-col">
            {/* 渲染消息内容 */}
            {renderMessageContent(message.content)}
            
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