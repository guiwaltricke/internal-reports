import {
  App,
  AppOptions,
  applicationDefault,
  cert,
  getApp,
  getApps,
  initializeApp,
} from 'firebase-admin/app';
import { Firestore, getFirestore } from 'firebase-admin/firestore';

const APP_NAME = 'next-fit-reports-server';

export interface ServiceAccountCredentials {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

/**
 * Reads the service account from the environment.
 *
 * Two formats are accepted so the same code works locally and on Vercel:
 *  - FIREBASE_SERVICE_ACCOUNT: the whole service-account JSON, raw or base64 encoded.
 *  - FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY: the three
 *    fields separately, which is easier to paste into the Vercel dashboard.
 */
function readServiceAccount(): ServiceAccountCredentials | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();

  if (raw) {
    const json = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    let parsed: Record<string, string>;
    try {
      parsed = JSON.parse(json);
    } catch (err) {
      throw new Error(
        'FIREBASE_SERVICE_ACCOUNT não é um JSON válido (nem raw, nem base64). Detalhe: ' +
          (err as Error).message
      );
    }
    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
      throw new Error(
        'FIREBASE_SERVICE_ACCOUNT precisa conter project_id, client_email e private_key.'
      );
    }
    return {
      projectId: parsed.project_id,
      clientEmail: parsed.client_email,
      privateKey: normalizePrivateKey(parsed.private_key),
    };
  }

  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (projectId && clientEmail && privateKey) {
    return { projectId, clientEmail, privateKey: normalizePrivateKey(privateKey) };
  }

  return null;
}

/**
 * Environment variable UIs (Vercel included) store the PEM with literal "\n"
 * sequences instead of real newlines, and sometimes wrap the whole value in quotes.
 */
function normalizePrivateKey(key: string): string {
  return key.trim().replace(/^["']|["']$/g, '').replace(/\\n/g, '\n');
}

export function getDatabaseId(): string | undefined {
  const id = (
    process.env.FIREBASE_DATABASE_ID ||
    process.env.VITE_FIREBASE_DATABASE_ID ||
    ''
  ).trim();
  return id || undefined;
}

let cachedApp: App | null = null;
let cachedDb: Firestore | null = null;

/**
 * True when the runtime supplies Application Default Credentials on its own:
 * Cloud Run (which is how the AI Studio applet is hosted), App Engine, Cloud
 * Functions, or any machine with GOOGLE_APPLICATION_CREDENTIALS pointing at a key.
 * Vercel provides none of these, which is why the explicit variables matter there.
 */
function hasApplicationDefaultCredentials(): boolean {
  return Boolean(
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      process.env.K_SERVICE || // Cloud Run
      process.env.FUNCTION_TARGET || // Cloud Functions
      process.env.GAE_ENV || // App Engine
      process.env.GOOGLE_CLOUD_PROJECT ||
      process.env.GCLOUD_PROJECT
  );
}

function ambientProjectId(): string | undefined {
  const id = (
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    process.env.FIREBASE_PROJECT_ID ||
    process.env.VITE_FIREBASE_PROJECT_ID ||
    ''
  ).trim();
  return id || undefined;
}

function buildAppOptions(): AppOptions {
  const credentials = readServiceAccount();

  if (credentials) {
    return {
      credential: cert({
        projectId: credentials.projectId,
        clientEmail: credentials.clientEmail,
        privateKey: credentials.privateKey,
      }),
      projectId: credentials.projectId,
    };
  }

  // No explicit key: fall back to the ambient service account. This is what keeps
  // the app running unchanged on Cloud Run / AI Studio, where no FIREBASE_* secret
  // is injected but the runtime identity already has project access.
  if (hasApplicationDefaultCredentials()) {
    return { credential: applicationDefault(), projectId: ambientProjectId() };
  }

  throw new Error(
    'Credenciais do Firebase Admin ausentes. Defina FIREBASE_SERVICE_ACCOUNT ' +
      '(JSON completo ou base64) ou FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY. ' +
      'Em ambientes Google (Cloud Run, AI Studio) as credenciais padrão da aplicação são usadas automaticamente.'
  );
}

function getAdminApp(): App {
  if (cachedApp) return cachedApp;

  const existing = getApps().find((a) => a.name === APP_NAME);
  if (existing) {
    cachedApp = existing;
    return existing;
  }

  cachedApp = initializeApp(buildAppOptions(), APP_NAME);
  return cachedApp;
}

/**
 * Firestore handle for the server. Cached across serverless invocations that
 * reuse the same container, which is why the module-level cache matters here.
 */
export function getDb(): Firestore {
  if (cachedDb) return cachedDb;

  const app = getAdminApp();
  const databaseId = getDatabaseId();
  cachedDb = databaseId ? getFirestore(app, databaseId) : getFirestore(app);

  // Records carry optional fields (password, photoURL, lastViewedAt) that are
  // plain `undefined` when unset; without this Firestore rejects the whole write.
  cachedDb.settings({ ignoreUndefinedProperties: true });

  return cachedDb;
}

export function isFirestoreConfigured(): boolean {
  try {
    return readServiceAccount() !== null || hasApplicationDefaultCredentials();
  } catch {
    return false;
  }
}

export { getApp };
