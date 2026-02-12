import React from 'react';

interface GridBackgroundProps {
  offsetX: number;
  offsetY: number;
  scale: number;
}

export const GridBackground: React.FC<GridBackgroundProps> = ({ offsetX, offsetY, scale }) => {
  // Grid dot pattern
  // We keep grid size relatively constant visually or let it scale? 
  // Standard infinite canvas behavior: grid scales with view.
  const gridSize = 40 * scale;
  
  // Fade out grid when zoomed out too far to prevent aliasing/noise
  // Start fading at 0.4, invisible at 0.1
  let opacity = 0.8;
  if (scale < 0.4) {
      opacity = Math.max(0, (scale - 0.1) / 0.3 * 0.8);
  }

  // If scale is huge, maybe fade out too? keeping it simple for now.

  return (
    <div 
      className="absolute inset-0 pointer-events-none z-0 will-change-[background-position]"
      style={{
        backgroundImage: 'radial-gradient(circle, #27272a 1.5px, transparent 1.5px)',
        backgroundSize: `${gridSize}px ${gridSize}px`,
        backgroundPosition: `${offsetX}px ${offsetY}px`,
        opacity: opacity
      }}
    />
  );
};