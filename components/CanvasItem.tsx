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
    const touch = e.touches[0];
    const mockEvent = {
        button: 0,
        clientX: touch.clientX,
        clientY: touch.clientY,
        stopPropagation: () => e.stopPropagation(),
        preventDefault: () => {} 
    } as unknown as React.MouseEvent;

    handleMouseDown(mockEvent);

    touchStartPos.current = { x: touch.clientX, y: touch.clientY };
    touchTimer.current = setTimeout(() => {
      if (isSelected) {
          if (navigator.vibrate) navigator.vibrate(50);
          onContextMenu({ clientX: touch.clientX, clientY: touch.clientY }, item.id);
      }
      touchStartPos.current = null;
    }, 500);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
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

  // Increased visual size for better touch/click targets
  const handleSize = 24 / scale;
  const handleOffset = -handleSize / 2;

  const displayX = localState?.x ?? item.x;
  const displayY = localState?.y ?? item.y;
  const displayW = localState?.width ?? item.width;
  const displayH = localState?.height ?? item.height;

  const transitionClass = (isDragging || isResizing) ? 'duration-0' : 'duration-300';

  // --- Non-destructive Crop Logic ---
  const crop = item.crop || { x: 0, y: 0, width: 1, height: 1 };
  
  const innerWidthPercent = (1 / crop.width) * 100;
  const innerHeightPercent = (1 / crop.height) * 100;
  
  const filterString = `
    brightness(${item.filters.brightness}%) 
    contrast(${item.filters.contrast}%) 
    saturate(${item.filters.saturation ?? 100}%) 
    hue-rotate(${item.filters.hue ?? 0}deg) 
    blur(${item.filters.blur ?? 0}px)
    sepia(${item.filters.sepia ?? 0}%)
  `;

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
      <div className={`w-full h-full relative overflow-hidden transition-all ${transitionClass} bg-zinc-900 ${isSelected ? 'ring-2 ring-blue-500 shadow-[0_0_30px_rgba(59,130,246,0.3)]' : 'hover:ring-1 hover:ring-white/50 hover:shadow-lg'}`}>
        {item.url ? (
          <div className="w-full h-full relative overflow-hidden">
            <div 
                className="absolute origin-top-left"
                style={{
                    width: `${innerWidthPercent}%`,
                    height: `${innerHeightPercent}%`,
                    left: `${-(crop.x / crop.width) * 100}%`,
                    top: `${-(crop.y / crop.height) * 100}%`,
                }}
            >
                <img
                    src={item.url}
                    alt={item.name}
                    className="absolute inset-0 w-full h-full object-fill pointer-events-none block"
                    style={{
                        filter: filterString,
                        transform: `rotate(${item.rotation}deg)`
                    }}
                    draggable={false}
                />
                
                {item.drawingUrl && (
                    <img 
                        src={item.drawingUrl}
                        className="absolute inset-0 w-full h-full object-fill pointer-events-none block z-10"
                        style={{
                            transform: `rotate(${item.rotation}deg)`
                        }}
                    />
                )}
            </div>
          </div>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-zinc-600 p-2">
            <ImageOff size={24} />
            <span className="text-[10px] mt-1 text-center leading-tight">Image on other device</span>
          </div>
        )}

        {isSelected && (
          <>
            <div 
                style={{ width: handleSize, height: handleSize, top: handleOffset, left: handleOffset }} 
                className="absolute bg-blue-500 rounded-full cursor-nw-resize hover:scale-150 transition-transform shadow-sm z-50 touch-manipulation" 
                onMouseDown={(e) => handleResizeStart(e, 'nw')}
                onTouchStart={(e) => handleResizeStart(e, 'nw')}
            />
            <div 
                style={{ width: handleSize, height: handleSize, top: handleOffset, right: handleOffset }} 
                className="absolute bg-blue-500 rounded-full cursor-ne-resize hover:scale-150 transition-transform shadow-sm z-50 touch-manipulation" 
                onMouseDown={(e) => handleResizeStart(e, 'ne')}
                onTouchStart={(e) => handleResizeStart(e, 'ne')}
            />
            <div 
                style={{ width: handleSize, height: handleSize, bottom: handleOffset, left: handleOffset }} 
                className="absolute bg-blue-500 rounded-full cursor-sw-resize hover:scale-150 transition-transform shadow-sm z-50 touch-manipulation" 
                onMouseDown={(e) => handleResizeStart(e, 'sw')}
                onTouchStart={(e) => handleResizeStart(e, 'sw')}
            />
            <div 
                style={{ width: handleSize, height: handleSize, bottom: handleOffset, right: handleOffset }} 
                className="absolute bg-blue-500 rounded-full cursor-se-resize hover:scale-150 transition-transform shadow-sm z-50 touch-manipulation" 
                onMouseDown={(e) => handleResizeStart(e, 'se')}
                onTouchStart={(e) => handleResizeStart(e, 'se')}
            />
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