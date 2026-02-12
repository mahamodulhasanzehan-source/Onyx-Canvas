import React from 'react';
import { Grid3X3, Trash2, ZoomIn, ZoomOut } from 'lucide-react';

interface ToolbarProps {
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  snapEnabled: boolean;
  onToggleSnap: () => void;
  hasSelection: boolean;
  onDeleteSelection: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  onZoomIn,
  onZoomOut,
  snapEnabled,
  onToggleSnap,
  hasSelection,
  onDeleteSelection
}) => {
  return (
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 bg-zinc-900/90 backdrop-blur-md border border-zinc-800 rounded-full shadow-2xl z-50 animate-in slide-in-from-bottom-10 fade-in duration-500 hover:scale-105 transition-transform">
      
      {/* Zoom controls: Visible ONLY on mobile (hidden on md and up) */}
      {onZoomOut && (
        <button
          onClick={onZoomOut}
          className="md:hidden p-2 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all active:scale-95"
          title="Zoom Out"
        >
          <ZoomOut size={20} />
        </button>
      )}

      {onZoomIn && (
        <button
          onClick={onZoomIn}
          className="md:hidden p-2 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all active:scale-95"
          title="Zoom In"
        >
          <ZoomIn size={20} />
        </button>
      )}

      {/* Vertical Separator: Hidden on desktop */}
      <div className="md:hidden w-px h-4 bg-zinc-800 mx-1" />

      <button
        onClick={onToggleSnap}
        className={`p-2 rounded-full transition-all active:scale-95 ${
          snapEnabled 
            ? 'bg-blue-500/20 text-blue-400' 
            : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
        }`}
        title="Toggle Snap to Grid"
      >
        <Grid3X3 size={20} />
      </button>

      <div className="w-px h-4 bg-zinc-800 mx-1" />

      <button
        onClick={onDeleteSelection}
        disabled={!hasSelection}
        className={`p-2 rounded-full transition-all active:scale-95 flex items-center gap-2 ${
          hasSelection
            ? 'text-red-400 hover:bg-red-500/20 hover:text-red-300'
            : 'text-zinc-600 cursor-not-allowed'
        }`}
        title="Delete Selection (Del)"
      >
        <Trash2 size={20} />
      </button>
    </div>
  );
};