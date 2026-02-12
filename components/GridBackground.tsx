import React from 'react';

interface GridBackgroundProps {
  offsetX: number;
  offsetY: number;
  scale: number;
}

export const GridBackground: React.FC<GridBackgroundProps> = ({ offsetX, offsetY, scale }) => {
  // Grid dot pattern
  const gridSize = 40 * scale;
  
  // Constant opacity regardless of scale
  const opacity = 0.8;

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