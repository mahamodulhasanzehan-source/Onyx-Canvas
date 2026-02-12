import React from 'react';
import { ZoomIn, ZoomOut } from 'lucide-react';

interface ToolbarProps {
  onZoomIn?: () => void;
  onZoomOut?: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  onZoomIn,
  onZoomOut,
}) => {
  return (
    <div className="md:hidden fixed bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 bg-zinc-900/90 backdrop-blur-md border border-zinc-800 rounded-full shadow-2xl z-50 animate-in slide-in-from-bottom-10 fade-in duration-500 hover:scale-105 transition-transform">
      
      {/* Zoom controls: Visible ONLY on mobile (hidden on md and up via container class) */}
      {onZoomOut && (
        <button
          onClick={onZoomOut}
          className="p-2 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all active:scale-95"
          title="Zoom Out"
        >
          <ZoomOut size={20} />
        </button>
      )}

      {onZoomIn && (
        <button
          onClick={onZoomIn}
          className="p-2 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all active:scale-95"
          title="Zoom In"
        >
          <ZoomIn size={20} />
        </button>
      )}
    </div>
  );
};