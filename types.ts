export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface ImageFilters {
  brightness: number; // 0-200, default 100
  contrast: number;   // 0-200, default 100
}

export interface CanvasItem {
  id: string;
  url: string; // Blob URL
  blobId?: number; // IndexedDB key
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number; // degrees, 90 increments
  name: string;
  filters: ImageFilters;
  originalWidth: number;
  originalHeight: number;
  zIndex: number;
}

export interface LoadingCanvasItem {
  id: string;
  x: number;
  y: number;
  name: string;
}

export type ResizeHandle = 'nw' | 'ne' | 'sw' | 'se';

export interface Viewport {
  x: number;
  y: number;
  scale: number;
}

export interface ContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
  itemId: string;
}