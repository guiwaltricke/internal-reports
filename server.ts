import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';

const app = express();
const PORT = 3000;

// Body parsing with 50MB limit for large AI HTML reports
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Directories
const DATA_DIR = path.join(process.cwd(), 'data');
const REPORTS_DIR = path.join(DATA_DIR, 'reports');
const DB_FILE = path.join(DATA_DIR, 'db.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });

// Simple In-memory / File DB structure
interface UserRecord {
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

interface ReportRecord {
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
  security: {
    accessType: 'authenticated_only' | 'email_whitelist' | 'password_protected' | 'public_link';
    password?: string;
    allowedEmails: string[];
    expiresAt: string | null;
    active: boolean;
    showWatermark: boolean;
    allowDownload: boolean;
    allowPrint: boolean;
  };
  tags: string[];
  htmlContent?: string;
}

interface DatabaseSchema {
  users: UserRecord[];
  reports: ReportRecord[];
  sessions: { [token: string]: { userId: string; email: string; expiresAt: number } };
}

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 32).toString('hex');
}

function loadDB(): DatabaseSchema {
  if (!fs.existsSync(DB_FILE)) {
    const salt = crypto.randomBytes(16).toString('hex');
    const defaultUser: UserRecord = {
      id: 'usr-default-guilherme',
      email: 'guilherme@nextfit.com.br',
      name: 'Guilherme',
      passwordHash: hashPassword('password123', salt),
      salt,
      role: 'admin',
      createdAt: new Date().toISOString(),
      avatarColor: '#4f46e5'
    };

    const initialDb: DatabaseSchema = {
      users: [defaultUser],
      reports: [],
      sessions: {}
    };

    saveDB(initialDb);
    return initialDb;
  }

  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading db:', err);
    return { users: [], reports: [], sessions: {} };
  }
}

function saveDB(db: DatabaseSchema) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
}

// Cookie / Auth token parser helper
function getAuthToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  // Check cookie header
  const cookies = req.headers.cookie;
  if (cookies) {
    const match = cookies.match(/(?:^|;\s*)auth_token=([^;]+)/);
    if (match) return decodeURIComponent(match[1]);
  }
  // Check query parameter (convenient for links)
  if (req.query.token && typeof req.query.token === 'string') {
    return req.query.token;
  }
  return null;
}

function authenticateUser(req: Request, db: DatabaseSchema): UserRecord | null {
  const token = getAuthToken(req);
  if (!token) return null;
  const session = db.sessions[token];
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    delete db.sessions[token];
    saveDB(db);
    return null;
  }
  const user = db.users.find(u => u.id === session.userId);
  return user || null;
}

// =================== API ROUTES ===================

// Health check
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Auth: Register
app.post('/api/auth/register', (req: Request, res: Response) => {
  const { email, name, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email e senha são obrigatórios.' });
  }

  const db = loadDB();
  const normalizedEmail = email.toLowerCase().trim();
  const existing = db.users.find(u => u.email.toLowerCase() === normalizedEmail);
  if (existing) {
    return res.status(400).json({ error: 'Este email já está cadastrado.' });
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = hashPassword(password, salt);
  const colors = ['#2563eb', '#7c3aed', '#059669', '#d97706', '#dc2626', '#0891b2'];
  const avatarColor = colors[Math.floor(Math.random() * colors.length)];

  const newUser: UserRecord = {
    id: `usr-${crypto.randomBytes(6).toString('hex')}`,
    email: normalizedEmail,
    name: name?.trim() || normalizedEmail.split('@')[0],
    passwordHash,
    salt,
    createdAt: new Date().toISOString(),
    avatarColor
  };

  db.users.push(newUser);

  // Create session
  const token = crypto.randomBytes(32).toString('hex');
  db.sessions[token] = {
    userId: newUser.id,
    email: newUser.email,
    expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 // 30 days
  };
  saveDB(db);

  res.setHeader('Set-Cookie', `auth_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`);
  return res.json({
    user: {
      id: newUser.id,
      email: newUser.email,
      name: newUser.name,
      photoURL: newUser.photoURL,
      role: newUser.role,
      createdAt: newUser.createdAt,
      avatarColor: newUser.avatarColor
    },
    token
  });
});

// Auth: Google Workspace Sync (@nextfit.com.br)
app.post('/api/auth/google-sync', (req: Request, res: Response) => {
  const { user: googleUser } = req.body;
  if (!googleUser || !googleUser.email) {
    return res.status(400).json({ error: 'Dados do Google Workspace incompletos.' });
  }

  const normalizedEmail = googleUser.email.toLowerCase().trim();
  if (!normalizedEmail.endsWith('@nextfit.com.br')) {
    return res.status(403).json({
      error: `Acesso restrito. A conta ${normalizedEmail} não pertence à organização corporativa @nextfit.com.br.`
    });
  }

  const db = loadDB();
  let user = db.users.find(u => u.email.toLowerCase() === normalizedEmail);

  if (!user) {
    const salt = crypto.randomBytes(16).toString('hex');
    user = {
      id: googleUser.id || `usr-${crypto.randomBytes(8).toString('hex')}`,
      email: normalizedEmail,
      name: googleUser.name || normalizedEmail.split('@')[0],
      passwordHash: hashPassword(crypto.randomBytes(24).toString('hex'), salt),
      salt,
      photoURL: googleUser.photoURL || undefined,
      role: normalizedEmail.includes('admin') || normalizedEmail.startsWith('guilherme') ? 'admin' : 'member',
      createdAt: new Date().toISOString(),
      avatarColor: '#4f46e5'
    };
    db.users.push(user);
  } else {
    if (googleUser.name) user.name = googleUser.name;
    if (googleUser.photoURL) user.photoURL = googleUser.photoURL;
    if (normalizedEmail.includes('admin') || normalizedEmail.startsWith('guilherme')) {
      user.role = 'admin';
    }
  }

  // Create or refresh session
  const token = crypto.randomBytes(32).toString('hex');
  db.sessions[token] = {
    userId: user.id,
    email: user.email,
    expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 // 30 days
  };
  saveDB(db);

  res.setHeader('Set-Cookie', `auth_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`);
  return res.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      photoURL: user.photoURL,
      role: user.role,
      createdAt: user.createdAt,
      avatarColor: user.avatarColor
    },
    token
  });
});

// Auth: Login
app.post('/api/auth/login', (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Informe email e senha.' });
  }

  const db = loadDB();
  const normalizedEmail = email.toLowerCase().trim();
  const user = db.users.find(u => u.email.toLowerCase() === normalizedEmail);

  if (!user) {
    return res.status(401).json({ error: 'Credenciais inválidas. Usuário não encontrado.' });
  }

  const hash = hashPassword(password, user.salt);
  if (hash !== user.passwordHash) {
    return res.status(401).json({ error: 'Senha incorreta.' });
  }

  // Create session
  const token = crypto.randomBytes(32).toString('hex');
  db.sessions[token] = {
    userId: user.id,
    email: user.email,
    expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000
  };
  saveDB(db);

  res.setHeader('Set-Cookie', `auth_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`);
  return res.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      photoURL: user.photoURL,
      role: user.role,
      createdAt: user.createdAt,
      avatarColor: user.avatarColor
    },
    token
  });
});


// Auth: Get Current User
app.get('/api/auth/me', (req: Request, res: Response) => {
  const db = loadDB();
  const user = authenticateUser(req, db);
  if (!user) {
    return res.status(401).json({ user: null });
  }
  return res.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      photoURL: user.photoURL,
      role: user.role,
      createdAt: user.createdAt,
      avatarColor: user.avatarColor
    }
  });
});

// Auth: Logout
app.post('/api/auth/logout', (req: Request, res: Response) => {
  const token = getAuthToken(req);
  if (token) {
    const db = loadDB();
    delete db.sessions[token];
    saveDB(db);
  }
  res.setHeader('Set-Cookie', 'auth_token=; Path=/; HttpOnly; Max-Age=0');
  return res.json({ success: true });
});

// Report: List all reports for the authenticated user (PRIVACY & USER ISOLATION)
app.get('/api/reports', (req: Request, res: Response) => {
  const db = loadDB();
  const currentUser = authenticateUser(req, db);

  if (!currentUser) {
    return res.status(401).json({ error: 'Sessão não autenticada. Faça login com seu Google Workspace @nextfit.com.br.', reports: [] });
  }

  // Filter reports with strict privacy:
  // 1. Reports authored by currentUser (owner)
  // 2. Reports where currentUser.email is explicitly invited in allowedEmails
  const userReports = db.reports.filter(r => {
    const isOwner = r.ownerId === currentUser.id || r.ownerEmail.toLowerCase() === currentUser.email.toLowerCase();
    const isWhitelisted = r.security.allowedEmails?.some((e: string) => {
      const emailLower = e.toLowerCase().trim();
      return emailLower === currentUser.email.toLowerCase() || (emailLower.startsWith('@') && currentUser.email.toLowerCase().endsWith(emailLower));
    });
    return isOwner || isWhitelisted;
  });

  // Format list (don't expose internal passwords)
  const safeReports = userReports.map(r => ({
    ...r,
    isOwner: r.ownerId === currentUser.id || r.ownerEmail.toLowerCase() === currentUser.email.toLowerCase(),
    security: {
      ...r.security,
      password: r.security.password ? '••••••••' : undefined
    }
  }));

  return res.json({
    reports: safeReports,
    currentUser: {
      id: currentUser.id,
      email: currentUser.email,
      name: currentUser.name,
      photoURL: currentUser.photoURL,
      role: currentUser.role
    }
  });
});

// Report: Get single report metadata & content
app.get('/api/reports/:id', (req: Request, res: Response) => {
  const db = loadDB();
  const idOrSlug = req.params.id;
  const report = db.reports.find(r => r.id === idOrSlug || r.slug === idOrSlug);

  if (!report) {
    return res.status(404).json({ error: 'Relatório não encontrado.' });
  }

  const filePath = path.join(REPORTS_DIR, `${report.id}.html`);
  let htmlContent = '';
  if (fs.existsSync(filePath)) {
    htmlContent = fs.readFileSync(filePath, 'utf8');
  }

  const safeReport = {
    ...report,
    htmlContent,
    security: {
      ...report.security,
      password: report.security.password ? '••••••••' : undefined
    }
  };

  return res.json({ report: safeReport });
});

// Bulk sync from Firestore to rehydrate ephemeral server storage
app.post('/api/reports/sync-bulk', (req: Request, res: Response) => {
  const { reports } = req.body;
  if (!Array.isArray(reports)) {
    return res.status(400).json({ error: 'reports array required' });
  }

  const db = loadDB();
  let count = 0;

  for (const r of reports) {
    if (!r || !r.id) continue;
    const existingIndex = db.reports.findIndex(x => x.id === r.id);
    const record: ReportRecord = {
      id: r.id,
      slug: r.slug || r.id,
      title: r.title || 'Sem título',
      description: r.description || '',
      ownerId: r.ownerId || r.authorId || '',
      ownerEmail: r.ownerEmail || r.authorEmail || '',
      ownerName: r.ownerName || r.authorName || 'Colaborador Next Fit',
      fileSize: r.fileSize || 0,
      createdAt: r.createdAt || new Date().toISOString(),
      updatedAt: r.updatedAt || new Date().toISOString(),
      viewsCount: r.viewsCount || 0,
      lastViewedAt: r.lastViewedAt,
      security: r.security || {
        accessType: 'authenticated_only',
        allowedEmails: [],
        expiresAt: null,
        active: true,
        showWatermark: true,
        allowDownload: true,
        allowPrint: true
      },
      tags: r.tags || [],
      htmlContent: r.htmlContent
    };

    if (existingIndex >= 0) {
      db.reports[existingIndex] = { ...db.reports[existingIndex], ...record };
    } else {
      db.reports.push(record);
    }

    if (r.htmlContent && typeof r.htmlContent === 'string') {
      const filePath = path.join(REPORTS_DIR, `${r.id}.html`);
      try {
        fs.writeFileSync(filePath, r.htmlContent, 'utf8');
      } catch (e) {
        console.error('Error writing report html in sync-bulk:', e);
      }
    }
    count++;
  }

  saveDB(db);
  return res.json({ success: true, synced: count });
});

// Report: Create / Upload
app.post('/api/reports', (req: Request, res: Response) => {
  const { title, description, htmlContent, slug, security, tags } = req.body;
  if (!htmlContent || typeof htmlContent !== 'string') {
    return res.status(400).json({ error: 'O conteúdo HTML do relatório é obrigatório.' });
  }

  const db = loadDB();
  const currentUser = authenticateUser(req, db) || db.users[0]; // fallback to default user if guest upload

  // Extract title from HTML if not given
  let finalTitle = title?.trim();
  if (!finalTitle) {
    const titleMatch = htmlContent.match(/<title[^>]*>([^<]+)<\/title>/i);
    finalTitle = titleMatch ? titleMatch[1].trim() : 'Relatório Sem Título';
  }

  // Generate safe slug
  let finalSlug = slug ? slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-') : '';
  if (!finalSlug) {
    finalSlug = finalTitle.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .substring(0, 32);
  }

  // Ensure unique slug
  let slugCandidate = finalSlug || `report-${crypto.randomBytes(3).toString('hex')}`;
  let counter = 1;
  while (db.reports.some(r => r.slug === slugCandidate)) {
    slugCandidate = `${finalSlug}-${counter++}`;
  }

  const reportId = `rep-${crypto.randomBytes(6).toString('hex')}`;
  const filePath = path.join(REPORTS_DIR, `${reportId}.html`);
  fs.writeFileSync(filePath, htmlContent, 'utf8');

  const newReport: ReportRecord = {
    id: reportId,
    slug: slugCandidate,
    title: finalTitle,
    description: description?.trim() || '',
    ownerId: currentUser.id,
    ownerEmail: currentUser.email,
    ownerName: currentUser.name,
    fileSize: Buffer.byteLength(htmlContent, 'utf8'),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    viewsCount: 0,
    security: {
      accessType: security?.accessType || 'authenticated_only',
      password: security?.password?.trim() || undefined,
      allowedEmails: Array.isArray(security?.allowedEmails) ? security.allowedEmails.map((e: string) => e.toLowerCase().trim()).filter(Boolean) : [currentUser.email],
      expiresAt: security?.expiresAt || null,
      active: security?.active !== undefined ? security.active : true,
      showWatermark: security?.showWatermark !== undefined ? security.showWatermark : true,
      allowDownload: security?.allowDownload !== undefined ? security.allowDownload : true,
      allowPrint: security?.allowPrint !== undefined ? security.allowPrint : true,
    },
    tags: Array.isArray(tags) ? tags : ['IA', 'Report'],
    htmlContent,
  };

  db.reports.unshift(newReport);
  saveDB(db);

  return res.status(201).json({
    report: {
      ...newReport,
      security: {
        ...newReport.security,
        password: newReport.security.password ? '••••••••' : undefined
      }
    }
  });
});

// Report: Update security or metadata
app.put('/api/reports/:id', (req: Request, res: Response) => {
  const db = loadDB();
  const currentUser = authenticateUser(req, db);
  if (!currentUser) {
    return res.status(401).json({ error: 'Você precisa estar autenticado.' });
  }

  const idOrSlug = req.params.id;
  const index = db.reports.findIndex(r => r.id === idOrSlug || r.slug === idOrSlug);

  if (index === -1) {
    return res.status(404).json({ error: 'Relatório não encontrado.' });
  }

  const existing = db.reports[index];
  const isOwner = existing.ownerId === currentUser.id || existing.ownerEmail.toLowerCase() === currentUser.email.toLowerCase() || currentUser.role === 'admin';
  if (!isOwner) {
    return res.status(403).json({ error: 'Acesso negado. Apenas o proprietário tem permissão para editar este relatório.' });
  }

  const { title, description, security, tags, htmlContent } = req.body;

  if (title) existing.title = title.trim();
  if (description !== undefined) existing.description = description.trim();
  if (tags && Array.isArray(tags)) existing.tags = tags;

  if (security) {
    existing.security = {
      ...existing.security,
      ...security,
      password: security.password === '••••••••' ? existing.security.password : (security.password !== undefined ? security.password.trim() : existing.security.password),
      allowedEmails: Array.isArray(security.allowedEmails) ? security.allowedEmails.map((e: string) => e.toLowerCase().trim()).filter(Boolean) : existing.security.allowedEmails
    };
  }

  if (htmlContent && typeof htmlContent === 'string') {
    const filePath = path.join(REPORTS_DIR, `${existing.id}.html`);
    fs.writeFileSync(filePath, htmlContent, 'utf8');
    existing.fileSize = Buffer.byteLength(htmlContent, 'utf8');
  }

  existing.updatedAt = new Date().toISOString();
  db.reports[index] = existing;
  saveDB(db);

  return res.json({
    report: {
      ...existing,
      security: {
        ...existing.security,
        password: existing.security.password ? '••••••••' : undefined
      }
    }
  });
});

// Report: Delete
app.delete('/api/reports/:id', (req: Request, res: Response) => {
  const db = loadDB();
  const currentUser = authenticateUser(req, db);
  if (!currentUser) {
    return res.status(401).json({ error: 'Você precisa estar autenticado.' });
  }

  const idOrSlug = req.params.id;
  const index = db.reports.findIndex(r => r.id === idOrSlug || r.slug === idOrSlug);

  if (index === -1) {
    return res.status(404).json({ error: 'Relatório não encontrado.' });
  }

  const report = db.reports[index];
  const isOwner = report.ownerId === currentUser.id || report.ownerEmail.toLowerCase() === currentUser.email.toLowerCase() || currentUser.role === 'admin';
  if (!isOwner) {
    return res.status(403).json({ error: 'Acesso negado. Apenas o proprietário tem permissão para excluir este relatório.' });
  }

  const filePath = path.join(REPORTS_DIR, `${report.id}.html`);
  if (fs.existsSync(filePath)) {
    try { fs.unlinkSync(filePath); } catch (e) { console.error('Error deleting html file:', e); }
  }

  db.reports.splice(index, 1);
  saveDB(db);

  return res.json({ success: true, deletedId: report.id });
});

// Verification API: Verify password or access token
app.post('/api/reports/:id/verify-access', (req: Request, res: Response) => {
  const db = loadDB();
  const idOrSlug = req.params.id;
  const report = db.reports.find(r => r.id === idOrSlug || r.slug === idOrSlug);

  if (!report) {
    return res.status(404).json({ authorized: false, reason: 'Relatório não encontrado.' });
  }

  if (!report.security.active) {
    return res.status(403).json({ authorized: false, reason: 'Acesso desativado pelo proprietário.' });
  }

  if (report.security.expiresAt && new Date(report.security.expiresAt).getTime() < Date.now()) {
    return res.status(403).json({ authorized: false, reason: 'Este link de relatório expirou.' });
  }

  const { password } = req.body;
  const currentUser = authenticateUser(req, db);

  // Check access type
  if (report.security.accessType === 'public_link') {
    return res.json({ authorized: true, viewer: currentUser?.email || 'público' });
  }

  if (report.security.accessType === 'password_protected') {
    if (password && password === report.security.password) {
      return res.json({ authorized: true, viewer: currentUser?.email || 'via senha' });
    }
    return res.status(401).json({ authorized: false, reason: 'Senha incorreta.' });
  }

  if (report.security.accessType === 'authenticated_only') {
    if (currentUser) {
      return res.json({ authorized: true, viewer: currentUser.email });
    }
    return res.status(401).json({ authorized: false, reason: 'Autenticação necessária.' });
  }

  if (report.security.accessType === 'email_whitelist') {
    if (!currentUser) {
      return res.status(401).json({ authorized: false, reason: 'Autenticação necessária.' });
    }
    const emailMatches = report.security.allowedEmails.some(allowed => {
      if (allowed.startsWith('@')) {
        return currentUser.email.toLowerCase().endsWith(allowed.toLowerCase());
      }
      return currentUser.email.toLowerCase() === allowed.toLowerCase();
    });

    if (emailMatches || currentUser.id === report.ownerId) {
      return res.json({ authorized: true, viewer: currentUser.email });
    }
    return res.status(403).json({ authorized: false, reason: `O email ${currentUser.email} não tem permissão de acesso.` });
  }

  return res.json({ authorized: true, viewer: currentUser?.email });
});

// Raw HTML serving endpoint with access control check
app.get('/api/raw/:id', (req: Request, res: Response) => {
  const db = loadDB();
  const idOrSlug = req.params.id;
  const report = db.reports.find(r => r.id === idOrSlug || r.slug === idOrSlug);

  if (!report) {
    return res.status(404).send('Relatório não encontrado');
  }

  // Security checks
  if (!report.security.active) {
    return res.status(403).send('Relatório desativado pelo proprietário.');
  }

  if (report.security.expiresAt && new Date(report.security.expiresAt).getTime() < Date.now()) {
    return res.status(403).send('Relatório expirado.');
  }

  const currentUser = authenticateUser(req, db);
  const providedPassword = (req.query.pwd as string) || '';

  let authorized = false;
  if (report.security.accessType === 'public_link') {
    authorized = true;
  } else if (report.security.accessType === 'password_protected') {
    authorized = (providedPassword === report.security.password);
  } else if (report.security.accessType === 'authenticated_only') {
    authorized = !!currentUser;
  } else if (report.security.accessType === 'email_whitelist') {
    if (currentUser) {
      authorized = (currentUser.id === report.ownerId) || report.security.allowedEmails.some(allowed => {
        if (allowed.startsWith('@')) return currentUser.email.toLowerCase().endsWith(allowed.toLowerCase());
        return currentUser.email.toLowerCase() === allowed.toLowerCase();
      });
    }
  }

  if (!authorized) {
    return res.status(401).send('Não autorizado. Faça login para visualizar este relatório.');
  }

  const filePath = path.join(REPORTS_DIR, `${report.id}.html`);
  if (!fs.existsSync(filePath) && report.htmlContent) {
    try {
      fs.writeFileSync(filePath, report.htmlContent, 'utf8');
    } catch (e) {
      console.error('Erro ao recriar arquivo HTML a partir do cache:', e);
    }
  }

  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Arquivo HTML não encontrado');
  }

  // Record view count
  report.viewsCount = (report.viewsCount || 0) + 1;
  report.lastViewedAt = new Date().toISOString();
  saveDB(db);

  let content = fs.readFileSync(filePath, 'utf8');

  // Optional watermark injection if enabled
  if (report.security.showWatermark && currentUser) {
    const watermarkTag = `
    <!-- HostReport Watermark -->
    <div style="position: fixed; bottom: 8px; right: 12px; z-index: 999999; background: rgba(15,23,42,0.85); color: #94a3b8; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-family: monospace; pointer-events: none; border: 1px solid rgba(255,255,255,0.1); backdrop-filter: blur(4px);">
      Visualizado por: ${currentUser.email} • ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}
    </div>
    `;
    content = content.replace('</body>', `${watermarkTag}</body>`);
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // Allow safe embedded rendering
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  return res.send(content);
});

// =================== HOSTED VIEW ROUTE (/r/:idOrSlug) ===================
// Serves the standalone hosted report page with responsive top bar and security barrier
app.get('/r/:idOrSlug', (req: Request, res: Response) => {
  const db = loadDB();
  const idOrSlug = req.params.idOrSlug;
  const report = db.reports.find(r => r.id === idOrSlug || r.slug === idOrSlug);

  if (!report) {
    return res.status(404).send(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>404 - Relatório Não Encontrado</title>
        <style>
          body { font-family: system-ui, sans-serif; background: #f8fafc; color: #0f172a; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
          .card { background: #ffffff; border: 1px solid #e2e8f0; padding: 40px; border-radius: 16px; max-width: 440px; text-align: center; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
          h1 { font-size: 24px; margin-bottom: 8px; color: #e11d48; }
          p { color: #64748b; font-size: 14px; margin-bottom: 24px; }
          a { background: #0f172a; color: #fff; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-size: 14px; font-weight: 500; display: inline-block; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>Relatório Não Encontrado</h1>
          <p>O link informado não existe ou foi removido pelo criador.</p>
          <a href="/">Ir para o Painel Principal</a>
        </div>
      </body>
      </html>
    `);
  }

  // Deactivated check
  if (!report.security.active) {
    return res.status(403).send(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Acesso Desativado</title>
        <style>
          body { font-family: system-ui, sans-serif; background: #f8fafc; color: #0f172a; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
          .card { background: #ffffff; border: 1px solid #e2e8f0; padding: 40px; border-radius: 16px; max-width: 440px; text-align: center; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
          h1 { font-size: 22px; margin-bottom: 8px; color: #d97706; }
          p { color: #64748b; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>Acesso Temporariamente Suspenso</h1>
          <p>A publicação deste documento foi pausada pelo administrador responsável.</p>
        </div>
      </body>
      </html>
    `);
  }

  // Expired check
  if (report.security.expiresAt && new Date(report.security.expiresAt).getTime() < Date.now()) {
    return res.status(403).send(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Link Expirado</title>
        <style>
          body { font-family: system-ui, sans-serif; background: #f8fafc; color: #0f172a; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
          .card { background: #ffffff; border: 1px solid #e2e8f0; padding: 40px; border-radius: 16px; max-width: 440px; text-align: center; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
          h1 { font-size: 22px; margin-bottom: 8px; color: #e11d48; }
          p { color: #64748b; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>Prazo de Acesso Expirado</h1>
          <p>A validade deste relatório expirou em ${new Date(report.security.expiresAt).toLocaleString('pt-BR')}.</p>
        </div>
      </body>
      </html>
    `);
  }

  const currentUser = authenticateUser(req, db);
  const providedPassword = (req.query.pwd as string) || '';

  let authorized = false;
  let accessReason = '';

  if (report.security.accessType === 'public_link') {
    authorized = true;
  } else if (report.security.accessType === 'password_protected') {
    if (providedPassword === report.security.password) {
      authorized = true;
    } else {
      accessReason = 'password_required';
    }
  } else if (report.security.accessType === 'authenticated_only') {
    if (currentUser) {
      authorized = true;
    } else {
      accessReason = 'login_required';
    }
  } else if (report.security.accessType === 'email_whitelist') {
    if (!currentUser) {
      accessReason = 'login_required';
    } else {
      const emailMatches = (currentUser.id === report.ownerId) || report.security.allowedEmails.some(allowed => {
        if (allowed.startsWith('@')) return currentUser.email.toLowerCase().endsWith(allowed.toLowerCase());
        return currentUser.email.toLowerCase() === allowed.toLowerCase();
      });
      if (emailMatches) {
        authorized = true;
      } else {
        accessReason = 'email_not_whitelisted';
      }
    }
  }

  // If NOT authorized, render the elegant Security Access Gate
  if (!authorized) {
    const isPassword = accessReason === 'password_required';
    const isDeniedEmail = accessReason === 'email_not_whitelisted';

    return res.send(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Acesso Protegido - ${report.title}</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; font-family: system-ui, -apple-system, sans-serif; }
          body { background: #f8fafc; color: #0f172a; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
          .gate-card { background: #ffffff; border: 1px solid #e2e8f0; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05); border-radius: 16px; width: 100%; max-width: 440px; padding: 32px; }
          .shield-icon { width: 48px; height: 48px; background: #eef2ff; border: 1px solid #e0e7ff; border-radius: 12px; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; color: #4f46e5; }
          h1 { font-size: 20px; text-align: center; margin-bottom: 6px; color: #0f172a; font-weight: 700; }
          .report-name { text-align: center; color: #4f46e5; font-size: 13px; font-weight: 600; margin-bottom: 20px; padding: 6px 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; word-break: break-word; }
          .desc { font-size: 13px; color: #64748b; text-align: center; margin-bottom: 24px; line-height: 1.5; }
          .form-group { margin-bottom: 16px; }
          label { display: block; font-size: 13px; font-weight: 500; margin-bottom: 6px; color: #334155; }
          input { width: 100%; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; font-size: 14px; color: #0f172a; outline: none; transition: border-color 0.2s; }
          input:focus { border-color: #4f46e5; box-shadow: 0 0 0 1px #4f46e5; }
          .btn-primary { width: 100%; background: #0f172a; color: #fff; border: none; border-radius: 8px; padding: 12px; font-size: 14px; font-weight: 600; cursor: pointer; transition: background 0.2s; margin-top: 8px; }
          .btn-primary:hover { background: #1e293b; }
          .btn-demo { width: 100%; background: #f8fafc; color: #334155; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; font-size: 13px; font-weight: 500; cursor: pointer; margin-top: 10px; transition: background 0.15s; }
          .btn-demo:hover { background: #f1f5f9; }
          .error-msg { background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; padding: 10px; border-radius: 8px; font-size: 13px; margin-bottom: 16px; text-align: center; }
          .footer-note { text-align: center; font-size: 12px; color: #94a3b8; margin-top: 24px; }
          .tabs { display: flex; border-bottom: 1px solid #e2e8f0; margin-bottom: 20px; }
          .tab { flex: 1; text-align: center; padding: 8px; font-size: 13px; color: #64748b; cursor: pointer; border-bottom: 2px solid transparent; font-weight: 500; }
          .tab.active { color: #4f46e5; border-color: #4f46e5; font-weight: 600; }
        </style>
      </head>
      <body>
        <div class="gate-card">
          <div class="shield-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>
          </div>

          <h1>Documento Protegido</h1>
          <div class="report-name">${report.title}</div>

          ${isDeniedEmail ? `
            <div class="error-msg">
              Acesso Negado: O usuário <strong>${currentUser?.email}</strong> não possui autorização nesta lista.
            </div>
            <p class="desc">Entre em contato com <strong>${report.ownerEmail}</strong> para solicitar a liberação do seu endereço corporativo.</p>
            <button class="btn-primary" onclick="logoutAndRetry()">Trocar de Conta</button>
          ` : isPassword ? `
            <p class="desc">Este relatório foi protegido por senha pelo autor. Digite a credencial para descriptografar a visualização.</p>
            <form onsubmit="handlePasswordSubmit(event)">
              <div class="form-group">
                <label>Senha de Acesso</label>
                <input type="password" id="pwdInput" placeholder="Digite a senha do documento" required autofocus />
              </div>
              <div id="pwdError" class="error-msg" style="display:none;"></div>
              <button type="submit" class="btn-primary">Acessar Relatório</button>
            </form>
          ` : `
            <div class="tabs">
              <div class="tab active" id="tabLogin" onclick="switchTab('login')">Entrar na Conta</div>
              <div class="tab" id="tabRegister" onclick="switchTab('register')">Criar Acesso</div>
            </div>

            <p class="desc">Apenas usuários autenticados têm permissão para acessar esta publicação gerada por IA.</p>

            <form id="authForm" onsubmit="handleAuthSubmit(event)">
              <div class="form-group" id="nameGroup" style="display:none;">
                <label>Seu Nome</label>
                <input type="text" id="nameInput" placeholder="Ex: Maria Silva" />
              </div>
              <div class="form-group">
                <label>E-mail Corporativo</label>
                <input type="email" id="emailInput" placeholder="seu.email@empresa.com" required value="guilherme@nextfit.com.br" />
              </div>
              <div class="form-group">
                <label>Senha</label>
                <input type="password" id="passwordInput" placeholder="••••••••" required value="password123" />
              </div>
              <div id="authError" class="error-msg" style="display:none;"></div>
              <button type="submit" id="submitBtn" class="btn-primary">Entrar e Visualizar</button>
            </form>

            <button type="button" class="btn-demo" onclick="demoLogin()">⚡ Entrar Rápido com Conta Demonstrativa</button>
          `}

          <div class="footer-note">
            Protegido por Next Fit Reports Security Engine • Acesso Corporativo Restrito
          </div>
        </div>

        <script>
          let currentMode = 'login';

          function switchTab(mode) {
            currentMode = mode;
            document.getElementById('tabLogin').classList.toggle('active', mode === 'login');
            document.getElementById('tabRegister').classList.toggle('active', mode === 'register');
            document.getElementById('nameGroup').style.display = mode === 'register' ? 'block' : 'none';
            document.getElementById('submitBtn').innerText = mode === 'register' ? 'Criar Conta e Visualizar' : 'Entrar e Visualizar';
          }

          async function handleAuthSubmit(e) {
            e.preventDefault();
            const email = document.getElementById('emailInput').value;
            const password = document.getElementById('passwordInput').value;
            const name = document.getElementById('nameInput')?.value;
            const errorEl = document.getElementById('authError');
            errorEl.style.display = 'none';

            try {
              const endpoint = currentMode === 'register' ? '/api/auth/register' : '/api/auth/login';
              const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password, name })
              });
              const data = await res.json();
              if (!res.ok) {
                errorEl.innerText = data.error || 'Erro na autenticação';
                errorEl.style.display = 'block';
                return;
              }
              // Save token in localStorage and reload page to unlock report
              if (data.token) {
                localStorage.setItem('hostreport_token', data.token);
              }
              window.location.reload();
            } catch (err) {
              errorEl.innerText = 'Falha de conexão com o servidor';
              errorEl.style.display = 'block';
            }
          }

          async function demoLogin() {
            try {
              const res = await fetch('/api/auth/demo', { method: 'POST' });
              const data = await res.json();
              if (data.token) localStorage.setItem('hostreport_token', data.token);
              window.location.reload();
            } catch (e) {
              window.location.reload();
            }
          }

          function handlePasswordSubmit(e) {
            e.preventDefault();
            const pwd = document.getElementById('pwdInput').value;
            const url = new URL(window.location.href);
            url.searchParams.set('pwd', pwd);
            window.location.href = url.toString();
          }

          async function logoutAndRetry() {
            await fetch('/api/auth/logout', { method: 'POST' });
            localStorage.removeItem('hostreport_token');
            window.location.reload();
          }
        </script>
      </body>
      </html>
    `);
  }

  // If authorized: render the report in an isolated, secure wrapper with top bar
  const rawUrl = `/api/raw/${report.id}?pwd=${encodeURIComponent(providedPassword)}`;

  res.send(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${report.title} • Next Fit Reports</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8fafc; height: 100vh; overflow: hidden; display: flex; flex-direction: column; }
        #topbar {
          background: #ffffff;
          border-bottom: 1px solid #e2e8f0;
          height: 52px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 16px;
          color: #0f172a;
          z-index: 50;
          font-size: 13px;
          transition: all 0.2s ease;
          box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.03);
        }
        #topbar.hidden-bar { display: none; }
        .topbar-left { display: flex; align-items: center; gap: 12px; overflow: hidden; }
        .logo-pill { background: #0f172a; color: #fff; padding: 4px 10px; border-radius: 6px; font-weight: 700; font-size: 11px; letter-spacing: 0.5px; text-decoration: none; }
        .report-title-head { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 320px; color: #0f172a; }
        .badge-sec { background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0; padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 500; display: flex; align-items: center; gap: 4px; }
        .topbar-right { display: flex; align-items: center; gap: 8px; }
        .user-tag { color: #64748b; font-size: 12px; background: #f8fafc; padding: 4px 10px; border-radius: 6px; border: 1px solid #e2e8f0; }
        .btn-action { background: #ffffff; color: #334155; border: 1px solid #e2e8f0; padding: 5px 10px; border-radius: 6px; font-size: 12px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; text-decoration: none; transition: background 0.15s; box-shadow: 0 1px 2px 0 rgba(0,0,0,0.02); }
        .btn-action:hover { background: #f1f5f9; color: #0f172a; }
        #viewerFrame { flex: 1; width: 100%; border: none; background: #fff; }
        #floatingToggle {
          position: fixed;
          top: 10px;
          right: 12px;
          z-index: 100;
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(8px);
          border: 1px solid #cbd5e1;
          color: #475569;
          padding: 4px 8px;
          border-radius: 6px;
          font-size: 11px;
          cursor: pointer;
          box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        }
        #floatingToggle:hover { color: #0f172a; background: #ffffff; }
      </style>
    </head>
    <body>
      <div id="topbar">
        <div class="topbar-left">
          <a href="/" class="logo-pill" title="Voltar ao Painel Next Fit Reports">NEXT FIT</a>
          <span class="report-title-head">${report.title}</span>
          <span class="badge-sec">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            ${report.security.accessType === 'password_protected' ? 'Senha Validada' : 'Autenticado'}
          </span>
        </div>
        <div class="topbar-right">
          ${currentUser ? `<span class="user-tag">👤 ${currentUser.email}</span>` : ''}
          <button class="btn-action" onclick="copyLink()">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
            Copiar Link
          </button>
          ${report.security.allowPrint ? `
            <button class="btn-action" onclick="printReport()">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/></svg>
              Imprimir
            </button>
          ` : ''}
          ${report.security.allowDownload ? `
            <a href="${rawUrl}" download="${report.slug}.html" class="btn-action">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
              HTML
            </a>
          ` : ''}
          <button class="btn-action" onclick="toggleFullscreen()">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
            Tela Cheia
          </button>
          <a href="/" class="btn-action" style="background:#0f172a; color:#fff; border-color:#0f172a;">Painel</a>
        </div>
      </div>

      <iframe id="viewerFrame" src="${rawUrl}" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture" sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-downloads"></iframe>

      <script>
        function copyLink() {
          navigator.clipboard.writeText(window.location.href);
          alert('Link do relatório copiado com sucesso!');
        }
        function printReport() {
          const iframe = document.getElementById('viewerFrame');
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
        }
        function toggleFullscreen() {
          if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
          } else {
            if (document.exitFullscreen) document.exitFullscreen();
          }
        }
      </script>
    </body>
    </html>
  `);
});

// =================== VITE MIDDLEWARE / SPA ===================
async function start() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`HostReport Server rodando na porta ${PORT}`);
  });
}

start();
