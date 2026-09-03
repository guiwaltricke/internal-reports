import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { Report, User } from '../types';

// Initialize Firebase App instance
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Initialize Auth
export const auth = getAuth(app);

// Initialize Firestore with specific database ID if configured
export const db = firebaseConfig.firestoreDatabaseId
  ? initializeFirestore(app, {}, firebaseConfig.firestoreDatabaseId)
  : getFirestore(app);

// Configure Google Auth Provider for Next Fit Google Workspace
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  hd: 'nextfit.com.br',
  prompt: 'select_account',
});

/**
 * Sign in using Google Workspace (@nextfit.com.br)
 */
export async function signInWithGoogleWorkspace(): Promise<{
  firebaseUser: FirebaseUser;
  appUser: User;
  idToken: string;
}> {
  const result = await signInWithPopup(auth, googleProvider);
  const fbUser = result.user;

  const email = fbUser.email?.toLowerCase().trim() || '';

  // Validate corporate domain @nextfit.com.br
  if (!email.endsWith('@nextfit.com.br')) {
    await signOut(auth);
    throw new Error(
      `Acesso restrito. A conta ${email} não pertence à organização @nextfit.com.br.`
    );
  }

  const idToken = await fbUser.getIdToken();

  const appUser: User = {
    id: fbUser.uid,
    email: email,
    name: fbUser.displayName || email.split('@')[0],
    photoURL: fbUser.photoURL || undefined,
    role: email.includes('admin') || email.startsWith('guilherme') ? 'admin' : 'member',
    createdAt: new Date().toISOString(),
    avatarColor: '#4f46e5',
  };

  // Upsert user profile in Firestore
  try {
    const userDocRef = doc(db, 'users', fbUser.uid);
    await setDoc(
      userDocRef,
      {
        id: appUser.id,
        email: appUser.email,
        displayName: appUser.name,
        photoURL: appUser.photoURL || '',
        domain: 'nextfit.com.br',
        role: appUser.role,
        lastLoginAt: Timestamp.now(),
      },
      { merge: true }
    );
  } catch (err) {
    console.warn('Firestore user profile sync error (will continue):', err);
  }

  return { firebaseUser: fbUser, appUser, idToken };
}

/**
 * Logout from Firebase Auth
 */
export async function signOutFromFirebase(): Promise<void> {
  await signOut(auth);
}

/**
 * Listen to Firebase Auth state
 */
export function onFirebaseAuthStateChanged(callback: (user: FirebaseUser | null) => void) {
  return onAuthStateChanged(auth, callback);
}

/**
 * Save report to Firestore database for cloud persistence
 */
export async function saveReportToFirestore(report: Report): Promise<void> {
  try {
    const reportRef = doc(db, 'reports', report.id);
    await setDoc(
      reportRef,
      {
        ...report,
        savedAt: Timestamp.now(),
      },
      { merge: true }
    );
  } catch (err) {
    console.warn('Error persisting report in Firestore:', err);
  }
}

/**
 * Delete report from Firestore
 */
export async function deleteReportFromFirestore(reportId: string): Promise<void> {
  try {
    const reportRef = doc(db, 'reports', reportId);
    await deleteDoc(reportRef);
  } catch (err) {
    console.warn('Error deleting report from Firestore:', err);
  }
}
