import { db, waitForAuth } from '../src/lib/firebase';
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
import { CanvasItem } from '../types';

const COLLECTION_NAME = 'canvas_items';

// --- Local Image Database (IndexedDB) ---
const DB_NAME = 'onyx_images_db';
const STORE_NAME = 'images';
// Increment version to ensure store creation runs on old clients
const DB_VERSION = 2; 

let dbPromise: Promise<IDBDatabase> | null = null;

const getImagesDB = (): Promise<IDBDatabase> => {
    if (!dbPromise) {
        dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = (event) => {
                const database = (event.target as IDBOpenDBRequest).result;
                if (!database.objectStoreNames.contains(STORE_NAME)) {
                    database.createObjectStore(STORE_NAME);
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => {
                console.error("IndexedDB Open Failed:", request.error);
                reject(request.error);
            };
        });
    }
    return dbPromise;
};

const saveImageLocally = async (id: string, blob: Blob) => {
    try {
        const database = await getImagesDB();
        return new Promise<void>((resolve, reject) => {
            const tx = database.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const req = store.put(blob, id);
            req.onsuccess = () => resolve();
            req.onerror = () => {
                console.error("IndexedDB Save Failed:", req.error);
                reject(req.error);
            };
        });
    } catch (e) {
        console.error("Failed to access IndexedDB:", e);
        throw e;
    }
};

const getImageLocally = async (id: string): Promise<Blob | null> => {
    try {
        const database = await getImagesDB();
        return new Promise((resolve) => {
            const tx = database.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const req = store.get(id);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => {
                console.warn("IndexedDB Read Failed (missing item?):", req.error);
                resolve(null);
            };
        });
    } catch (e) {
        console.warn("IndexedDB Access Error:", e);
        return null;
    }
};

const deleteImageLocally = async (id: string) => {
    try {
        const database = await getImagesDB();
        const tx = database.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(id);
    } catch (e) {
        console.warn("IndexedDB Delete Error:", e);
    }
};

// --- Firestore & Logic ---

/**
 * Subscribes to canvas items from Firestore.
 * Automatically resolves local image blobs from IndexedDB.
 */
export const subscribeToCanvasItems = (callback: (items: CanvasItem[]) => void) => {
  if (!db) {
    console.error("Database not initialized");
    return () => {};
  }

  const q = query(collection(db, COLLECTION_NAME), orderBy('zIndex', 'asc'));
  
  const unsubscribe = onSnapshot(q, async (snapshot) => {
        const rawItems = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as CanvasItem[];
        
        // Hydrate images from local DB if needed
        const resolvedItems = await Promise.all(rawItems.map(async (item) => {
            // Check if this is a locally stored image
            if (item.storagePath && item.storagePath.startsWith('local:')) {
                // Try to get the blob
                const blob = await getImageLocally(item.storagePath);
                if (blob) {
                    return { ...item, url: URL.createObjectURL(blob) };
                } else {
                    // Image missing (maybe on another device)
                    return { ...item, url: '' }; 
                }
            }
            return item;
        }));

        callback(resolvedItems);
    }, 
    (error) => {
        console.error("Firestore subscription failed:", error);
    }
  );
  
  return unsubscribe;
};

/**
 * Saves image to Local IndexedDB and returns a reference path.
 * Replaces the Cloud Storage upload to bypass CORS errors.
 */
export const uploadImageBlob = async (blob: Blob, fileName: string): Promise<{ url: string, storagePath: string }> => {
  // We no longer wait for Auth here because local DB doesn't need it, 
  // but we still need auth for the subsequent Firestore write.
  
  const uniqueId = crypto.randomUUID();
  const storagePath = `local:${uniqueId}`; // Marker for local storage
  
  await saveImageLocally(storagePath, blob);
  
  const url = URL.createObjectURL(blob);
  return { url, storagePath };
};

/**
 * Adds a new item to Firestore.
 */
export const addCanvasItem = async (item: Omit<CanvasItem, 'id'>) => {
  if (!db) throw new Error("Firestore not initialized");
  await waitForAuth();
  
  await addDoc(collection(db, COLLECTION_NAME), {
    ...item,
    createdAt: serverTimestamp()
  });
};

/**
 * Updates an existing item in Firestore.
 */
export const updateCanvasItem = async (id: string, updates: Partial<CanvasItem>) => {
  if (!db) return; 
  const docRef = doc(db, COLLECTION_NAME, id);
  await updateDoc(docRef, updates);
};

/**
 * Deletes an item from Firestore and Local DB.
 */
export const deleteCanvasItem = async (id: string, storagePath?: string) => {
  if (!db) return;

  await deleteDoc(doc(db, COLLECTION_NAME, id));
  
  if (storagePath && storagePath.startsWith('local:')) {
    deleteImageLocally(storagePath).catch(console.error);
  }
};