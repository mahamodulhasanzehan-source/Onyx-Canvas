import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAuth } from "firebase/auth";

// Direct configuration as requested
const firebaseConfig = {
  apiKey: "AIzaSyBkzJzSzSXvbOaSYs7csHLSp-8EgfEY1QQ",
  authDomain: "tacotyper.firebaseapp.com",
  projectId: "tacotyper",
  storageBucket: "tacotyper.firebasestorage.app",
  messagingSenderId: "781290974991",
  appId: "1:781290974991:web:1d8c5e546ba03a58a5187a",
  measurementId: "G-N38BBSR6J2"
};

export let isFirebaseInitialized = false;

let app;
let db: any = null;
let storage: any = null;
let auth: any = null;

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

export { db, storage, auth };