import React, { useState, useRef, useEffect } from 'react';
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

  const handleResizeStart = (e: React.MouseEvent | React.TouchEvent, handle: ResizeHandle) => {
    e.stopPropagation();
    
    // Prevent default on touch to stop scrolling/emulated mouse events
    if (e.cancelable && e.type === 'touchstart') e.preventDefault();
    if (e.type === 'mousedown') e.preventDefault(); // Prevent text selection

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    setIsResizing(true);
    initialDragItemRef.current = { ...item };
    setLocalState({ x: item.x, y: item.y, width: item.width, height: item.height });
    setResizeStart({
      startX: clientX,
      startY: clientY,
      origX: item.x,
      origY: item.y,
      origW: item.width,
      origH: item.height,
      handle
    });
  };

  useEffect(() => {
    const handleGlobalMove = (e: MouseEvent | TouchEvent) => {
      // Allow if either dragStart OR resizeStart exists
      if (!dragStart && !resizeStart) return;

      const clientX = 'touches' in e ? (e as TouchEvent).touches[0].clientX : (e as MouseEvent).clientX;
      const clientY = 'touches' in e ? (e as TouchEvent).touches[0].clientY : (e as MouseEvent).clientY;

      const currentScale = scaleRef.current;
      const startItem = initialDragItemRef.current;
      const gridSize = 40;

      // Check for movement threshold (only relevant for dragging/tap check)
      if (dragStart) {
        const dist = Math.hypot(clientX - dragStart.x, clientY - dragStart.y);
        if (dist > 3) {
            hasMovedRef.current = true;
            if (isTapCheck) {
              setIsTapCheck(false);
            }
        }
      }

      if (isDragging && startItem && dragStart) {
        const dx = (clientX - dragStart.x) / currentScale;
        const dy = (clientY - dragStart.y) / currentScale;
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
        const dx = (clientX - resizeStart.startX) / currentScale;
        const dy = (clientY - resizeStart.startY) / currentScale;
        
        const { origX, origY, origW, origH, handle } = resizeStart;
        const aspectRatio = origW / origH;

        // 1. Calculate candidate dimensions from mouse position
        let candW = origW;
        let candH = origH;

        if (handle.includes('e')) candW = origW + dx;
        if (handle.includes('w')) candW = origW - dx;
        if (handle.includes('s')) candH = origH + dy;
        if (handle.includes('n')) candH = origH - dy;

        // Ensure minimum dimensions
        const minSize = snapEnabled ? gridSize : 20;
        candW = Math.max(minSize, candW);
        candH = Math.max(minSize, candH);

        // 2. Enforce Aspect Ratio
        // Determine which dimension has changed more relative to its size
        // and use that to drive the other dimension.
        const wRatio = Math.abs(candW - origW) / origW;
        const hRatio = Math.abs(candH - origH) / origH;

        let finalW, finalH;

        if (wRatio > hRatio) {
            // Width is the driver
            finalW = candW;
            if (snapEnabled) {
                finalW = Math.max(gridSize, snapToGrid(finalW, gridSize));
            }
            finalH = finalW / aspectRatio;
        } else {
            // Height is the driver
            finalH = candH;
            if (snapEnabled) {
                finalH = Math.max(gridSize, snapToGrid(finalH, gridSize));
            }
            finalW = finalH * aspectRatio;
        }

        // 3. Calculate new positions based on handle anchor points
        let finalX = origX;
        let finalY = origY;

        if (handle.includes('w')) {
            finalX = origX + (origW - finalW);
        }
        if (handle.includes('n')) {
            finalY = origY + (origH - finalH);
        }

        const candidate = { x: finalX, y: finalY, width: finalW, height: finalH };
        if (!isColliding(candidate, items, item.id)) {
          setLocalState({ x: finalX, y: finalY, width: finalW, height: finalH });
        }
      }
    };

    const handleUp = (e: Event) => {
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
          
          if (e.type === 'touchend' && e.cancelable) {
            e.preventDefault();
          }
        }
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
      window.addEventListener('touchend', handleUp, { passive: false });
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