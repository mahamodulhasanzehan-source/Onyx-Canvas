import React, { useState, useRef, useEffect } from 'react';
import { Canvas, CanvasHandle } from './components/Canvas';
import { Toolbar } from './components/Toolbar';
import { EditModal } from './components/EditModal';
import { HelpModal } from './components/HelpModal';
import { NavigationControls } from './components/NavigationControls';
import { Sidebar } from './components/Sidebar';
import { ContextMenu } from './components/ContextMenu';
import { GroupControls } from './components/GroupControls';
import { CanvasItem, ContextMenuState } from './types';
import { distance } from './utils/geometry';
import { useCanvasData } from './hooks/useCanvasData';
import { useFileProcessor } from './hooks/useFileProcessor';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { Loader2 } from 'lucide-react';

const App: React.FC = () => {
  const { items, setItems, isInitializing, updateItem, updateItems, deleteItem } = useCanvasData();
  const { loadingItems, handleDropFiles } = useFileProcessor(items);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [snapEnabled] = useState(true);
  const [itemToEdit, setItemToEdit] = useState<CanvasItem | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ isOpen: false, x: 0, y: 0, itemId: '' });

  const canvasRef = useRef<CanvasHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcut handler updated for multiple selection?
  // We'll keep basic nudge for single selection for now or update it.
  useKeyboardShortcuts({
    selectedId: selectedIds.length === 1 ? selectedIds[0] : null,
    renamingId,
    items,
    onDelete: () => handleDeleteSelection(),
    onUpdate: (id, updates) => updateItem(id, updates)
  });

  const handleDeleteSelection = async (targetId?: string) => {
    let idsToDelete = selectedIds;
    
    // Check if a specific target was requested (e.g. from context menu)
    if (targetId) {
        // If the target is NOT currently selected, we only delete that one target
        if (!selectedIds.includes(targetId)) {
            idsToDelete = [targetId];
        }
        // Otherwise (if target IS selected), we delete the entire selection (default behavior)
    } else {
        // No specific target (e.g. Delete key)
        if (idsToDelete.length === 0 && contextMenu.itemId) {
             // Fallback to context menu item if no selection exists
             idsToDelete = [contextMenu.itemId];
        }
    }
    
    if (idsToDelete.length === 0) return;

    // Optimistic Update
    setItems(prev => prev.filter(i => !idsToDelete.includes(i.id)));
    setSelectedIds([]);

    for (const id of idsToDelete) {
        if(id) await deleteItem(id);
    }
  };

  const handleGroupDrag = (dx: number, dy: number) => {
      // Update ALL selected items positions locally
      setItems(prev => prev.map(item => {
          if (selectedIds.includes(item.id)) {
              return { ...item, x: item.x + dx, y: item.y + dy };
          }
          return item;
      }));
  };

  const handleGroupDragEnd = async () => {
      // Grab current positions of all selected items and save them to DB
      // We use the 'items' from current render scope which should be up-to-date from handleGroupDrag state updates
      const updates = items
        .filter(i => selectedIds.includes(i.id))
        .map(i => ({
            id: i.id,
            data: { x: i.x, y: i.y }
        }));
      
      if (updates.length > 0) {
          await updateItems(updates);
      }
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
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const wx = (cx - viewport.x) / viewport.scale;
    const wy = (cy - viewport.y) / viewport.scale;

    let closestItem = items[0];
    let minDist = Infinity;

    items.forEach(item => {
      const icx = item.x + item.width / 2;
      const icy = item.y + item.height / 2;
      const d = distance({ x: wx, y: wy }, { x: icx, y: icy });
      if (d < minDist) {
        minDist = d;
        closestItem = item;
      }
    });

    const itemCenterX = closestItem.x + closestItem.width / 2;
    const itemCenterY = closestItem.y + closestItem.height / 2;
    let targetScale = Math.max(viewport.scale, 0.2);
    if (targetScale > 2) targetScale = 1;
    const newX = cx - itemCenterX * targetScale;
    const newY = cy - itemCenterY * targetScale;
    canvasRef.current.flyTo(newX, newY, targetScale);
  };

  const handleNavigateToOrigin = () => {
    if (canvasRef.current) {
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      canvasRef.current.flyTo(cx, cy, 1);
    }
  };

  const handleSidebarItemClick = (item: CanvasItem) => {
    if (!canvasRef.current) return;
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const ix = item.x + item.width / 2;
    const iy = item.y + item.height / 2;
    const targetScale = 0.5;
    const newX = cx - ix * targetScale;
    const newY = cy - iy * targetScale;
    canvasRef.current.flyTo(newX, newY, targetScale);
    setSidebarOpen(false);
    setSelectedIds([item.id]);
  };

  const handleContextMenu = (e: React.MouseEvent | { clientX: number, clientY: number }, id: string) => {
    if ('preventDefault' in e) e.preventDefault();
    setContextMenu({ isOpen: true, x: e.clientX, y: e.clientY, itemId: id });
    if (!selectedIds.includes(id)) {
        setSelectedIds([id]);
    }
  };

  const handleCanvasContextMenu = (e: React.MouseEvent | { clientX: number, clientY: number }) => {
    if ('preventDefault' in e) e.preventDefault();
    setContextMenu({ isOpen: true, x: e.clientX, y: e.clientY, itemId: '' });
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
    const targetId = contextMenu.itemId || selectedIds[0];
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
      <input type="file" ref={fileInputRef} className="hidden" accept="image/*" multiple onChange={handleFileSelect} />

      <NavigationControls
        onFindClosest={handleFindClosest}
        onNavigateToOrigin={handleNavigateToOrigin}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        onShowHelp={() => setHelpOpen(true)}
      />

      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        items={items}
        onItemClick={handleSidebarItemClick}
      />

      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}

      <Canvas
        ref={canvasRef}
        items={items}
        loadingItems={loadingItems}
        selectedIds={selectedIds}
        renamingId={renamingId}
        snapEnabled={snapEnabled}
        onSelectionChange={setSelectedIds}
        onItemsChange={setItems}
        onItemUpdate={updateItem}
        onDropFiles={handleDropFiles}
        onEditItem={setItemToEdit}
        onContextMenu={handleContextMenu}
        onCanvasContextMenu={handleCanvasContextMenu}
        onRenameComplete={handleRenameComplete}
        onGroupDrag={handleGroupDrag}
        onGroupDragEnd={handleGroupDragEnd}
      />

      <Toolbar onZoomIn={handleZoomIn} onZoomOut={handleZoomOut} />
      
      <GroupControls 
          selectedIds={selectedIds}
          items={items}
          onUpdateItems={updateItems}
          onDeselectAll={() => setSelectedIds([])}
          onDeleteSelected={() => handleDeleteSelection()}
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