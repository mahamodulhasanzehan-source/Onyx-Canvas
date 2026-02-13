import React from 'react';
import { CanvasItem } from '../types';
import { X, Image as ImageIcon, ImageOff } from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  items: CanvasItem[];
  onItemClick: (item: CanvasItem) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose, items, onItemClick }) => {
  return (
    <>
      {/* Backdrop for mobile */}
      <div 
        className={`fixed inset-0 bg-black/50 backdrop-blur-sm z-40 transition-opacity duration-300 md:hidden ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} 
        onClick={onClose}
      />
      
      {/* Sidebar Panel */}
      <div 
        className={`fixed top-0 right-0 h-full w-80 bg-zinc-950/95 border-l border-zinc-800 z-50 transform transition-transform duration-300 ease-in-out flex flex-col ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <h2 className="text-zinc-100 font-medium">Canvas Items <span className="text-zinc-500 text-sm ml-2">({items.length})</span></h2>
          <button onClick={onClose} className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {items.length === 0 ? (
             <div className="flex flex-col items-center justify-center h-40 text-zinc-600 text-sm gap-2">
                 <ImageIcon size={32} className="opacity-50" />
                 <p>No images yet</p>
             </div>
          ) : (
             items.map(item => (
                <button
                  key={item.id}
                  onClick={() => onItemClick(item)}
                  className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-zinc-900 text-left group transition-colors border border-transparent hover:border-zinc-800"
                >
                  <div className="w-12 h-12 rounded bg-zinc-900 overflow-hidden shrink-0 border border-zinc-800 group-hover:border-zinc-700 flex items-center justify-center">
                    {item.url ? (
                        <img src={item.url} alt="" className="w-full h-full object-cover" />
                    ) : (
                        <ImageOff size={16} className="text-zinc-700" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-zinc-300 group-hover:text-white truncate font-medium">{item.name}</p>
                    {/* Display ORIGINAL resolution (Quality), not current display size */}
                    <p className="text-xs text-zinc-500 truncate">{Math.round(item.originalWidth)} × {Math.round(item.originalHeight)}</p>
                  </div>
                </button>
             ))
          )}
        </div>
      </div>
    </>
  );
};