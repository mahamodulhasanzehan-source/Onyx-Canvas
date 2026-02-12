import React, { useEffect, useRef } from 'react';
import { Download, Edit2, Trash2 } from 'lucide-react';

interface ContextMenuProps {
  x: number;
  y: number;
  onRename: () => void;
  onDelete: () => void;
  onDownload?: () => void;
  onClose: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, onRename, onDelete, onDownload, onClose }) => {
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

  return (
    <div 
      ref={ref}
      className="fixed z-50 bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl py-1 w-40 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 origin-top-left"
      style={{ top: y, left: x }}
      onContextMenu={(e) => e.preventDefault()}
    >
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
    </div>
  );
};