import React, { useRef, useImperativeHandle, forwardRef, useCallback } from 'react';
import { CanvasItem as ICanvasItem, LoadingCanvasItem, Viewport } from '../types';
import { CanvasItem } from './CanvasItem';
import { Loader2 } from 'lucide-react';
import { useCanvasGestures } from '../hooks/useCanvasGestures';

interface CanvasProps {
  items: ICanvasItem[];
  loadingItems: LoadingCanvasItem[];
  selectedIds: string[]; // Changed from selectedId
  renamingId: string | null;
  snapEnabled: boolean;
  onSelectionChange: (ids: string[]) => void;
  onItemsChange: (items: ICanvasItem[]) => void;
  onItemUpdate: (id: string, updates: Partial<ICanvasItem>) => void;
  onDropFiles: (files: File[], x: number, y: number) => void;
  onEditItem: (item: ICanvasItem) => void;
  onContextMenu: (e: React.MouseEvent, id: string) => void;
  onCanvasContextMenu: (e: React.MouseEvent | { clientX: number, clientY: number }) => void;
  onRenameComplete: (id: string, newName: string) => void;
  onGroupDrag?: (dx: number, dy: number) => void;
}

export interface CanvasHandle {
  flyTo: (x: number, y: number, scale: number) => void;
  getViewport: () => Viewport;
}

export const Canvas = forwardRef<CanvasHandle, CanvasProps>(({
  items,
  loadingItems,
  selectedIds,
  renamingId,
  snapEnabled,
  onSelectionChange,
  onItemsChange,
  onItemUpdate,
  onDropFiles,
  onEditItem,
  onContextMenu,
  onCanvasContextMenu,
  onRenameComplete,
  onGroupDrag
}, ref) => {
  const viewportRef = useRef<Viewport>({ x: 0, y: 0, scale: 1 });
  const containerRef = useRef<HTMLDivElement>(null);
  const itemsContainerRef = useRef<HTMLDivElement>(null);

  const {
    scaleState,
    setScaleState,
    selectionBox,
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
    items, // Pass items for collision calc
    onSelectionChange,
    onCanvasContextMenu,
    onDropFiles
  });

  useImperativeHandle(ref, () => ({
    flyTo: (x, y, scale) => flyTo(x, y, scale),
    getViewport: () => viewportRef.current
  }));

  const handleUpdateItem = useCallback((id: string, updates: Partial<ICanvasItem>) => {
    onItemUpdate(id, updates);
  }, [onItemUpdate]);

  const gridSize = 40 * scaleState;
  const gridOffset = gridSize / 2;

  // Fix mobile crash: Hide grid if dots are too dense (scale < 0.4 roughly)
  const gridOpacity = gridSize < 16 ? 0 : 1;

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
          backgroundImage: 'radial-gradient(circle, #27272a 3px, transparent 3px)',
          backgroundSize: `${gridSize}px ${gridSize}px`,
          backgroundPosition: `${-gridOffset}px ${-gridOffset}px`,
          opacity: gridOpacity,
          transition: 'opacity 0.2s ease-out' 
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
              isSelected={selectedIds.includes(item.id)}
              selectedIds={selectedIds}
              scale={scaleState}
              snapEnabled={snapEnabled}
              onSelect={onSelectionChange}
              onUpdate={handleUpdateItem}
              onEdit={onEditItem}
              onContextMenu={onContextMenu}
              viewportOffset={{ x: 0, y: 0 }}
              isRenaming={renamingId === item.id}
              onRenameComplete={(name) => onRenameComplete(item.id, name)}
              onGroupDrag={onGroupDrag}
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

      {/* Selection Box Overlay */}
      {selectionBox && (
          <div 
             className="absolute border border-blue-500 bg-blue-500/10 pointer-events-none z-50"
             style={{
                 left: Math.min(selectionBox.startX, selectionBox.curX),
                 top: Math.min(selectionBox.startY, selectionBox.curY),
                 width: Math.abs(selectionBox.curX - selectionBox.startX),
                 height: Math.abs(selectionBox.curY - selectionBox.startY)
             }}
          />
      )}

      {items.length === 0 && loadingItems.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
          <div className="text-zinc-700 text-center animate-in fade-in slide-in-from-bottom-5 duration-700">
            <p className="text-xl font-medium mb-2">Drag & Drop images here</p>
            <p className="text-sm opacity-60">Zoom with wheel. Pan to explore.</p>
            <p className="text-xs text-zinc-600 mt-2 md:hidden">Long press for options</p>
            <p className="text-xs text-zinc-800 mt-4 font-mono">Ctrl+Drag to select multiple</p>
          </div>
        </div>
      )}
    </div>
  );
});

Canvas.displayName = "Canvas";