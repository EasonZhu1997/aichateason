import { useState, useRef, useCallback } from 'react';
import { X, Upload, Image as ImageIcon, RotateCw, ZoomIn, ZoomOut } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { ImageEditor } from './image-editor';

interface Character {
  name: string;
  description: string;
  avatar?: string;
}

interface CharacterEditorProps {
  character: Character;
  onSave: (character: Character) => void;
  onClose: () => void;
}

interface ImageEditor {
  scale: number;
  rotation: number;
  position: { x: number; y: number };
}

export function CharacterEditor({ character, onSave, onClose }: CharacterEditorProps) {
  const [name, setName] = useState(character.name);
  const [description, setDescription] = useState(character.description);
  const [avatar, setAvatar] = useState(character.avatar);
  const [showImageEditor, setShowImageEditor] = useState(false);
  const [imageEdit, setImageEdit] = useState<ImageEditor>({ 
    scale: 1, 
    rotation: 0,
    position: { x: 0, y: 0 }
  });
  
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLDivElement>(null);

  // 处理拖动开始
  const handleDragStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    setIsDragging(true);
    const pos = 'touches' in e ? e.touches[0] : e;
    setDragStart({ 
      x: pos.clientX - imageEdit.position.x, 
      y: pos.clientY - imageEdit.position.y 
    });
  }, [imageEdit.position]);

  // 处理拖动
  const handleDrag = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDragging) return;
    const pos = 'touches' in e ? e.touches[0] : e;
    
    setImageEdit(prev => ({
      ...prev,
      position: {
        x: pos.clientX - dragStart.x,
        y: pos.clientY - dragStart.y
      }
    }));
  }, [isDragging, dragStart]);

  // 处理拖动结束
  const handleDragEnd = () => {
    setIsDragging(false);
  };

  // 处理自定义角度旋转
  const handleRotationInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    if (!isNaN(value)) {
      setImageEdit(prev => ({
        ...prev,
        rotation: value
      }));
    }
  };

  // 重置图片位置
  const handleResetPosition = () => {
    setImageEdit(prev => ({
      ...prev,
      position: { x: 0, y: 0 },
      scale: 1,
      rotation: 0
    }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 1024 * 1024) {
        alert('图片大小不能超过1MB');
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = e.target?.result as string;
        setAvatar(base64);
        setShowImageEditor(true);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleImageSave = (editedImage: string) => {
    setAvatar(editedImage);
    setShowImageEditor(false);
  };

  // 图片编辑控制函数
  const handleZoomIn = () => {
    setImageEdit(prev => ({ ...prev, scale: Math.min(prev.scale + 0.1, 2) }));
  };

  const handleZoomOut = () => {
    setImageEdit(prev => ({ ...prev, scale: Math.max(prev.scale - 0.1, 0.5) }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ name, description, avatar });
  };

  return (
    <>
      <div 
        className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50"
        onClick={onClose}
      />
      
      <Card className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50
                      w-full max-w-lg p-6 bg-white dark:bg-gray-800 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold dark:text-gray-200">
            编辑角色设定
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col items-center gap-2">
            <div 
              className="w-24 h-24 rounded-full border-2 border-dashed border-gray-300 
                         flex items-center justify-center overflow-hidden cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              {avatar ? (
                <img src={avatar} alt="Character avatar" className="w-full h-full object-cover" />
              ) : (
                <div className="flex flex-col items-center">
                  <ImageIcon className="w-8 h-8 text-gray-400" />
                  <span className="text-xs text-gray-500 mt-1">上传头像</span>
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
            {avatar && (
              <button
                type="button"
                onClick={() => setShowImageEditor(true)}
                className="text-xs text-blue-500 hover:text-blue-600"
              >
                编辑头像
              </button>
            )}
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              角色名称
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent
                       dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
              placeholder="输入角色名称..."
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              角色描述
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={10}
              className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent
                       dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
              placeholder="输入角色描述..."
              required
            />
          </div>
          
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 
                       dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm text-white bg-blue-500 hover:bg-blue-600
                       rounded-lg transition-colors"
            >
              保存
            </button>
          </div>
        </form>
      </Card>

      {/* 图片编辑器弹窗 */}
      {showImageEditor && avatar && (
        <ImageEditor
          imageUrl={avatar}
          onSave={handleImageSave}
          onClose={() => setShowImageEditor(false)}
        />
      )}
    </>
  );
} 