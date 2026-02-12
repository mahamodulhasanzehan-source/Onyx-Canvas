import { ImageFilters } from '../types';

/**
 * Creates an HTMLImageElement from a source string (URL or Base64).
 */
export const createImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', (error) => reject(error));
    // No crossOrigin needed for Base64, but harmless if set to anonymous for external
    if (!url.startsWith('data:')) {
        image.setAttribute('crossOrigin', 'anonymous');
    }
    image.src = url;
  });

/**
 * Compresses and resizes an image file to a Base64 string suitable for Firestore.
 * Max dimension: 800px.
 * Quality: 0.8 JPEG.
 */
export const compressImage = async (file: Blob): Promise<{ base64: string, width: number, height: number }> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = async (event) => {
            try {
                const src = event.target?.result as string;
                const img = await createImage(src);
                
                const MAX_DIMENSION = 800;
                let width = img.naturalWidth;
                let height = img.naturalHeight;

                if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
                    const ratio = width / height;
                    if (width > height) {
                        width = MAX_DIMENSION;
                        height = Math.round(width / ratio);
                    } else {
                        height = MAX_DIMENSION;
                        width = Math.round(height * ratio);
                    }
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (!ctx) throw new Error("Could not get canvas context");

                // White background for transparent PNGs converted to JPEG
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, width, height);
                
                ctx.drawImage(img, 0, 0, width, height);

                const base64 = canvas.toDataURL('image/jpeg', 0.8);
                resolve({ base64, width, height });
            } catch (e) {
                reject(e);
            }
        };
        reader.onerror = (e) => reject(e);
    });
};

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
        // Return JPEG for consistency
        croppedCanvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error('Canvas is empty'));
        }, 'image/jpeg', 0.9);
    });
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Canvas is empty'));
    }, 'image/jpeg', 0.9);
  });
};