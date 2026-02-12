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

/**
 * Subscribes to canvas items from Firestore.
 */
export const subscribeToCanvasItems = (callback: (items: CanvasItem[]) => void) => {
  if (!db) {
    console.error("Database not initialized");
    return () => {};
  }

  const q = query(collection(db, COLLECTION_NAME), orderBy('zIndex', 'asc'));
  
  const unsubscribe = onSnapshot(q, (snapshot) => {
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
 * Adds a new item to Firestore.
 */
export const addCanvasItem = async (item: Omit<CanvasItem, 'id'>) => {
  if (!db) throw new Error("Firestore not initialized");
  await waitForAuth();
  
  // Note: item.url is now expected to be a Base64 string
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
 * Deletes an item from Firestore.
 */
export const deleteCanvasItem = async (id: string) => {
  if (!db) return;
  await deleteDoc(doc(db, COLLECTION_NAME, id));
};