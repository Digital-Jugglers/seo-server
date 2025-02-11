import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword, signOut } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDZrkEmKWRaTCT5Ki4w42vf8EeEYMLpBeI",
  authDomain: "dj-seo-dashboard.firebaseapp.com",
  projectId: "dj-seo-dashboard",
  storageBucket: "dj-seo-dashboard.firebasestorage.app",
  messagingSenderId: "38950665976",
  appId: "1:38950665976:web:cd98160132c77fe8e3050d",
  measurementId: "G-R3J68825PJ",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

export { auth, signInWithEmailAndPassword, signOut, db };
