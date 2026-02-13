import { useState, useCallback } from 'react';
import { CanvasItem, LoadingCanvasItem } from '../types';
import { compressImage } from '../utils/imageProcessing';
import { isColliding, rectIntersects } from '../utils/geometry';
import { addCanvasItem } from '../utils/db';

export const useFileProcessor = (items: CanvasItem[]) => {
  const [loadingItems, setLoadingItems] = useState<LoadingCanvasItem[]>([]);

  const handleDropFiles = useCallback(async (files: File[], x: number, y: number) => {
    let currentX = x;
    let currentY = y;

    // Create placeholders for visual feedback
    const newLoadingItems: LoadingCanvasItem[] = files.map((f, index) => ({
      id: `loading-${Date.now()}-${index}`,
      name: f.name,
      x: currentX + (index * 20),
      y: currentY + (index * 20)
    }));
    setLoadingItems(prev => [...prev, ...newLoadingItems]);

    // Track regions occupied by items processed in this batch to prevent self-collision
    const batchOccupiedRects: { x: number, y: number, width: number, height: number }[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const placeholder = newLoadingItems[i];
      let fileToProcess: Blob = file;
      let fileName = file.name;

      const isHeic = file.name.toLowerCase().endsWith('.heic') || file.type === 'image/heic';
      if (isHeic) {
        try {
          // @ts-ignore
          const heic2any = (await import('heic2any')).default;
          const converted = await heic2any({
            blob: file,
            toType: 'image/jpeg',
            quality: 0.8
          });
          fileToProcess = Array.isArray(converted) ? converted[0] : converted;
          fileName = fileName.replace(/\.heic$/i, '.jpg');
        } catch (e) {
          console.error("HEIC conversion failed", e);
          setLoadingItems(prev => prev.filter(p => p.id !== placeholder.id));
          continue;
        }
      }

      try {
        const { base64, width, height } = await compressImage(fileToProcess);

        const gridSize = 40;
        // Start search from placeholder position
        let finalX = placeholder.x - width / 2;
        let finalY = placeholder.y - height / 2;

        finalX = Math.round(finalX / gridSize) * gridSize;
        finalY = Math.round(finalY / gridSize) * gridSize;

        // Smart Placement: Check against EXISTING items AND items processed in this BATCH
        let attempts = 0;
        const candidateRect = { x: finalX, y: finalY, width, height };
        
        const checkCollision = (rect: typeof candidateRect) => {
            return isColliding(rect, items, '') || batchOccupiedRects.some(r => rectIntersects(rect, r));
        };

        // Spiral search / simple scan to find empty spot
        while (checkCollision({ x: finalX, y: finalY, width, height }) && attempts < 100) {
          finalX += gridSize;
          // If we move too far right, drop down a line (simple grid fill strategy)
          if (attempts % 10 === 0 && attempts > 0) {
              finalX = placeholder.x - width / 2; // Reset X
              finalY += gridSize; // Move Y down
          }
          attempts++;
        }

        // Register this new position as occupied for the next iteration in this loop
        batchOccupiedRects.push({ x: finalX, y: finalY, width, height });

        await addCanvasItem({
          url: base64,
          x: finalX,
          y: finalY,
          width,
          height,
          originalWidth: width,
          originalHeight: height,
          rotation: 0,
          name: fileName.split('.')[0] || 'Untitled',
          filters: { 
            brightness: 100, 
            contrast: 100,
            saturation: 100,
            hue: 0,
            blur: 0,
            sepia: 0
          },
          zIndex: Date.now() + i // Increment zIndex to preserve drag order
        });

      } catch (e) {
        console.error("FAILED TO ADD IMAGE:", e);
        alert(`Failed to add ${fileName}. It might be corrupted or format unsupported.`);
      } finally {
        setLoadingItems(prev => prev.filter(p => p.id !== placeholder.id));
      }
    }
  }, [items]);

  return {
    loadingItems,
    handleDropFiles
  };
};