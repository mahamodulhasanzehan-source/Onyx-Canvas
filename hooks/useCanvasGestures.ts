import React, { useState, useRef, useEffect, useCallback, RefObject, MutableRefObject } from 'react';
import { Viewport } from '../types';
import { rectIntersects } from '../utils/geometry';

interface GestureConfig {
  containerRef: RefObject<HTMLDivElement>;
  itemsContainerRef: RefObject<HTMLDivElement>;
  viewportRef: MutableRefObject<Viewport>;
  items: any[];
  onSelectionChange: (ids: string[]) => void;
  onCanvasContextMenu: (e: React.MouseEvent | { clientX: number, clientY: number }) => void;
  onDropFiles: (files: File[], x: number, y: number) => void;
}

export const useCanvasGestures = ({
  containerRef,
  itemsContainerRef,
  viewportRef,
  items,
  onSelectionChange,
  onCanvasContextMenu,
  onDropFiles
}: GestureConfig) => {
  const [scaleState, setScaleState] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionBox, setSelectionBox] = useState<{ startX: number, startY: number, curX: number, curY: number } | null>(null);

  const lastMousePos = useRef<{ x: number, y: number }>({ x: 0, y: 0 });
  const animationFrameRef = useRef<number>(0);
  
  // Touch Refs
  const lastTouchRef = useRef<{ x: number, y: number } | null>(null);
  const lastPinchDistRef = useRef<number | null>(null);
  const isGestureActiveRef = useRef(false);
  const touchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartPosRef = useRef<{ x: number, y: number } | null>(null);

  const updateVisuals = useCallback(() => {
    const { x, y, scale } = viewportRef.current;
    if (itemsContainerRef.current) {
      itemsContainerRef.current.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
      itemsContainerRef.current.style.transformOrigin = '0 0';
    }
    const gridEl = document.getElementById('grid-bg-layer');
    if (gridEl) {
      const gridSize = 40 * scale;
      const offset = gridSize / 2;
      gridEl.style.backgroundPosition = `${x - offset}px ${y - offset}px`;
      gridEl.style.backgroundSize = `${gridSize}px ${gridSize}px`;
      
      // OPTIMIZATION: Fade out grid when zoomed out too far to prevent mobile crashes
      // Rendering thousands of radial gradients kills mobile GPU/CPU
      if (gridSize < 16) {
        gridEl.style.opacity = "0";
      } else {
        gridEl.style.opacity = "1";
      }
    }
  }, [itemsContainerRef, viewportRef]);

  // Animated flyTo
  const flyTo = useCallback((targetX: number, targetY: number, targetScale: number, duration: number = 500) => {
    const startX = viewportRef.current.x;
    const startY = viewportRef.current.y;
    const startScale = viewportRef.current.scale;
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 4);

      const currentX = startX + (targetX - startX) * ease;
      const currentY = startY + (targetY - startY) * ease;
      const currentScale = startScale + (targetScale - startScale) * ease;

      viewportRef.current = { x: currentX, y: currentY, scale: currentScale };
      setScaleState(currentScale);
      updateVisuals();

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate);
      }
    };
    
    cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = requestAnimationFrame(animate);
  }, [updateVisuals, viewportRef]);

  // Wheel Zoom
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
  }, [containerRef, viewportRef, updateVisuals]);

  // Mouse Pan & Select
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    
    // Check for Ctrl/Command for Selection Box
    if (e.ctrlKey || e.metaKey) {
        setIsSelecting(true);
        const rect = containerRef.current?.getBoundingClientRect();
        if(rect) {
            const startX = e.clientX - rect.left;
            const startY = e.clientY - rect.top;
            setSelectionBox({ startX, startY, curX: startX, curY: startY });
        }
    } else {
        // Normal Panning
        onSelectionChange([]); // Clear selection when clicking BG
        setIsPanning(true);
        lastMousePos.current = { x: e.clientX, y: e.clientY };
        if (containerRef.current) containerRef.current.style.cursor = 'grabbing';
    }
  };

  const handleGlobalMouseMove = useCallback((e: MouseEvent) => {
    if (isSelecting) {
        const rect = containerRef.current?.getBoundingClientRect();
        if(rect) {
            const curX = e.clientX - rect.left;
            const curY = e.clientY - rect.top;
            setSelectionBox(prev => prev ? { ...prev, curX, curY } : null);
        }
    } else if (isPanning) {
        const dx = e.clientX - lastMousePos.current.x;
        const dy = e.clientY - lastMousePos.current.y;
        lastMousePos.current = { x: e.clientX, y: e.clientY };
        viewportRef.current.x += dx;
        viewportRef.current.y += dy;
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = requestAnimationFrame(updateVisuals);
    }
  }, [isPanning, isSelecting, updateVisuals, viewportRef, containerRef]);

  const handleGlobalMouseUp = useCallback(() => {
    if (isSelecting && selectionBox) {
        // Calculate Intersection
        const { x: vpX, y: vpY, scale } = viewportRef.current;
        
        // Convert screen box to world box
        const minX = Math.min(selectionBox.startX, selectionBox.curX);
        const maxX = Math.max(selectionBox.startX, selectionBox.curX);
        const minY = Math.min(selectionBox.startY, selectionBox.curY);
        const maxY = Math.max(selectionBox.startY, selectionBox.curY);

        const worldRect = {
            x: (minX - vpX) / scale,
            y: (minY - vpY) / scale,
            width: (maxX - minX) / scale,
            height: (maxY - minY) / scale
        };

        const selected = items.filter(item => rectIntersects(worldRect, item)).map(i => i.id);
        onSelectionChange(selected);
        
        setIsSelecting(false);
        setSelectionBox(null);
    } else if (isPanning) {
      setIsPanning(false);
      if (containerRef.current) containerRef.current.style.cursor = 'default';
    }
  }, [isPanning, isSelecting, selectionBox, viewportRef, items, onSelectionChange, containerRef]);

  useEffect(() => {
    if (isPanning || isSelecting) {
      window.addEventListener('mousemove', handleGlobalMouseMove, { passive: true });
      window.addEventListener('mouseup', handleGlobalMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isPanning, isSelecting, handleGlobalMouseMove, handleGlobalMouseUp]);

  // Touch Logic
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      isGestureActiveRef.current = true;
      if (touchTimerRef.current) clearTimeout(touchTimerRef.current);
      touchStartPosRef.current = null;
      
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      lastPinchDistRef.current = dist;
      lastTouchRef.current = null;
      return;
    }

    if (e.touches.length === 1) {
      const touch = e.touches[0];
      lastTouchRef.current = { x: touch.clientX, y: touch.clientY };
      touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };
      isGestureActiveRef.current = true;
      
      touchTimerRef.current = setTimeout(() => {
        if (navigator.vibrate) navigator.vibrate(50);
        onCanvasContextMenu({ clientX: touch.clientX, clientY: touch.clientY });
        touchStartPosRef.current = null;
        isGestureActiveRef.current = false;
      }, 500);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isGestureActiveRef.current) return;
    
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const last = lastTouchRef.current;
      if (touchStartPosRef.current) {
        const moveDist = Math.hypot(touch.clientX - touchStartPosRef.current.x, touch.clientY - touchStartPosRef.current.y);
        if (moveDist > 10) {
          if (touchTimerRef.current) clearTimeout(touchTimerRef.current);
          touchStartPosRef.current = null;
        }
      }
      if (last) {
        const dx = touch.clientX - last.x;
        const dy = touch.clientY - last.y;
        viewportRef.current.x += dx;
        viewportRef.current.y += dy;
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = requestAnimationFrame(updateVisuals);
        lastTouchRef.current = { x: touch.clientX, y: touch.clientY };
      }
    } else if (e.touches.length === 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      const cx = (t1.clientX + t2.clientX) / 2;
      const cy = (t1.clientY + t2.clientY) / 2;
      if (lastPinchDistRef.current && lastPinchDistRef.current > 0) {
        const scaleFactor = dist / lastPinchDistRef.current;
        const oldScale = viewportRef.current.scale;
        const newScale = Math.min(Math.max(oldScale * scaleFactor, 0.05), 50);
        const actualFactor = newScale / oldScale;
        viewportRef.current.x = cx - (cx - viewportRef.current.x) * actualFactor;
        viewportRef.current.y = cy - (cy - viewportRef.current.y) * actualFactor;
        viewportRef.current.scale = newScale;
        setScaleState(newScale);
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = requestAnimationFrame(updateVisuals);
      }
      lastPinchDistRef.current = dist;
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length === 0) {
        if (touchStartPosRef.current && !lastPinchDistRef.current) {
            onSelectionChange([]); // Tap BG -> Clear Selection
        }

        if (touchTimerRef.current) clearTimeout(touchTimerRef.current);
        touchStartPosRef.current = null;
        isGestureActiveRef.current = false;
        lastTouchRef.current = null;
        lastPinchDistRef.current = null;
    } else if (e.touches.length === 1) {
      const touch = e.touches[0];
      lastTouchRef.current = { x: touch.clientX, y: touch.clientY };
      lastPinchDistRef.current = null;
    }
  };

  // Drag Drop
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (!e.dataTransfer) return;
    const files = Array.from(e.dataTransfer.files) as File[];
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      const { x, y, scale } = viewportRef.current;
      const worldX = (e.clientX - rect.left - x) / scale;
      const worldY = (e.clientY - rect.top - y) / scale;
      onDropFiles(files, worldX, worldY);
    }
  };

  const handleDragOver = (e: React.DragEvent) => e.preventDefault();

  return {
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
  };
};