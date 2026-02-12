import React, { useState, useRef, useEffect, memo } from 'react';
import { CanvasItem as ICanvasItem, ResizeHandle, Point } from '../types';
import { ImageOff } from 'lucide-react';
import { snapToGrid } from '../utils/geometry';

export interface CanvasItemProps {
  item: ICanvasItem;
  isSelected: boolean;
  scale: number;
  snapEnabled: boolean;
  onSelect: (id: string) => void;
  onUpdate: (id: string, updates: Partial<ICanvasItem>) => void;
  onContextMenu: (e: React.MouseEvent | { clientX: number, clientY: number }, id: string) => void;
  onEdit?: (item: ICanvasItem) => void;
  viewportOffset: Point;
  isRenaming?: boolean;
  onRenameComplete?: (newName: string) => void;
}

export const CanvasItem: React.FC<CanvasItemProps> = memo(({
  item,
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
  // Local state for dragging/resizing interaction
  // This overrides the props while interacting to avoid laggy round-trips to parent state
  const [localState, setLocalState] = useState<Partial<ICanvasItem> | null>(null);

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

  // Refs for event listeners
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  
  // Base item ref to calculate deltas against the starting state of the drag
  // We use this instead of props.item during drag to avoid fighting with incoming prop updates if any
  const initialDragItemRef = useRef<ICanvasItem | null>(null);

  // Long Press Refs
  const touchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartPos = useRef<Point | null>(null);

  useEffect(() => {
      if (isRenaming && inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
      }
  }, [isRenaming]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    onSelect(item.id);
    
    if (!isRenaming) {
        setIsDragging(true);
        setDragStart({ x: e.clientX, y: e.clientY });
        initialDragItemRef.current = { ...item }; // Snapshot starting state
        setLocalState({ x: item.x, y: item.y }); // Initialize local state
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onEdit && item.url) onEdit(item);
  };

  // --- Touch Handling ---
  const handleTouchStart = (e: React.TouchEvent) => {
    // Note: We intentionally don't stop propagation here to let the touch event bubble up 
    // if it turns out to be a pan/scroll, but for long-press we catch it.
    // However, for the ContextMenu to work specifically on this item, we trigger it here.
    
    const touch = e.touches[0];
    touchStartPos.current = { x: touch.clientX, y: touch.clientY };

    touchTimer.current = setTimeout(() => {
      // Long press detected on item
      if (navigator.vibrate) navigator.vibrate(50);
      onContextMenu({ clientX: touch.clientX, clientY: touch.clientY }, item.id);
      
      // Clear refs
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

  const handleResizeStart = (e: React.MouseEvent, handle: ResizeHandle) => {
    e.stopPropagation();
    e.preventDefault();
    setIsResizing(true);
    initialDragItemRef.current = { ...item };
    setLocalState({ x: item.x, y: item.y, width: item.width, height: item.height });
    
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

  useEffect(() => {
    const handleGlobalMove = (e: MouseEvent) => {
      const currentScale = scaleRef.current;
      const startItem = initialDragItemRef.current;

      if (!startItem) return;

      if (isDragging && dragStart) {
        const dx = (e.clientX - dragStart.x) / currentScale;
        const dy = (e.clientY - dragStart.y) / currentScale;
        
        let newX = startItem.x + dx;
        let newY = startItem.y + dy;

        if (snapEnabled) {
            newX = snapToGrid(newX, 40);
            newY = snapToGrid(newY, 40);
        }
        
        // Update ONLY local state
        setLocalState({ x: newX, y: newY });
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

        if (snapEnabled) {
            // Optional: Snap dimensions or position during resize
            // Snapping position is safer visually
            newX = snapToGrid(newX, 40);
            newY = snapToGrid(newY, 40);
        }

        setLocalState({ x: newX, y: newY, width: newW, height: newH });
      }
    };

    const handleUp = () => {
      if ((isDragging || isResizing) && localState) {
          // Commit the final state to parent (and server)
          // This is the ONLY time we update the server
          onUpdate(item.id, localState);
      }

      setIsDragging(false);
      setIsResizing(false);
      setDragStart(null);
      setResizeStart(null);
      setLocalState(null); // Clear local state to revert to props source
      initialDragItemRef.current = null;
    };

    if (isDragging || isResizing) {
      window.addEventListener('mousemove', handleGlobalMove);
      window.addEventListener('mouseup', handleUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleGlobalMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [isDragging, isResizing, dragStart, resizeStart, onUpdate, item.id, snapEnabled, localState]); 

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

  // Use local state if active, otherwise fallback to props
  const displayX = localState?.x ?? item.x;
  const displayY = localState?.y ?? item.y;
  const displayW = localState?.width ?? item.width;
  const displayH = localState?.height ?? item.height;

  // Disable transition during drag for instant responsiveness
  const transitionClass = (isDragging || isResizing) ? 'duration-0' : 'duration-300';

  return (
    <div
      className={`absolute group select-none animate-in fade-in zoom-in-95 ${transitionClass} ${isSelected ? 'z-20' : 'z-10'}`}
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
});