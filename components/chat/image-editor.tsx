import { useState, useRef, useCallback } from 'react';
import { X, ZoomIn, ZoomOut, RotateCw, Check } from 'lucide-react';
import { Card } from '@/components/ui/card';

interface ImageEditorProps {
  imageUrl: string;
  onSave: (editedImage: string) => void;
  onClose: () => void;
}

interface EditState {
  scale: number;
  rotation: number;
  position: { x: number; y: number };
}

export function ImageEditor({ imageUrl, onSave, onClose }: ImageEditorProps) {
  const [editState, setEditState] = useState<EditState>({
    scale: 1,
    rotation: 0,
    position: { x: 0, y: 0 }
  });
  
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const imageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleDragStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    setIsDragging(true);
    const pos = 'touches' in e ? e.touches[0] : e;
    setDragStart({ 
      x: pos.clientX - editState.position.x, 
      y: pos.clientY - editState.position.y 
    });
  }, [editState.position]);

  const handleDrag = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDragging) return;
    const pos = 'touches' in e ? e.touches[0] : e;
    
    setEditState(prev => ({
      ...prev,
      position: {
        x: pos.clientX - dragStart.x,
        y: pos.clientY - dragStart.y
      }
    }));
  }, [isDragging, dragStart]);

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  const handleSave = () => {
    // 创建一个临时canvas来生成最终的圆形头像
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = 200; // 最终图片大小
    canvas.width = size;
    canvas.height = size;

    // 创建圆形裁剪区域
    ctx.beginPath();
    ctx.arc(size/2, size/2, size/2, 0, Math.PI * 2);
    ctx.clip();

    // 加载图片
    const img = new Image();
    img.onload = () => {
      ctx.save();
      // 移动到中心点
      ctx.translate(size/2, size/2);
      // 应用旋转
      ctx.rotate(editState.rotation * Math.PI / 180);
      // 应用缩放
      ctx.scale(editState.scale, editState.scale);
      // 绘制图片
      ctx.drawImage(
        img,
        -size/2 + editState.position.x,
        -size/2 + editState.position.y,
        size,
        size
      );
      ctx.restore();
      
      // 转换为base64并保存
      const dataUrl = canvas.toDataURL('image/png');
      onSave(dataUrl);
    };
    img.src = imageUrl;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <Card className="w-[90vw] max-w-2xl p-6 bg-white dark:bg-gray-800">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">编辑头像</h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 编辑预览区域 */}
        <div className="relative w-48 h-48 mx-auto mb-4 rounded-full overflow-hidden border-2">
          <div
            ref={imageRef}
            className="w-full h-full cursor-move"
            onMouseDown={handleDragStart}
            onMouseMove={handleDrag}
            onMouseUp={handleDragEnd}
            onMouseLeave={handleDragEnd}
            onTouchStart={handleDragStart}
            onTouchMove={handleDrag}
            onTouchEnd={handleDragEnd}
          >
            <img
              src={imageUrl}
              alt="Edit preview"
              className="w-full h-full object-cover"
              style={{
                transform: `
                  translate(${editState.position.x}px, ${editState.position.y}px)
                  scale(${editState.scale})
                  rotate(${editState.rotation}deg)
                `,
                transition: isDragging ? 'none' : 'transform 0.2s'
              }}
              draggable={false}
            />
          </div>
        </div>

        {/* 控制面板 */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => setEditState(prev => ({ ...prev, scale: Math.min(prev.scale + 0.1, 3) }))}
              className="p-2 hover:bg-gray-100 rounded-full"
              title="放大"
            >
              <ZoomIn className="w-5 h-5" />
            </button>
            <button
              onClick={() => setEditState(prev => ({ ...prev, scale: Math.max(prev.scale - 0.1, 0.5) }))}
              className="p-2 hover:bg-gray-100 rounded-full"
              title="缩小"
            >
              <ZoomOut className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={editState.rotation}
                onChange={(e) => {
                  const value = parseInt(e.target.value);
                  if (!isNaN(value)) {
                    setEditState(prev => ({ ...prev, rotation: value }));
                  }
                }}
                className="w-16 p-1 text-sm border rounded"
                min={0}
                max={360}
              />
              <span className="text-sm">度</span>
            </div>
          </div>

          <div className="flex justify-center gap-2">
            <button
              onClick={() => setEditState({ scale: 1, rotation: 0, position: { x: 0, y: 0 } })}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded"
            >
              重置
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 text-sm text-white bg-blue-500 hover:bg-blue-600 rounded flex items-center gap-1"
            >
              <Check className="w-4 h-4" />
              确认
            </button>
          </div>
        </div>

        {/* 隐藏的canvas用于生成最终图片 */}
        <canvas ref={canvasRef} className="hidden" />
      </Card>
    </div>
  );
} 