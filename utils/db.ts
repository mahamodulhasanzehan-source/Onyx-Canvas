import { db, storage, waitForAuth } from '../src/lib/firebase';
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
 * Uploads an image to Firebase Storage with retry logic.
 */
export const uploadImageBlob = async (blob: Blob, fileName: string): Promise<{ url: string, storagePath: string }> => {
  if (!storage) throw new Error("Firebase Storage not initialized");

  // CRITICAL: Wait for authentication before attempting upload
  // This prevents 403 errors that look like CORS errors
  await waitForAuth();

  const uniqueId = crypto.randomUUID();
  const storagePath = `images/${uniqueId}_${fileName}`;
  const storageRef = ref(storage, storagePath);
  
  const MAX_RETRIES = 3;
  let attempt = 0;

  while (attempt < MAX_RETRIES) {
      try {
          // 20 second timeout for uploads
          const timeoutMs = 20000; 
          const uploadTask = uploadBytes(storageRef, blob);
          
          const timeoutPromise = new Promise((_, reject) => 
              setTimeout(() => reject(new Error("Upload timed out")), timeoutMs)
          );
          
          await Promise.race([uploadTask, timeoutPromise]);
          const url = await getDownloadURL(storageRef);
          return { url, storagePath };

      } catch (error: any) {
          attempt++;
          console.warn(`Upload attempt ${attempt} failed:`, error);
          
          if (attempt >= MAX_RETRIES) {
              if (error.message?.includes('CORS') || error.code === 'storage/unauthorized') {
                  console.error("CORS/Auth Error: Ensure your Firebase Storage rules allow reads/writes for authenticated users.");
              }
              throw error;
          }
          // Wait 1s before retry
          await new Promise(r => setTimeout(r, 1000));
      }
  }
  throw new Error("Upload failed after retries");
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
  // We don't strictly await auth for updates to keep UI snappy, 
  // assuming auth is ready if we are seeing items.
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
    deleteObject(storageRef).catch(e => console.warn("Failed to delete cloud image:", e));
  }
};