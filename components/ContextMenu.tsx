import React, { useEffect, useRef } from 'react';

interface ContextMenuProps {
  x: number;
  y: number;
  onRename: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, onRename, onDelete, onClose }) => {
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
      className="fixed z-50 bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl py-1 w-32 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-100"
      style={{ top: y, left: x }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <button 
        onClick={() => { onRename(); onClose(); }}
        className="text-left px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
      >
        Rename
      </button>
      <button 
        onClick={() => { onDelete(); onClose(); }}
        className="text-left px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors"
      >
        Delete
      </button>
    </div>
  );
};