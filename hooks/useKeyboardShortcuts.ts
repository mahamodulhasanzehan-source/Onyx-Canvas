import { useEffect } from 'react';
import { CanvasItem } from '../types';

interface ShortcutConfig {
  selectedId: string | null;
  renamingId: string | null;
  items: CanvasItem[];
  onDelete: () => void;
  onUpdate: (id: string, updates: Partial<CanvasItem>) => void;
}

export const useKeyboardShortcuts = ({
  selectedId,
  renamingId,
  items,
  onDelete,
  onUpdate
}: ShortcutConfig) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (selectedId && !renamingId) {
        if (e.key === 'Delete' || e.key === 'Backspace') {
          onDelete();
        }

        if (e.key.startsWith('Arrow')) {
          e.preventDefault();
          const nudge = e.shiftKey ? 10 : 1;
          const current = items.find(i => i.id === selectedId);
          if (current) {
            let updates = {};
            if (e.key === 'ArrowLeft') updates = { x: current.x - nudge };
            if (e.key === 'ArrowRight') updates = { x: current.x + nudge };
            if (e.key === 'ArrowUp') updates = { y: current.y - nudge };
            if (e.key === 'ArrowDown') updates = { y: current.y + nudge };

            if (Object.keys(updates).length > 0) {
              onUpdate(selectedId, updates);
            }
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId, renamingId, items, onDelete, onUpdate]);
};