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

const switchToLocalMode = () => {
    if (!forcedLocalMode) {
        console.warn("Switching to Local Mode due to Firebase connection issues.");
        forcedLocalMode = true;
        // Trigger a refresh of the subscription to switch data sources
        // We can't easily force the React component to re-subscribe from here 
        // without a global event, but new calls will use local.
        // For the subscription, we handle it inside the subscribe function.
    }
};

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
            switchToLocalMode();
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
      switchToLocalMode();
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
  if (!forcedLocalMode && isFirebaseInitialized && storage) {
      try {
          const uniqueId = crypto.randomUUID();
          const storagePath = `images/${uniqueId}_${fileName}`;
          const storageRef = ref(storage, storagePath);
          
          // Add a timeout promise to detect hangs
          const uploadPromise = uploadBytes(storageRef, blob);
          const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Upload timeout")), 15000));
          
          await Promise.race([uploadPromise, timeoutPromise]);
          
          const url = await getDownloadURL(storageRef);
          return { url, storagePath };
      } catch (e) {
          console.error("Firebase Storage upload failed, using local fallback:", e);
          switchToLocalMode();
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
          await addDoc(collection(db, COLLECTION_NAME), {
            ...item,
            createdAt: serverTimestamp()
          });
          return;
      } catch (e) {
          console.error("Firestore write failed, using local fallback:", e);
          switchToLocalMode();
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
          await updateDoc(docRef, updates);
          return;
      } catch (e) {
           console.error("Firestore update failed:", e);
           // If the doc doesn't exist in cloud (maybe it was created locally), this will fail.
           // We should try local update too just in case.
           switchToLocalMode();
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
          switchToLocalMode();
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