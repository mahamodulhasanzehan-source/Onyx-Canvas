import { useState, useRef, useEffect } from 'react';
import { CanvasItem, Point, ResizeHandle } from '../types';
import { snapToGrid, isColliding } from '../utils/geometry';

interface ItemInteractionConfig {
  item: CanvasItem;
  items: CanvasItem[];
  scale: number;
  snapEnabled: boolean;
  onUpdate: (id: string, updates: Partial<CanvasItem>) => void;
  onSelect: (id: string) => void;
  isRenaming?: boolean;
}

export const useItemInteraction = ({
  item,
  items,
  scale,
  snapEnabled,
  onUpdate,
  onSelect,
  isRenaming
}: ItemInteractionConfig) => {
  const [localState, setLocalState] = useState<Partial<CanvasItem> | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeStart, setResizeStart] = useState<{
    startX: number; startY: number;
    origX: number; origY: number;
    origW: number; origH: number;
    handle: ResizeHandle
  } | null>(null);

  const initialDragItemRef = useRef<CanvasItem | null>(null);
  const scaleRef = useRef(scale);
  scaleRef.current = scale;

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    onSelect(item.id);
    if (!isRenaming) {
      setIsDragging(true);
      setDragStart({ x: e.clientX, y: e.clientY });
      initialDragItemRef.current = { ...item };
      setLocalState({ x: item.x, y: item.y });
    }
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
      const gridSize = 40;
      if (!startItem) return;

      if (isDragging && dragStart) {
        const dx = (e.clientX - dragStart.x) / currentScale;
        const dy = (e.clientY - dragStart.y) / currentScale;
        let newX = startItem.x + dx;
        let newY = startItem.y + dy;
        if (snapEnabled) {
          newX = snapToGrid(newX, gridSize);
          newY = snapToGrid(newY, gridSize);
        }
        const candidate = { x: newX, y: newY, width: startItem.width, height: startItem.height };
        if (!isColliding(candidate, items, item.id)) {
          setLocalState({ x: newX, y: newY });
        }
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

        if (resizeStart.handle.includes('e')) newW = resizeStart.origW + dx;
        if (resizeStart.handle.includes('w')) {
          const rawNewX = resizeStart.origX + dx;
          const rawNewW = resizeStart.origW - dx;
          newX = rawNewX;
          newW = rawNewW;
        }
        if (resizeStart.handle.includes('s')) newH = resizeStart.origH + dy;
        if (resizeStart.handle.includes('n')) {
          const rawNewY = resizeStart.origY + dy;
          const rawNewH = resizeStart.origH - dy;
          newY = rawNewY;
          newH = rawNewH;
        }

        if (snapEnabled) {
          const snappedW = Math.max(gridSize, snapToGrid(newW, gridSize));
          const snappedH = Math.max(gridSize, snapToGrid(newH, gridSize));
          if (resizeStart.handle.includes('w')) {
            const rightEdge = resizeStart.origX + resizeStart.origW;
            const snappedX = snapToGrid(newX, gridSize);
            if (snappedX < rightEdge - gridSize) {
              newX = snappedX;
              newW = rightEdge - snappedX;
            } else {
              newX = rightEdge - gridSize;
              newW = gridSize;
            }
          } else {
            newW = snappedW;
          }
          if (resizeStart.handle.includes('n')) {
            const bottomEdge = resizeStart.origY + resizeStart.origH;
            const snappedY = snapToGrid(newY, gridSize);
            if (snappedY < bottomEdge - gridSize) {
              newY = snappedY;
              newH = bottomEdge - snappedY;
            } else {
              newY = bottomEdge - gridSize;
              newH = gridSize;
            }
          } else {
            newH = snappedH;
          }
        }

        if (!isShift && !snapEnabled) {
          if (resizeStart.handle === 'se') newH = newW / aspectRatio;
          else if (resizeStart.handle === 'sw') newH = newW / aspectRatio;
          else if (resizeStart.handle === 'ne') newW = newH * aspectRatio;
          else if (resizeStart.handle === 'nw') {
            newH = newW / aspectRatio;
            newY = resizeStart.origY + (resizeStart.origH - newH);
          }
        }

        newW = Math.max(snapEnabled ? gridSize : 50, newW);
        newH = Math.max(snapEnabled ? gridSize : 50, newH);

        const candidate = { x: newX, y: newY, width: newW, height: newH };
        if (!isColliding(candidate, items, item.id)) {
          setLocalState({ x: newX, y: newY, width: newW, height: newH });
        }
      }
    };

    const handleUp = () => {
      if ((isDragging || isResizing) && localState) {
        onUpdate(item.id, localState);
      }
      setIsDragging(false);
      setIsResizing(false);
      setDragStart(null);
      setResizeStart(null);
      setLocalState(null);
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
  }, [isDragging, isResizing, dragStart, resizeStart, onUpdate, item.id, snapEnabled, localState, items]);

  return {
    localState,
    isDragging,
    isResizing,
    handleMouseDown,
    handleResizeStart
  };
};