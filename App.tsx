import React, { useState, useEffect, useRef } from 'react';
import { Canvas, CanvasHandle } from './components/Canvas';
import { Toolbar } from './components/Toolbar';
import { EditModal } from './components/EditModal';
import { NavigationControls } from './components/NavigationControls';
import { Sidebar } from './components/Sidebar';
import { ContextMenu } from './components/ContextMenu';
import { CanvasItem, ImageFilters, LoadingCanvasItem, ContextMenuState } from './types';
import { getScaledDimensions, distance } from './utils/geometry';
import { saveImageBlob, getImageBlob, deleteImageBlob } from './utils/db';
import { Loader2 } from 'lucide-react';

const App: React.FC = () => {
  const [items, setItems] = useState<CanvasItem[]>([]);
  const [loadingItems, setLoadingItems] = useState<LoadingCanvasItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [snapEnabled, setSnapEnabled] = useState(false);
  const [itemToEdit, setItemToEdit] = useState<CanvasItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ isOpen: false, x: 0, y: 0, itemId: '' });

  const canvasRef = useRef<CanvasHandle>(null);

  // Load items from local storage/IndexedDB on mount
  useEffect(() => {
    const loadItems = async () => {
      try {
        const stored = localStorage.getItem('onyx_items');
        if (stored) {
          const parsedItems: CanvasItem[] = JSON.parse(stored);
          const hydrated = await Promise.all(parsedItems.map(async (item) => {
             if (item.blobId) {
                 const blob = await getImageBlob(item.blobId);
                 if (blob) {
                     return { ...item, url: URL.createObjectURL(blob) };
                 }
             }
             return item; 
          }));
          setItems(hydrated);
        }
      } catch (error) {
        console.error("Failed to load items", error);
      } finally {
        setLoading(false);
      }
    };
    loadItems();
  }, []);

  useEffect(() => {
    if (!loading) {
        const toSave = items.map(({ url, ...rest }) => rest);
        localStorage.setItem('onyx_items', JSON.stringify(toSave));
    }
  }, [items, loading]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedId && !renamingId) {
            handleDeleteSelection();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId, renamingId, items]);

  const handleDropFiles = async (files: File[], x: number, y: number) => {
    let currentX = x;
    let currentY = y;

    // Create placeholders
    const newLoadingItems: LoadingCanvasItem[] = files.map(f => ({
        id: crypto.randomUUID(), // Temp ID
        name: f.name,
        x: currentX,
        y: currentY // We will stagger real placement, but keep loading stack simple
    }));
    setLoadingItems(prev => [...prev, ...newLoadingItems]);

    // Process sequentially to keep order but could be parallel
    // We use a separate index to stagger processing if needed
    let processedCount = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const placeholder = newLoadingItems[i];
      let fileToProcess: Blob = file;
      let fileName = file.name;

      const isHeic = file.name.toLowerCase().endsWith('.heic') || file.type === 'image/heic';
      if (isHeic) {
          try {
              // @ts-ignore
              const heic2any = (await import('heic2any')).default;
              const converted = await heic2any({
                  blob: file,
                  toType: 'image/jpeg',
                  quality: 1.0 // High quality
              });
              fileToProcess = Array.isArray(converted) ? converted[0] : converted;
              fileName = fileName.replace(/\.heic$/i, '.jpg');
          } catch (e) {
              console.error("HEIC conversion failed", e);
              // Remove placeholder if failed
              setLoadingItems(prev => prev.filter(p => p.id !== placeholder.id));
              continue; 
          }
      } else if (!file.type.startsWith('image/')) {
          setLoadingItems(prev => prev.filter(p => p.id !== placeholder.id));
          continue;
      }

      try {
        const blobId = await saveImageBlob(fileToProcess);
        const url = URL.createObjectURL(fileToProcess);
        
        const img = new Image();
        img.src = url;
        await new Promise((resolve) => { img.onload = resolve; });
        
        // Use natural dimensions
        const width = img.naturalWidth;
        const height = img.naturalHeight;

        // Use placeholder position, stagger slightly if multiple
        const finalX = currentX + (processedCount * 50);
        const finalY = currentY + (processedCount * 50);

        const newItem: CanvasItem = {
          id: crypto.randomUUID(),
          blobId,
          url,
          x: finalX - width / 2, // Center on mouse
          y: finalY - height / 2,
          width,
          height,
          originalWidth: img.naturalWidth,
          originalHeight: img.naturalHeight,
          rotation: 0,
          name: fileName.split('.')[0] || 'Untitled',
          filters: { brightness: 100, contrast: 100 },
          zIndex: items.length + 1
        };

        setItems(prev => [...prev, newItem]);
        processedCount++;
      } catch (e) {
        console.error("Failed to add image", e);
      } finally {
          // Remove specific placeholder
          setLoadingItems(prev => prev.filter(p => p.id !== placeholder.id));
      }
    }
  };

  const handleDeleteSelection = async () => {
      const targetId = selectedId || contextMenu.itemId;
      if (!targetId) return;
      
      const item = items.find(i => i.id === targetId);
      if (item && item.blobId) {
          await deleteImageBlob(item.blobId);
      }
      setItems(prev => prev.filter(i => i.id !== targetId));
      setSelectedId(null);
  };

  const handleEditSave = async (id: string, newBlob: Blob, newFilters: ImageFilters, newRotation: number) => {
      const newBlobId = await saveImageBlob(newBlob);
      const newUrl = URL.createObjectURL(newBlob);
      const img = new Image();
      img.src = newUrl;
      await new Promise(r => img.onload = r);

      setItems(prev => prev.map(item => {
          if (item.id === id) {
              if (item.url) URL.revokeObjectURL(item.url);
              // Maintain visual size approx? No, update to new crop size
              return {
                  ...item,
                  blobId: newBlobId,
                  url: newUrl,
                  width: img.naturalWidth,
                  height: img.naturalHeight,
                  filters: newFilters,
                  rotation: 0,
                  originalWidth: img.naturalWidth,
                  originalHeight: img.naturalHeight,
              };
          }
          return item;
      }));
  };

  const handleFindClosest = () => {
    if (!canvasRef.current || items.length === 0) return;
    
    const viewport = canvasRef.current.getViewport();
    // Center of viewport in world coordinates
    // We can't easily calculate exact viewport center in world coords without container dims,
    // but we can approximate using the viewport x/y which are top-left offsets usually?
    // In our Canvas implementation: transform is translate(x, y) scale(s).
    // So top-left of world is (-x/s, -y/s).
    // Center screen is approx (window.innerWidth/2, window.innerHeight/2).
    // World Center = (ScreenCenter - Translate) / Scale.
    
    const screenCenterX = window.innerWidth / 2;
    const screenCenterY = window.innerHeight / 2;
    const worldCenterX = (screenCenterX - viewport.x) / viewport.scale;
    const worldCenterY = (screenCenterY - viewport.y) / viewport.scale;
    
    let closestItem = items[0];
    let minDist = Infinity;
    
    items.forEach(item => {
        const centerX = item.x + item.width / 2;
        const centerY = item.y + item.height / 2;
        const d = distance({x: worldCenterX, y: worldCenterY}, {x: centerX, y: centerY});
        if (d < minDist) {
            minDist = d;
            closestItem = item;
        }
    });

    // Fly to it
    // We want item center to be at screen center
    const itemCenterX = closestItem.x + closestItem.width / 2;
    const itemCenterY = closestItem.y + closestItem.height / 2;
    
    // New Transform:
    // Scale should probably reset or adjust? Let's zoom in to fit item or just comfortable zoom
    // Comfortable zoom: 1.0 or fit screen? Let's go with 0.5 or 1 depending on size.
    // Let's preserve current scale unless it's too far out.
    let targetScale = Math.max(viewport.scale, 0.2); 
    if (targetScale > 2) targetScale = 1;
    
    // x = ScreenCenter - WorldItemCenter * scale
    const newX = screenCenterX - itemCenterX * targetScale;
    const newY = screenCenterY - itemCenterY * targetScale;
    
    canvasRef.current.flyTo(newX, newY, targetScale);
  };

  const handleSidebarItemClick = (item: CanvasItem) => {
      if (!canvasRef.current) return;
      // Center item
      const screenCenterX = window.innerWidth / 2;
      const screenCenterY = window.innerHeight / 2;
      const itemCenterX = item.x + item.width / 2;
      const itemCenterY = item.y + item.height / 2;
      
      const targetScale = 0.5; // Good overview zoom
      const newX = screenCenterX - itemCenterX * targetScale;
      const newY = screenCenterY - itemCenterY * targetScale;
      
      canvasRef.current.flyTo(newX, newY, targetScale);
      setSidebarOpen(false); // Optional: close sidebar on selection
      setSelectedId(item.id);
  };

  const handleContextMenu = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    setContextMenu({
      isOpen: true,
      x: e.clientX,
      y: e.clientY,
      itemId: id
    });
  };

  const handleRenameStart = () => {
    setRenamingId(contextMenu.itemId);
    setContextMenu({ ...contextMenu, isOpen: false });
  };

  const handleRenameComplete = (id: string, newName: string) => {
      setItems(prev => prev.map(i => i.id === id ? { ...i, name: newName } : i));
      setRenamingId(null);
  };

  if (loading) {
      return (
          <div className="h-screen w-full bg-zinc-950 flex items-center justify-center text-white">
              <Loader2 className="animate-spin text-zinc-700" size={32} />
          </div>
      )
  }

  return (
    <>
      <NavigationControls 
          onFindClosest={handleFindClosest} 
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
      />

      <Sidebar 
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          items={items}
          onItemClick={handleSidebarItemClick}
      />

      <Canvas
        ref={canvasRef}
        items={items}
        loadingItems={loadingItems}
        selectedId={selectedId}
        renamingId={renamingId}
        snapEnabled={snapEnabled}
        onSelectionChange={setSelectedId}
        onItemsChange={setItems}
        onDropFiles={handleDropFiles}
        onEditItem={setItemToEdit}
        onContextMenu={handleContextMenu}
        onRenameComplete={handleRenameComplete}
      />
      
      <Toolbar 
        snapEnabled={snapEnabled}
        onToggleSnap={() => setSnapEnabled(!snapEnabled)}
        hasSelection={!!selectedId}
        onDeleteSelection={handleDeleteSelection}
      />

      {itemToEdit && (
        <EditModal 
            item={itemToEdit}
            isOpen={!!itemToEdit}
            onClose={() => setItemToEdit(null)}
            onSave={handleEditSave}
        />
      )}

      {contextMenu.isOpen && (
        <ContextMenu 
            x={contextMenu.x}
            y={contextMenu.y}
            onRename={handleRenameStart}
            onDelete={() => { handleDeleteSelection(); setContextMenu(prev => ({ ...prev, isOpen: false })); }}
            onClose={() => setContextMenu(prev => ({ ...prev, isOpen: false }))}
        />
      )}
    </>
  );
};

export default App;