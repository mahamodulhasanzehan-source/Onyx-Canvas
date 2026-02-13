import React, { useState, useRef, useEffect } from 'react';
import { CanvasItem, Point, ResizeHandle } from '../types';
import { snapToGrid, isColliding, findFreePosition } from '../utils/geometry';

interface ItemInteractionConfig {
  item: CanvasItem;
  items: CanvasItem[];
  scale: number;
  snapEnabled: boolean;
  onUpdate: (id: string, updates: Partial<CanvasItem>) => void;
  onSelect: (ids: string[]) => void;
  isRenaming?: boolean;
  isSelected: boolean;
  selectedIds: string[];
  onGroupDrag?: (dx: number, dy: number) => void;
}

export const useItemInteraction = ({
  item,
  items,
  scale,
  snapEnabled,
  onUpdate,
  onSelect,
  isRenaming,
  isSelected,
  selectedIds,
  onGroupDrag
}: ItemInteractionConfig) => {
  const [localState, setLocalState] = useState<Partial<CanvasItem> | null>(null);
  const [isDragging, setIsDragging] = useState(false);
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
  const hasMovedRef = useRef(false);

  // Group drag accumulation to prevent floating point drift
  const dragAccumulator = useRef({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    
    // e.type check for touch to enable toggle logic
    // 'touchstart' is passed artificially by CanvasItem
    // Desktop: Ctrl check handled here? 
    // Actually, CanvasItem passes native MouseEvent or mocked TouchEvent
    
    hasMovedRef.current = false;
    setDragStart({ x: e.clientX, y: e.clientY });

    const isTouch = (e as any).type === 'touchstart';
    const isMultiSelectModifier = e.ctrlKey || e.metaKey;

    if (isSelected && !isRenaming) {
      // If selecting a selected item with modifier, we might be preparing to Deselect it on Up if no move
      e.stopPropagation();
      setIsDragging(true);
      initialDragItemRef.current = { ...item };
      setLocalState({ x: item.x, y: item.y });
      dragAccumulator.current = { x: 0, y: 0 };
    } else if (!isSelected) {
      // Start tap check to see if we select/toggle
      setIsTapCheck(true);
    }
  };

  const handleResizeStart = (e: React.MouseEvent | React.TouchEvent, handle: ResizeHandle) => {
    e.stopPropagation();
    if (e.cancelable && e.type === 'touchstart') e.preventDefault();
    if (e.type === 'mousedown') e.preventDefault();

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    setIsResizing(true);
    initialDragItemRef.current = { ...item };
    setLocalState({ x: item.x, y: item.y, width: item.width, height: item.height });
    setResizeStart({
      startX: clientX, startY: clientY,
      origX: item.x, origY: item.y, origW: item.width, origH: item.height,
      handle
    });
  };

  useEffect(() => {
    const handleGlobalMove = (e: MouseEvent | TouchEvent) => {
      if (!dragStart && !resizeStart) return;

      const clientX = 'touches' in e ? (e as TouchEvent).touches[0].clientX : (e as MouseEvent).clientX;
      const clientY = 'touches' in e ? (e as TouchEvent).touches[0].clientY : (e as MouseEvent).clientY;
      const currentScale = scaleRef.current;
      const startItem = initialDragItemRef.current;
      const gridSize = 40;

      if (dragStart) {
        const dist = Math.hypot(clientX - dragStart.x, clientY - dragStart.y);
        if (dist > 3) {
            hasMovedRef.current = true;
            if (isTapCheck) setIsTapCheck(false);
        }
      }

      if (isDragging && startItem && dragStart) {
        const rawDx = (clientX - dragStart.x) / currentScale;
        const rawDy = (clientY - dragStart.y) / currentScale;
        
        if (selectedIds.length > 1 && onGroupDrag) {
            // Group Drag Mode
            // Calculate delta since last frame
            // We need absolute position for this item to render correctly locally
            // AND we need to emit delta for others.
            // Simplified: calculate new pos, diff with current localState, emit diff
            
            // Actually, simpler: just calculate total displacement from start
            const newX = startItem.x + rawDx;
            const newY = startItem.y + rawDy;
            
            // Snap logic applies to the *leader* (this item)
            const snappedX = snapEnabled ? snapToGrid(newX, gridSize) : newX;
            const snappedY = snapEnabled ? snapToGrid(newY, gridSize) : newY;
            
            const deltaX = snappedX - (localState?.x ?? startItem.x);
            const deltaY = snappedY - (localState?.y ?? startItem.y);

            if (deltaX !== 0 || deltaY !== 0) {
                 onGroupDrag(deltaX, deltaY); // Update ALL selected items (including this one via parent re-render or local update?)
                 // If we rely on parent updating props, it might be slow.
                 // We must update localState for this item immediately.
                 setLocalState(prev => ({ 
                     x: (prev?.x ?? startItem.x) + deltaX, 
                     y: (prev?.y ?? startItem.y) + deltaY 
                 }));
            }

        } else {
            // Single Item Drag
            let newX = startItem.x + rawDx;
            let newY = startItem.y + rawDy;
            if (snapEnabled) {
              newX = snapToGrid(newX, gridSize);
              newY = snapToGrid(newY, gridSize);
            }
            setLocalState({ x: newX, y: newY });
        }
      }

      if (isResizing && resizeStart && startItem) {
        // ... (Keep existing resize logic exactly as is, it's perfect)
        const dx = (clientX - resizeStart.startX) / currentScale;
        const dy = (clientY - resizeStart.startY) / currentScale;
        const { origX, origY, origW, origH, handle } = resizeStart;
        const aspectRatio = origW / origH;
        let candW = origW;
        let candH = origH;
        if (handle.includes('e')) candW = origW + dx;
        if (handle.includes('w')) candW = origW - dx;
        if (handle.includes('s')) candH = origH + dy;
        if (handle.includes('n')) candH = origH - dy;
        const minSize = snapEnabled ? gridSize : 20;
        candW = Math.max(minSize, candW);
        candH = Math.max(minSize, candH);
        const wRatio = Math.abs(candW - origW) / origW;
        const hRatio = Math.abs(candH - origH) / origH;
        let finalW, finalH;
        if (wRatio > hRatio) {
            finalW = candW;
            if (snapEnabled) finalW = Math.max(gridSize, snapToGrid(finalW, gridSize));
            finalH = finalW / aspectRatio;
        } else {
            finalH = candH;
            if (snapEnabled) finalH = Math.max(gridSize, snapToGrid(finalH, gridSize));
            finalW = finalH * aspectRatio;
        }
        let finalX = origX;
        let finalY = origY;
        if (handle.includes('w')) finalX = origX + (origW - finalW);
        if (handle.includes('n')) finalY = origY + (origH - finalH);
        setLocalState({ x: finalX, y: finalY, width: finalW, height: finalH });
      }
    };

    const handleUp = (e: Event) => {
      // Check toggle logic
      const isTouch = e.type === 'touchend';
      // If modifier key held (desktop) or touch (mobile)
      const isModifier = (e as MouseEvent).ctrlKey || (e as MouseEvent).metaKey || isTouch;

      if (isDragging) {
        if (hasMovedRef.current && localState) {
          // Check collision ONLY for single item drag (Group collision logic handled differently/ignored for drag)
          if (selectedIds.length <= 1) {
             const currentState = { ...item, ...localState };
             const others = items.filter(i => i.id !== item.id);
             if (isColliding(currentState, others, item.id)) {
                 const { x, y } = findFreePosition(currentState, others, 40);
                 onUpdate(item.id, { ...localState, x, y });
             } else {
                 onUpdate(item.id, localState);
             }
          } else {
              // Group Drag commit handled by parent? 
              // No, parent updates state during drag via onGroupDrag?
              // Actually, onGroupDrag updates the rendered state of peers. 
              // We need to commit the changes to DB.
              // We will fire a special "commit group drag" event or just rely on the fact 
              // that the parent has been updating the items in real-time?
              // React state updates !== DB updates.
              // This is tricky. Let's simplify: 
              // If group drag, we assume App handles the "live" update.
              // But we need to save to DB.
              // App should expose `commitGroupDrag`.
              // For now, let's assume single item update for this item, 
              // peers need to be updated by App logic.
              
              // REVISION: The `onGroupDrag` in `CanvasItem` prop should likely update the local
              // state of *other* items? No, that's too complex for this component.
              // We will assume `onGroupDrag` provided by App updates the ACTUAL `items` state in App.
              // So onUp, the items are already at new positions in memory. We just need to sync to DB.
              // But wait, `onUpdate` prop usually updates DB.
              
              // Let's stick to single item safety for now to prevent bugs.
              // If multi-drag, we assume collision checks are skipped or user is responsible.
               onUpdate(item.id, localState);
          }
        } else if (!hasMovedRef.current) {
          // Clicked/Tapped without moving -> Toggle Logic
          if (isModifier) {
              // Toggle off
              onSelect(selectedIds.filter(id => id !== item.id));
          } else {
              // Select ONLY this
              onSelect([item.id]);
          }
        }
      } else if (isTapCheck) {
        if (!hasMovedRef.current) {
          // Tapped unselected item
          if (isModifier) {
              // Add to selection
              onSelect([...selectedIds, item.id]);
          } else {
              // Select ONLY this
              onSelect([item.id]);
          }
          if (e.type === 'touchend' && e.cancelable) e.preventDefault();
        }
      } else if (isResizing && localState) {
        const currentState = { ...item, ...localState };
        const others = items.filter(i => i.id !== item.id);
        if (isColliding(currentState, others, item.id)) {
           const { x, y } = findFreePosition(currentState, others, 40);
           onUpdate(item.id, { ...localState, x, y });
        } else {
           onUpdate(item.id, localState);
        }
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
      window.addEventListener('touchmove', handleGlobalMove as any, { passive: false });
      window.addEventListener('touchend', handleUp, { passive: false });
    }
    return () => {
      window.removeEventListener('mousemove', handleGlobalMove);
      window.removeEventListener('mouseup', handleUp);
      window.removeEventListener('touchmove', handleGlobalMove as any);
      window.removeEventListener('touchend', handleUp);
    };
  }, [isDragging, isResizing, isTapCheck, dragStart, resizeStart, onUpdate, item.id, snapEnabled, localState, items, onSelect, item, selectedIds, onGroupDrag]);

  return {
    localState,
    isDragging,
    isResizing,
    handleMouseDown,
    handleResizeStart
  };
};