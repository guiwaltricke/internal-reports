import crypto from 'crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getDb } from './firestore';

// =================== TYPES ===================

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  salt: string;
  photoURL?: string;
  role?: string;
  createdAt: string;
  avatarColor: string;
}

export interface ReportSecurity {
  accessType: 'authenticated_only' | 'email_whitelist' | 'password_protected' | 'public_link';
  password?: string;
  allowedEmails: string[];
  expiresAt: string | null;
  active: boolean;
  showWatermark: boolean;
  allowDownload: boolean;
  allowPrint: boolean;
}

export interface ReportRecord {
  id: string;
  slug: string;
  title: string;
  description: string;
  ownerId: string;
  ownerEmail: string;
  ownerName: string;
  fileSize: number;
  createdAt: string;
  updatedAt: string;
  viewsCount: number;
  lastViewedAt?: string;
  security: ReportSecurity;
  tags: string[];
  htmlContent?: string;
}

export interface SessionRecord {
  userId: string;
  email: string;
  expiresAt: number;
}

// =================== COLLECTIONS ===================

// `reports` is shared with the browser client (see src/services/firebase.ts) so
// both writers see the same documents. The other two collections are server-only
// and are intentionally absent from firestore.rules, which denies all client
// access to them — the Admin SDK bypasses rules.
const REPORTS = 'reports';
const USERS = 'serverUsers';
const SESSIONS = 'serverSessions';
const CONTENTS = 'reportContents';
const CHUNKS = 'chunks';

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// A Firestore document is capped at 1 MiB. Reports below the inline threshold are
// stored on the report document itself so the browser client keeps reading them
// exactly as it does today; anything larger goes to chunked content documents.
const INLINE_HTML_MAX_BYTES = 700_000;
const CHUNK_MAX_BYTES = 900_000;
const BATCH_MAX_BYTES = 7_000_000; // Firestore commits are capped around 10 MiB.

// =================== HELPERS ===================

export function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 32).toString('hex');
}

/** Accepts ISO strings, Firestore Timestamps and Dates — the client writes all three. */
function toIso(value: unknown, fallback: string): string {
  if (!value) return fallback;
  if (typeof value === 'string') return value;
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && typeof (value as Timestamp).toDate === 'function') {
    return (value as Timestamp).toDate().toISOString();
  }
  return fallback;
}

export function defaultSecurity(): ReportSecurity {
  return {
    accessType: 'authenticated_only',
    allowedEmails: [],
    expiresAt: null,
    active: true,
    showWatermark: true,
    allowDownload: true,
    allowPrint: true,
  };
}

function mapReport(id: string, data: FirebaseFirestore.DocumentData): ReportRecord {
  const now = new Date().toISOString();
  const createdAt = toIso(data.createdAt, now);
  return {
    id,
    slug: data.slug || id,
    title: data.title || 'Relatório Sem Título',
    description: data.description || '',
    ownerId: data.ownerId || data.authorId || '',
    ownerEmail: (data.ownerEmail || data.authorEmail || '').toLowerCase(),
    ownerName: data.ownerName || data.authorName || 'Colaborador Next Fit',
    fileSize: data.fileSize || (data.htmlContent ? data.htmlContent.length : 0),
    createdAt,
    updatedAt: toIso(data.updatedAt, createdAt),
    viewsCount: data.viewsCount || 0,
    lastViewedAt: data.lastViewedAt ? toIso(data.lastViewedAt, now) : undefined,
    security: { ...defaultSecurity(), ...(data.security || {}) },
    tags: Array.isArray(data.tags) ? data.tags : [],
    htmlContent: typeof data.htmlContent === 'string' ? data.htmlContent : undefined,
  };
}

function mapUser(data: FirebaseFirestore.DocumentData): UserRecord {
  return {
    id: data.id,
    email: data.email,
    name: data.name,
    passwordHash: data.passwordHash,
    salt: data.salt,
    photoURL: data.photoURL || undefined,
    role: data.role || undefined,
    createdAt: toIso(data.createdAt, new Date().toISOString()),
    avatarColor: data.avatarColor || '#4f46e5',
  };
}

/**
 * Splits a string into pieces of at most `maxBytes` UTF-8 bytes, never cutting a
 * multi-byte sequence in half.
 */
export function splitByBytes(input: string, maxBytes: number): string[] {
  const buffer = Buffer.from(input, 'utf8');
  if (buffer.byteLength <= maxBytes) return [input];

  const parts: string[] = [];
  let start = 0;
  while (start < buffer.byteLength) {
    let end = Math.min(start + maxBytes, buffer.byteLength);
    // Walk back to the start of the UTF-8 sequence if we landed on a continuation byte.
    while (end > start && end < buffer.byteLength && (buffer[end] & 0xc0) === 0x80) {
      end--;
    }
    parts.push(buffer.subarray(start, end).toString('utf8'));
    start = end;
  }
  return parts;
}

// =================== USERS ===================

export async function findUserById(id: string): Promise<UserRecord | null> {
  const snap = await getDb().collection(USERS).doc(id).get();
  return snap.exists ? mapUser(snap.data()!) : null;
}

export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  const normalized = email.toLowerCase().trim();
  const snap = await getDb().collection(USERS).where('email', '==', normalized).limit(1).get();
  return snap.empty ? null : mapUser(snap.docs[0].data());
}

export async function saveUser(user: UserRecord): Promise<void> {
  await getDb().collection(USERS).doc(user.id).set(user, { merge: true });
}

/**
 * The upload endpoint falls back to "some existing account" for guest uploads.
 * Ordering by createdAt keeps that deterministic instead of depending on scan order.
 */
export async function findFallbackUser(): Promise<UserRecord | null> {
  const snap = await getDb().collection(USERS).orderBy('createdAt', 'asc').limit(1).get();
  return snap.empty ? null : mapUser(snap.docs[0].data());
}

export const DEFAULT_USER_EMAIL = 'guilherme@nextfit.com.br';

/**
 * Seeds the original demo account. It has a well-known password, so it is only
 * created when explicitly asked for — see SEED_DEFAULT_USER in .env.example.
 */
export async function ensureDefaultUser(): Promise<void> {
  const existing = await findUserByEmail(DEFAULT_USER_EMAIL);
  if (existing) return;

  const salt = crypto.randomBytes(16).toString('hex');
  const password = process.env.SEED_DEFAULT_USER_PASSWORD || 'password123';
  await saveUser({
    id: 'usr-default-guilherme',
    email: DEFAULT_USER_EMAIL,
    name: 'Guilherme',
    passwordHash: hashPassword(password, salt),
    salt,
    role: 'admin',
    createdAt: new Date().toISOString(),
    avatarColor: '#4f46e5',
  });
  console.log(`[store] Usuário padrão ${DEFAULT_USER_EMAIL} criado no Firestore.`);
}

// =================== SESSIONS ===================

export async function createSession(user: UserRecord): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  const session: SessionRecord = {
    userId: user.id,
    email: user.email,
    expiresAt: Date.now() + SESSION_TTL_MS,
  };
  await getDb().collection(SESSIONS).doc(token).set(session);
  return token;
}

export async function getSession(token: string): Promise<SessionRecord | null> {
  const snap = await getDb().collection(SESSIONS).doc(token).get();
  return snap.exists ? (snap.data() as SessionRecord) : null;
}

export async function deleteSession(token: string): Promise<void> {
  await getDb().collection(SESSIONS).doc(token).delete();
}

// =================== REPORT CONTENT ===================

export async function setReportContent(reportId: string, html: string): Promise<void> {
  const db = getDb();
  const contentRef = db.collection(CONTENTS).doc(reportId);
  const chunksRef = contentRef.collection(CHUNKS);

  const chunks = splitByBytes(html, CHUNK_MAX_BYTES);
  const stale = await chunksRef.listDocuments();

  // Commit in size-bounded groups: a single Firestore batch is capped around 10 MiB.
  let batch = db.batch();
  let pendingBytes = 0;
  let pendingOps = 0;

  const flush = async () => {
    if (pendingOps === 0) return;
    await batch.commit();
    batch = db.batch();
    pendingBytes = 0;
    pendingOps = 0;
  };

  for (const doc of stale) {
    batch.delete(doc);
    pendingOps++;
    if (pendingOps >= 400) await flush();
  }
  await flush();

  for (let i = 0; i < chunks.length; i++) {
    const data = chunks[i];
    const bytes = Buffer.byteLength(data, 'utf8');
    if (pendingOps > 0 && pendingBytes + bytes > BATCH_MAX_BYTES) await flush();
    batch.set(chunksRef.doc(String(i).padStart(4, '0')), { data });
    pendingBytes += bytes;
    pendingOps++;
  }

  batch.set(contentRef, {
    chunkCount: chunks.length,
    size: Buffer.byteLength(html, 'utf8'),
    updatedAt: new Date().toISOString(),
  });
  pendingOps++;
  await flush();
}

export async function getReportContent(reportId: string): Promise<string | null> {
  const db = getDb();
  const contentRef = db.collection(CONTENTS).doc(reportId);
  const meta = await contentRef.get();
  if (!meta.exists) return null;

  const snap = await contentRef.collection(CHUNKS).orderBy('__name__').get();
  if (snap.empty) return null;

  return snap.docs.map((d) => (d.data().data as string) || '').join('');
}

export async function deleteReportContent(reportId: string): Promise<void> {
  const db = getDb();
  const contentRef = db.collection(CONTENTS).doc(reportId);
  const chunks = await contentRef.collection(CHUNKS).listDocuments();

  let batch = db.batch();
  let ops = 0;
  for (const doc of chunks) {
    batch.delete(doc);
    if (++ops >= 400) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }
  batch.delete(contentRef);
  await batch.commit();
}

/**
 * Full HTML for a report: chunked content store first, then the inline copy the
 * browser client writes when it saves a report straight to Firestore.
 */
export async function resolveReportHtml(report: ReportRecord): Promise<string | null> {
  const stored = await getReportContent(report.id);
  if (stored !== null) return stored;
  return report.htmlContent ?? null;
}

// =================== REPORTS ===================

export async function getReportByIdOrSlug(idOrSlug: string): Promise<ReportRecord | null> {
  const db = getDb();

  const byId = await db.collection(REPORTS).doc(idOrSlug).get();
  if (byId.exists) return mapReport(byId.id, byId.data()!);

  const bySlug = await db.collection(REPORTS).where('slug', '==', idOrSlug).limit(1).get();
  if (!bySlug.empty) return mapReport(bySlug.docs[0].id, bySlug.docs[0].data());

  return null;
}

/**
 * Every report, newest first, without the inline HTML payload. `select()` keeps
 * the listing cheap: report bodies can be hundreds of kilobytes each.
 */
export async function listReportsMetadata(): Promise<ReportRecord[]> {
  const snap = await getDb()
    .collection(REPORTS)
    .select(
      'slug',
      'title',
      'description',
      'ownerId',
      'ownerEmail',
      'ownerName',
      'authorId',
      'authorEmail',
      'authorName',
      'fileSize',
      'createdAt',
      'updatedAt',
      'viewsCount',
      'lastViewedAt',
      'security',
      'tags'
    )
    .get();

  return snap.docs
    .map((d) => mapReport(d.id, d.data()))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function slugExists(slug: string): Promise<boolean> {
  const snap = await getDb().collection(REPORTS).where('slug', '==', slug).limit(1).get();
  return !snap.empty;
}

/**
 * Persists a report. Small bodies are mirrored inline on the report document so
 * the browser client sees them; large ones live only in the chunked store and the
 * inline field is cleared to stay under the 1 MiB document limit.
 */
export async function saveReport(report: ReportRecord, htmlContent?: string): Promise<void> {
  const db = getDb();
  const { htmlContent: _ignored, ...metadata } = report;

  if (htmlContent !== undefined) {
    await setReportContent(report.id, htmlContent);
    const bytes = Buffer.byteLength(htmlContent, 'utf8');
    const inline = bytes <= INLINE_HTML_MAX_BYTES;
    await db
      .collection(REPORTS)
      .doc(report.id)
      .set(
        {
          ...metadata,
          fileSize: bytes,
          htmlContent: inline ? htmlContent : '',
          htmlContentOffloaded: !inline,
        },
        { merge: true }
      );
    return;
  }

  await db.collection(REPORTS).doc(report.id).set(metadata, { merge: true });
}

export async function updateReportFields(
  reportId: string,
  fields: Record<string, unknown>
): Promise<void> {
  await getDb().collection(REPORTS).doc(reportId).set(fields, { merge: true });
}

export async function deleteReport(reportId: string): Promise<void> {
  await deleteReportContent(reportId);
  await getDb().collection(REPORTS).doc(reportId).delete();
}

/** Atomic view counter bump — several viewers can hit the same report at once. */
export async function recordReportView(reportId: string): Promise<void> {
  await getDb()
    .collection(REPORTS)
    .doc(reportId)
    .set(
      {
        viewsCount: FieldValue.increment(1),
        lastViewedAt: new Date().toISOString(),
      },
      { merge: true }
    );
}
