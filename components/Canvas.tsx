import React, { useRef, useImperativeHandle, forwardRef, useCallback } from 'react';
import { CanvasItem as ICanvasItem, LoadingCanvasItem, Viewport } from '../types';
import { CanvasItem } from './CanvasItem';
import { Loader2 } from 'lucide-react';
import { useCanvasGestures } from '../hooks/useCanvasGestures';

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

  const {
    scaleState,
    setScaleState,
    updateVisuals,
    handleMouseDown,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleDrop,
    handleDragOver,
    flyTo
  } = useCanvasGestures({
    containerRef,
    itemsContainerRef,
    viewportRef,
    onSelectionChange,
    onCanvasContextMenu,
    onDropFiles
  });

  useImperativeHandle(ref, () => ({
    flyTo: (x, y, scale) => flyTo(x, y, scale),
    getViewport: () => viewportRef.current
  }));

  const handleUpdateItem = useCallback((id: string, updates: Partial<ICanvasItem>) => {
    // Optimistic update bubbling up
    onItemUpdate(id, updates);
  }, [onItemUpdate]);

  // Initial grid calculation for first render
  const gridSize = 40 * scaleState;
  const gridOffset = gridSize / 2;

  return (
    <div
      ref={containerRef}
      className="relative w-full h-screen overflow-hidden bg-canvas-bg cursor-default"
      style={{ touchAction: 'none' }}
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
          // 3px radius = 6px wide dots. Fully opaque (no transparency).
          backgroundImage: 'radial-gradient(circle, #27272a 3px, transparent 3px)',
          backgroundSize: `${gridSize}px ${gridSize}px`,
          // Offset by half grid size to align dots with (0,0) coordinate
          backgroundPosition: `${-gridOffset}px ${-gridOffset}px`,
          opacity: 1
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
              viewportOffset={{ x: 0, y: 0 }}
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