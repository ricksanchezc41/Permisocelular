// Única capa que toca el SDK de Firebase (v10, modular, sin build).
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  writeBatch, query, where, serverTimestamp, Timestamp
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import {
  getAuth, setPersistence, browserSessionPersistence, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut, onAuthStateChanged, deleteUser,
  updatePassword, reauthenticateWithCredential, EmailAuthProvider
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { firebaseConfig } from './firebase-config.js';

export const configurado = !/^TU_/.test(firebaseConfig.apiKey || 'TU_');
export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
// La sesión del administrador termina al cerrar la pestaña (equivale a st.session_state).
setPersistence(auth, browserSessionPersistence).catch(() => {});

// Segunda instancia: permite crear cuentas de admin sin cerrar la sesión del superadmin.
let sec;
export function authSecundaria() {
  sec ||= initializeApp(firebaseConfig, 'secundaria');
  return getAuth(sec);
}

export {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, writeBatch, query, where,
  serverTimestamp, Timestamp,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged,
  deleteUser, updatePassword, reauthenticateWithCredential, EmailAuthProvider
};
