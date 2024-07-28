import { getApp, getApps, initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyCuXwYJpuVYKXybyJeXd4xr0Bc35NKkFuk",
  authDomain: "chat-with-pdf-d4767.firebaseapp.com",
  projectId: "chat-with-pdf-d4767",
  storageBucket: "chat-with-pdf-d4767.appspot.com",
  messagingSenderId: "460408607869",
  appId: "1:460408607869:web:fb891241d2400ec5724d14",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

const db = getFirestore(app);
const storage = getStorage(app);

export { db, storage };
