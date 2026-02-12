import { ImageFilters } from '../types';

export const createImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', (error) => reject(error));
    image.setAttribute('crossOrigin', 'anonymous'); 
    image.src = url;
  });

/**
 * Applies destructive edits (crop, rotate, filters) and returns a new Blob.
 */
export const processImage = async (
  imageSrc: string,
  pixelCrop: { x: number; y: number; width: number; height: number } | null,
  rotation: number = 0,
  filters: ImageFilters
): Promise<Blob> => {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('No 2d context');
  }

  const rotRad = (rotation * Math.PI) / 180;

  // Calculate bounding box for rotation
  const sin = Math.abs(Math.sin(rotRad));
  const cos = Math.abs(Math.cos(rotRad));
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  
  const rotatedWidth = Math.floor(width * cos + height * sin);
  const rotatedHeight = Math.floor(height * cos + width * sin);

  canvas.width = rotatedWidth;
  canvas.height = rotatedHeight;

  // Apply Filters
  ctx.filter = `brightness(${filters.brightness}%) contrast(${filters.contrast}%)`;

  // Move to center, rotate, move back
  ctx.translate(rotatedWidth / 2, rotatedHeight / 2);
  ctx.rotate(rotRad);
  ctx.translate(-width / 2, -height / 2);

  ctx.drawImage(image, 0, 0);

  // If cropping is needed
  if (pixelCrop) {
    const croppedCanvas = document.createElement('canvas');
    const croppedCtx = croppedCanvas.getContext('2d');
    if (!croppedCtx) throw new Error('No cropped context');

    croppedCanvas.width = pixelCrop.width;
    croppedCanvas.height = pixelCrop.height;

    croppedCtx.drawImage(
      canvas,
      pixelCrop.x,
      pixelCrop.y,
      pixelCrop.width,
      pixelCrop.height,
      0,
      0,
      pixelCrop.width,
      pixelCrop.height
    );

    return new Promise((resolve, reject) => {
        // High quality export
        croppedCanvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error('Canvas is empty'));
        }, 'image/jpeg', 1.0);
    });
  }

  return new Promise((resolve, reject) => {
    // High quality export
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Canvas is empty'));
    }, 'image/jpeg', 1.0);
  });
};