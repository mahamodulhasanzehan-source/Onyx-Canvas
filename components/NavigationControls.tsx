import React, { useState, useRef, useEffect } from 'react';
import { Search, AlignJustify, HelpCircle, MapPin } from 'lucide-react';

interface NavigationControlsProps {
  onFindClosest: () => void;
  onNavigateToOrigin: () => void;
  onToggleSidebar: () => void;
  onShowHelp: () => void;
}

export const NavigationControls: React.FC<NavigationControlsProps> = ({ 
  onFindClosest, 
  onNavigateToOrigin,
  onToggleSidebar, 
  onShowHelp 
}) => {
  const [showOriginMenu, setShowOriginMenu] = useState<{x: number, y: number} | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPress = useRef(false);

  useEffect(() => {
    const closeMenu = () => setShowOriginMenu(null);
    window.addEventListener('click', closeMenu);
    return () => window.removeEventListener('click', closeMenu);
  }, []);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Position menu slightly offset from cursor
    setShowOriginMenu({ x: e.clientX + 10, y: e.clientY + 10 });
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    isLongPress.current = false;
    const touch = e.touches[0];
    const x = touch.clientX;
    const y = touch.clientY;

    longPressTimer.current = setTimeout(() => {
      isLongPress.current = true;
      if (navigator.vibrate) navigator.vibrate(50);
      // Position menu near finger but readable
      setShowOriginMenu({ x: x + 20, y: y - 20 });
    }, 500);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (isLongPress.current && e.cancelable) {
       e.preventDefault();
    }
  };

  const handleSearchClick = (e: React.MouseEvent) => {
      if (isLongPress.current) {
          e.preventDefault();
          e.stopPropagation();
          isLongPress.current = false;
          return;
      }
      onFindClosest();
  };

  return (
    <>
      <div className="fixed top-4 left-4 z-50 flex flex-col gap-2">
        <button 
          onClick={handleSearchClick}
          onContextMenu={handleContextMenu}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          className="p-3 bg-zinc-900/90 backdrop-blur-md border border-zinc-800 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 shadow-xl transition-all active:scale-95 select-none touch-manipulation relative group"
          title="Find closest image (Right-click/Hold for Origin)"
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
        <div className="w-full h-px bg-zinc-800 my-1" />
        <button 
          onClick={onShowHelp}
          className="p-3 bg-zinc-900/90 backdrop-blur-md border border-zinc-800 rounded-xl text-blue-400 hover:text-blue-300 hover:bg-zinc-800 shadow-xl transition-all active:scale-95"
          title="Help & Instructions"
        >
          <HelpCircle size={20} />
        </button>
      </div>

      {showOriginMenu && (
        <div 
            className="fixed z-[70] bg-zinc-900 border border-zinc-800 rounded-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
            style={{ top: showOriginMenu.y, left: showOriginMenu.x }}
            onClick={(e) => e.stopPropagation()} 
        >
            <button 
                onClick={() => { onNavigateToOrigin(); setShowOriginMenu(null); }}
                className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors whitespace-nowrap"
            >
                <MapPin size={16} className="text-blue-500" />
                Move to Origin (0,0)
            </button>
        </div>
      )}
    </>
  );
};