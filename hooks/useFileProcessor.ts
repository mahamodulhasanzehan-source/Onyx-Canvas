import { useState, useCallback } from 'react';
import { CanvasItem, LoadingCanvasItem } from '../types';
import { compressImage } from '../utils/imageProcessing';
import { isColliding } from '../utils/geometry';
import { addCanvasItem } from '../utils/db';

export const useFileProcessor = (items: CanvasItem[]) => {
  const [loadingItems, setLoadingItems] = useState<LoadingCanvasItem[]>([]);

  const handleDropFiles = useCallback(async (files: File[], x: number, y: number) => {
    let currentX = x;
    let currentY = y;

    const newLoadingItems: LoadingCanvasItem[] = files.map((f, index) => ({
      id: `loading-${Date.now()}-${index}`,
      name: f.name,
      x: currentX + (index * 20),
      y: currentY + (index * 20)
    }));
    setLoadingItems(prev => [...prev, ...newLoadingItems]);

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
        let finalX = placeholder.x - width / 2;
        let finalY = placeholder.y - height / 2;

        finalX = Math.round(finalX / gridSize) * gridSize;
        finalY = Math.round(finalY / gridSize) * gridSize;

        let attempts = 0;
        while (isColliding({ x: finalX, y: finalY, width, height }, items, '') && attempts < 100) {
          finalX += gridSize;
          finalY += gridSize;
          attempts++;
        }

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
          zIndex: Date.now()
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