import { useState, useRef, useEffect } from 'react';
import { CanvasItem, Point, ResizeHandle } from '../types';
import { snapToGrid, isColliding } from '../utils/geometry';

interface ItemInteractionConfig {
  item: CanvasItem;
  items: CanvasItem[];
  scale: number;
  snapEnabled: boolean;
  onUpdate: (id: string, updates: Partial<CanvasItem>) => void;
  onSelect: (id: string | null) => void;
  isRenaming?: boolean;
  isSelected: boolean;
}

export const useItemInteraction = ({
  item,
  items,
  scale,
  snapEnabled,
  onUpdate,
  onSelect,
  isRenaming,
  isSelected
}: ItemInteractionConfig) => {
  const [localState, setLocalState] = useState<Partial<CanvasItem> | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  
  // New state to track if we are checking for a tap on an unselected item
  const [isTapCheck, setIsTapCheck] = useState(false);
  
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
  
  // Track movement to distinguish click vs drag
  const hasMovedRef = useRef(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    
    hasMovedRef.current = false;
    setDragStart({ x: e.clientX, y: e.clientY });

    if (isSelected && !isRenaming) {
      // SELECTED: Stop propagation (prevent pan), start dragging item
      e.stopPropagation();
      setIsDragging(true);
      initialDragItemRef.current = { ...item };
      setLocalState({ x: item.x, y: item.y });
    } else if (!isSelected) {
      // UNSELECTED: Allow propagation (enable pan), start tap check
      // Do NOT setIsDragging(true)
      setIsTapCheck(true);
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
      if (!dragStart) return;

      const currentScale = scaleRef.current;
      const startItem = initialDragItemRef.current;
      const gridSize = 40;

      // Check for movement threshold
      const dist = Math.hypot(e.clientX - dragStart.x, e.clientY - dragStart.y);
      if (dist > 3) {
          hasMovedRef.current = true;
          
          // If we were checking for a tap on an unselected item, and we moved, 
          // it's a pan. Cancel the tap check so we don't select on release.
          if (isTapCheck) {
            setIsTapCheck(false);
          }
      }

      if (isDragging && startItem) {
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

      if (isResizing && resizeStart && startItem) {
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
      if (isDragging) {
        // Was dragging a selected item
        if (hasMovedRef.current && localState) {
          // Moved -> Update position
          onUpdate(item.id, localState);
        } else if (!hasMovedRef.current) {
          // Didn't move -> Toggle off (Deselect)
          onSelect(null);
        }
      } else if (isTapCheck) {
        // Was checking for tap on unselected item
        if (!hasMovedRef.current) {
          // Didn't move -> Select it
          onSelect(item.id);
        }
        // If moved, it was a pan, do nothing (Canvas handled it)
      } else if (isResizing && localState) {
        onUpdate(item.id, localState);
      }

      setIsDragging(false);
      setIsResizing(false);
      setIsTapCheck(false);
      setDragStart(null);
      setResizeStart(null);
      setLocalState(null);
      initialDragItemRef.current = null;
    };

    if (isDragging || isResizing || isTapCheck) {
      window.addEventListener('mousemove', handleGlobalMove);
      window.addEventListener('mouseup', handleUp);
      // Also listen for touch events on window to handle the "global move" equivalence for touch
      window.addEventListener('touchmove', handleGlobalMove as any, { passive: false });
      window.addEventListener('touchend', handleUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleGlobalMove);
      window.removeEventListener('mouseup', handleUp);
      window.removeEventListener('touchmove', handleGlobalMove as any);
      window.removeEventListener('touchend', handleUp);
    };
  }, [isDragging, isResizing, isTapCheck, dragStart, resizeStart, onUpdate, item.id, snapEnabled, localState, items, onSelect]);

  return {
    localState,
    isDragging,
    isResizing,
    handleMouseDown,
    handleResizeStart
  };
};