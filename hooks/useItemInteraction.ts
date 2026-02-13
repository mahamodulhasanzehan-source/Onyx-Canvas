import React, { useState, useRef, useEffect } from 'react';
import { CanvasItem, Point, ResizeHandle } from '../types';
import { snapToGrid, isColliding, findFreePosition, getBoundingBox } from '../utils/geometry';

interface SnapData {
    x: number;
    y: number;
    width: number;
    height: number;
    relX: number;
    relY: number;
    relW: number;
    relH: number;
}

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
  onGroupDragEnd?: () => void;
  onBatchLocalUpdate?: (updates: { id: string, data: Partial<CanvasItem> }[]) => void;
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
  onGroupDrag,
  onGroupDragEnd,
  onBatchLocalUpdate
}: ItemInteractionConfig) => {
  const [localState, setLocalState] = useState<Partial<CanvasItem> | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isTapCheck, setIsTapCheck] = useState(false);
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  
  // Extended Resize State for Groups
  const [resizeStart, setResizeStart] = useState<{
    startX: number; startY: number;
    origX: number; origY: number;
    origW: number; origH: number;
    handle: ResizeHandle;
    // Group Data
    groupBounds?: { x: number, y: number, width: number, height: number };
    itemSnapshots?: Record<string, SnapData>;
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
    
    // Handle Group Resize Initialization
    let groupData: { x: number, y: number, width: number, height: number } | undefined;
    let itemSnapshots: Record<string, SnapData> | undefined;

    if (selectedIds.length > 1 && isSelected) {
        const selectedItems = items.filter(i => selectedIds.includes(i.id));
        const bounds = getBoundingBox(selectedItems);
        
        if (bounds) {
            groupData = { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
            itemSnapshots = {};
            selectedItems.forEach(i => {
                // Store relative positions normalized to group bounds (0.0 to 1.0)
                if (itemSnapshots) {
                    itemSnapshots[i.id] = {
                        x: i.x, y: i.y, width: i.width, height: i.height,
                        relX: (i.x - bounds.x) / bounds.width,
                        relY: (i.y - bounds.y) / bounds.height,
                        relW: i.width / bounds.width,
                        relH: i.height / bounds.height
                    };
                }
            });
        }
    }

    setResizeStart({
      startX: clientX, startY: clientY,
      origX: item.x, origY: item.y, origW: item.width, origH: item.height,
      handle,
      groupBounds: groupData,
      itemSnapshots: itemSnapshots
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
        // Increase threshold on touch to prevent accidental drags when trying to tap
        const moveThreshold = ('touches' in e) ? 10 : 3; 
        if (dist > moveThreshold) {
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
            
            const newX = startItem.x + rawDx;
            const newY = startItem.y + rawDy;
            
            // Snap logic applies to the *leader* (this item)
            const snappedX = snapEnabled ? snapToGrid(newX, gridSize) : newX;
            const snappedY = snapEnabled ? snapToGrid(newY, gridSize) : newY;
            
            const deltaX = snappedX - (localState?.x ?? startItem.x);
            const deltaY = snappedY - (localState?.y ?? startItem.y);

            if (deltaX !== 0 || deltaY !== 0) {
                 onGroupDrag(deltaX, deltaY); 
                 // We must update localState for this item immediately to keep it snappy
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
        const dx = (clientX - resizeStart.startX) / currentScale;
        const dy = (clientY - resizeStart.startY) / currentScale;
        const { origX, origY, origW, origH, handle, groupBounds, itemSnapshots } = resizeStart;
        
        // 1. Calculate the NEW dimensions of the ACTIVE item first
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
        
        // Single Item Aspect Ratio Logic (optional/default behavior)
        // Note: For groups, we often want free scaling, but maintaining individual aspect ratio logic for the driver is safer UI
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

        // Calculate final X/Y for active item
        let finalX = origX;
        let finalY = origY;
        if (handle.includes('w')) finalX = origX + (origW - finalW);
        if (handle.includes('n')) finalY = origY + (origH - finalH);

        // 2. Check if this is a Group Resize
        if (selectedIds.length > 1 && groupBounds && itemSnapshots && onBatchLocalUpdate) {
             // Calculate scaling factor based on the ACTIVE item's change
             // scaleX = newWidth / oldWidth
             const scaleX = finalW / origW;
             const scaleY = finalH / origH;

             // Calculate new Group Dimensions
             const newGroupW = groupBounds.width * scaleX;
             const newGroupH = groupBounds.height * scaleY;

             // Calculate new Group Position
             // This depends on the handle direction of the ACTIVE item
             // We need to keep the "anchor" side stationary
             let newGroupX = groupBounds.x;
             let newGroupY = groupBounds.y;

             // If active handle has 'w', it means we are pushing left. 
             // The group anchor is the "East" side of the group? No, simpler:
             // We know the Active Item's old vs new position relative to the group.
             
             // Let's use the active item's position delta to drive the group position
             // Old Relative X of active item: (origX - groupBounds.x) / groupBounds.width
             // New X of active item is `finalX`.
             // finalX = newGroupX + (relX * newGroupW)
             // So: newGroupX = finalX - (relX * newGroupW)
             
             const activeSnapshot = itemSnapshots[item.id];
             if (activeSnapshot) {
                 newGroupX = finalX - (activeSnapshot.relX * newGroupW);
                 newGroupY = finalY - (activeSnapshot.relY * newGroupH);
             }

             // Apply to ALL selected items
             const updates: { id: string, data: Partial<CanvasItem> }[] = [];
             
             Object.entries(itemSnapshots).forEach(([id, snap]) => {
                  const s = snap as SnapData;
                  updates.push({
                      id,
                      data: {
                          x: newGroupX + (s.relX * newGroupW),
                          y: newGroupY + (s.relY * newGroupH),
                          width: s.relW * newGroupW,
                          height: s.relH * newGroupH
                      }
                  });
             });

             onBatchLocalUpdate(updates);
             
             // Update local state for the active item component so it feels responsive immediately
             // (Though onBatchLocalUpdate should trigger a re-render from parent)
             setLocalState({ x: finalX, y: finalY, width: finalW, height: finalH });

        } else {
             // Single Item Resize
            setLocalState({ x: finalX, y: finalY, width: finalW, height: finalH });
        }
      }
    };

    const handleUp = (e: Event) => {
      // Check toggle logic
      const isTouch = e.type === 'touchend';
      // If modifier key held (desktop) or touch (mobile)
      const isModifier = (e as MouseEvent).ctrlKey || (e as MouseEvent).metaKey || isTouch;

      if (isDragging) {
        if (hasMovedRef.current && localState) {
          
          if (selectedIds.length > 1) {
              // Group Drag: Commit ALL changes
              // We don't perform strict collision check for groups during drag for performance/complexity reasons.
              // We rely on visual placement.
              if (onGroupDragEnd) onGroupDragEnd();
          } else {
              // Single Item Drag: Check collision and commit
              const currentState = { ...item, ...localState };
              const others = items.filter(i => i.id !== item.id);
              if (isColliding(currentState, others, item.id)) {
                  const { x, y } = findFreePosition(currentState, others, 40);
                  onUpdate(item.id, { ...localState, x, y });
              } else {
                  onUpdate(item.id, localState);
              }
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
      } else if (isResizing) {
        // Handle Resize End Commit
        if (selectedIds.length > 1 && onGroupDragEnd) {
             onGroupDragEnd();
        } else if (localState) {
            const currentState = { ...item, ...localState };
            const others = items.filter(i => i.id !== item.id);
            if (isColliding(currentState, others, item.id)) {
               const { x, y } = findFreePosition(currentState, others, 40);
               onUpdate(item.id, { ...localState, x, y });
            } else {
               onUpdate(item.id, localState);
            }
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
  }, [isDragging, isResizing, isTapCheck, dragStart, resizeStart, onUpdate, item.id, snapEnabled, localState, items, onSelect, item, selectedIds, onGroupDrag, onGroupDragEnd, onBatchLocalUpdate]);

  return {
    localState,
    isDragging,
    isResizing,
    handleMouseDown,
    handleResizeStart
  };
};