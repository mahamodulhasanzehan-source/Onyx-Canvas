import React, { useState, useEffect, useRef } from 'react';
import { CanvasItem, ImageFilters, CropData } from '../types';
import { X, Check, RotateCw, Sun, Contrast, Crop as CropIcon, RotateCcw, Droplet, Palette, Pencil, Eraser, SlidersHorizontal } from 'lucide-react';
import { Slider } from './ui/Slider';
import { snapToGrid } from '../utils/geometry';

interface EditModalProps {
  item: CanvasItem;
  isOpen: boolean;
  onClose: () => void;
  onSave: (id: string, updates: Partial<CanvasItem>) => void;
}

export const EditModal: React.FC<EditModalProps> = ({ item, isOpen, onClose, onSave }) => {
  const [filters, setFilters] = useState<ImageFilters>({ 
    brightness: 100, contrast: 100, saturation: 100, hue: 0, blur: 0, sepia: 0,
    ...item.filters 
  });
  const [rotation, setRotation] = useState(item.rotation || 0); 
  const [crop, setCrop] = useState<CropData>(item.crop || { x: 0, y: 0, width: 1, height: 1 });
  const [mode, setMode] = useState<'adjust' | 'crop' | 'draw'>('adjust');
  
  // Desktop specific: Active tool for Adjust mode
  const [activeTool, setActiveTool] = useState<keyof ImageFilters>('brightness');
  
  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawColor, setDrawColor] = useState('#ef4444');
  const [drawWidth, setDrawWidth] = useState(4);
  const drawingCanvasRef = useRef<HTMLCanvasElement>(null);
  const [drawingDataUrl, setDrawingDataUrl] = useState<string | undefined>(item.drawingUrl);

  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Initialize drawing canvas when mode changes to draw
  useEffect(() => {
    if (mode === 'draw' && drawingCanvasRef.current && imageRef.current) {
        const canvas = drawingCanvasRef.current;
        const img = imageRef.current;
        if (canvas.width !== img.naturalWidth || canvas.height !== img.naturalHeight) {
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            if (ctx && drawingDataUrl) {
                const prevDraw = new Image();
                prevDraw.src = drawingDataUrl;
                prevDraw.onload = () => ctx.drawImage(prevDraw, 0, 0);
            }
        }
    }
  }, [mode, drawingDataUrl]);

  const handleSave = () => {
    // Save drawing if needed
    let finalDrawingUrl = drawingDataUrl;
    if (drawingCanvasRef.current) {
        finalDrawingUrl = drawingCanvasRef.current.toDataURL('image/png');
    }

    // Calculate new dimensions based on crop aspect ratio
    const prevCropW = item.crop?.width || 1;
    const prevCropH = item.crop?.height || 1;
    
    const scaleX = item.width / (item.originalWidth * prevCropW);
    const scaleY = item.height / (item.originalHeight * prevCropH);
    
    let newW = (item.originalWidth * crop.width) * scaleX;
    let newH = (item.originalHeight * crop.height) * scaleY;
    
    const gridSize = 40;
    newW = Math.max(gridSize, snapToGrid(newW, gridSize));
    newH = Math.max(gridSize, snapToGrid(newH, gridSize));

    onSave(item.id, {
        filters,
        rotation,
        crop,
        drawingUrl: finalDrawingUrl,
        width: newW,
        height: newH
    });
    onClose();
  };

  const handleReset = () => {
      setFilters({ brightness: 100, contrast: 100, saturation: 100, hue: 0, blur: 0, sepia: 0 });
      setRotation(0);
      setCrop({ x: 0, y: 0, width: 1, height: 1 });
      setDrawingDataUrl(undefined);
      if (drawingCanvasRef.current) {
          const ctx = drawingCanvasRef.current.getContext('2d');
          ctx?.clearRect(0, 0, drawingCanvasRef.current.width, drawingCanvasRef.current.height);
      }
  };

  // --- Crop Logic ---
  const cropStart = useRef<{x: number, y: number, cropX: number, cropY: number, cropW: number, cropH: number, type: string} | null>(null);

  const handleCropDown = (e: React.MouseEvent | React.TouchEvent, type: string) => {
      e.stopPropagation();
      e.preventDefault(); 
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      cropStart.current = {
          x: clientX,
          y: clientY,
          cropX: crop.x,
          cropY: crop.y,
          cropW: crop.width,
          cropH: crop.height,
          type
      };
  };

  const handleGlobalMove = (e: MouseEvent | TouchEvent) => {
      if (!cropStart.current || !imageRef.current || mode !== 'crop') return;
      
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      
      const dxPx = clientX - cropStart.current.x;
      const dyPx = clientY - cropStart.current.y;
      
      const rect = imageRef.current.getBoundingClientRect();
      const dxPct = dxPx / rect.width;
      const dyPct = dyPx / rect.height;
      
      let { cropX, cropY, cropW, cropH, type } = cropStart.current;
      
      if (type === 'move') {
          cropX = Math.min(Math.max(0, cropX + dxPct), 1 - cropW);
          cropY = Math.min(Math.max(0, cropY + dyPct), 1 - cropH);
      } else {
          if (type.includes('e')) cropW = Math.min(Math.max(0.05, cropW + dxPct), 1 - cropX);
          if (type.includes('s')) cropH = Math.min(Math.max(0.05, cropH + dyPct), 1 - cropY);
          if (type.includes('w')) {
              const maxDelta = cropW - 0.05;
              const delta = Math.max(-cropX, Math.min(maxDelta, dxPct));
              cropX += delta;
              cropW -= delta;
          }
          if (type.includes('n')) {
              const maxDelta = cropH - 0.05;
              const delta = Math.max(-cropY, Math.min(maxDelta, dyPct));
              cropY += delta;
              cropH -= delta;
          }
      }
      
      setCrop({ x: cropX, y: cropY, width: cropW, height: cropH });
  };

  const handleGlobalUp = () => {
      cropStart.current = null;
      setIsDrawing(false);
  };

  useEffect(() => {
      window.addEventListener('mousemove', handleGlobalMove);
      window.addEventListener('mouseup', handleGlobalUp);
      window.addEventListener('touchmove', handleGlobalMove, { passive: false });
      window.addEventListener('touchend', handleGlobalUp);
      return () => {
          window.removeEventListener('mousemove', handleGlobalMove);
          window.removeEventListener('mouseup', handleGlobalUp);
          window.removeEventListener('touchmove', handleGlobalMove);
          window.removeEventListener('touchend', handleGlobalUp);
      };
  }, [mode]);

  // --- Drawing Logic ---
  const getCanvasCoords = (e: React.MouseEvent | React.TouchEvent) => {
      if (!drawingCanvasRef.current) return { x: 0, y: 0 };
      const rect = drawingCanvasRef.current.getBoundingClientRect();
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      const scaleX = drawingCanvasRef.current.width / rect.width;
      const scaleY = drawingCanvasRef.current.height / rect.height;
      return {
          x: (clientX - rect.left) * scaleX,
          y: (clientY - rect.top) * scaleY
      };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
      if (mode !== 'draw') return;
      e.preventDefault();
      setIsDrawing(true);
      const ctx = drawingCanvasRef.current?.getContext('2d');
      if (ctx) {
          const { x, y } = getCanvasCoords(e);
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.strokeStyle = drawColor;
          ctx.lineWidth = drawWidth * (drawingCanvasRef.current!.width / 1000); 
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
      }
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
      if (!isDrawing || mode !== 'draw') return;
      e.preventDefault();
      const ctx = drawingCanvasRef.current?.getContext('2d');
      if (ctx) {
          const { x, y } = getCanvasCoords(e);
          ctx.lineTo(x, y);
          ctx.stroke();
      }
  };

  const stopDrawing = () => {
      setIsDrawing(false);
      const ctx = drawingCanvasRef.current?.getContext('2d');
      ctx?.closePath();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col md:flex-row bg-zinc-950 animate-in fade-in duration-200">
        
        {/* === DESKTOP SIDEBAR === */}
        <div className="hidden md:flex w-20 bg-zinc-900 border-r border-zinc-800 flex-col items-center py-6 gap-6 z-20 shrink-0">
             <ModeButton 
                active={mode === 'adjust'} 
                onClick={() => setMode('adjust')} 
                icon={<SlidersHorizontal size={20} />} 
                label="Adjust" 
             />
             <ModeButton 
                active={mode === 'crop'} 
                onClick={() => setMode('crop')} 
                icon={<CropIcon size={20} />} 
                label="Crop" 
             />
             <ModeButton 
                active={mode === 'draw'} 
                onClick={() => setMode('draw')} 
                icon={<Pencil size={20} />} 
                label="Draw" 
             />
        </div>

        {/* === MAIN CONTENT AREA === */}
        <div className="flex-1 flex flex-col relative h-full min-w-0 overflow-hidden">
            
            {/* MOBILE HEADER */}
            <div className="md:hidden shrink-0 flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900 z-10">
                <button onClick={onClose} className="p-2 -ml-2 rounded-full hover:bg-zinc-800 text-zinc-400">
                    <X size={24} />
                </button>
                <div className="flex items-center gap-4">
                    <button onClick={handleReset} className="text-xs font-medium text-zinc-500 uppercase">Reset</button>
                    <button onClick={handleSave} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-1.5 rounded-full font-medium text-sm">
                        <Check size={16} /> Save
                    </button>
                </div>
            </div>

            {/* DESKTOP FLOATING HEADER */}
            <div className="hidden md:flex absolute top-0 left-0 right-0 h-20 items-center justify-between px-8 z-30 pointer-events-none bg-gradient-to-b from-black/80 to-transparent">
                <button onClick={onClose} className="pointer-events-auto p-2.5 bg-zinc-900/50 backdrop-blur rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
                    <X size={24} />
                </button>
                <div className="pointer-events-auto flex gap-3">
                    <button onClick={handleReset} className="px-4 py-2 rounded-lg bg-zinc-900/50 backdrop-blur text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors text-sm font-medium">
                        Reset
                    </button>
                    <button onClick={handleSave} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg font-medium text-sm shadow-lg transition-all active:scale-95">
                        <Check size={16} /> Save Changes
                    </button>
                </div>
            </div>

            {/* SHARED IMAGE WORKSPACE */}
            {/* 'min-h-0' is crucial for flex children to shrink properly and not overflow */}
            <div className="flex-1 relative bg-black flex items-center justify-center min-h-0 overflow-hidden select-none touch-none p-4 md:p-12">
                <div 
                    ref={containerRef} 
                    className="relative shadow-2xl transition-transform duration-300 ease-out"
                    style={{ 
                        transform: `rotate(${rotation}deg)`,
                        maxWidth: '100%',
                        maxHeight: '100%',
                        aspectRatio: `${item.originalWidth} / ${item.originalHeight}`,
                    }}
                >
                    <img 
                        ref={imageRef}
                        src={item.url} 
                        alt="Edit preview" 
                        className="w-full h-full object-fill block"
                        style={{
                            filter: `brightness(${filters.brightness}%) contrast(${filters.contrast}%) saturate(${filters.saturation}%) hue-rotate(${filters.hue}deg) blur(${filters.blur}px) sepia(${filters.sepia}%)`
                        }}
                        draggable={false}
                    />
                    
                    {/* Drawing Overlay */}
                    <canvas 
                        ref={drawingCanvasRef}
                        className={`absolute inset-0 w-full h-full object-contain mx-auto ${mode === 'draw' ? 'cursor-crosshair pointer-events-auto' : 'pointer-events-none'}`}
                        onMouseDown={startDrawing}
                        onMouseMove={draw}
                        onMouseUp={stopDrawing}
                        onTouchStart={startDrawing}
                        onTouchMove={draw}
                        onTouchEnd={stopDrawing}
                    />

                    {/* Crop Overlay */}
                    {mode === 'crop' && (
                        <div className="absolute inset-0 pointer-events-none">
                             {/* Darken outside area */}
                             <div className="absolute inset-0 bg-black/50" 
                                  style={{ 
                                      clipPath: `polygon(
                                          0% 0%, 0% 100%, 
                                          ${crop.x * 100}% 100%, ${crop.x * 100}% ${crop.y * 100}%, 
                                          ${(crop.x + crop.width) * 100}% ${crop.y * 100}%, ${(crop.x + crop.width) * 100}% ${(crop.y + crop.height) * 100}%, 
                                          ${crop.x * 100}% ${(crop.y + crop.height) * 100}%, ${crop.x * 100}% 100%, 
                                          100% 100%, 100% 0%
                                      )` 
                                   }} 
                            />
                             
                             {/* Selection Box */}
                             <div 
                                className="absolute border border-white/80 shadow-[0_0_0_1px_rgba(0,0,0,0.5)] pointer-events-auto cursor-move"
                                style={{
                                    left: `${crop.x * 100}%`,
                                    top: `${crop.y * 100}%`,
                                    width: `${crop.width * 100}%`,
                                    height: `${crop.height * 100}%`,
                                }}
                                onMouseDown={(e) => handleCropDown(e, 'move')}
                                onTouchStart={(e) => handleCropDown(e, 'move')}
                            >
                                {/* Grid Lines */}
                                <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none opacity-30">
                                    <div className="border-r border-b border-white"></div>
                                    <div className="border-r border-b border-white"></div>
                                    <div className="border-b border-white"></div>
                                    <div className="border-r border-b border-white"></div>
                                    <div className="border-r border-b border-white"></div>
                                    <div className="border-b border-white"></div>
                                    <div className="border-r border-white"></div>
                                    <div className="border-r border-white"></div>
                                    <div></div>
                                </div>
                                
                                {/* Handles */}
                                {['nw', 'ne', 'sw', 'se', 'n', 'e', 's', 'w'].map(h => (
                                    <div 
                                        key={h}
                                        className={`absolute w-6 h-6 flex items-center justify-center
                                            ${h.includes('n') ? '-top-3' : h.includes('s') ? '-bottom-3' : 'top-1/2 -translate-y-1/2'}
                                            ${h.includes('w') ? '-left-3' : h.includes('e') ? '-right-3' : 'left-1/2 -translate-x-1/2'}
                                            cursor-${h}-resize
                                        `}
                                        onMouseDown={(e) => handleCropDown(e, h)}
                                        onTouchStart={(e) => handleCropDown(e, h)}
                                    >
                                        <div className="w-2.5 h-2.5 bg-white rounded-full shadow-sm border border-black/20" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* === DESKTOP BOTTOM BAR === */}
            <div className="hidden md:flex h-36 bg-zinc-900 border-t border-zinc-800 shrink-0 flex-col items-center justify-center relative z-30">
                {mode === 'adjust' && (
                    <div className="w-full flex flex-col items-center gap-5 px-8 animate-in slide-in-from-bottom-4 fade-in">
                        {/* Active Slider */}
                        <div className="w-full max-w-lg flex items-center gap-4">
                            <input 
                                type="range" 
                                min={0} 
                                max={activeTool === 'hue' ? 360 : (activeTool === 'blur' ? 20 : (activeTool === 'sepia' ? 100 : 200))}
                                value={filters[activeTool]}
                                onChange={(e) => setFilters(p => ({...p, [activeTool]: Number(e.target.value)}))}
                                className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-blue-500 hover:accent-blue-400 focus:outline-none"
                            />
                            <div className="w-12 text-center bg-zinc-800 rounded px-2 py-1 text-xs font-mono text-zinc-300">
                                {filters[activeTool]}{activeTool === 'hue' ? '°' : activeTool === 'blur' ? 'px' : '%'}
                            </div>
                        </div>

                        {/* Tool Icons */}
                        <div className="flex items-center gap-8">
                            <AdjustToolButton tool="brightness" active={activeTool === 'brightness'} onClick={() => setActiveTool('brightness')} icon={<Sun size={20} />} />
                            <AdjustToolButton tool="contrast" active={activeTool === 'contrast'} onClick={() => setActiveTool('contrast')} icon={<Contrast size={20} />} />
                            <AdjustToolButton tool="saturation" active={activeTool === 'saturation'} onClick={() => setActiveTool('saturation')} icon={<Droplet size={20} />} />
                            <AdjustToolButton tool="hue" active={activeTool === 'hue'} onClick={() => setActiveTool('hue')} icon={<Palette size={20} />} />
                            <AdjustToolButton tool="blur" active={activeTool === 'blur'} onClick={() => setActiveTool('blur')} icon={<Droplet size={20} />} />
                            <AdjustToolButton tool="sepia" active={activeTool === 'sepia'} onClick={() => setActiveTool('sepia')} icon={<Palette size={20} />} />
                        </div>
                    </div>
                )}

                {mode === 'crop' && (
                    <div className="flex items-center gap-8 animate-in slide-in-from-bottom-4 fade-in">
                        <button 
                            onClick={() => setRotation((r) => r - 90)}
                            className="flex flex-col items-center gap-2 p-4 rounded-xl hover:bg-zinc-800 text-zinc-400 hover:text-white transition-all"
                        >
                            <RotateCcw size={24} />
                            <span className="text-xs">Rotate Left</span>
                        </button>
                        <div className="h-12 w-px bg-zinc-800" />
                        <span className="text-zinc-500 text-sm font-medium">Drag corners to crop</span>
                        <div className="h-12 w-px bg-zinc-800" />
                        <button 
                            onClick={() => setRotation((r) => r + 90)}
                            className="flex flex-col items-center gap-2 p-4 rounded-xl hover:bg-zinc-800 text-zinc-400 hover:text-white transition-all"
                        >
                            <RotateCw size={24} />
                            <span className="text-xs">Rotate Right</span>
                        </button>
                    </div>
                )}

                {mode === 'draw' && (
                    <div className="w-full flex flex-col items-center gap-4 animate-in slide-in-from-bottom-4 fade-in">
                        {/* Size Slider */}
                        <div className="w-full max-w-sm flex items-center gap-4">
                            <div className="p-1.5 rounded-full bg-white" style={{ width: 4, height: 4 }}></div>
                            <input 
                                type="range" 
                                min={1} max={20}
                                value={drawWidth}
                                onChange={(e) => setDrawWidth(Number(e.target.value))}
                                className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-white hover:accent-zinc-200"
                            />
                            <div className="p-1.5 rounded-full bg-white" style={{ width: 16, height: 16 }}></div>
                        </div>
                        
                        {/* Colors */}
                        <div className="flex items-center gap-4">
                            {['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#ffffff', '#000000'].map(c => (
                                <button 
                                    key={c}
                                    onClick={() => setDrawColor(c)}
                                    className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 ${drawColor === c ? 'border-white scale-110 ring-2 ring-white/20' : 'border-transparent'}`}
                                    style={{ backgroundColor: c }}
                                />
                            ))}
                            <div className="w-px h-8 bg-zinc-800 mx-2" />
                            <button 
                                onClick={() => {
                                    setDrawingDataUrl(undefined);
                                    const ctx = drawingCanvasRef.current?.getContext('2d');
                                    if (ctx && drawingCanvasRef.current) ctx.clearRect(0,0, drawingCanvasRef.current.width, drawingCanvasRef.current.height);
                                }}
                                className="text-red-400 hover:text-red-300 hover:bg-red-500/10 px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 transition-colors"
                            >
                                <Eraser size={14} /> Clear
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* === MOBILE CONTROLS (Original) === */}
            <div className="md:hidden shrink-0 bg-zinc-900 border-t border-zinc-800 flex flex-col h-[40vh] overflow-hidden">
                <div className="flex shrink-0 border-b border-zinc-800 overflow-x-auto">
                    {[
                        { id: 'adjust', icon: <SlidersHorizontal size={20} />, label: 'Adjust' },
                        { id: 'crop', icon: <CropIcon size={20} />, label: 'Crop' },
                        { id: 'draw', icon: <Pencil size={20} />, label: 'Draw' },
                    ].map((m) => (
                        <button
                            key={m.id}
                            onClick={() => setMode(m.id as any)}
                            className={`flex flex-col items-center justify-center px-6 py-3 gap-1 min-w-[80px] transition-colors
                                ${mode === m.id ? 'bg-zinc-800 text-blue-400' : 'text-zinc-500 hover:text-zinc-300'}
                            `}
                        >
                            {m.icon}
                            <span className="text-[10px] font-medium uppercase">{m.label}</span>
                        </button>
                    ))}
                </div>

                <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
                    <div className="max-w-md mx-auto space-y-6 pb-8">
                        {mode === 'adjust' && (
                            <div className="flex flex-col gap-6 animate-in slide-in-from-bottom-4 fade-in">
                                <h3 className="text-sm font-medium text-zinc-400 mb-2">Color & Light</h3>
                                <Slider label="Brightness" value={filters.brightness} min={0} max={200} onChange={v => setFilters(p => ({...p, brightness: v}))} icon={<Sun size={14} />} />
                                <Slider label="Contrast" value={filters.contrast} min={0} max={200} onChange={v => setFilters(p => ({...p, contrast: v}))} icon={<Contrast size={14} />} />
                                <Slider label="Saturation" value={filters.saturation} min={0} max={200} onChange={v => setFilters(p => ({...p, saturation: v}))} icon={<Droplet size={14} />} />
                                <h3 className="text-sm font-medium text-zinc-400 mt-4 mb-2">Effects</h3>
                                <Slider label="Hue" value={filters.hue} min={0} max={360} onChange={v => setFilters(p => ({...p, hue: v}))} icon={<Palette size={14} />} />
                                <Slider label="Blur" value={filters.blur} min={0} max={20} onChange={v => setFilters(p => ({...p, blur: v}))} icon={<Droplet size={14} />} />
                                <Slider label="Sepia" value={filters.sepia} min={0} max={100} onChange={v => setFilters(p => ({...p, sepia: v}))} icon={<Palette size={14} />} />
                            </div>
                        )}

                        {mode === 'crop' && (
                            <div className="flex flex-col gap-6 animate-in slide-in-from-bottom-4 fade-in items-center">
                                <p className="text-sm text-zinc-500 text-center mb-4">
                                    Drag corner handles to crop.<br/>Image will snap to grid layout.
                                </p>
                                <div className="flex gap-4">
                                    <button onClick={() => setRotation((r) => r - 90)} className="flex flex-col items-center gap-2 p-4 bg-zinc-800 rounded-lg w-24"><RotateCcw size={24} /><span className="text-xs text-zinc-400">-90°</span></button>
                                    <button onClick={() => setRotation((r) => r + 90)} className="flex flex-col items-center gap-2 p-4 bg-zinc-800 rounded-lg w-24"><RotateCw size={24} /><span className="text-xs text-zinc-400">+90°</span></button>
                                </div>
                            </div>
                        )}

                        {mode === 'draw' && (
                            <div className="flex flex-col gap-6 animate-in slide-in-from-bottom-4 fade-in">
                                <div>
                                    <label className="text-xs text-zinc-500 mb-2 block uppercase font-medium">Color</label>
                                    <div className="flex gap-3 flex-wrap">
                                        {['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#ffffff', '#000000'].map(c => (
                                            <button 
                                                key={c}
                                                onClick={() => setDrawColor(c)}
                                                className={`w-8 h-8 rounded-full border-2 ${drawColor === c ? 'border-white scale-110' : 'border-transparent'}`}
                                                style={{ backgroundColor: c }}
                                            />
                                        ))}
                                    </div>
                                </div>
                                <Slider label="Brush Size" value={drawWidth} min={1} max={20} onChange={setDrawWidth} icon={<Pencil size={14} />} />
                                <div className="flex justify-center pt-4">
                                    <button onClick={() => { setDrawingDataUrl(undefined); const ctx = drawingCanvasRef.current?.getContext('2d'); if(ctx && drawingCanvasRef.current) ctx.clearRect(0,0,drawingCanvasRef.current.width,drawingCanvasRef.current.height); }} className="text-red-400 text-sm flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-800"><Eraser size={16} /> Clear</button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    </div>
  );
};

const ModeButton = ({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) => (
    <button 
       onClick={onClick}
       className={`flex flex-col items-center gap-3 p-3 rounded-xl w-16 transition-all duration-200
         ${active ? 'bg-zinc-800 text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.1)]' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'}
       `}
    >
       {icon}
       <span className="text-[10px] font-medium uppercase tracking-wide">{label}</span>
    </button>
);

const AdjustToolButton = ({ active, onClick, icon, tool }: { active: boolean, onClick: () => void, icon: React.ReactNode, tool: string }) => (
    <button
       onClick={onClick}
       className={`flex flex-col items-center gap-2 p-2 rounded-lg transition-all duration-200
        ${active ? 'text-blue-400 transform -translate-y-1' : 'text-zinc-500 hover:text-zinc-300'}
       `}
    >
        <div className={`p-3 rounded-full ${active ? 'bg-zinc-800 shadow-lg' : 'bg-transparent'}`}>
            {icon}
        </div>
        <span className="text-[10px] font-medium uppercase tracking-wider">{tool}</span>
    </button>
);
