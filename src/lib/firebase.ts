import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAuth } from "firebase/auth";

const getEnv = (key: string) => {
  // @ts-ignore
  return import.meta.env?.[key] || '';
};

const firebaseConfig = {
  apiKey: getEnv('VITE_API_KEY'),
  authDomain: getEnv('VITE_AUTH_DOMAIN'),
  projectId: getEnv('VITE_PROJECT_ID'),
  storageBucket: getEnv('VITE_STORAGE_BUCKET'),
  messagingSenderId: getEnv('VITE_MESSAGING_SENDER_ID'),
  appId: getEnv('VITE_APP_ID')
};

// Check if configuration is valid
export let isFirebaseInitialized = false;

let app;
let db: any = null;
let storage: any = null;
let auth: any = null;

if (firebaseConfig.apiKey) {
  try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    storage = getStorage(app);
    auth = getAuth(app);
    isFirebaseInitialized = true;
    console.log("Firebase initialized successfully.");
  } catch (e) {
    console.warn("Firebase initialization failed, falling back to local mode:", e);
  }
} else {
  console.log("No Firebase API key found. Running in Local Mode (IndexedDB).");
}

export { db, storage, auth };