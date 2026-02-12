import React, { useState, useRef, useEffect } from 'react';
import { CanvasItem as ICanvasItem, ResizeHandle, Point } from '../types';

export interface CanvasItemProps {
  item: ICanvasItem;
  isSelected: boolean;
  scale: number;
  onSelect: (id: string) => void;
  onUpdate: (id: string, updates: Partial<ICanvasItem>) => void;
  onContextMenu: (e: React.MouseEvent, id: string) => void;
  onEdit?: (item: ICanvasItem) => void;
  viewportOffset: Point;
  isRenaming?: boolean;
  onRenameComplete?: (newName: string) => void;
}

export const CanvasItem: React.FC<CanvasItemProps> = ({
  item,
  isSelected,
  scale,
  onSelect,
  onUpdate,
  onContextMenu,
  onEdit,
  isRenaming,
  onRenameComplete
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<Point | null>(null);
  
  const [isResizing, setIsResizing] = useState(false);
  const [resizeStart, setResizeStart] = useState<{ 
      startX: number; startY: number; 
      origX: number; origY: number; 
      origW: number; origH: number; 
      handle: ResizeHandle 
  } | null>(null);
  
  const [nameInput, setNameInput] = useState(item.name);
  const inputRef = useRef<HTMLInputElement>(null);

  // Refs for event listeners to avoid re-binding
  const itemRef = useRef(item);
  itemRef.current = item;
  const scaleRef = useRef(scale);
  scaleRef.current = scale;

  useEffect(() => {
      if (isRenaming && inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
      }
  }, [isRenaming]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left click
    e.stopPropagation();
    onSelect(item.id);
    
    if (!isRenaming) {
        setIsDragging(true);
        setDragStart({ x: e.clientX, y: e.clientY });
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onEdit) onEdit(item);
  };

  const handleResizeStart = (e: React.MouseEvent, handle: ResizeHandle) => {
    e.stopPropagation();
    e.preventDefault();
    setIsResizing(true);
    setResizeStart({ 
      startX: e.clientX, 
      startY: e.clientY, 
      origX: item.x,
      origY: item.y,
      origW: item.width, 
      origH: item.height, 
      handle 
    });
  };

  // Global Drag/Resize
  useEffect(() => {
    const handleGlobalMove = (e: MouseEvent) => {
      const currentScale = scaleRef.current;
      const currentItem = itemRef.current;

      if (isDragging && dragStart) {
        const dx = (e.clientX - dragStart.x) / currentScale;
        const dy = (e.clientY - dragStart.y) / currentScale;
        
        onUpdate(currentItem.id, {
          x: currentItem.x + dx,
          y: currentItem.y + dy
        });
        setDragStart({ x: e.clientX, y: e.clientY });
      }

      if (isResizing && resizeStart) {
        const dx = (e.clientX - resizeStart.startX) / currentScale;
        const dy = (e.clientY - resizeStart.startY) / currentScale;
        
        let newW = resizeStart.origW;
        let newH = resizeStart.origH;
        let newX = resizeStart.origX;
        let newY = resizeStart.origY;
        const aspectRatio = resizeStart.origW / resizeStart.origH;
        const isShift = e.shiftKey; 

        if (resizeStart.handle.includes('e')) newW = Math.max(50, resizeStart.origW + dx);
        if (resizeStart.handle.includes('w')) {
            const possibleW = resizeStart.origW - dx;
            if (possibleW > 50) { newW = possibleW; newX = resizeStart.origX + dx; }
        }
        if (resizeStart.handle.includes('s')) newH = Math.max(50, resizeStart.origH + dy);
        if (resizeStart.handle.includes('n')) {
            const possibleH = resizeStart.origH - dy;
            if (possibleH > 50) { newH = possibleH; newY = resizeStart.origY + dy; }
        }

        if (!isShift) {
            if (resizeStart.handle === 'se') newH = newW / aspectRatio;
            else if (resizeStart.handle === 'sw') newH = newW / aspectRatio;
            else if (resizeStart.handle === 'ne') newW = newH * aspectRatio;
            else if (resizeStart.handle === 'nw') {
                 newH = newW / aspectRatio;
                 newY = resizeStart.origY + (resizeStart.origH - newH);
            }
        }

        onUpdate(currentItem.id, { x: newX, y: newY, width: newW, height: newH });
      }
    };

    const handleUp = () => {
      setIsDragging(false);
      setIsResizing(false);
      setDragStart(null);
      setResizeStart(null);
    };

    if (isDragging || isResizing) {
      window.addEventListener('mousemove', handleGlobalMove);
      window.addEventListener('mouseup', handleUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleGlobalMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [isDragging, isResizing, dragStart, resizeStart, onUpdate]); 
  // removed item and scale from deps to prevent effect churn, using refs instead

  const handleNameKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
          onRenameComplete?.(nameInput);
      }
  };

  const handleNameBlur = () => {
      onRenameComplete?.(nameInput);
  };

  // Counter-scale for handles so they stay constant visual size
  const handleSize = 10 / scale;
  const handleOffset = -handleSize / 2;

  return (
    <div
      className={`absolute group select-none animate-in fade-in zoom-in-95 duration-300 ${isSelected ? 'z-20' : 'z-10'}`}
      style={{
        transform: `translate(${item.x}px, ${item.y}px)`,
        width: item.width,
        height: item.height,
        cursor: isDragging ? 'grabbing' : 'grab',
      }}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      onContextMenu={(e) => onContextMenu(e, item.id)}
    >
      <div className={`w-full h-full relative transition-all duration-200 ${isSelected ? 'ring-2 ring-blue-500 shadow-[0_0_30px_rgba(59,130,246,0.3)]' : 'hover:ring-1 hover:ring-white/50 hover:shadow-lg'}`}>
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
        
        {isSelected && (
            <>
                <div style={{ width: handleSize, height: handleSize, top: handleOffset, left: handleOffset }} className="absolute bg-blue-500 rounded-full cursor-nw-resize hover:scale-150 transition-transform shadow-sm" onMouseDown={(e) => handleResizeStart(e, 'nw')} />
                <div style={{ width: handleSize, height: handleSize, top: handleOffset, right: handleOffset }} className="absolute bg-blue-500 rounded-full cursor-ne-resize hover:scale-150 transition-transform shadow-sm" onMouseDown={(e) => handleResizeStart(e, 'ne')} />
                <div style={{ width: handleSize, height: handleSize, bottom: handleOffset, left: handleOffset }} className="absolute bg-blue-500 rounded-full cursor-sw-resize hover:scale-150 transition-transform shadow-sm" onMouseDown={(e) => handleResizeStart(e, 'sw')} />
                <div style={{ width: handleSize, height: handleSize, bottom: handleOffset, right: handleOffset }} className="absolute bg-blue-500 rounded-full cursor-se-resize hover:scale-150 transition-transform shadow-sm" onMouseDown={(e) => handleResizeStart(e, 'se')} />
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
                style={{ transform: `scale(${1/scale})`, transformOrigin: 'top center' }}
            />
        ) : (
            <div 
                className="text-zinc-400 text-xs px-2 py-0.5 rounded bg-zinc-950/50 backdrop-blur-sm text-center truncate max-w-[200px] opacity-0 group-hover:opacity-100 transition-opacity delay-100"
                style={{ transform: `scale(${1/scale})`, transformOrigin: 'top center' }}
            >
                {item.name}
            </div>
        )}
      </div>
    </div>
  );
};