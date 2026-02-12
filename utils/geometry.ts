
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
