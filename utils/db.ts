import { isFirebaseInitialized, db, storage } from '../src/lib/firebase';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  orderBy,
  serverTimestamp
} from 'firebase/firestore';
import { 
  ref, 
  uploadBytes, 
  getDownloadURL, 
  deleteObject 
} from 'firebase/storage';
import { CanvasItem } from '../types';

const COLLECTION_NAME = 'canvas_items';
// We track this variable to switch modes for the session
let forcedLocalMode = false;

// --- Local IndexedDB Setup (Fallback) ---
const LOCAL_DB_NAME = 'onyx_canvas_local';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

const getLocalDB = (): Promise<IDBDatabase> => {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(LOCAL_DB_NAME, DB_VERSION);
      request.onupgradeneeded = (e) => {
        const database = (e.target as IDBOpenDBRequest).result;
        if (!database.objectStoreNames.contains('items')) {
          database.createObjectStore('items', { keyPath: 'id' });
        }
        if (!database.objectStoreNames.contains('images')) {
          database.createObjectStore('images', { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return dbPromise;
};

// Helper to broadcast changes for local subscription
const listeners: ((items: CanvasItem[]) => void)[] = [];
const notifyListeners = async () => {
    const database = await getLocalDB();
    const tx = database.transaction('items', 'readonly');
    const store = tx.objectStore('items');
    const request = store.getAll();
    request.onsuccess = async () => {
        let items = request.result as CanvasItem[];
        // Sort by zIndex
        items.sort((a, b) => a.zIndex - b.zIndex);
        
        // Resolve Blob URLs for local images
        const resolvedItems = await Promise.all(items.map(async (item) => {
            if (item.storagePath && item.storagePath.startsWith('local-')) {
                const blob = await getLocalImageBlob(item.storagePath);
                if (blob) {
                    return { ...item, url: URL.createObjectURL(blob) };
                }
            }
            return item;
        }));
        
        listeners.forEach(cb => cb(resolvedItems));
    };
};

const getLocalImageBlob = async (id: string): Promise<Blob | null> => {
    const database = await getLocalDB();
    return new Promise((resolve) => {
        const tx = database.transaction('images', 'readonly');
        const store = tx.objectStore('images');
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result?.blob || null);
        request.onerror = () => resolve(null);
    });
};

// --- Fallback Handlers ---

const switchToLocalMode = (reason?: string) => {
    if (!forcedLocalMode) {
        console.warn(`Switching to Local Mode. Reason: ${reason || 'Connection issue'}`);
        forcedLocalMode = true;
        // Notify any listeners that might care about status (could add an event emitter here later)
    }
};

export const isLocalMode = () => forcedLocalMode;

// --- Exported Functions ---

/**
 * Subscribes to canvas items. 
 * Tries Firestore first. If it fails (permission/network), falls back to Local DB.
 */
export const subscribeToCanvasItems = (callback: (items: CanvasItem[]) => void) => {
  // If we already decided to be local, or firebase is missing
  if (forcedLocalMode || !isFirebaseInitialized || !db) {
      listeners.push(callback);
      notifyListeners();
      return () => {
          const index = listeners.indexOf(callback);
          if (index > -1) listeners.splice(index, 1);
      };
  }

  // Try Cloud
  try {
      const q = query(collection(db, COLLECTION_NAME), orderBy('zIndex', 'asc'));
      const unsubscribe = onSnapshot(q, 
        (snapshot) => {
            const items = snapshot.docs.map(doc => ({
              id: doc.id,
              ...doc.data()
            })) as CanvasItem[];
            callback(items);
        }, 
        (error) => {
            console.error("Firestore subscription failed:", error);
            // If permission denied or other fatal error, switch to local
            switchToLocalMode("Firestore subscription error");
            // Start local subscription immediately
            listeners.push(callback);
            notifyListeners();
        }
      );
      
      return () => {
          unsubscribe();
          const index = listeners.indexOf(callback);
          if (index > -1) listeners.splice(index, 1);
      };

  } catch (e) {
      console.error("Setup subscription error:", e);
      switchToLocalMode("Setup failed");
      listeners.push(callback);
      notifyListeners();
      return () => {};
  }
};

/**
 * Uploads an image. 
 * Tries Firebase Storage. If it fails, falls back to IndexedDB.
 */
export const uploadImageBlob = async (blob: Blob, fileName: string): Promise<{ url: string, storagePath: string }> => {
  // Short timeout for cloud upload to prevent "infinite loading" feel
  // 3 seconds is enough for a handshake. If it takes longer, user experience suffers anyway.
  const CLOUD_TIMEOUT_MS = 3000; 

  if (!forcedLocalMode && isFirebaseInitialized && storage) {
      try {
          const uniqueId = crypto.randomUUID();
          const storagePath = `images/${uniqueId}_${fileName}`;
          const storageRef = ref(storage, storagePath);
          
          const uploadTask = uploadBytes(storageRef, blob);
          const timeoutPromise = new Promise((_, reject) => 
              setTimeout(() => reject(new Error("Cloud Upload Timeout")), CLOUD_TIMEOUT_MS)
          );
          
          await Promise.race([uploadTask, timeoutPromise]);
          const url = await getDownloadURL(storageRef);
          
          return { url, storagePath };
      } catch (e) {
          console.warn("Firebase Storage upload failed/timed out, switching to Local Mode:", e);
          switchToLocalMode("Storage upload failed");
          // Fall through to local logic below
      }
  }

  // Local Mode
  const uniqueId = `local-${crypto.randomUUID()}`;
  const database = await getLocalDB();
  const tx = database.transaction('images', 'readwrite');
  const store = tx.objectStore('images');
  store.put({ id: uniqueId, blob });
  
  const url = URL.createObjectURL(blob);
  return { url, storagePath: uniqueId };
};

/**
 * Adds a new item.
 */
export const addCanvasItem = async (item: Omit<CanvasItem, 'id'>) => {
  if (!forcedLocalMode && isFirebaseInitialized && db) {
      try {
          // Wrap in timeout so we don't hang if Firestore is trying to reconnect forever
          const addPromise = addDoc(collection(db, COLLECTION_NAME), {
            ...item,
            createdAt: serverTimestamp()
          });
          
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error("Firestore Write Timeout")), 3000)
          );

          await Promise.race([addPromise, timeoutPromise]);
          return;
      } catch (e) {
          console.warn("Firestore write failed, switching to Local Mode:", e);
          switchToLocalMode("Write failed");
          // Fall through to local logic below
      }
  }

  const database = await getLocalDB();
  const tx = database.transaction('items', 'readwrite');
  const store = tx.objectStore('items');
  const newItem = { ...item, id: crypto.randomUUID(), createdAt: Date.now() };
  store.add(newItem);
  notifyListeners();
};

/**
 * Updates an existing item.
 */
export const updateCanvasItem = async (id: string, updates: Partial<CanvasItem>) => {
  if (!forcedLocalMode && isFirebaseInitialized && db) {
      try {
          const docRef = doc(db, COLLECTION_NAME, id);
          // We don't await this strictly with a timeout because UI updates optimistically anyway
          updateDoc(docRef, updates).catch(e => {
              console.warn("Firestore background update failed:", e);
              switchToLocalMode("Update failed");
          });
          return;
      } catch (e) {
           console.error("Firestore update failed:", e);
           switchToLocalMode("Update failed");
      }
  }

  const database = await getLocalDB();
  const tx = database.transaction('items', 'readwrite');
  const store = tx.objectStore('items');
  const request = store.get(id);
  request.onsuccess = () => {
      const data = request.result;
      if (data) {
          store.put({ ...data, ...updates });
          notifyListeners();
      }
  };
};

/**
 * Deletes an item and its associated image.
 */
export const deleteCanvasItem = async (id: string, storagePath?: string) => {
  if (!forcedLocalMode && isFirebaseInitialized && db) {
      try {
          await deleteDoc(doc(db, COLLECTION_NAME, id));
          if (storagePath && !storagePath.startsWith('local-')) {
            if (storage) {
                const storageRef = ref(storage, storagePath);
                // Don't await this, let it happen in bg
                deleteObject(storageRef).catch(e => console.warn("Failed to delete cloud image:", e));
            }
          }
          return;
      } catch (e) {
          console.warn("Firestore delete failed:", e);
          switchToLocalMode("Delete failed");
      }
  }

  const database = await getLocalDB();
  // Delete Item
  const txItems = database.transaction('items', 'readwrite');
  txItems.objectStore('items').delete(id);
  
  // Delete Image if local
  if (storagePath && storagePath.startsWith('local-')) {
      const txImages = database.transaction('images', 'readwrite');
      txImages.objectStore('images').delete(storagePath);
  }
  notifyListeners();
};