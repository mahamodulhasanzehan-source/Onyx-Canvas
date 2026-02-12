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

// --- Exported Functions ---

/**
 * Subscribes to canvas items. Uses Firestore if initialized, else IndexedDB.
 */
export const subscribeToCanvasItems = (callback: (items: CanvasItem[]) => void) => {
  if (isFirebaseInitialized && db) {
      const q = query(collection(db, COLLECTION_NAME), orderBy('zIndex', 'asc'));
      return onSnapshot(q, (snapshot) => {
        const items = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as CanvasItem[];
        callback(items);
      }, (error) => {
        console.error("Firestore subscription error:", error);
      });
  } else {
      // Local Mode
      listeners.push(callback);
      notifyListeners(); // Initial load
      return () => {
          const index = listeners.indexOf(callback);
          if (index > -1) listeners.splice(index, 1);
      };
  }
};

/**
 * Uploads an image. Uses Firebase Storage if initialized, else IndexedDB.
 */
export const uploadImageBlob = async (blob: Blob, fileName: string): Promise<{ url: string, storagePath: string }> => {
  if (isFirebaseInitialized && storage) {
      const uniqueId = crypto.randomUUID();
      const storagePath = `images/${uniqueId}_${fileName}`;
      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, blob);
      const url = await getDownloadURL(storageRef);
      return { url, storagePath };
  } else {
      // Local Mode
      const uniqueId = `local-${crypto.randomUUID()}`;
      const database = await getLocalDB();
      const tx = database.transaction('images', 'readwrite');
      const store = tx.objectStore('images');
      store.put({ id: uniqueId, blob });
      
      const url = URL.createObjectURL(blob);
      return { url, storagePath: uniqueId };
  }
};

/**
 * Adds a new item.
 */
export const addCanvasItem = async (item: Omit<CanvasItem, 'id'>) => {
  if (isFirebaseInitialized && db) {
      await addDoc(collection(db, COLLECTION_NAME), {
        ...item,
        createdAt: serverTimestamp()
      });
  } else {
      const database = await getLocalDB();
      const tx = database.transaction('items', 'readwrite');
      const store = tx.objectStore('items');
      const newItem = { ...item, id: crypto.randomUUID(), createdAt: Date.now() };
      store.add(newItem);
      notifyListeners();
  }
};

/**
 * Updates an existing item.
 */
export const updateCanvasItem = async (id: string, updates: Partial<CanvasItem>) => {
  if (isFirebaseInitialized && db) {
      const docRef = doc(db, COLLECTION_NAME, id);
      await updateDoc(docRef, updates);
  } else {
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
  }
};

/**
 * Deletes an item and its associated image.
 */
export const deleteCanvasItem = async (id: string, storagePath?: string) => {
  if (isFirebaseInitialized && db && storage) {
      await deleteDoc(doc(db, COLLECTION_NAME, id));
      if (storagePath && !storagePath.startsWith('local-')) {
        const storageRef = ref(storage, storagePath);
        try { await deleteObject(storageRef); } catch (e) { console.warn("Failed to delete image file:", e); }
      }
  } else {
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
  }
};