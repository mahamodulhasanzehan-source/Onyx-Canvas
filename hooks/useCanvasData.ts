import { useState, useEffect } from 'react';
import { CanvasItem } from '../types';
import { subscribeToCanvasItems, updateCanvasItem, deleteCanvasItem } from '../utils/db';

export const useCanvasData = () => {
  const [items, setItems] = useState<CanvasItem[]>([]);
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    const unsubscribe = subscribeToCanvasItems((newItems) => {
      setItems(newItems);
      setIsInitializing(false);
    });
    return () => unsubscribe();
  }, []);

  const updateItem = async (id: string, updates: Partial<CanvasItem>) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i));
    try {
      await updateCanvasItem(id, updates);
    } catch (e) {
      console.error("Failed to update item", e);
    }
  };

  // Batch update
  const updateItems = async (updates: { id: string, data: Partial<CanvasItem> }[]) => {
      setItems(prev => {
          const map = new Map(updates.map(u => [u.id, u.data]));
          return prev.map(i => {
              const u = map.get(i.id);
              return u ? { ...i, ...u } : i;
          });
      });
      
      try {
          // Fire and forget individually for now, or use batch write if DB supports
          await Promise.all(updates.map(u => updateCanvasItem(u.id, u.data)));
      } catch(e) {
          console.error("Failed batch update", e);
      }
  };

  const deleteItem = async (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
    try {
      await deleteCanvasItem(id);
    } catch (e) {
      console.error("Failed to delete", e);
    }
  };

  return {
    items,
    setItems,
    isInitializing,
    updateItem,
    updateItems,
    deleteItem
  };
};