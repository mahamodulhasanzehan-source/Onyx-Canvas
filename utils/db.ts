import { db, storage } from '../src/lib/firebase';
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

/**
 * Subscribes to canvas items from Firestore.
 */
export const subscribeToCanvasItems = (callback: (items: CanvasItem[]) => void) => {
  if (!db) {
    console.error("Database not initialized");
    return () => {};
  }

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
    }
  );
  
  return unsubscribe;
};

/**
 * Uploads an image to Firebase Storage.
 * throws error if upload fails or times out.
 */
export const uploadImageBlob = async (blob: Blob, fileName: string): Promise<{ url: string, storagePath: string }> => {
  if (!storage) throw new Error("Firebase Storage not initialized");

  const uniqueId = crypto.randomUUID();
  const storagePath = `images/${uniqueId}_${fileName}`;
  const storageRef = ref(storage, storagePath);
  
  // 10 second timeout for uploads. If CORS blocks it, it often hangs forever without a timeout.
  const timeoutMs = 10000; 

  const uploadTask = uploadBytes(storageRef, blob);
  
  const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error("Upload timed out. Check CORS configuration or Network.")), timeoutMs)
  );
  
  try {
    await Promise.race([uploadTask, timeoutPromise]);
    const url = await getDownloadURL(storageRef);
    return { url, storagePath };
  } catch (error: any) {
    console.error("Upload Error Details:", error);
    if (error.message?.includes('CORS') || error.code === 'storage/unauthorized') {
        console.error("CORS ERROR DETECTED. You must configure CORS for your Firebase Storage bucket.");
    }
    throw error;
  }
};

/**
 * Adds a new item to Firestore.
 */
export const addCanvasItem = async (item: Omit<CanvasItem, 'id'>) => {
  if (!db) throw new Error("Firestore not initialized");
  
  await addDoc(collection(db, COLLECTION_NAME), {
    ...item,
    createdAt: serverTimestamp()
  });
};

/**
 * Updates an existing item in Firestore.
 */
export const updateCanvasItem = async (id: string, updates: Partial<CanvasItem>) => {
  if (!db) return; // Silent fail if offline/init fail, optimistically updated in UI
  const docRef = doc(db, COLLECTION_NAME, id);
  await updateDoc(docRef, updates);
};

/**
 * Deletes an item from Firestore and Storage.
 */
export const deleteCanvasItem = async (id: string, storagePath?: string) => {
  if (!db) return;

  await deleteDoc(doc(db, COLLECTION_NAME, id));
  
  if (storagePath && storage) {
    const storageRef = ref(storage, storagePath);
    // Attempt delete, catch error if missing/perm issue
    deleteObject(storageRef).catch(e => console.warn("Failed to delete cloud image:", e));
  }
};