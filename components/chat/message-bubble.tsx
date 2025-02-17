import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Card } from '@/components/ui/card';
import { Bot, UserCircle, Copy, MessageSquare, RefreshCw } from 'lucide-react';
import { Message } from '@/services/chat';

interface MessageBubbleProps {
  message: Message;
  onRegenerate?: () => void;
}

export function MessageBubble({ message, onRegenerate }: MessageBubbleProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [isSelectable, setIsSelectable] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const timeoutRef = useRef<NodeJS.Timeout>();
  const bubbleRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const isTouchMovedRef = useRef(false);
  const scrollPositionRef = useRef(0);

  // 控制页面滚动
  useEffect(() => {
    if (showMenu) {
      // 保存当前滚动位置
      scrollPositionRef.current = window.scrollY;
      // 禁用页面滚动
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
      document.body.style.top = `-${scrollPositionRef.current}px`;
    } else {
      // 恢复页面滚动
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
      document.body.style.top = '';
      // 恢复滚动位置
      window.scrollTo(0, scrollPositionRef.current);
    }
  }, [showMenu]);

  const updateMenuPosition = (x: number, y: number) => {
    if (!bubbleRef.current) return;
    
    const bubbleRect = bubbleRef.current.getBoundingClientRect();
    const menuWidth = 192; // w-48 = 12rem = 192px
    const menuHeight = 140; // 估计的菜单高度
    
    // 计算最佳位置
    let menuX = x - menuWidth / 2; // 默认在触摸点水平居中
    let menuY = y - menuHeight - 10; // 默认在触摸点上方
    
    // 确保菜单不会超出屏幕边界
    menuX = Math.max(10, Math.min(menuX, window.innerWidth - menuWidth - 10));
    
    // 如果上方空间不足，则显示在下方
    if (menuY < 10) {
      menuY = y + 10;
    }
    
    setMenuPosition({ top: menuY, left: menuX });
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now()
    };
    isTouchMovedRef.current = false;

    timeoutRef.current = setTimeout(() => {
      if (!isTouchMovedRef.current && touchStartRef.current) {
        updateMenuPosition(touch.clientX, touch.clientY);
        setShowMenu(true);
      }
    }, 500);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;

    const touch = e.touches[0];
    const deltaX = Math.abs(touch.clientX - touchStartRef.current.x);
    const deltaY = Math.abs(touch.clientY - touchStartRef.current.y);

    if (deltaX > 10 || deltaY > 10) {
      isTouchMovedRef.current = true;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    }
  };

  const handleTouchEnd = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    touchStartRef.current = null;
  };

  const handleCopy = async () => {
    try {
      if (bubbleRef.current) {
        const textElement = bubbleRef.current.querySelector('p');
        if (textElement) {
          await navigator.clipboard.writeText(textElement.textContent || '');
          setShowMenu(false);
        }
      }
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleSelectText = () => {
    setIsSelectable(true);
    setShowMenu(false);
    
    requestAnimationFrame(() => {
      if (bubbleRef.current) {
        const textElement = bubbleRef.current.querySelector('p');
        if (textElement) {
          const selection = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(textElement);
          selection?.removeAllRanges();
          selection?.addRange(range);
        }
      }
    });
  };

  return (
    <div className="relative">
      <div
        ref={bubbleRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onContextMenu={(e) => e.preventDefault()}
        className={`relative transition-transform duration-200 ${
          showMenu ? 'scale-[1.02] z-50 overflow-auto max-h-[70vh]' : ''
        } ${isSelectable ? '' : 'select-none'}`}
        style={{
          WebkitTouchCallout: 'none',
          WebkitUserSelect: isSelectable ? 'text' : 'none',
          MozUserSelect: isSelectable ? 'text' : 'none',
          msUserSelect: isSelectable ? 'text' : 'none',
          userSelect: isSelectable ? 'text' : 'none',
        }}
      >
        <Card 
          className={`p-4 shadow-sm ${
            message.role === 'user' 
              ? 'bg-blue-500 text-white dark:bg-blue-600' 
              : 'bg-gray-100 dark:bg-gray-700 dark:text-gray-200'
          } ${
            showMenu ? 'ring-2 ring-blue-500 dark:ring-blue-400' : ''
          }`}
        >
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

      {/* 背景遮罩 */}
      {showMenu && (
        <div 
          className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 transition-opacity duration-200"
          onClick={() => {
            setShowMenu(false);
            setIsSelectable(false);
          }}
        />
      )}

      {/* 菜单 */}
      {showMenu && createPortal(
        <div 
          ref={menuRef}
          style={{
            position: 'fixed',
            top: `${menuPosition.top}px`,
            left: `${menuPosition.left}px`,
            zIndex: 9999,
          }}
          className="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden 
                     transform transition-transform duration-200 origin-top-left
                     w-48"
        >
          <button 
            onClick={handleCopy}
            className="flex items-center w-full px-4 py-3 text-sm text-gray-700 dark:text-gray-200 
                     hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <Copy className="w-4 h-4 mr-3" />
            复制
          </button>
          <div className="h-[1px] bg-gray-200 dark:bg-gray-700" />
          <button 
            onClick={handleSelectText}
            className="flex items-center w-full px-4 py-3 text-sm text-gray-700 dark:text-gray-200 
                     hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <MessageSquare className="w-4 h-4 mr-3" />
            选择文本
          </button>
          {message.role === 'assistant' && onRegenerate && (
            <>
              <div className="h-[1px] bg-gray-200 dark:bg-gray-700" />
              <button 
                onClick={() => {
                  onRegenerate();
                  setShowMenu(false);
                }}
                className="flex items-center w-full px-4 py-3 text-sm text-gray-700 dark:text-gray-200 
                         hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <RefreshCw className="w-4 h-4 mr-3" />
                重新生成
              </button>
            </>
          )}
        </div>,
        document.body
      )}
    </div>
  );
} 