import React, { useState, useRef, useEffect, memo } from 'react';
import { CanvasItem as ICanvasItem, Point } from '../types';
import { ImageOff } from 'lucide-react';
import { useItemInteraction } from '../hooks/useItemInteraction';

export interface CanvasItemProps {
  item: ICanvasItem;
  items: ICanvasItem[]; 
  isSelected: boolean;
  scale: number;
  snapEnabled: boolean;
  onSelect: (id: string | null) => void;
  onUpdate: (id: string, updates: Partial<ICanvasItem>) => void;
  onContextMenu: (e: React.MouseEvent | { clientX: number, clientY: number }, id: string) => void;
  onEdit?: (item: ICanvasItem) => void;
  viewportOffset: Point;
  isRenaming?: boolean;
  onRenameComplete?: (newName: string) => void;
}

export const CanvasItem: React.FC<CanvasItemProps> = memo(({
  item,
  items,
  isSelected,
  scale,
  snapEnabled,
  onSelect,
  onUpdate,
  onContextMenu,
  onEdit,
  isRenaming,
  onRenameComplete
}) => {
  const {
    localState,
    isDragging,
    isResizing,
    handleMouseDown,
    handleResizeStart
  } = useItemInteraction({
    item,
    items,
    scale,
    snapEnabled,
    onUpdate,
    onSelect,
    isRenaming,
    isSelected
  });

  const [nameInput, setNameInput] = useState(item.name);
  const inputRef = useRef<HTMLInputElement>(null);

  // Long Press Refs for Context Menu
  const touchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartPos = useRef<Point | null>(null);

  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isRenaming]);

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onEdit && item.url) onEdit(item);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    // We must invoke the hook's mouse down logic which handles the propagation logic
    // But since touch is different, we replicate the logic or adapt it.
    // Actually, useItemInteraction doesn't expose a specific touch handler, so we mimic handleMouseDown
    
    // Pass event to "MouseDown" handler logic for selection/drag state
    // But we need to convert touch event to something compatible or call the logic directly.
    // The hook attaches window listeners for move/up, but we need to initialize the state.
    
    // However, react onTouchStart is passive?
    // Let's rely on handleMouseDown logic inside the hook which accepts React.MouseEvent.
    // We'll cast strictly for the logic reuse or pass coordinates.
    // The hook logic uses clientX/Y.
    
    const touch = e.touches[0];
    const mockEvent = {
        button: 0,
        clientX: touch.clientX,
        clientY: touch.clientY,
        stopPropagation: () => e.stopPropagation(),
        preventDefault: () => {} // Don't prevent default on start or scrolling breaks
    } as unknown as React.MouseEvent;

    handleMouseDown(mockEvent);

    // Context Menu Logic (Long Press)
    touchStartPos.current = { x: touch.clientX, y: touch.clientY };
    touchTimer.current = setTimeout(() => {
      // REQUIREMENT: Only show context menu on long press if the item is ALREADY selected.
      if (isSelected) {
          if (navigator.vibrate) navigator.vibrate(50);
          onContextMenu({ clientX: touch.clientX, clientY: touch.clientY }, item.id);
      }
      touchStartPos.current = null;
    }, 500);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    // Cancel long press on move
    if (touchStartPos.current) {
      const touch = e.touches[0];
      const dx = Math.abs(touch.clientX - touchStartPos.current.x);
      const dy = Math.abs(touch.clientY - touchStartPos.current.y);
      if (dx > 10 || dy > 10) {
        if (touchTimer.current) clearTimeout(touchTimer.current);
        touchStartPos.current = null;
      }
    }
  };

  const handleTouchEnd = () => {
    if (touchTimer.current) clearTimeout(touchTimer.current);
    touchStartPos.current = null;
  };

  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onRenameComplete?.(nameInput);
    }
  };

  const handleNameBlur = () => {
    onRenameComplete?.(nameInput);
  };

  const handleSize = 10 / scale;
  const handleOffset = -handleSize / 2;

  const displayX = localState?.x ?? item.x;
  const displayY = localState?.y ?? item.y;
  const displayW = localState?.width ?? item.width;
  const displayH = localState?.height ?? item.height;

  const transitionClass = (isDragging || isResizing) ? 'duration-0' : 'duration-300';

  return (
    <div
      className={`canvas-item absolute group select-none animate-in fade-in zoom-in-95 ${transitionClass} ${isSelected ? 'z-20' : 'z-10'}`}
      style={{
        transform: `translate(${displayX}px, ${displayY}px)`,
        width: displayW,
        height: displayH,
        cursor: isDragging ? 'grabbing' : 'grab',
      }}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onDoubleClick={handleDoubleClick}
      onContextMenu={(e) => {
        e.stopPropagation();
        onContextMenu(e, item.id);
      }}
    >
      <div className={`w-full h-full relative transition-all ${transitionClass} bg-zinc-900 ${isSelected ? 'ring-2 ring-blue-500 shadow-[0_0_30px_rgba(59,130,246,0.3)]' : 'hover:ring-1 hover:ring-white/50 hover:shadow-lg'}`}>
        {item.url ? (
          <img
            src={item.url}
            alt={item.name}
            className="w-full h-full object-fill pointer-events-none select-none block"
            style={{
              filter: `brightness(${item.filters.brightness}%) contrast(${item.filters.contrast}%)`,
              transform: `rotate(${item.rotation}deg)`
            }}
            draggable={false}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-zinc-600 p-2">
            <ImageOff size={24} />
            <span className="text-[10px] mt-1 text-center leading-tight">Image on other device</span>
          </div>
        )}

        {isSelected && (
          <>
            <div style={{ width: handleSize, height: handleSize, top: handleOffset, left: handleOffset }} className="absolute bg-blue-500 rounded-full cursor-nw-resize hover:scale-150 transition-transform shadow-sm animate-in fade-in zoom-in duration-200" onMouseDown={(e) => handleResizeStart(e, 'nw')} />
            <div style={{ width: handleSize, height: handleSize, top: handleOffset, right: handleOffset }} className="absolute bg-blue-500 rounded-full cursor-ne-resize hover:scale-150 transition-transform shadow-sm animate-in fade-in zoom-in duration-200" onMouseDown={(e) => handleResizeStart(e, 'ne')} />
            <div style={{ width: handleSize, height: handleSize, bottom: handleOffset, left: handleOffset }} className="absolute bg-blue-500 rounded-full cursor-sw-resize hover:scale-150 transition-transform shadow-sm animate-in fade-in zoom-in duration-200" onMouseDown={(e) => handleResizeStart(e, 'sw')} />
            <div style={{ width: handleSize, height: handleSize, bottom: handleOffset, right: handleOffset }} className="absolute bg-blue-500 rounded-full cursor-se-resize hover:scale-150 transition-transform shadow-sm animate-in fade-in zoom-in duration-200" onMouseDown={(e) => handleResizeStart(e, 'se')} />
          </>
        )}
      </div>

      <div className="absolute top-full left-0 w-full mt-2 flex justify-center">
        {isRenaming ? (
          <input
            ref={inputRef}
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onKeyDown={handleNameKeyDown}
            onBlur={handleNameBlur}
            onMouseDown={(e) => e.stopPropagation()}
            className="bg-zinc-900/90 text-white text-xs px-2 py-1 rounded border border-blue-500 outline-none text-center min-w-[60px] shadow-xl"
            style={{ transform: `scale(${1 / scale})`, transformOrigin: 'top center' }}
          />
        ) : (
          <div
            className="text-zinc-400 text-xs px-2 py-0.5 rounded bg-zinc-950/50 backdrop-blur-sm text-center truncate max-w-[200px] opacity-0 group-hover:opacity-100 transition-opacity delay-100"
            style={{ transform: `scale(${1 / scale})`, transformOrigin: 'top center' }}
          >
            {item.name}
          </div>
        )}
      </div>
    </div>
  );
});