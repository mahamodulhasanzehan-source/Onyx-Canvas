
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
  saturation: number; // 0-200, default 100
  hue: number;        // 0-360, default 0
  blur: number;       // 0-20, default 0
  sepia: number;      // 0-100, default 0
}

export interface CropData {
  x: number;      // relative to original image width (0-1)
  y: number;      // relative to original image height (0-1)
  width: number;  // relative width (0-1)
  height: number; // relative height (0-1)
}

export interface CanvasItem {
  id: string;
  url: string; // Remote Storage URL or Base64
  drawingUrl?: string; // Base64 for drawing overlay
  storagePath?: string; 
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number; // degrees
  name: string;
  filters: ImageFilters;
  crop?: CropData; // Non-destructive crop
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
