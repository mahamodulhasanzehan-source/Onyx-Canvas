import React, { useState, useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import { CanvasItem as ICanvasItem, LoadingCanvasItem, Viewport } from '../types';
import { CanvasItem } from './CanvasItem';
import { Loader2 } from 'lucide-react';

interface CanvasProps {
  items: ICanvasItem[];
  loadingItems: LoadingCanvasItem[];
  selectedId: string | null;
  renamingId: string | null;
  snapEnabled: boolean;
  onSelectionChange: (id: string | null) => void;
  onItemsChange: (items: ICanvasItem[]) => void;
  onItemUpdate: (id: string, updates: Partial<ICanvasItem>) => void;
  onDropFiles: (files: File[], x: number, y: number) => void;
  onEditItem: (item: ICanvasItem) => void;
  onContextMenu: (e: React.MouseEvent, id: string) => void;
  onCanvasContextMenu: (e: React.MouseEvent | { clientX: number, clientY: number }) => void;
  onRenameComplete: (id: string, newName: string) => void;
}

export interface CanvasHandle {
  flyTo: (x: number, y: number, scale: number) => void;
  getViewport: () => Viewport;
}

export const Canvas = forwardRef<CanvasHandle, CanvasProps>(({
  items,
  loadingItems,
  selectedId,
  renamingId,
  snapEnabled,
  onSelectionChange,
  onItemsChange,
  onItemUpdate,
  onDropFiles,
  onEditItem,
  onContextMenu,
  onCanvasContextMenu,
  onRenameComplete
}, ref) => {
  const viewportRef = useRef<Viewport>({ x: 0, y: 0, scale: 1 });
  
  const containerRef = useRef<HTMLDivElement>(null);
  const itemsContainerRef = useRef<HTMLDivElement>(null);
  
  const [scaleState, setScaleState] = useState(1); 
  
  const [isPanning, setIsPanning] = useState(false);
  const lastMousePos = useRef<{x: number, y: number}>({ x: 0, y: 0 });
  const animationFrameRef = useRef<number>(0);

  // Long press refs
  const touchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartPosRef = useRef<{x: number, y: number} | null>(null);

  // Keep latest items in ref to avoid re-creating handleUpdateItem callback
  const itemsRef = useRef(items);
  itemsRef.current = items;

  // Expose methods to parent
  useImperativeHandle(ref, () => ({
    flyTo: (x, y, scale) => {
      viewportRef.current = { x, y, scale };
      setScaleState(scale);
      updateVisuals();
    },
    getViewport: () => viewportRef.current
  }));

  const updateVisuals = useCallback(() => {
    const { x, y, scale } = viewportRef.current;
    
    if (itemsContainerRef.current) {
        itemsContainerRef.current.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
        itemsContainerRef.current.style.transformOrigin = '0 0';
    }
    
    // Directly update grid for performance
    const gridEl = document.getElementById('grid-bg-layer');
    if (gridEl) {
        gridEl.style.backgroundPosition = `${x}px ${y}px`;
        const gridSize = 40 * scale;
        gridEl.style.backgroundSize = `${gridSize}px ${gridSize}px`;
        gridEl.style.opacity = "0.8";
    }
  }, []);

  // Wheel Zoom Logic
  useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const handleWheel = (e: WheelEvent) => {
          e.preventDefault();
          const { x, y, scale } = viewportRef.current;
          
          const delta = -e.deltaY * 0.001;
          const newScale = Math.min(Math.max(scale * (1 + delta), 0.05), 50); 
          
          const rect = container.getBoundingClientRect();
          const mouseX = e.clientX - rect.left;
          const mouseY = e.clientY - rect.top;
          
          const wx = (mouseX - x) / scale;
          const wy = (mouseY - y) / scale;
          
          const newX = mouseX - wx * newScale;
          const newY = mouseY - wy * newScale;

          viewportRef.current = { x: newX, y: newY, scale: newScale };
          
          setScaleState(newScale); 
          updateVisuals();
      };

      container.addEventListener('wheel', handleWheel, { passive: false });
      return () => container.removeEventListener('wheel', handleWheel);
  }, [updateVisuals]);

  // Panning
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) { 
      onSelectionChange(null);
      setIsPanning(true);
      lastMousePos.current = { x: e.clientX, y: e.clientY };
      if (containerRef.current) containerRef.current.style.cursor = 'grabbing';
    }
  };

  // --- Touch Handling (Long Press for Background) ---
  const handleTouchStart = (e: React.TouchEvent) => {
      // Don't interfere if touching an item (handled in CanvasItem or bubbling will be stopped)
      // But we can check event target if needed. 
      // For now, we rely on CanvasItem stopping propagation for its own long press.
      
      const touch = e.touches[0];
      touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };
      
      touchTimerRef.current = setTimeout(() => {
          // Long press detected on background
          if (navigator.vibrate) navigator.vibrate(50);
          onCanvasContextMenu({ clientX: touch.clientX, clientY: touch.clientY });
          touchStartPosRef.current = null; // Clear to prevent panic logic
      }, 500); // 500ms threshold
  };

  const handleTouchMove = (e: React.TouchEvent) => {
      if (touchStartPosRef.current) {
          const touch = e.touches[0];
          const dx = Math.abs(touch.clientX - touchStartPosRef.current.x);
          const dy = Math.abs(touch.clientY - touchStartPosRef.current.y);
          
          // If moved more than 10px, cancel long press
          if (dx > 10 || dy > 10) {
              if (touchTimerRef.current) clearTimeout(touchTimerRef.current);
              touchStartPosRef.current = null;
          }
      }
  };

  const handleTouchEnd = () => {
      if (touchTimerRef.current) {
          clearTimeout(touchTimerRef.current);
      }
      touchStartPosRef.current = null;
  };

  const handleGlobalMouseMove = useCallback((e: MouseEvent) => {
    if (!isPanning) return;
    
    const dx = e.clientX - lastMousePos.current.x;
    const dy = e.clientY - lastMousePos.current.y;
    
    lastMousePos.current = { x: e.clientX, y: e.clientY };
    
    viewportRef.current.x += dx;
    viewportRef.current.y += dy;

    cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = requestAnimationFrame(updateVisuals);
  }, [isPanning, updateVisuals]);

  const handleGlobalMouseUp = useCallback(() => {
    if (isPanning) {
        setIsPanning(false);
        if (containerRef.current) containerRef.current.style.cursor = 'default';
    }
  }, [isPanning]);

  useEffect(() => {
    if (isPanning) {
      window.addEventListener('mousemove', handleGlobalMouseMove, { passive: true });
      window.addEventListener('mouseup', handleGlobalMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isPanning, handleGlobalMouseMove, handleGlobalMouseUp]);


  // Drop
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      const { x, y, scale } = viewportRef.current;
      const worldX = (e.clientX - rect.left - x) / scale;
      const worldY = (e.clientY - rect.top - y) / scale;
      onDropFiles(files, worldX, worldY);
    }
  };
  
  const handleDragOver = (e: React.DragEvent) => e.preventDefault();

  const handleUpdateItem = useCallback((id: string, updates: Partial<ICanvasItem>) => {
      // NOTE: We no longer do snapping here because CanvasItem handles it locally
      // and sends us the final, snapped coordinates on mouse up.
      // We just pass it through to update state and DB.

      const currentItems = itemsRef.current;
      onItemsChange(currentItems.map(item => {
        if (item.id === id) {
          return { ...item, ...updates };
        }
        return item;
      }));

      onItemUpdate(id, updates);

  }, [onItemsChange, onItemUpdate]); 

  return (
    <div 
      ref={containerRef}
      className="relative w-full h-screen overflow-hidden bg-canvas-bg cursor-default"
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onContextMenu={(e) => {
          e.preventDefault();
          onCanvasContextMenu(e);
      }} 
    >
      {/* Grid Layer */}
      <div id="grid-bg-layer" className="absolute inset-0 pointer-events-none z-0 will-change-[background-position,opacity]"
           style={{
             backgroundImage: 'radial-gradient(circle, #27272a 1.5px, transparent 1.5px)',
             backgroundSize: `${40 * scaleState}px ${40 * scaleState}px`, 
             backgroundPosition: '0px 0px',
             opacity: 0.8
           }}
      />
      
      {/* Items Container */}
      <div 
        ref={itemsContainerRef}
        className="absolute top-0 left-0 w-full h-full pointer-events-none will-change-transform"
        style={{ transform: 'translate3d(0px, 0px, 0) scale(1)', transformOrigin: '0 0' }}
      >
        <div className="pointer-events-auto">
             {items.map(item => (
                <CanvasItem
                  key={item.id}
                  item={item}
                  items={items}
                  isSelected={item.id === selectedId}
                  scale={scaleState}
                  snapEnabled={snapEnabled}
                  onSelect={onSelectionChange}
                  onUpdate={handleUpdateItem}
                  onEdit={onEditItem}
                  onContextMenu={onContextMenu}
                  viewportOffset={{x:0, y:0}} 
                  isRenaming={renamingId === item.id}
                  onRenameComplete={(name) => onRenameComplete(item.id, name)}
                />
              ))}

             {loadingItems.map(item => (
                 <div 
                    key={item.id}
                    className="absolute flex flex-col items-center justify-center p-4 bg-zinc-900/80 border border-zinc-700 rounded-lg backdrop-blur-sm animate-pulse shadow-[0_0_20px_rgba(59,130,246,0.2)]"
                    style={{
                        left: item.x,
                        top: item.y,
                        width: 150,
                        height: 120,
                        transform: 'translate(-50%, -50%)' 
                    }}
                 >
                     <div className="relative">
                        <Loader2 className="animate-spin text-blue-500 mb-2" size={32} />
                        <div className="absolute inset-0 blur-md bg-blue-500/30 rounded-full animate-pulse"></div>
                     </div>
                     <span className="text-[10px] text-zinc-400 font-medium uppercase tracking-wider mb-1">Compressing</span>
                     <span className="text-xs text-zinc-300 truncate max-w-full text-center px-2">{item.name}</span>
                 </div>
             ))}
        </div>
      </div>

      {items.length === 0 && loadingItems.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
          <div className="text-zinc-700 text-center animate-in fade-in slide-in-from-bottom-5 duration-700">
            <p className="text-xl font-medium mb-2">Drag & Drop images here</p>
            <p className="text-sm opacity-60">Zoom with wheel. Pan to explore.</p>
            <p className="text-xs text-zinc-600 mt-2 md:hidden">Long press for options</p>
          </div>
        </div>
      )}
    </div>
  );
});

Canvas.displayName = "Canvas";