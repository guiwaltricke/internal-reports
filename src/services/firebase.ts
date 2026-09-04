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
  onSnapshot,
  Timestamp,
} from 'firebase/firestore';
import firebaseConfig from 'virtual:firebase-applet-config';
import { Report, User } from '../types';

// Helper to safely sanitize config strings and strip accidental quotes
function sanitizeConfig(val?: string, fallback?: string): string {
  const value = (val !== undefined && val !== '' ? val : fallback) || '';
  return value.trim().replace(/^["'\\]+|["'\\]+$/g, '').trim();
}

// Resolve configuration from environment variables (e.g. GitHub Secrets/CI/CD) with fallback to json
const activeFirebaseConfig = {
  apiKey: sanitizeConfig(import.meta.env.VITE_FIREBASE_API_KEY, firebaseConfig.apiKey),
  authDomain: sanitizeConfig(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN, firebaseConfig.authDomain),
  projectId: sanitizeConfig(import.meta.env.VITE_FIREBASE_PROJECT_ID, firebaseConfig.projectId),
  storageBucket: sanitizeConfig(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET, firebaseConfig.storageBucket),
  messagingSenderId: sanitizeConfig(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID, firebaseConfig.messagingSenderId),
  appId: sanitizeConfig(import.meta.env.VITE_FIREBASE_APP_ID, firebaseConfig.appId),
  firestoreDatabaseId: sanitizeConfig(import.meta.env.VITE_FIREBASE_DATABASE_ID, firebaseConfig.firestoreDatabaseId),
};

// Initialize Firebase App instance
const app = !getApps().length ? initializeApp(activeFirebaseConfig) : getApp();

// Initialize Auth
export const auth = getAuth(app);

// Initialize Firestore with specific database ID if configured
export const db = activeFirebaseConfig.firestoreDatabaseId
  ? initializeFirestore(app, {}, activeFirebaseConfig.firestoreDatabaseId)
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
 * Save report to Firestore database for eternal cloud persistence
 */
export async function saveReportToFirestore(report: Report, htmlContent?: string): Promise<void> {
  try {
    const currentUid = auth.currentUser?.uid || report.ownerId;
    const currentEmail = auth.currentUser?.email?.toLowerCase() || report.ownerEmail?.toLowerCase() || '';
    const currentName = auth.currentUser?.displayName || report.ownerName || 'Colaborador Next Fit';

    const reportRef = doc(db, 'reports', report.id);
    const content = htmlContent || report.htmlContent || '';

    const payload = {
      ...report,
      ownerId: currentUid,
      authorId: currentUid, // compatibility
      ownerEmail: currentEmail,
      authorEmail: currentEmail,
      ownerName: currentName,
      authorName: currentName,
      htmlContent: content,
      fileSize: report.fileSize || content.length,
      savedAt: Timestamp.now(),
      updatedAt: new Date().toISOString(),
    };

    await setDoc(reportRef, payload, { merge: true });
    console.log(`[Firestore] Relatório ${report.id} persistido com sucesso na nuvem.`);
  } catch (err) {
    console.error('[Firestore] Erro ao persistir relatório no Firestore:', err);
    throw err;
  }
}

/**
 * Fetch all reports from Firestore database
 */
export async function getReportsFromFirestore(): Promise<Report[]> {
  try {
    const q = query(collection(db, 'reports'), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    const reports: Report[] = [];
    const currentUid = auth.currentUser?.uid;
    const currentEmail = auth.currentUser?.email?.toLowerCase();

    snapshot.forEach((d) => {
      const data = d.data();
      const docOwnerId = data.ownerId || data.authorId || '';
      const docOwnerEmail = (data.ownerEmail || data.authorEmail || '').toLowerCase();

      reports.push({
        id: d.id,
        slug: data.slug || d.id,
        title: data.title || 'Relatório Sem Título',
        description: data.description || '',
        ownerId: docOwnerId,
        ownerEmail: docOwnerEmail,
        ownerName: data.ownerName || data.authorName || 'Colaborador Next Fit',
        isOwner: Boolean(
          (currentUid && docOwnerId === currentUid) ||
          (currentEmail && docOwnerEmail === currentEmail)
        ),
        fileSize: data.fileSize || (data.htmlContent ? data.htmlContent.length : 0),
        createdAt: data.createdAt || new Date().toISOString(),
        updatedAt: data.updatedAt || data.createdAt || new Date().toISOString(),
        viewsCount: data.viewsCount || 0,
        lastViewedAt: data.lastViewedAt,
        security: data.security || {
          accessType: 'authenticated_only',
          allowedEmails: [],
          expiresAt: null,
          active: true,
          showWatermark: true,
          allowDownload: true,
          allowPrint: true,
        },
        tags: data.tags || [],
        htmlContent: data.htmlContent || '',
      });
    });

    return reports;
  } catch (err) {
    console.error('[Firestore] Erro ao carregar relatórios do Firestore:', err);
    return [];
  }
}

/**
 * Real-time listener for Firestore reports
 */
export function subscribeReportsFromFirestore(callback: (reports: Report[]) => void): () => void {
  try {
    const q = query(collection(db, 'reports'), orderBy('createdAt', 'desc'));
    return onSnapshot(
      q,
      (snapshot) => {
        const reports: Report[] = [];
        const currentUid = auth.currentUser?.uid;
        const currentEmail = auth.currentUser?.email?.toLowerCase();

        snapshot.forEach((d) => {
          const data = d.data();
          const docOwnerId = data.ownerId || data.authorId || '';
          const docOwnerEmail = (data.ownerEmail || data.authorEmail || '').toLowerCase();

          reports.push({
            id: d.id,
            slug: data.slug || d.id,
            title: data.title || 'Relatório Sem Título',
            description: data.description || '',
            ownerId: docOwnerId,
            ownerEmail: docOwnerEmail,
            ownerName: data.ownerName || data.authorName || 'Colaborador Next Fit',
            isOwner: Boolean(
              (currentUid && docOwnerId === currentUid) ||
              (currentEmail && docOwnerEmail === currentEmail)
            ),
            fileSize: data.fileSize || (data.htmlContent ? data.htmlContent.length : 0),
            createdAt: data.createdAt || new Date().toISOString(),
            updatedAt: data.updatedAt || data.createdAt || new Date().toISOString(),
            viewsCount: data.viewsCount || 0,
            lastViewedAt: data.lastViewedAt,
            security: data.security || {
              accessType: 'authenticated_only',
              allowedEmails: [],
              expiresAt: null,
              active: true,
              showWatermark: true,
              allowDownload: true,
              allowPrint: true,
            },
            tags: data.tags || [],
            htmlContent: data.htmlContent || '',
          });
        });

        callback(reports);
      },
      (error) => {
        console.error('[Firestore] Erro no snapshot do Firestore:', error);
      }
    );
  } catch (err) {
    console.error('[Firestore] Erro ao iniciar escuta do Firestore:', err);
    return () => {};
  }
}

/**
 * Delete report from Firestore
 */
export async function deleteReportFromFirestore(reportId: string): Promise<void> {
  try {
    const reportRef = doc(db, 'reports', reportId);
    await deleteDoc(reportRef);
    console.log(`[Firestore] Relatório ${reportId} excluído do Firestore.`);
  } catch (err) {
    console.error('[Firestore] Erro ao excluir relatório do Firestore:', err);
    throw err;
  }
}
