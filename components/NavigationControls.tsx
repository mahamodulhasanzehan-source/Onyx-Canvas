import React from 'react';
import { Search, AlignJustify } from 'lucide-react';

interface NavigationControlsProps {
  onFindClosest: () => void;
  onToggleSidebar: () => void;
}

export const NavigationControls: React.FC<NavigationControlsProps> = ({ onFindClosest, onToggleSidebar }) => {
  return (
    <div className="fixed top-4 left-4 z-50 flex flex-col gap-2">
      <button 
        onClick={onFindClosest}
        className="p-3 bg-zinc-900/90 backdrop-blur-md border border-zinc-800 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 shadow-xl transition-all active:scale-95"
        title="Find closest image"
      >
        <Search size={20} />
      </button>
      <button 
        onClick={onToggleSidebar}
        className="p-3 bg-zinc-900/90 backdrop-blur-md border border-zinc-800 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 shadow-xl transition-all active:scale-95"
        title="Image List"
      >
        <AlignJustify size={20} />
      </button>
    </div>
  );
};