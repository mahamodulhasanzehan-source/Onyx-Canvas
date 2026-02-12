import { initializeApp } from "firebase/app";
import { getFirestore, enableIndexedDbPersistence } from "firebase/firestore";
import { getAuth, signInAnonymously, User } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBkzJzSzSXvbOaSYs7csHLSp-8EgfEY1QQ",
  authDomain: "tacotyper.firebaseapp.com",
  projectId: "tacotyper",
  storageBucket: "tacotyper.firebasestorage.app",
  messagingSenderId: "781290974991",
  appId: "1:781290974991:web:1d8c5e546ba03a58a5187a",
  measurementId: "G-N38BBSR6J2"
};

let app;
let db: any = null;
let auth: any = null;
let authPromise: Promise<User | null> = Promise.resolve(null);

try {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
  
  console.log("Firebase initialized (Firestore & Auth only).");

  // Enable standard Firestore offline persistence
  enableIndexedDbPersistence(db).catch((err) => {
      if (err.code === 'failed-precondition') {
          console.warn('Firebase persistence failed: Multiple tabs open');
      } else if (err.code === 'unimplemented') {
          console.warn('Firebase persistence not supported by browser');
      }
  });
  
  authPromise = new Promise((resolve) => {
      const unsubscribe = auth.onAuthStateChanged((user: User | null) => {
          if (user) {
              console.log("Auth State: Signed in");
              resolve(user);
              unsubscribe();
          } else {
              console.log("Auth State: Signing in...");
              signInAnonymously(auth).catch(e => {
                  console.error("Auto-sign-in failed", e);
                  resolve(null);
              });
          }
      });
  });

} catch (e) {
  console.error("Firebase initialization critical error:", e);
}

export const waitForAuth = async () => {
    if (authPromise) return authPromise;
    return null;
}

export { db, auth };