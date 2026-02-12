import React, { useState, useEffect, useRef } from 'react';
import { CanvasItem, ImageFilters } from '../types';
import { X, Check, RotateCw, Sun, Contrast, Crop as CropIcon, RotateCcw } from 'lucide-react';
import { Slider } from './ui/Slider';
import { processImage } from '../utils/imageProcessing';

interface EditModalProps {
  item: CanvasItem;
  isOpen: boolean;
  onClose: () => void;
  onSave: (id: string, newBlob: Blob, newFilters: ImageFilters, newRotation: number) => void;
}

export const EditModal: React.FC<EditModalProps> = ({ item, isOpen, onClose, onSave }) => {
  const [filters, setFilters] = useState<ImageFilters>({ ...item.filters });
  const [rotation, setRotation] = useState(0); 
  const [isProcessing, setIsProcessing] = useState(false);
  const [mode, setMode] = useState<'adjust' | 'crop'>('adjust');
  
  // Crop state
  const [cropRect, setCropRect] = useState<{x: number, y: number, w: number, h: number} | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setFilters({ ...item.filters });
      setRotation(0);
      setMode('adjust');
      setCropRect(null);
    }
  }, [isOpen, item]);

  // Initialize crop rect when entering crop mode
  useEffect(() => {
    if (mode === 'crop' && imageRef.current && !cropRect) {
      const { width, height } = imageRef.current.getBoundingClientRect();
      setCropRect({
        x: width * 0.1,
        y: height * 0.1,
        w: width * 0.8,
        h: height * 0.8
      });
    }
  }, [mode]);

  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  const handleReset = () => {
      setFilters({ brightness: 100, contrast: 100 });
      setRotation(0);
      setCropRect(null);
      
      // If we are in crop mode, re-init the rect
      if (mode === 'crop' && imageRef.current) {
          const { width, height } = imageRef.current.getBoundingClientRect();
          setCropRect({
              x: width * 0.1,
              y: height * 0.1,
              w: width * 0.8,
              h: height * 0.8
          });
      }
  };

  const handleSave = async () => {
    setIsProcessing(true);
    try {
      let pixelCrop = null;
      
      if (mode === 'crop' && cropRect && imageRef.current) {
         const renderedW = imageRef.current.width;
         const renderedH = imageRef.current.height;
         const naturalW = imageRef.current.naturalWidth;
         const naturalH = imageRef.current.naturalHeight;
         
         const pctX = cropRect.x / renderedW;
         const pctY = cropRect.y / renderedH;
         const pctW = cropRect.w / renderedW;
         const pctH = cropRect.h / renderedH;
         
         const rad = (rotation * Math.PI) / 180;
         const sin = Math.abs(Math.sin(rad));
         const cos = Math.abs(Math.cos(rad));
         const rotW = naturalW * cos + naturalH * sin;
         const rotH = naturalH * cos + naturalW * sin;
         
         pixelCrop = {
             x: pctX * rotW,
             y: pctY * rotH,
             width: pctW * rotW,
             height: pctH * rotH
         };
      }

      const newBlob = await processImage(item.url, pixelCrop, rotation, filters);
      
      onSave(item.id, newBlob, { brightness: 100, contrast: 100 }, 0); 
      onClose();
    } catch (e) {
      console.error("Failed to process image", e);
      alert("Could not save image. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  // Crop Drag Handling
  const dragStart = useRef<{x: number, y: number, type: 'move' | 'nw'|'ne'|'sw'|'se' | null} | null>(null);
  
  const handleMouseDown = (e: React.MouseEvent, type: 'move' | 'nw'|'ne'|'sw'|'se') => {
    e.preventDefault();
    e.stopPropagation();
    dragStart.current = { x: e.clientX, y: e.clientY, type };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragStart.current || !cropRect || !imageRef.current) return;
    
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    
    const parentRect = imageRef.current.getBoundingClientRect();
    const maxWidth = parentRect.width;
    const maxHeight = parentRect.height;
    
    let newRect = { ...cropRect };

    if (dragStart.current.type === 'move') {
        newRect.x = Math.max(0, Math.min(newRect.x + dx, maxWidth - newRect.w));
        newRect.y = Math.max(0, Math.min(newRect.y + dy, maxHeight - newRect.h));
    } else {
        if (dragStart.current.type?.includes('e')) newRect.w += dx;
        if (dragStart.current.type?.includes('w')) { newRect.x += dx; newRect.w -= dx; }
        if (dragStart.current.type?.includes('s')) newRect.h += dy;
        if (dragStart.current.type?.includes('n')) { newRect.y += dy; newRect.h -= dy; }
    }

    if (newRect.w < 50) newRect.w = 50;
    if (newRect.h < 50) newRect.h = 50;
    if (newRect.x < 0) newRect.x = 0;
    if (newRect.y < 0) newRect.y = 0;
    if (newRect.x + newRect.w > maxWidth) newRect.w = maxWidth - newRect.x;
    if (newRect.y + newRect.h > maxHeight) newRect.h = maxHeight - newRect.y;

    setCropRect(newRect);
    dragStart.current = { x: e.clientX, y: e.clientY, type: dragStart.current.type };
  };

  const handleMouseUp = () => {
    dragStart.current = null;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl w-[90vw] h-[90vh] max-w-5xl flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-900/50">
          <h2 className="text-white font-medium">Edit Image</h2>
          <div className="flex gap-2">
            <button 
                onClick={handleReset}
                className="p-2 rounded-full hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors flex items-center gap-1 text-xs"
                title="Reset Changes"
            >
                <RotateCcw size={16} />
                <span className="hidden sm:inline">Reset</span>
            </button>
            <div className="w-px h-6 bg-zinc-800 mx-2" />
            <button 
                onClick={onClose}
                className="p-2 rounded-full hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
            >
                <X size={20} />
            </button>
          </div>
        </div>

        {/* Main Workspace */}
        <div 
            className="flex-1 relative bg-black flex items-center justify-center overflow-hidden select-none"
            onMouseMove={mode === 'crop' ? handleMouseMove : undefined}
            onMouseUp={mode === 'crop' ? handleMouseUp : undefined}
            onMouseLeave={mode === 'crop' ? handleMouseUp : undefined}
        >
            <div ref={containerRef} className="relative inline-block">
                <img 
                    ref={imageRef}
                    src={item.url} 
                    alt="Edit preview" 
                    className="max-h-[70vh] max-w-full object-contain transition-all duration-300"
                    style={{
                        transform: `rotate(${rotation}deg)`,
                        filter: `brightness(${filters.brightness}%) contrast(${filters.contrast}%)`
                    }}
                    draggable={false}
                />
                
                {/* Crop Overlay */}
                {mode === 'crop' && cropRect && (
                    <div 
                        className="absolute border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.5)] cursor-move"
                        style={{
                            left: cropRect.x,
                            top: cropRect.y,
                            width: cropRect.w,
                            height: cropRect.h,
                        }}
                        onMouseDown={(e) => handleMouseDown(e, 'move')}
                    >
                        {/* Grid of thirds */}
                        <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none opacity-50">
                             <div className="border-r border-b border-white/30"></div>
                             <div className="border-r border-b border-white/30"></div>
                             <div className="border-b border-white/30"></div>
                             <div className="border-r border-b border-white/30"></div>
                             <div className="border-r border-b border-white/30"></div>
                             <div className="border-b border-white/30"></div>
                             <div className="border-r border-white/30"></div>
                             <div className="border-r border-white/30"></div>
                             <div></div>
                        </div>

                        {/* Handles */}
                        <div className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white cursor-nw-resize" onMouseDown={(e) => handleMouseDown(e, 'nw')}/>
                        <div className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white cursor-ne-resize" onMouseDown={(e) => handleMouseDown(e, 'ne')}/>
                        <div className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white cursor-sw-resize" onMouseDown={(e) => handleMouseDown(e, 'sw')}/>
                        <div className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white cursor-se-resize" onMouseDown={(e) => handleMouseDown(e, 'se')}/>
                    </div>
                )}
            </div>
        </div>

        {/* Footer / Controls */}
        <div className="px-6 py-6 border-t border-zinc-800 bg-zinc-900 flex flex-col gap-4">
            
            <div className="flex items-center justify-between gap-8">
                {/* Mode Toggles */}
                <div className="flex bg-zinc-800 rounded-lg p-1 gap-1">
                    <button 
                        onClick={() => setMode('adjust')}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${mode === 'adjust' ? 'bg-zinc-700 text-white shadow-sm' : 'text-zinc-400 hover:text-white'}`}
                    >
                        Adjust
                    </button>
                    <button 
                        onClick={() => setMode('crop')}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${mode === 'crop' ? 'bg-zinc-700 text-white shadow-sm' : 'text-zinc-400 hover:text-white'}`}
                    >
                        Crop
                    </button>
                </div>

                {/* Sliders for Adjust Mode */}
                {mode === 'adjust' && (
                    <div className="flex-1 grid grid-cols-2 gap-8 animate-in fade-in slide-in-from-bottom-2">
                        <Slider 
                            label="Brightness" 
                            value={filters.brightness} 
                            min={0} 
                            max={200} 
                            onChange={(v) => setFilters(prev => ({...prev, brightness: v}))} 
                            icon={<Sun size={14} />}
                        />
                        <Slider 
                            label="Contrast" 
                            value={filters.contrast} 
                            min={0} 
                            max={200} 
                            onChange={(v) => setFilters(prev => ({...prev, contrast: v}))} 
                            icon={<Contrast size={14} />}
                        />
                    </div>
                )}

                {/* Controls for Crop Mode */}
                 {mode === 'crop' && (
                    <div className="flex-1 flex items-center justify-center text-zinc-400 text-sm animate-in fade-in slide-in-from-bottom-2">
                        <CropIcon size={16} className="mr-2"/>
                        Drag corners to crop
                    </div>
                 )}

                {/* Rotate Button */}
                <button 
                    onClick={handleRotate}
                    className="p-3 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-white transition-colors"
                    title="Rotate 90 degrees"
                >
                    <RotateCw size={20} />
                </button>
            </div>

            <div className="flex justify-end pt-2">
                <button 
                    onClick={handleSave}
                    disabled={isProcessing}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 text-white px-6 py-2.5 rounded-lg font-medium transition-all shadow-lg hover:shadow-blue-500/20 active:scale-95"
                >
                    {isProcessing ? 'Saving...' : (
                        <>
                            <Check size={18} />
                            Done
                        </>
                    )}
                </button>
            </div>
        </div>

      </div>
    </div>
  );
};