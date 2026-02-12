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
    deleteItem
  };
};