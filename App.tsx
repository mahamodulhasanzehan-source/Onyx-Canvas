import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Canvas, CanvasHandle } from './components/Canvas';
import { Toolbar } from './components/Toolbar';
import { EditModal } from './components/EditModal';
import { NavigationControls } from './components/NavigationControls';
import { Sidebar } from './components/Sidebar';
import { ContextMenu } from './components/ContextMenu';
import { CanvasItem, ImageFilters, LoadingCanvasItem, ContextMenuState } from './types';
import { distance } from './utils/geometry';
import { 
  subscribeToCanvasItems, 
  addCanvasItem, 
  updateCanvasItem, 
  deleteCanvasItem 
} from './utils/db';
import { compressImage } from './utils/imageProcessing';
import { Loader2 } from 'lucide-react';

const App: React.FC = () => {
  const [items, setItems] = useState<CanvasItem[]>([]);
  const [loadingItems, setLoadingItems] = useState<LoadingCanvasItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [snapEnabled, setSnapEnabled] = useState(false);
  const [itemToEdit, setItemToEdit] = useState<CanvasItem | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ isOpen: false, x: 0, y: 0, itemId: '' });

  const canvasRef = useRef<CanvasHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Subscribe to Firestore
  useEffect(() => {
    const unsubscribe = subscribeToCanvasItems((newItems) => {
      setItems(newItems);
      setIsInitializing(false);
    });
    return () => unsubscribe();
  }, []);

  const handleDropFiles = useCallback(async (files: File[], x: number, y: number) => {
    let currentX = x;
    let currentY = y;

    // Create temporary loading placeholders
    const newLoadingItems: LoadingCanvasItem[] = files.map((f, index) => ({
        id: `loading-${Date.now()}-${index}`,
        name: f.name,
        x: currentX + (index * 20),
        y: currentY + (index * 20)
    }));
    setLoadingItems(prev => [...prev, ...newLoadingItems]);

    // Process each file
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const placeholder = newLoadingItems[i];
      let fileToProcess: Blob = file;
      let fileName = file.name;

      // Check for HEIC
      const isHeic = file.name.toLowerCase().endsWith('.heic') || file.type === 'image/heic';
      if (isHeic) {
          try {
              // @ts-ignore
              const heic2any = (await import('heic2any')).default;
              const converted = await heic2any({
                  blob: file,
                  toType: 'image/jpeg',
                  quality: 0.8
              });
              fileToProcess = Array.isArray(converted) ? converted[0] : converted;
              fileName = fileName.replace(/\.heic$/i, '.jpg');
          } catch (e) {
              console.error("HEIC conversion failed", e);
              setLoadingItems(prev => prev.filter(p => p.id !== placeholder.id));
              continue; 
          }
      }

      try {
        // Compress and resize client-side to fit in Firestore
        const { base64, width, height } = await compressImage(fileToProcess);

        await addCanvasItem({
          url: base64, 
          x: placeholder.x - width / 2,
          y: placeholder.y - height / 2,
          width,
          height,
          originalWidth: width,
          originalHeight: height,
          rotation: 0,
          name: fileName.split('.')[0] || 'Untitled',
          filters: { brightness: 100, contrast: 100 },
          zIndex: Date.now()
        });

      } catch (e) {
        console.error("FAILED TO ADD IMAGE:", e);
        alert(`Failed to add ${fileName}. It might be corrupted or format unsupported.`);
      } finally {
          // Remove placeholder
          setLoadingItems(prev => prev.filter(p => p.id !== placeholder.id));
      }
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0 && canvasRef.current) {
          const viewport = canvasRef.current.getViewport();
          
          // Calculate world coordinates from the context menu click position
          const screenX = contextMenu.x;
          const screenY = contextMenu.y;
          const worldX = (screenX - viewport.x) / viewport.scale;
          const worldY = (screenY - viewport.y) / viewport.scale;

          handleDropFiles(Array.from(e.target.files), worldX, worldY);
      }
      // Reset input
      if (fileInputRef.current) fileInputRef.current.value = '';
      setContextMenu(prev => ({ ...prev, isOpen: false }));
  };

  const handleAddImageRequest = () => {
      fileInputRef.current?.click();
  };

  // Paste Handling
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
        if (renamingId) return;
        const clipboardItems = e.clipboardData?.items;
        if (!clipboardItems) return;

        const files: File[] = [];
        for (let i = 0; i < clipboardItems.length; i++) {
            if (clipboardItems[i].type.indexOf('image') !== -1) {
                const file = clipboardItems[i].getAsFile();
                if (file) files.push(file);
            }
        }

        if (files.length > 0 && canvasRef.current) {
            const viewport = canvasRef.current.getViewport();
            const cx = window.innerWidth / 2;
            const cy = window.innerHeight / 2;
            const wx = (cx - viewport.x) / viewport.scale;
            const wy = (cy - viewport.y) / viewport.scale;
            await handleDropFiles(files, wx, wy);
        }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [renamingId, handleDropFiles]);

  const handleItemUpdate = async (id: string, updates: Partial<CanvasItem>) => {
      setItems(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i));
      try {
          await updateCanvasItem(id, updates);
      } catch (e) {
          console.error("Failed to update item", e);
      }
  };

  const handleDeleteSelection = async () => {
      const targetId = selectedId || contextMenu.itemId;
      if (!targetId) return;
      
      const item = items.find(i => i.id === targetId);
      if (item) {
          setItems(prev => prev.filter(i => i.id !== targetId));
          setSelectedId(null);
          try {
              await deleteCanvasItem(targetId);
          } catch (e) {
              console.error("Failed to delete", e);
          }
      }
  };

  // Keyboard Shortcuts (Delete, Nudge)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (selectedId && !renamingId) {
          if (e.key === 'Delete' || e.key === 'Backspace') {
              handleDeleteSelection();
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
                      handleItemUpdate(selectedId, updates);
                  }
              }
          }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId, renamingId, items]);

  const handleUpdateItems = (newItems: CanvasItem[]) => {
      setItems(newItems);
  };

  const handleEditSave = async (id: string, newBlob: Blob, newFilters: ImageFilters, newRotation: number) => {
      const item = items.find(i => i.id === id);
      if (!item) return;

      try {
          const { base64, width, height } = await compressImage(newBlob);
          
          await updateCanvasItem(id, {
              url: base64,
              width: width,
              height: height,
              filters: newFilters,
              rotation: 0,
              originalWidth: width,
              originalHeight: height,
          });

      } catch (e) {
          console.error("Failed to save edit", e);
          alert("Failed to save changes.");
      }
  };

  const handleFindClosest = () => {
    if (!canvasRef.current || items.length === 0) return;
    const viewport = canvasRef.current.getViewport();
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

    const itemCenterX = closestItem.x + closestItem.width / 2;
    const itemCenterY = closestItem.y + closestItem.height / 2;
    
    let targetScale = Math.max(viewport.scale, 0.2); 
    if (targetScale > 2) targetScale = 1;
    
    const newX = screenCenterX - itemCenterX * targetScale;
    const newY = screenCenterY - itemCenterY * targetScale;
    
    canvasRef.current.flyTo(newX, newY, targetScale);
  };

  const handleSidebarItemClick = (item: CanvasItem) => {
      if (!canvasRef.current) return;
      const screenCenterX = window.innerWidth / 2;
      const screenCenterY = window.innerHeight / 2;
      const itemCenterX = item.x + item.width / 2;
      const itemCenterY = item.y + item.height / 2;
      
      const targetScale = 0.5; 
      const newX = screenCenterX - itemCenterX * targetScale;
      const newY = screenCenterY - itemCenterY * targetScale;
      
      canvasRef.current.flyTo(newX, newY, targetScale);
      setSidebarOpen(false);
      setSelectedId(item.id);
  };

  const handleContextMenu = (e: React.MouseEvent | { clientX: number, clientY: number }, id: string) => {
    if ('preventDefault' in e) e.preventDefault();
    setContextMenu({
      isOpen: true,
      x: e.clientX,
      y: e.clientY,
      itemId: id
    });
  };

  const handleCanvasContextMenu = (e: React.MouseEvent | { clientX: number, clientY: number }) => {
    if ('preventDefault' in e) e.preventDefault();
    setContextMenu({
        isOpen: true,
        x: e.clientX,
        y: e.clientY,
        itemId: '' // Empty string implies canvas context
    });
  };

  const handleRenameComplete = async (id: string, newName: string) => {
      setRenamingId(null);
      await updateCanvasItem(id, { name: newName });
  };

  const handleZoomIn = () => {
    if (canvasRef.current) {
      const { x, y, scale } = canvasRef.current.getViewport();
      const newScale = Math.min(scale * 1.2, 50);
      canvasRef.current.flyTo(x, y, newScale);
    }
  };

  const handleZoomOut = () => {
    if (canvasRef.current) {
      const { x, y, scale } = canvasRef.current.getViewport();
      const newScale = Math.max(scale / 1.2, 0.05);
      canvasRef.current.flyTo(x, y, newScale);
    }
  };

  const handleDownload = async () => {
      const targetId = selectedId || contextMenu.itemId;
      if (!targetId) return;
      const item = items.find(i => i.id === targetId);
      if (item) {
          try {
              const a = document.createElement('a');
              a.href = item.url;
              a.download = (item.name || 'image') + '.jpg';
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
          } catch (e) {
              console.error("Download failed", e);
              window.open(item.url, '_blank');
          }
      }
      setContextMenu(prev => ({...prev, isOpen: false}));
  };

  if (isInitializing) {
      return (
          <div className="h-screen w-full bg-zinc-950 flex flex-col gap-4 items-center justify-center text-white">
              <div className="relative">
                <Loader2 className="animate-spin text-blue-500" size={48} />
                <div className="absolute inset-0 animate-pulse bg-blue-500/20 blur-xl rounded-full"></div>
              </div>
              <p className="text-zinc-500 text-sm animate-pulse">Initializing Canvas...</p>
          </div>
      )
  }

  return (
    <>
      {/* Hidden file input for "New" option */}
      <input 
        type="file" 
        ref={fileInputRef} 
        className="hidden" 
        accept="image/*" 
        multiple 
        onChange={handleFileSelect}
      />

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
        onItemsChange={handleUpdateItems} 
        onItemUpdate={handleItemUpdate}   
        onDropFiles={handleDropFiles}
        onEditItem={setItemToEdit}
        onContextMenu={handleContextMenu}
        onCanvasContextMenu={handleCanvasContextMenu}
        onRenameComplete={handleRenameComplete}
      />
      
      <Toolbar 
        snapEnabled={snapEnabled}
        onToggleSnap={() => setSnapEnabled(!snapEnabled)}
        hasSelection={!!selectedId}
        onDeleteSelection={handleDeleteSelection}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
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
            itemId={contextMenu.itemId}
            onRename={() => { setRenamingId(contextMenu.itemId); setContextMenu(p => ({...p, isOpen:false})); }}
            onDelete={() => { handleDeleteSelection(); setContextMenu(prev => ({ ...prev, isOpen: false })); }}
            onDownload={handleDownload}
            onAddImage={handleAddImageRequest}
            onClose={() => setContextMenu(prev => ({ ...prev, isOpen: false }))}
        />
      )}
    </>
  );
};

export default App;