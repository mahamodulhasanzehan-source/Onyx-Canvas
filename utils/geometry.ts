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
  // Filter out items that are part of the moving group from the "obstacles" list
  const movingIds = new Set(projections.map(p => p.id));
  const obstacles = allItems.filter(item => !movingIds.has(item.id));

  return projections.some(proj => {
      return obstacles.some(obs => rectIntersects(proj, obs));
  });
};

export const getAlignmentProjections = (
    type: 'align-h' | 'align-v' | 'dist-h' | 'dist-v' | 'compact-h' | 'compact-v',
    selectedItems: CanvasItem[],
    gridSize: number = 1
): { id: string, x: number, y: number, width: number, height: number }[] => {
    if (selectedItems.length < 2) return [];

    const result = selectedItems.map(i => ({ ...i })); // Clone basic props

    if (type === 'align-h') {
        // Align Centers Vertically (share same Y center) -> Actually "Align Horizontal" usually means align Y axis so they sit on a horizontal line?
        // Standard naming: "Align Horizontal Centers" means they line up vertically. "Align Vertical Centers" means they line up horizontally.
        // Let's interpret "Align Horizontally" as making them share the same Y-center (forming a row).
        const avgY = selectedItems.reduce((sum, i) => sum + (i.y + i.height/2), 0) / selectedItems.length;
        result.forEach(i => {
            i.y = snapToGrid(avgY - i.height/2, gridSize);
        });
    } else if (type === 'align-v') {
        // Form a column
        const avgX = selectedItems.reduce((sum, i) => sum + (i.x + i.width/2), 0) / selectedItems.length;
        result.forEach(i => {
            i.x = snapToGrid(avgX - i.width/2, gridSize);
        });
    } else if (type === 'dist-h') {
        // Equal spacing horizontally between first and last
        const sorted = [...result].sort((a, b) => a.x - b.x);
        const first = sorted[0];
        const last = sorted[sorted.length - 1];
        const totalSpan = (last.x) - (first.x + first.width); // gap between first's right and last's left
        
        // Actually, we usually distribute centers or distribute space. Let's distribute space between edges.
        // Range: First Left to Last Right.
        const startX = first.x;
        const totalWidth = (last.x + last.width) - first.x;
        
        // If we want equal gaps:
        // totalSpaceAvailable = (Last.x - First.Right) - sum(widths of middle items)
        // simpler: Distribute centers if items are same size, but they aren't.
        // Let's implement: Distribute "Centers" evenly
        const minX = Math.min(...selectedItems.map(i => i.x));
        const maxX = Math.max(...selectedItems.map(i => i.x));
        const span = maxX - minX;
        const step = span / (selectedItems.length - 1);
        
        sorted.forEach((item, idx) => {
            if (idx === 0 || idx === sorted.length - 1) return; // Keep anchors
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
        // Stack horizontally with 0 gap
        const sorted = [...result].sort((a, b) => a.x - b.x);
        let currentX = sorted[0].x;
        sorted.forEach(item => {
            item.x = currentX;
            currentX += snapToGrid(item.width + 10, gridSize); // +10 padding
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
  item: { x: number; y: number; width: number; height: number },
  others: CanvasItem[],
  gridSize: number
): Point => {
  let { x, y } = item;
  let attempts = 0;
  const MAX_ATTEMPTS = 50;

  while (attempts < MAX_ATTEMPTS) {
    const collidingItems = others.filter(other => 
      rectIntersects({ x, y, width: item.width, height: item.height }, other)
    );

    if (collidingItems.length === 0) {
      return { x, y };
    }

    // Calculate separation vector
    let pushX = 0;
    let pushY = 0;
    const cx = x + item.width / 2;
    const cy = y + item.height / 2;

    collidingItems.forEach(other => {
      const ocx = other.x + other.width / 2;
      const ocy = other.y + other.height / 2;
      
      let dx = cx - ocx;
      let dy = cy - ocy;

      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) {
        dx = gridSize;
        dy = gridSize;
      }

      pushX += dx;
      pushY += dy;
    });

    const mag = Math.hypot(pushX, pushY);
    if (mag === 0) {
        pushX = gridSize;
        pushY = 0;
    } else {
        pushX = (pushX / mag) * gridSize;
        pushY = (pushY / mag) * gridSize;
    }

    x += pushX;
    y += pushY;

    x = Math.round(x / gridSize) * gridSize;
    y = Math.round(y / gridSize) * gridSize;

    attempts++;
  }
  return { x, y };
};