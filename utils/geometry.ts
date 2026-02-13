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
  // Add a tiny buffer (epsilon) to prevent floating point errors from triggering collisions 
  // when items are perfectly adjacent
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

export const getScaledDimensions = (
  originalWidth: number,
  originalHeight: number,
  maxWidth: number
): Size => {
  // STRICT REQUIREMENT: ZERO COMPRESSION / RESIZING
  // We ignore maxWidth and return original dimensions to render as-is.
  return { width: originalWidth, height: originalHeight };
};

/**
 * Finds the nearest free position for an item given a list of obstacles.
 * Uses a force-directed approach to push the item away from collisions.
 */
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

    // Calculate separation vector (push away from average center of collisions)
    let pushX = 0;
    let pushY = 0;
    const cx = x + item.width / 2;
    const cy = y + item.height / 2;

    collidingItems.forEach(other => {
      const ocx = other.x + other.width / 2;
      const ocy = other.y + other.height / 2;
      
      let dx = cx - ocx;
      let dy = cy - ocy;

      // If perfectly overlapping, pick a bias direction
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) {
        dx = gridSize;
        dy = gridSize;
      }

      pushX += dx;
      pushY += dy;
    });

    // Normalize and scale by grid size for the next step
    const mag = Math.hypot(pushX, pushY);
    if (mag === 0) {
        pushX = gridSize;
        pushY = 0;
    } else {
        pushX = (pushX / mag) * gridSize;
        pushY = (pushY / mag) * gridSize;
    }

    // Apply push
    x += pushX;
    y += pushY;

    // Snap result to grid
    x = Math.round(x / gridSize) * gridSize;
    y = Math.round(y / gridSize) * gridSize;

    attempts++;
  }

  // If we ran out of attempts, just return the last calculated position (better than staying inside)
  return { x, y };
};