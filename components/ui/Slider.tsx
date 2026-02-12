import React from 'react';

interface SliderProps {
  value: number;
  min: number;
  max: number;
  onChange: (val: number) => void;
  label: string;
  icon?: React.ReactNode;
}

export const Slider: React.FC<SliderProps> = ({ value, min, max, onChange, label, icon }) => {
  return (
    <div className="flex flex-col space-y-2 w-full">
      <div className="flex justify-between text-xs text-zinc-400 items-center">
        <span className="flex items-center gap-2">{icon} {label}</span>
        <span>{value}%</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-blue-500 hover:accent-blue-400 transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/50"
      />
    </div>
  );
};