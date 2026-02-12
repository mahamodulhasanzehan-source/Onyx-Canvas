import { Point, Size } from '../types';

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
  return !(
    r2.x > r1.x + r1.width ||
    r2.x + r2.width < r1.x ||
    r2.y > r1.y + r1.height ||
    r2.y + r2.height < r1.y
  );
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