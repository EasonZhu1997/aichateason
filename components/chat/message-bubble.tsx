import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Card } from '@/components/ui/card';
import { Bot, UserCircle, Copy, MessageSquare, RefreshCw, Trash2, RotateCw } from 'lucide-react';
import { Message, MessageContent, isContentString } from '@/services/chat';
import select from 'select';
import 'katex/dist/katex.min.css';
import katex from 'katex';

interface MessageBubbleProps {
  message: Message;
  onRegenerate?: () => void;
  onDelete?: () => void;
  isRegenerating?: boolean;
}

// 辅助函数：处理数学公式
const renderMathExpression = (text: string) => {
  // 更强大的数学公式检测正则表达式
  const hasMathSyntax = /\\(sin|int|frac|lim|cdots|left|right|sum|prod|to|infty|alpha|beta|theta|pi)|\^\{|\$\$|\$|\{.+?\}|\\|_{|\^{/g.test(text);
  
  if (hasMathSyntax) {
    try {
      // 处理LaTeX格式，如果文本中包含$$包裹的内容，提取它们
      if (text.includes('$$')) {
        // 使用不带s标志的分割方法
        const segments = [];
        let currentPos = 0;
        let startPos, endPos;
        
        while (currentPos < text.length) {
          startPos = text.indexOf('$$', currentPos);
          
          if (startPos === -1) {
            // 没有更多的$$，添加剩余部分
            segments.push(text.slice(currentPos));
            break;
          }
          
          // 添加$$前的文本
          if (startPos > currentPos) {
            segments.push(text.slice(currentPos, startPos));
          }
          
          // 寻找结束的$$
          endPos = text.indexOf('$$', startPos + 2);
          
          if (endPos === -1) {
            // 没有匹配的结束$$，添加剩余部分并结束
            segments.push(text.slice(currentPos));
            break;
          }
          
          // 添加包含$$的段落
          segments.push(text.slice(startPos, endPos + 2));
          currentPos = endPos + 2;
        }
        
        return (
          <div className="math-content">
            {segments.map((segment, index) => {
              if (segment.startsWith('$$') && segment.endsWith('$$')) {
                // 删除$$符号并渲染为数学公式
                const formula = segment.slice(2, -2);
                try {
                  const html = katex.renderToString(formula, {
                    throwOnError: false,
                    displayMode: true,
                    output: 'html',
                    trust: true,
                    strict: 'ignore'
                  });
                  return <div key={index} dangerouslySetInnerHTML={{ __html: html }} className="math-expression overflow-x-auto" />;
                } catch (err) {
                  console.error('KaTeX rendering error:', err);
                  return <pre key={index} className="text-red-500 overflow-x-auto">{segment}</pre>;
                }
              }
              return <p key={index} className="whitespace-pre-wrap overflow-x-auto break-words">{segment}</p>;
            })}
          </div>
        );
      }
      
      // 尝试直接渲染整个文本
      const html = katex.renderToString(text, {
        throwOnError: false, 
        displayMode: true,
        output: 'html',
        trust: true,
        strict: 'ignore'
      });
      return <div dangerouslySetInnerHTML={{ __html: html }} className="math-expression overflow-x-auto" />;
    } catch (error) {
      console.error('Math rendering error:', error);
      
      // 如果整体渲染失败，尝试行分割渲染
      try {
        const lines = text.split('\n');
        return (
          <div className="math-content space-y-2">
            {lines.map((line, idx) => {
              if (line.trim() === '') return <br key={idx} />;
              
              try {
                const html = katex.renderToString(line, {
                  throwOnError: false,
                  displayMode: true,
                  output: 'html'
                });
                return <div key={idx} dangerouslySetInnerHTML={{ __html: html }} className="math-expression overflow-x-auto" />;
              } catch (lineError) {
                return <p key={idx} className="whitespace-pre-wrap overflow-x-auto break-words">{line}</p>;
              }
            })}
          </div>
        );
      } catch (fallbackError) {
        // 如果行分割渲染也失败，直接显示原始文本
        return <p className="whitespace-pre-wrap overflow-x-auto break-words">{text}</p>;
      }
    }
  }
  
  // 如果没有识别为数学公式，返回普通文本
  return <p className="whitespace-pre-wrap overflow-x-auto break-words">{text}</p>;
};

// 辅助函数：渲染消息内容
const renderMessageContent = (content: string | MessageContent[]) => {
  // 如果是字符串，检查是否包含数学公式
  if (isContentString(content)) {
    return renderMathExpression(content);
  }
  
  // 否则，渲染多模态内容
  return (
    <div className="space-y-2">
      {content.map((item, index) => {
        if (item.type === 'text') {
          return <div key={index}>{renderMathExpression(item.text)}</div>;
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
                {item.alt && (
                  <p className="text-xs text-gray-500 mt-1">{item.alt}</p>
                )}
              </div>
            );
          }
          
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
              {renderMessageContent(message.content)}
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