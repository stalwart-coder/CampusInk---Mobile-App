import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence, getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: "AIzaSyD7VNnzWa7i8KANeuye14joS-QzhCD82z0",
  authDomain: "blog-website-dde49.firebaseapp.com",
  projectId: "blog-website-dde49",
  storageBucket: "blog-website-dde49.firebasestorage.app",
  messagingSenderId: "145682173197",
  appId: "1:145682173197:web:173623920045f85058b444"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

let auth;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage)
  });
} catch (e) {
  auth = getAuth(app);
}

export { auth };
export const db = getFirestore(app);
export const storage = getStorage(app);
export default app;