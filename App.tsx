import React, { useState, useRef, useEffect } from 'react';
import { Canvas, CanvasHandle } from './components/Canvas';
import { Toolbar } from './components/Toolbar';
import { EditModal } from './components/EditModal';
import { HelpModal } from './components/HelpModal';
import { NavigationControls } from './components/NavigationControls';
import { Sidebar } from './components/Sidebar';
import { ContextMenu } from './components/ContextMenu';
import { CanvasItem, ContextMenuState } from './types';
import { distance } from './utils/geometry';
import { useCanvasData } from './hooks/useCanvasData';
import { useFileProcessor } from './hooks/useFileProcessor';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { Loader2 } from 'lucide-react';

const App: React.FC = () => {
  const { items, setItems, isInitializing, updateItem, deleteItem } = useCanvasData();
  const { loadingItems, handleDropFiles } = useFileProcessor(items);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [snapEnabled] = useState(true);
  const [itemToEdit, setItemToEdit] = useState<CanvasItem | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ isOpen: false, x: 0, y: 0, itemId: '' });

  const canvasRef = useRef<CanvasHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useKeyboardShortcuts({
    selectedId,
    renamingId,
    items,
    onDelete: () => selectedId && handleDeleteSelection(selectedId),
    onUpdate: (id, updates) => updateItem(id, updates)
  });

  const handleDeleteSelection = async (targetId?: string) => {
    const id = targetId || selectedId || contextMenu.itemId;
    if (!id) return;
    await deleteItem(id);
    if (selectedId === id) setSelectedId(null);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0 && canvasRef.current) {
      const viewport = canvasRef.current.getViewport();
      const screenX = contextMenu.x;
      const screenY = contextMenu.y;
      const worldX = (screenX - viewport.x) / viewport.scale;
      const worldY = (screenY - viewport.y) / viewport.scale;
      handleDropFiles(Array.from(e.target.files), worldX, worldY);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
    setContextMenu(prev => ({ ...prev, isOpen: false }));
  };

  const handleAddImageRequest = () => {
    fileInputRef.current?.click();
  };

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

  const handleEditSave = async (id: string, updates: Partial<CanvasItem>) => {
    try {
      await updateItem(id, updates);
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
      const d = distance({ x: worldCenterX, y: worldCenterY }, { x: centerX, y: centerY });
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
      itemId: ''
    });
  };

  const handleRenameComplete = async (id: string, newName: string) => {
    setRenamingId(null);
    await updateItem(id, { name: newName });
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
    setContextMenu(prev => ({ ...prev, isOpen: false }));
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
        onShowHelp={() => setHelpOpen(true)}
      />

      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        items={items}
        onItemClick={handleSidebarItemClick}
      />

      {helpOpen && (
        <HelpModal onClose={() => setHelpOpen(false)} />
      )}

      <Canvas
        ref={canvasRef}
        items={items}
        loadingItems={loadingItems}
        selectedId={selectedId}
        renamingId={renamingId}
        snapEnabled={snapEnabled}
        onSelectionChange={setSelectedId}
        onItemsChange={setItems}
        onItemUpdate={updateItem}
        onDropFiles={handleDropFiles}
        onEditItem={setItemToEdit}
        onContextMenu={handleContextMenu}
        onCanvasContextMenu={handleCanvasContextMenu}
        onRenameComplete={handleRenameComplete}
      />

      <Toolbar
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
          onEdit={() => {
              const item = items.find(i => i.id === contextMenu.itemId);
              if (item) setItemToEdit(item);
              setContextMenu(p => ({ ...p, isOpen: false }));
          }}
          onRename={() => { setRenamingId(contextMenu.itemId); setContextMenu(p => ({ ...p, isOpen: false })); }}
          onDelete={() => { handleDeleteSelection(contextMenu.itemId); setContextMenu(prev => ({ ...prev, isOpen: false })); }}
          onDownload={handleDownload}
          onAddImage={handleAddImageRequest}
          onClose={() => setContextMenu(prev => ({ ...prev, isOpen: false }))}
        />
      )}
    </>
  );
};

export default App;
