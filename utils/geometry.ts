import { Point, Size, CanvasItem } from '../types';

export const snapToGrid = (value: number, gridSize: number): number => {
  return Math.round(value / gridSize) * gridSize;
};

export const distance = (p1: Point, p2: Point): number => {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
};

export const rectIntersects = (
  r1: { x: number; y: number; width: number; height: number },
  r2: { x: number; y: number; width: number; height: number }
): boolean => {
  const buffer = 0.5;
  return !(
    r2.x >= r1.x + r1.width - buffer ||
    r2.x + r2.width <= r1.x + buffer ||
    r2.y >= r1.y + r1.height - buffer ||
    r2.y + r2.height <= r1.y + buffer
  );
};

export const isColliding = (
  candidate: { x: number; y: number; width: number; height: number },
  others: CanvasItem[],
  ignoreId: string
): boolean => {
  return others.some((other) => {
    if (other.id === ignoreId) return false;
    return rectIntersects(candidate, other);
  });
};

export const isGroupColliding = (
  projections: { id: string, x: number, y: number, width: number, height: number }[],
  allItems: CanvasItem[]
): boolean => {
  const movingIds = new Set(projections.map(p => p.id));
  const obstacles = allItems.filter(item => !movingIds.has(item.id));

  // 1. Check collision against obstacles (unselected items)
  const hitsObstacle = projections.some(proj => {
      return obstacles.some(obs => rectIntersects(proj, obs));
  });
  if (hitsObstacle) return true;

  // 2. Check strict self-collision among the projected items
  // This prevents alignment tools from stacking images on top of each other
  for (let i = 0; i < projections.length; i++) {
      for (let j = i + 1; j < projections.length; j++) {
          if (rectIntersects(projections[i], projections[j])) {
              return true;
          }
      }
  }

  return false;
};

export const getAlignmentProjections = (
    type: 'align-h' | 'align-v' | 'dist-h' | 'dist-v' | 'compact-h' | 'compact-v',
    selectedItems: CanvasItem[],
    gridSize: number = 1
): { id: string, x: number, y: number, width: number, height: number }[] => {
    if (selectedItems.length < 2) return [];

    const result = selectedItems.map(i => ({ ...i })); // Clone basic props

    if (type === 'align-h') {
        const avgY = selectedItems.reduce((sum, i) => sum + (i.y + i.height/2), 0) / selectedItems.length;
        result.forEach(i => {
            i.y = snapToGrid(avgY - i.height/2, gridSize);
        });
    } else if (type === 'align-v') {
        const avgX = selectedItems.reduce((sum, i) => sum + (i.x + i.width/2), 0) / selectedItems.length;
        result.forEach(i => {
            i.x = snapToGrid(avgX - i.width/2, gridSize);
        });
    } else if (type === 'dist-h') {
        const sorted = [...result].sort((a, b) => a.x - b.x);
        const minX = Math.min(...selectedItems.map(i => i.x));
        const maxX = Math.max(...selectedItems.map(i => i.x));
        const span = maxX - minX;
        const step = span / (selectedItems.length - 1);
        
        sorted.forEach((item, idx) => {
            if (idx === 0 || idx === sorted.length - 1) return;
            item.x = snapToGrid(minX + (step * idx), gridSize);
        });
    } else if (type === 'dist-v') {
        const sorted = [...result].sort((a, b) => a.y - b.y);
        const minY = Math.min(...selectedItems.map(i => i.y));
        const maxY = Math.max(...selectedItems.map(i => i.y));
        const span = maxY - minY;
        const step = span / (selectedItems.length - 1);
        
        sorted.forEach((item, idx) => {
             if (idx === 0 || idx === sorted.length - 1) return;
             item.y = snapToGrid(minY + (step * idx), gridSize);
        });
    } else if (type === 'compact-h') {
        const sorted = [...result].sort((a, b) => a.x - b.x);
        let currentX = sorted[0].x;
        sorted.forEach(item => {
            item.x = currentX;
            currentX += snapToGrid(item.width + 10, gridSize); 
        });
    } else if (type === 'compact-v') {
        const sorted = [...result].sort((a, b) => a.y - b.y);
        let currentY = sorted[0].y;
        sorted.forEach(item => {
            item.y = currentY;
            currentY += snapToGrid(item.height + 10, gridSize);
        });
    }

    return result;
};

export const getScaledDimensions = (
  originalWidth: number,
  originalHeight: number,
  maxWidth: number
): Size => {
  return { width: originalWidth, height: originalHeight };
};

export const findFreePosition = (
  item: { x: number; y: number; width: number; height: number; id?: string },
  others: CanvasItem[],
  gridSize: number
): Point => {
  // Strict deterministic search using Grid Spiral
  // This guarantees finding the nearest valid non-overlapping position
  
  const startX = Math.round(item.x / gridSize) * gridSize;
  const startY = Math.round(item.y / gridSize) * gridSize;
  
  const width = item.width;
  const height = item.height;
  const id = item.id || '';

  // Helper to check collision at a specific point
  const isPosValid = (cx: number, cy: number) => {
      // Check collision with others
      const rect = { x: cx, y: cy, width, height };
      const hit = others.some(other => {
          if (other.id === id) return false;
          return rectIntersects(rect, other);
      });
      return !hit;
  };

  // 1. Check origin
  if (isPosValid(startX, startY)) {
      return { x: startX, y: startY };
  }

  // 2. Spiral Search
  // Expand in layers: distance 1 grid unit, 2 units, etc.
  let layer = 1;
  const MAX_LAYERS = 50; // Search radius approx 2000px

  while (layer <= MAX_LAYERS) {
      // Top Row (moving right)
      for (let i = -layer; i <= layer; i++) {
          const x = startX + (i * gridSize);
          const y = startY - (layer * gridSize);
          if (isPosValid(x, y)) return { x, y };
      }
      
      // Right Column (moving down)
      for (let i = -layer + 1; i <= layer; i++) {
          const x = startX + (layer * gridSize);
          const y = startY + (i * gridSize);
          if (isPosValid(x, y)) return { x, y };
      }

      // Bottom Row (moving left)
      for (let i = -layer; i < layer; i++) {
          const x = startX + (i * gridSize);
          const y = startY + (layer * gridSize);
          if (isPosValid(x, y)) return { x, y };
      }

      // Left Column (moving up)
      for (let i = -layer + 1; i < layer; i++) {
          const x = startX - (layer * gridSize);
          const y = startY + (i * gridSize);
          if (isPosValid(x, y)) return { x, y };
      }

      layer++;
  }

  // Fallback: If absolutely jammed (unlikely in infinite canvas), return original
  return { x: startX, y: startY };
};