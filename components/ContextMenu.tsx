import React, { useEffect, useRef } from 'react';
import { Download, Edit2, Trash2, Plus, ImagePlus } from 'lucide-react';

interface ContextMenuProps {
  x: number;
  y: number;
  itemId?: string;
  onRename: () => void;
  onDelete: () => void;
  onDownload?: () => void;
  onAddImage?: () => void;
  onClose: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ 
  x, 
  y, 
  itemId, 
  onRename, 
  onDelete, 
  onDownload, 
  onAddImage, 
  onClose 
}) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Adjust position if it goes off screen
  const style = {
      top: y,
      left: x,
      // If we are close to the right edge, shift left
      transform: x > window.innerWidth - 170 ? 'translateX(-100%)' : 'none'
  };

  return (
    <div 
      ref={ref}
      className="fixed z-50 bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl py-1 w-40 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 origin-top-left"
      style={style}
      onContextMenu={(e) => e.preventDefault()}
    >
      {!itemId ? (
        // Canvas Context Menu (No Item Selected)
        <button 
            onClick={() => { onAddImage?.(); onClose(); }}
            className="text-left px-4 py-3 text-sm text-blue-400 hover:bg-zinc-800 hover:text-blue-300 transition-colors flex items-center gap-2 font-medium"
        >
            <ImagePlus size={16} />
            New Image
        </button>
      ) : (
        // Item Context Menu
        <>
            <button 
                onClick={() => { onRename(); onClose(); }}
                className="text-left px-4 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors flex items-center gap-2 group"
            >
                <Edit2 size={14} className="group-hover:text-blue-400 transition-colors" />
                Rename
            </button>
            
            {onDownload && (
                <button 
                onClick={() => { onDownload(); onClose(); }}
                className="text-left px-4 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors flex items-center gap-2 group"
                >
                <Download size={14} className="group-hover:text-green-400 transition-colors" />
                Download
                </button>
            )}

            <div className="h-px bg-zinc-800 my-1" />

            <button 
                onClick={() => { onDelete(); onClose(); }}
                className="text-left px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors flex items-center gap-2"
            >
                <Trash2 size={14} />
                Delete
            </button>
        </>
      )}
    </div>
  );
};