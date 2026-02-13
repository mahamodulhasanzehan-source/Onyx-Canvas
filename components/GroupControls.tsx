import React, { useMemo } from 'react';
import { CanvasItem } from '../types';
import { AlignHorizontalJustifyStart, AlignVerticalJustifyStart, Columns, Rows, GripHorizontal, GripVertical, Trash2, X } from 'lucide-react';
import { isGroupColliding, getAlignmentProjections } from '../utils/geometry';

interface GroupControlsProps {
  selectedIds: string[];
  items: CanvasItem[];
  onUpdateItems: (updates: { id: string, data: Partial<CanvasItem> }[]) => void;
  onDeselectAll: () => void;
  onDeleteSelected: () => void;
}

export const GroupControls: React.FC<GroupControlsProps> = ({ 
  selectedIds, 
  items, 
  onUpdateItems, 
  onDeselectAll,
  onDeleteSelected
}) => {
  const selectedItems = useMemo(() => items.filter(i => selectedIds.includes(i.id)), [items, selectedIds]);

  const getActionStatus = (type: any) => {
      const projections = getAlignmentProjections(type, selectedItems, 40);
      const isColliding = isGroupColliding(projections, items);
      return { disabled: isColliding, projections };
  };

  const actions = [
      { id: 'align-v', icon: <AlignHorizontalJustifyStart size={20} />, label: 'Align H', type: 'align-h' }, // Switch H/V for visual logic vs axis logic
      { id: 'align-h', icon: <AlignVerticalJustifyStart size={20} />, label: 'Align V', type: 'align-v' },
      { id: 'dist-h', icon: <Columns size={20} />, label: 'Dist H', type: 'dist-h' },
      { id: 'dist-v', icon: <Rows size={20} />, label: 'Dist V', type: 'dist-v' },
      { id: 'compact-h', icon: <GripHorizontal size={20} />, label: 'Compact H', type: 'compact-h' },
      { id: 'compact-v', icon: <GripVertical size={20} />, label: 'Compact V', type: 'compact-v' },
  ];

  const handleAction = (type: any) => {
      const { disabled, projections } = getActionStatus(type);
      if (disabled) return;
      
      onUpdateItems(projections.map(p => ({
          id: p.id,
          data: { x: p.x, y: p.y }
      })));
  };

  if (selectedIds.length < 2) return null;

  return (
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 z-50 animate-in slide-in-from-bottom-10 fade-in duration-300">
        <div className="flex items-center gap-1 p-2 bg-zinc-900/95 backdrop-blur-xl border border-zinc-800 rounded-2xl shadow-2xl">
            <div className="px-3 text-xs font-medium text-zinc-500 border-r border-zinc-800 mr-1">
                {selectedIds.length} Selected
            </div>
            
            {actions.map(action => {
                const { disabled } = getActionStatus(action.type);
                return (
                    <button
                        key={action.id}
                        onClick={() => handleAction(action.type)}
                        disabled={disabled}
                        className={`p-2 rounded-lg transition-all active:scale-95 group relative
                            ${disabled ? 'text-zinc-700 cursor-not-allowed' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'}
                        `}
                        title={disabled ? "Alignment would cause collision" : action.label}
                    >
                        {action.icon}
                    </button>
                );
            })}
            
            <div className="w-px h-6 bg-zinc-800 mx-1" />
            
            <button
                onClick={onDeleteSelected}
                className="p-2 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-all active:scale-95"
                title="Delete Selected"
            >
                <Trash2 size={20} />
            </button>
            
             <button
                onClick={onDeselectAll}
                className="p-2 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-all active:scale-95"
                title="Clear Selection"
            >
                <X size={20} />
            </button>
        </div>
    </div>
  );
};