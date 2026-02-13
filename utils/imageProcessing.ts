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
 * Tries to maximize quality/resolution while staying under the 1MB document limit.
 */
export const compressImage = async (file: Blob): Promise<{ base64: string, width: number, height: number }> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = async (event) => {
            try {
                const src = event.target?.result as string;
                const img = await createImage(src);
                
                // Firestore limit is 1MB (1,048,576 bytes). 
                // Base64 is ~1.33x larger than binary. 
                // Safe limit for Base64 string length: ~1,000,000 chars (approx 750KB binary).
                // This leaves room for other fields in the document.
                const MAX_BASE64_LENGTH = 1000000; 

                // Start with a reasonably high max dimension (e.g., 2560px for QHD)
                // We want to preserve as much detail as possible.
                let width = img.naturalWidth;
                let height = img.naturalHeight;
                let quality = 0.9;
                
                // Initial cap to 2560 to prevent massive 4k/8k images from choking immediately
                const INITIAL_MAX = 2560;
                if (width > INITIAL_MAX || height > INITIAL_MAX) {
                     const ratio = width / height;
                     if (width > height) {
                         width = INITIAL_MAX;
                         height = Math.round(width / ratio);
                     } else {
                         height = INITIAL_MAX;
                         width = Math.round(height * ratio);
                     }
                }

                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                if (!ctx) throw new Error("Could not get canvas context");

                const attemptCompression = (w: number, h: number, q: number): string => {
                    canvas.width = w;
                    canvas.height = h;
                    // White background for transparent PNGs converted to JPEG
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(0, 0, w, h);
                    ctx.drawImage(img, 0, 0, w, h);
                    return canvas.toDataURL('image/jpeg', q);
                }

                let base64 = attemptCompression(width, height, quality);
                
                // Iterative reduction to fit size
                // Strategy: 
                // 1. Reduce quality down to 0.5 first (maintain resolution)
                // 2. If still too big, step down resolution
                
                while (base64.length > MAX_BASE64_LENGTH) {
                    if (quality > 0.55) { // Stop reducing quality at 0.5 to avoid artifacts
                        quality -= 0.1;
                        base64 = attemptCompression(width, height, quality);
                    } else {
                        // Quality is low, start shrinking image dimensions
                        width = Math.floor(width * 0.85); // Reduce by 15% each step
                        height = Math.floor(height * 0.85);
                        // Reset quality slightly for the new smaller size to keep it looking crisp
                        quality = 0.8; 
                        base64 = attemptCompression(width, height, quality);
                    }
                    
                    // Safety break for very small images
                    if (width < 200) break;
                }

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