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
// 添加数学公式支持
// @ts-ignore
import remarkMath from 'remark-math';
// @ts-ignore
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

interface MessageBubbleProps {
  message: Message;
  onRegenerate?: () => void;
  onDelete?: () => void;
  isRegenerating?: boolean;
}

// 添加预处理函数，将文本中的各种数学表达式转换为标准LaTeX格式
const preprocessMathExpressions = (text: string): string => {
  // 如果输入为null或undefined，直接返回空字符串
  if (!text) return '';
  
  try {
    let processedText = text;
    
    // 处理通用的数学符号 - 将所有操作放在try-catch块中
    try {
      // 处理分数表示法: (a:b) 或 (a/b)
      processedText = processedText.replace(/\((\d+):(\d+)\)/g, '$\\frac{$1}{$2}$');
      processedText = processedText.replace(/\((\d+)\/(\d+)\)/g, '$\\frac{$1}{$2}$');
    } catch (error) {
      console.error('处理分数表示法失败:', error);
    }
    
    try {
      // 处理\frac表达式，确保它们被$包围
      processedText = processedText.replace(/\(\(\\frac\{([^{}]+)\}\{([^{}]+)\}\)\)/g, '$\\frac{$1}{$2}$');
      processedText = processedText.replace(/\(\\frac\{([^{}]+)\}\{([^{}]+)\}\)/g, '$\\frac{$1}{$2}$');
    } catch (error) {
      console.error('处理\\frac表达式失败:', error);
    }
    
    try {
      // 处理已有的\frac表达式，但没有被$包围的情况
      processedText = processedText.replace(/(^|[^$])\\frac\{([^{}]+)\}\{([^{}]+)\}([^$]|$)/g, (match, before, p1, p2, after) => {
        // 检查是不是已经被$包围了
        if (before.endsWith('$') && after.startsWith('$')) {
          return match; // 已经被包围，保持不变
        }
        return `${before}$\\frac{${p1}}{${p2}}$${after}`;
      });
    } catch (error) {
      console.error('处理未包围的\\frac表达式失败:', error);
    }
    
    try {
      // 处理平方表示法，如 cm^{2} 或 cm^2
      processedText = processedText.replace(/(\w+)\^{?(\d+)}?/g, (match, base, exponent) => {
        try {
          // 排除已经在数学环境中的情况
          const matchIndex = processedText.indexOf(match);
          if (matchIndex === -1) return match; // 安全检查
          
          const prevChar = matchIndex > 0 ? processedText.charAt(matchIndex - 1) : '';
          const nextChar = matchIndex + match.length < processedText.length ? processedText.charAt(matchIndex + match.length) : '';
          
          if (prevChar === '$' && nextChar === '$') {
            return match;
          }
          return `$${base}^{${exponent}}$`;
        } catch (innerError) {
          console.error('处理平方表示法内部错误:', innerError);
          return match; // 发生错误时返回原始匹配
        }
      });
    } catch (error) {
      console.error('处理平方表示法失败:', error);
    }
    
    try {
      // 处理常见的圆周率表示
      processedText = processedText.replace(/\bpai\b/g, '\\pi');
      processedText = processedText.replace(/\bpi\b/g, '\\pi');
      processedText = processedText.replace(/π/g, '\\pi');
    } catch (error) {
      console.error('处理圆周率表示失败:', error);
    }
    
    try {
      // 处理乘法符号
      processedText = processedText.replace(/(\d+)×(\d+)/g, '$1 \\times $2');
      processedText = processedText.replace(/(\d+)\s*×\s*(\d+)/g, '$1 \\times $2');
      processedText = processedText.replace(/(\w+)\s*×\s*(\w+)/g, '$1 \\times $2');
      // 处理\Times乘法符号，转换为LaTeX的\times
      processedText = processedText.replace(/\\Times/g, '\\times');
      // 确保\times被包含在数学环境中
      processedText = processedText.replace(/(^|[^$])\\times([^$]|$)/g, '$1$\\times$$2');
    } catch (error) {
      console.error('处理乘法符号失败:', error);
    }
    
    try {
      // 处理\times$\frac{}{}$这种情况，将它们合并到一个数学环境中
      processedText = processedText.replace(/\\times\$\\frac\{([^{}]+)\}\{([^{}]+)\}\$/g, '\\times\\frac{$1}{$2}');
    } catch (error) {
      console.error('处理\\times$\\frac{}{}$失败:', error);
    }
    
    try {
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
    } catch (error) {
      console.error('处理\\times和\\frac组合失败:', error);
    }
    
    try {
      // 处理除法符号 ÷
      processedText = processedText.replace(/(\d+)÷(\d+)/g, '$\\frac{$1}{$2}$');
    } catch (error) {
      console.error('处理除法符号失败:', error);
    }
    
    try {
      // 处理一般的数学表达式，如 a/b
      processedText = processedText.replace(/(\d+)\/(\d+)(?![^\s.,:;!?)])/g, (match, p1, p2) => {
        try {
          // 检查是否已在数学环境中
          const index = processedText.indexOf(match);
          if (index === -1) return match; // 安全检查
          
          const prevChar = index > 0 ? processedText.charAt(index - 1) : '';
          const nextChar = index + match.length < processedText.length ? processedText.charAt(index + match.length) : '';
          
          if ((prevChar === '$' && nextChar === '$') || 
              (prevChar === '\\' && match.includes('frac'))) {
            return match;
          }
          return `$\\frac{${p1}}{${p2}}$`;
        } catch (innerError) {
          console.error('处理一般数学表达式内部错误:', innerError);
          return match; // 发生错误时返回原始匹配
        }
      });
    } catch (error) {
      console.error('处理一般数学表达式失败:', error);
    }
    
    try {
      // 处理括号中的复杂表达式，使用更通用的方式
      processedText = processedText.replace(/\((\d+[+\-×÷*/][\d+\-×÷*/\s()]+=[^)]+)\)/g, '($1$)');
    } catch (error) {
      console.error('处理复杂表达式时出错:', error);
      // 错误处理时不修改文本
    }
    
    return processedText;
  } catch (error) {
    console.error('预处理数学表达式失败:', error);
    return text; // 出错时返回原始文本
  }
};

// 渲染文本内容的函数，添加错误处理
const renderTextContent = (text: string): React.ReactNode => {
  if (!text) return <div className="empty-content">(空内容)</div>;
  
  try {
    // 首先预处理文本以转换数学表达式
    const processedText = preprocessMathExpressions(text);
    
    // 简化渲染，避免使用可能引起问题的style jsx
    return (
      <div className="markdown-content prose-sm max-w-full break-words">
        <ReactMarkdown 
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex as any]}
        >
          {processedText}
        </ReactMarkdown>
      </div>
    );
  } catch (error) {
    console.error('渲染文本内容出错:', error);
    // 以纯文本形式返回，以确保在出错时也能显示内容
    return (
      <div className="whitespace-pre-wrap break-words">
        {text}
        {process.env.NODE_ENV === 'development' && (
          <div className="text-red-500 text-xs mt-2">
            渲染错误，显示原始文本。错误: {error instanceof Error ? error.message : String(error)}
          </div>
        )}
      </div>
    );
  }
}

// 从各种消息格式中提取文本内容的辅助函数
const extractTextContent = (content: any): string | null => {
  if (!content) return null;
  
  // 如果是字符串，直接返回
  if (typeof content === 'string') return content;
  
  // 如果有response属性
  if (content.response) return content.response;
  
  // 如果有text属性
  if (content.text) return content.text;
  
  // 如果是数组，尝试连接文本内容
  if (Array.isArray(content)) {
    const textParts = content
      .map(item => {
        if (typeof item === 'string') return item;
        if (item?.text) return item.text;
        return null;
      })
      .filter(Boolean);
    
    if (textParts.length > 0) {
      return textParts.join('\n');
    }
  }
  
  // 如果是对象，尝试JSON.stringify
  if (typeof content === 'object') {
    try {
      return JSON.stringify(content);
    } catch (error) {
      console.error('无法将对象转换为JSON字符串:', error);
    }
  }
  
  return null;
}

export function MessageBubble({ message, onRegenerate, onDelete, isRegenerating }: MessageBubbleProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [renderError, setRenderError] = useState(false);
  const [enlargedImage, setEnlargedImage] = useState<string | null>(null);
  const [showCopySuccess, setShowCopySuccess] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const isAssistant = message.role === 'assistant';
  const isMounted = useRef(true); // 用于跟踪组件是否已卸载
  
  // 只在文本内容上使用复制按钮
  const isTextOnlyContent = isContentString(message.content) || 
    (Array.isArray(message.content) && message.content.every(item => item.type === 'text'));
  
  // 在组件卸载时设置isMounted标志
  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);
  
  // 获取纯文本内容用于复制
  const getTextContent = (): string => {
    if (!message || !message.content) return '';
    
    try {
      if (isContentString(message.content)) {
        return message.content;
      }
      
      if (Array.isArray(message.content)) {
        return message.content
          .filter(item => item.type === 'text')
          .map(item => (item.type === 'text' ? item.text : ''))
          .join('\n');
      }
      
      return typeof message.content === 'object' ? JSON.stringify(message.content) : String(message.content);
    } catch (error) {
      console.error('获取文本内容失败:', error);
      return '';
    }
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
        if (isMounted.current) {
          setRenderError(false);
        }
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

  // 完全重写的复制函数，避免未处理的Promise异常
  const handleCopy = () => {
    try {
      // 获取要复制的文本，避免直接访问可能为null的属性
      const textToCopy = getTextContent();
      
      if (!textToCopy) {
        console.warn('没有可复制的文本内容');
        return;
      }
      
      // 使用execCommand方法，同步操作，避免Promise异常
      const copyUsingExecCommand = () => {
        const textarea = document.createElement('textarea');
        textarea.value = textToCopy;
        
        // 确保textarea在视窗之外
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        textarea.style.top = '-9999px';
        
        // 添加到DOM、选择文本并执行复制
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        
        let success = false;
        try {
          success = document.execCommand('copy');
        } catch (e) {
          console.error('execCommand复制失败:', e);
        }
        
        // 清理DOM
        document.body.removeChild(textarea);
        return success;
      };
      
      // 尝试使用execCommand复制
      if (copyUsingExecCommand()) {
        if (isMounted.current) {
          setShowCopySuccess(true);
          // 设置定时器清除成功状态
          setTimeout(() => {
            if (isMounted.current) {
              setShowCopySuccess(false);
            }
          }, 2000);
        }
        return;
      }
      
      // 如果execCommand失败，尝试使用Clipboard API
      // 但要特别注意Promise处理
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        // 封装在全局try-catch中
        try {
          navigator.clipboard.writeText(textToCopy)
            .then(() => {
              // 检查组件是否仍然挂载
              if (isMounted.current) {
                setShowCopySuccess(true);
                setTimeout(() => {
                  if (isMounted.current) {
                    setShowCopySuccess(false);
                  }
                }, 2000);
              }
            })
            .catch(err => {
              console.error('Clipboard API复制失败:', err);
              // 使用同步的方式提示用户
              if (isMounted.current) {
                // 在这里就不再尝试使用window.prompt了，避免可能的浏览器阻止
                console.warn('无法自动复制文本，请用户手动复制');
              }
            });
        } catch (e) {
          console.error('调用Clipboard API出错:', e);
        }
      } else {
        console.warn('浏览器不支持复制功能');
      }
    } catch (error) {
      // 捕获整个操作中可能的任何错误
      console.error('复制过程中发生错误:', error);
    }
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
  
  // 安全渲染函数 - 重命名以避免与全局函数冲突
  const renderMessageSafely = () => {
    try {
      // 添加额外的检查，确保消息内容是有效的
      if (!message || !message.content) {
        return <div>正在重新生成，请稍后...</div>;
      }
      
      // 尝试渲染消息内容
      return renderMessageContent(message.content);
    } catch (error) {
      console.error('安全渲染失败:', error);
      
      // 避免在异常处理过程中调用setState，而是返回备用内容
      // 不再调用 setRenderError(true)，改为外部控制
      
      // 尝试获取纯文本内容
      try {
        const textContent = getTextContent();
        if (textContent) {
          // 如果能够获取到文本内容，尝试以纯文本方式显示
          return <div className="whitespace-pre-wrap">{textContent}</div>;
        }
      } catch (innerError) {
        console.error('获取纯文本内容失败:', innerError);
      }
      
      // 如果所有尝试都失败，显示错误消息
      return <div className="text-red-500">内容无法显示</div>;
    }
  };

  // 外部错误处理，避免在渲染函数中设置状态
  const handleRenderError = (error: any) => {
    console.error('渲染过程中发生错误:', error);
    if (isMounted.current) {
      setRenderError(true);
    }
  };

  // 主渲染逻辑
  let renderedContent;
  try {
    renderedContent = renderError 
      ? <div className="whitespace-pre-wrap">{getTextContent()}</div>
      : renderMessageSafely();
  } catch (error) {
    handleRenderError(error);
    renderedContent = <div className="whitespace-pre-wrap">{getTextContent()}</div>;
  }

  return (
    <div className="relative" ref={cardRef}>
      <div>
        <Card 
          className={`p-4 shadow-sm overflow-x-auto ${
            isAssistant ? 'bg-gray-100 dark:bg-gray-700 dark:text-gray-200' : 
            'bg-blue-50 text-gray-800 dark:bg-blue-900 dark:text-gray-100'
          }`}
        >
          <div className="flex flex-col w-full">
            {/* 渲染消息内容 */}
            <div className="w-full overflow-x-auto">
              {renderedContent}
            </div>
            
            {/* 时间戳和操作按钮 */}
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {message.timestamp}
              </span>
              
              <div className="flex space-x-2">
                {isTextOnlyContent && (
                  <button
                    onClick={handleCopy}
                    className="p-1 text-gray-500 hover:text-blue-500 dark:text-gray-400 dark:hover:text-blue-400"
                    title="复制文本"
                  >
                    <Copy size={16} />
                  </button>
                )}
                
                {isAssistant && onRegenerate && (
                  <button
                    onClick={onRegenerate}
                    disabled={isRegenerating}
                    className="p-1 text-gray-500 hover:text-blue-500 dark:text-gray-400 dark:hover:text-blue-400
                             disabled:opacity-50 disabled:cursor-not-allowed"
                    title="重新生成"
                  >
                    <RotateCw size={16} className={isRegenerating ? 'animate-spin' : ''} />
                  </button>
                )}
                
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
            </div>
          </div>
        </Card>
      </div>
      
      {/* 复制成功提示 */}
      {showCopySuccess && (
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 -translate-y-2 bg-black bg-opacity-70 text-white px-2 py-1 rounded text-xs">
          已复制到剪贴板
        </div>
      )}
      
      {/* 图片放大模态框 */}
      {enlargedImage && createPortal(
        <div 
          className="fixed inset-0 z-50 bg-black bg-opacity-80 flex items-center justify-center p-4"
          onClick={() => setEnlargedImage(null)}
        >
          <div className="relative max-w-[90vw] max-h-[90vh]">
            <button
              className="absolute top-2 right-2 p-1 rounded-full bg-black bg-opacity-50 text-white hover:bg-opacity-70 transition-opacity"
              onClick={(e) => {
                e.stopPropagation();
                setEnlargedImage(null);
              }}
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
    </div>
  );
} 