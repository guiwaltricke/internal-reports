import crypto from 'crypto';
import express, { NextFunction, Request, Response } from 'express';
import {
  ReportRecord,
  UserRecord,
  createSession,
  deleteReport,
  deleteSession,
  ensureDefaultUser,
  findFallbackUser,
  findUserByEmail,
  findUserById,
  getReportByIdOrSlug,
  getSession,
  hashPassword,
  listReportsMetadata,
  recordReportView,
  resolveReportHtml,
  saveReport,
  saveUser,
  slugExists,
} from './store';

export const app = express();

// Body parsing with 50MB limit for large AI HTML reports.
// Note: on Vercel the platform caps a serverless request body at 4.5MB, so that
// is the effective ceiling in production regardless of this setting.
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const SESSION_COOKIE_MAX_AGE = 2592000; // 30 days, in seconds

/** Express 4 does not forward rejected promises, so every async route goes through this. */
type AsyncHandler = (req: Request, res: Response) => Promise<unknown>;
const wrap =
  (handler: AsyncHandler) => (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res)).catch(next);
  };

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

async function authenticateUser(req: Request): Promise<UserRecord | null> {
  const token = getAuthToken(req);
  if (!token) return null;

  const session = await getSession(token);
  if (!session) return null;

  if (session.expiresAt < Date.now()) {
    await deleteSession(token);
    return null;
  }

  return findUserById(session.userId);
}

function sessionCookie(token: string): string {
  return `auth_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_COOKIE_MAX_AGE}`;
}

function publicUser(user: UserRecord) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    photoURL: user.photoURL,
    role: user.role,
    createdAt: user.createdAt,
    avatarColor: user.avatarColor,
  };
}

/** Never send the stored password back to the browser. */
function maskSecurity(report: ReportRecord) {
  return {
    ...report.security,
    password: report.security.password ? '••••••••' : undefined,
  };
}

function isOwner(report: ReportRecord, user: UserRecord): boolean {
  return (
    report.ownerId === user.id ||
    report.ownerEmail.toLowerCase() === user.email.toLowerCase()
  );
}

// =================== API ROUTES ===================

// Health check
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Auth: Register
app.post(
  '/api/auth/register',
  wrap(async (req, res) => {
    const { email, name, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios.' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existing = await findUserByEmail(normalizedEmail);
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
      avatarColor,
    };

    await saveUser(newUser);
    const token = await createSession(newUser);

    res.setHeader('Set-Cookie', sessionCookie(token));
    return res.json({ user: publicUser(newUser), token });
  })
);

// Auth: Google Workspace Sync (@nextfit.com.br)
app.post(
  '/api/auth/google-sync',
  wrap(async (req, res) => {
    const { user: googleUser } = req.body;
    if (!googleUser || !googleUser.email) {
      return res.status(400).json({ error: 'Dados do Google Workspace incompletos.' });
    }

    const normalizedEmail = googleUser.email.toLowerCase().trim();
    if (!normalizedEmail.endsWith('@nextfit.com.br')) {
      return res.status(403).json({
        error: `Acesso restrito. A conta ${normalizedEmail} não pertence à organização corporativa @nextfit.com.br.`,
      });
    }

    let user = await findUserByEmail(normalizedEmail);

    if (!user) {
      const salt = crypto.randomBytes(16).toString('hex');
      user = {
        id: googleUser.id || `usr-${crypto.randomBytes(8).toString('hex')}`,
        email: normalizedEmail,
        name: googleUser.name || normalizedEmail.split('@')[0],
        passwordHash: hashPassword(crypto.randomBytes(24).toString('hex'), salt),
        salt,
        photoURL: googleUser.photoURL || undefined,
        role:
          normalizedEmail.includes('admin') || normalizedEmail.startsWith('guilherme')
            ? 'admin'
            : 'member',
        createdAt: new Date().toISOString(),
        avatarColor: '#4f46e5',
      };
    } else {
      if (googleUser.name) user.name = googleUser.name;
      if (googleUser.photoURL) user.photoURL = googleUser.photoURL;
      if (normalizedEmail.includes('admin') || normalizedEmail.startsWith('guilherme')) {
        user.role = 'admin';
      }
    }

    await saveUser(user);
    const token = await createSession(user);

    res.setHeader('Set-Cookie', sessionCookie(token));
    return res.json({ user: publicUser(user), token });
  })
);

// Auth: Login
app.post(
  '/api/auth/login',
  wrap(async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Informe email e senha.' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await findUserByEmail(normalizedEmail);

    if (!user) {
      return res.status(401).json({ error: 'Credenciais inválidas. Usuário não encontrado.' });
    }

    const hash = hashPassword(password, user.salt);
    if (hash !== user.passwordHash) {
      return res.status(401).json({ error: 'Senha incorreta.' });
    }

    const token = await createSession(user);

    res.setHeader('Set-Cookie', sessionCookie(token));
    return res.json({ user: publicUser(user), token });
  })
);

// Auth: Get Current User
app.get(
  '/api/auth/me',
  wrap(async (req, res) => {
    const user = await authenticateUser(req);
    if (!user) {
      return res.status(401).json({ user: null });
    }
    return res.json({ user: publicUser(user) });
  })
);

// Auth: Logout
app.post(
  '/api/auth/logout',
  wrap(async (req, res) => {
    const token = getAuthToken(req);
    if (token) {
      await deleteSession(token);
    }
    res.setHeader('Set-Cookie', 'auth_token=; Path=/; HttpOnly; Max-Age=0');
    return res.json({ success: true });
  })
);

// Report: List all reports for the authenticated user (PRIVACY & USER ISOLATION)
app.get(
  '/api/reports',
  wrap(async (req, res) => {
    const currentUser = await authenticateUser(req);

    if (!currentUser) {
      return res.status(401).json({
        error:
          'Sessão não autenticada. Faça login com seu Google Workspace @nextfit.com.br.',
        reports: [],
      });
    }

    const all = await listReportsMetadata();

    // Filter reports with strict privacy:
    // 1. Reports authored by currentUser (owner)
    // 2. Reports where currentUser.email is explicitly invited in allowedEmails
    const userReports = all.filter((r) => {
      const owned = isOwner(r, currentUser);
      const isWhitelisted = r.security.allowedEmails?.some((e: string) => {
        const emailLower = e.toLowerCase().trim();
        return (
          emailLower === currentUser.email.toLowerCase() ||
          (emailLower.startsWith('@') && currentUser.email.toLowerCase().endsWith(emailLower))
        );
      });
      return owned || isWhitelisted;
    });

    // Format list (don't expose internal passwords)
    const safeReports = userReports.map((r) => ({
      ...r,
      isOwner: isOwner(r, currentUser),
      security: maskSecurity(r),
    }));

    return res.json({
      reports: safeReports,
      currentUser: {
        id: currentUser.id,
        email: currentUser.email,
        name: currentUser.name,
        photoURL: currentUser.photoURL,
        role: currentUser.role,
      },
    });
  })
);

// Report: Get single report metadata & content
app.get(
  '/api/reports/:id',
  wrap(async (req, res) => {
    const report = await getReportByIdOrSlug(req.params.id);

    if (!report) {
      return res.status(404).json({ error: 'Relatório não encontrado.' });
    }

    const htmlContent = (await resolveReportHtml(report)) || '';

    return res.json({
      report: { ...report, htmlContent, security: maskSecurity(report) },
    });
  })
);

// Bulk sync from the browser's Firestore snapshot.
//
// This endpoint existed to rehydrate the old ephemeral on-disk storage. The server
// now reads and writes the very same Firestore `reports` collection the client
// subscribes to, so re-writing those documents here would echo straight back into
// the client's onSnapshot listener and loop. It is kept as an accepted no-op so
// existing clients keep working.
app.post(
  '/api/reports/sync-bulk',
  wrap(async (req, res) => {
    const { reports } = req.body;
    if (!Array.isArray(reports)) {
      return res.status(400).json({ error: 'reports array required' });
    }
    return res.json({
      success: true,
      synced: 0,
      skipped: reports.length,
      reason: 'firestore-shared-store',
    });
  })
);

// Report: Create / Upload
app.post(
  '/api/reports',
  wrap(async (req, res) => {
    const { title, description, htmlContent, slug, security, tags } = req.body;
    if (!htmlContent || typeof htmlContent !== 'string') {
      return res.status(400).json({ error: 'O conteúdo HTML do relatório é obrigatório.' });
    }

    // Fall back to the first registered account for guest uploads, matching the
    // previous behaviour. With an empty user collection there is nobody to own
    // the report, so the upload is refused instead of being silently orphaned.
    const currentUser = (await authenticateUser(req)) || (await findFallbackUser());
    if (!currentUser) {
      return res
        .status(401)
        .json({ error: 'Você precisa estar autenticado para publicar um relatório.' });
    }

    // Extract title from HTML if not given
    let finalTitle = title?.trim();
    if (!finalTitle) {
      const titleMatch = htmlContent.match(/<title[^>]*>([^<]+)<\/title>/i);
      finalTitle = titleMatch ? titleMatch[1].trim() : 'Relatório Sem Título';
    }

    // Generate safe slug
    let finalSlug = slug
      ? slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-')
      : '';
    if (!finalSlug) {
      finalSlug = finalTitle
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .substring(0, 32);
    }

    // Ensure unique slug
    let slugCandidate = finalSlug || `report-${crypto.randomBytes(3).toString('hex')}`;
    let counter = 1;
    while (await slugExists(slugCandidate)) {
      slugCandidate = `${finalSlug}-${counter++}`;
    }

    const reportId = `rep-${crypto.randomBytes(6).toString('hex')}`;
    const now = new Date().toISOString();

    const newReport: ReportRecord = {
      id: reportId,
      slug: slugCandidate,
      title: finalTitle,
      description: description?.trim() || '',
      ownerId: currentUser.id,
      ownerEmail: currentUser.email,
      ownerName: currentUser.name,
      fileSize: Buffer.byteLength(htmlContent, 'utf8'),
      createdAt: now,
      updatedAt: now,
      viewsCount: 0,
      security: {
        accessType: security?.accessType || 'authenticated_only',
        password: security?.password?.trim() || undefined,
        allowedEmails: Array.isArray(security?.allowedEmails)
          ? security.allowedEmails.map((e: string) => e.toLowerCase().trim()).filter(Boolean)
          : [currentUser.email],
        expiresAt: security?.expiresAt || null,
        active: security?.active !== undefined ? security.active : true,
        showWatermark: security?.showWatermark !== undefined ? security.showWatermark : true,
        allowDownload: security?.allowDownload !== undefined ? security.allowDownload : true,
        allowPrint: security?.allowPrint !== undefined ? security.allowPrint : true,
      },
      tags: Array.isArray(tags) ? tags : ['IA', 'Report'],
      htmlContent,
    };

    await saveReport(newReport, htmlContent);

    return res.status(201).json({
      report: { ...newReport, security: maskSecurity(newReport) },
    });
  })
);

// Report: Update security or metadata
app.put(
  '/api/reports/:id',
  wrap(async (req, res) => {
    const currentUser = await authenticateUser(req);
    if (!currentUser) {
      return res.status(401).json({ error: 'Você precisa estar autenticado.' });
    }

    const existing = await getReportByIdOrSlug(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Relatório não encontrado.' });
    }

    if (!isOwner(existing, currentUser) && currentUser.role !== 'admin') {
      return res.status(403).json({
        error:
          'Acesso negado. Apenas o proprietário tem permissão para editar este relatório.',
      });
    }

    const { title, description, security, tags, htmlContent } = req.body;

    if (title) existing.title = title.trim();
    if (description !== undefined) existing.description = description.trim();
    if (tags && Array.isArray(tags)) existing.tags = tags;

    if (security) {
      existing.security = {
        ...existing.security,
        ...security,
        password:
          security.password === '••••••••'
            ? existing.security.password
            : security.password !== undefined
              ? security.password.trim()
              : existing.security.password,
        allowedEmails: Array.isArray(security.allowedEmails)
          ? security.allowedEmails.map((e: string) => e.toLowerCase().trim()).filter(Boolean)
          : existing.security.allowedEmails,
      };
    }

    const newHtml = typeof htmlContent === 'string' && htmlContent ? htmlContent : undefined;
    if (newHtml) {
      existing.fileSize = Buffer.byteLength(newHtml, 'utf8');
    }

    existing.updatedAt = new Date().toISOString();
    await saveReport(existing, newHtml);

    return res.json({
      report: { ...existing, security: maskSecurity(existing) },
    });
  })
);

// Report: Delete
app.delete(
  '/api/reports/:id',
  wrap(async (req, res) => {
    const currentUser = await authenticateUser(req);
    if (!currentUser) {
      return res.status(401).json({ error: 'Você precisa estar autenticado.' });
    }

    const report = await getReportByIdOrSlug(req.params.id);
    if (!report) {
      return res.status(404).json({ error: 'Relatório não encontrado.' });
    }

    if (!isOwner(report, currentUser) && currentUser.role !== 'admin') {
      return res.status(403).json({
        error:
          'Acesso negado. Apenas o proprietário tem permissão para excluir este relatório.',
      });
    }

    await deleteReport(report.id);

    return res.json({ success: true, deletedId: report.id });
  })
);

// Verification API: Verify password or access token
app.post(
  '/api/reports/:id/verify-access',
  wrap(async (req, res) => {
    const report = await getReportByIdOrSlug(req.params.id);

    if (!report) {
      return res.status(404).json({ authorized: false, reason: 'Relatório não encontrado.' });
    }

    if (!report.security.active) {
      return res
        .status(403)
        .json({ authorized: false, reason: 'Acesso desativado pelo proprietário.' });
    }

    if (
      report.security.expiresAt &&
      new Date(report.security.expiresAt).getTime() < Date.now()
    ) {
      return res
        .status(403)
        .json({ authorized: false, reason: 'Este link de relatório expirou.' });
    }

    const { password } = req.body;
    const currentUser = await authenticateUser(req);

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
      const emailMatches = report.security.allowedEmails.some((allowed) => {
        if (allowed.startsWith('@')) {
          return currentUser.email.toLowerCase().endsWith(allowed.toLowerCase());
        }
        return currentUser.email.toLowerCase() === allowed.toLowerCase();
      });

      if (emailMatches || currentUser.id === report.ownerId) {
        return res.json({ authorized: true, viewer: currentUser.email });
      }
      return res.status(403).json({
        authorized: false,
        reason: `O email ${currentUser.email} não tem permissão de acesso.`,
      });
    }

    return res.json({ authorized: true, viewer: currentUser?.email });
  })
);

// Raw HTML serving endpoint with access control check
app.get(
  '/api/raw/:id',
  wrap(async (req, res) => {
    const report = await getReportByIdOrSlug(req.params.id);

    if (!report) {
      return res.status(404).send('Relatório não encontrado');
    }

    // Security checks
    if (!report.security.active) {
      return res.status(403).send('Relatório desativado pelo proprietário.');
    }

    if (
      report.security.expiresAt &&
      new Date(report.security.expiresAt).getTime() < Date.now()
    ) {
      return res.status(403).send('Relatório expirado.');
    }

    const currentUser = await authenticateUser(req);
    const providedPassword = (req.query.pwd as string) || '';

    let authorized = false;
    if (report.security.accessType === 'public_link') {
      authorized = true;
    } else if (report.security.accessType === 'password_protected') {
      authorized = providedPassword === report.security.password;
    } else if (report.security.accessType === 'authenticated_only') {
      authorized = !!currentUser;
    } else if (report.security.accessType === 'email_whitelist') {
      if (currentUser) {
        authorized =
          currentUser.id === report.ownerId ||
          report.security.allowedEmails.some((allowed) => {
            if (allowed.startsWith('@'))
              return currentUser.email.toLowerCase().endsWith(allowed.toLowerCase());
            return currentUser.email.toLowerCase() === allowed.toLowerCase();
          });
      }
    }

    if (!authorized) {
      return res
        .status(401)
        .send('Não autorizado. Faça login para visualizar este relatório.');
    }

    let content = await resolveReportHtml(report);
    if (content === null) {
      return res.status(404).send('Arquivo HTML não encontrado');
    }

    // Record view count
    await recordReportView(report.id);

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
  })
);

// =================== HOSTED VIEW ROUTE (/r/:idOrSlug) ===================
// Serves the standalone hosted report page with responsive top bar and security barrier
app.get(
  '/r/:idOrSlug',
  wrap(async (req, res) => {
    const report = await getReportByIdOrSlug(req.params.idOrSlug);

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

    const currentUser = await authenticateUser(req);
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
  })
);

// =================== ERROR HANDLING ===================

// Async route rejections funnel here through wrap(). Without it an unhandled
// rejection would tear down the whole serverless invocation with no response.
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  console.error(`[api] ${req.method} ${req.originalUrl} falhou:`, err);
  if (res.headersSent) return;
  const wantsJson = req.originalUrl.startsWith('/api/');
  const message = 'Erro interno do servidor. Verifique a configuração do Firebase Admin.';
  if (wantsJson) {
    res.status(500).json({ error: message, detail: err.message });
  } else {
    res.status(500).send(message);
  }
});

// =================== BOOTSTRAP ===================

let bootstrapPromise: Promise<void> | null = null;

/**
 * Optional one-time seeding of the legacy demo account. Off by default: it has a
 * publicly known password, so it must be opted into with SEED_DEFAULT_USER=true.
 * Memoized so warm serverless containers do not re-query Firestore per request.
 */
export function bootstrap(): Promise<void> {
  if (process.env.SEED_DEFAULT_USER !== 'true') return Promise.resolve();
  if (!bootstrapPromise) {
    bootstrapPromise = ensureDefaultUser().catch((err) => {
      console.error('[bootstrap] Falha ao criar usuário padrão:', err);
    });
  }
  return bootstrapPromise;
}

export default app;
