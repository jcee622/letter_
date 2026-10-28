import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {
  collection,
  doc,
  getDocs,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc,
  writeBatch
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyC7vpHLps98cKuhHs6HCxX1QW9UalZhWAE',
  authDomain: 'open-when-letters-a64ec.firebaseapp.com',
  projectId: 'open-when-letters-a64ec',
  storageBucket: 'open-when-letters-a64ec.firebasestorage.app',
  messagingSenderId: '413669683098',
  appId: '1:413669683098:web:9947204770a503ee6a9423',
  measurementId: 'G-GBZVM67V2H'
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export {
  GoogleAuthProvider,
  auth,
  collection,
  db,
  doc,
  getDocs,
  onAuthStateChanged,
  onSnapshot,
  serverTimestamp,
  setDoc,
  signInWithPopup,
  signOut,
  writeBatch
};
