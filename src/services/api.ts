import { Report, User } from '../types';

const TOKEN_KEY = 'hostreport_token';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

function getHeaders(customHeaders: Record<string, string> = {}): HeadersInit {
  const token = getStoredToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...customHeaders,
  };
}

export const api = {
  // Auth
  async getCurrentUser(): Promise<User | null> {
    try {
      const res = await fetch('/api/auth/me', { headers: getHeaders() });
      if (!res.ok) return null;
      const data = await res.json();
      return data.user;
    } catch {
      return null;
    }
  },

  async login(email: string, password: string): Promise<{ user: User; token: string }> {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Falha no login');
    setStoredToken(data.token);
    return data;
  },

  async register(name: string, email: string, password: string): Promise<{ user: User; token: string }> {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Falha no cadastro');
    setStoredToken(data.token);
    return data;
  },

  async syncGoogleUser(user: User, idToken: string): Promise<{ user: User; token: string }> {
    const res = await fetch('/api/auth/google-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user, idToken }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Falha na autenticação corporativa Next Fit');
    setStoredToken(data.token);
    return data;
  },

  async logout(): Promise<void> {
    try {
      await fetch('/api/auth/logout', { method: 'POST', headers: getHeaders() });
    } finally {
      setStoredToken(null);
    }
  },

  // Reports
  async getReports(): Promise<{ reports: Report[]; currentUser: { id: string; email: string } | null }> {
    const res = await fetch('/api/reports', { headers: getHeaders() });
    if (!res.ok) throw new Error('Erro ao listar relatórios');
    return res.json();
  },

  async getReport(id: string): Promise<Report> {
    const res = await fetch(`/api/reports/${id}`, { headers: getHeaders() });
    if (!res.ok) throw new Error('Erro ao carregar relatório');
    const data = await res.json();
    return data.report;
  },

  async createReport(payload: {
    title: string;
    description?: string;
    htmlContent: string;
    slug?: string;
    security: Report['security'];
    tags?: string[];
  }): Promise<Report> {
    const res = await fetch('/api/reports', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao publicar relatório');
    return data.report;
  },

  async updateReport(
    id: string,
    payload: {
      title?: string;
      description?: string;
      security?: Partial<Report['security']>;
      tags?: string[];
      htmlContent?: string;
    }
  ): Promise<Report> {
    const res = await fetch(`/api/reports/${id}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao atualizar relatório');
    return data.report;
  },

  async deleteReport(id: string): Promise<void> {
    const res = await fetch(`/api/reports/${id}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error('Erro ao excluir relatório');
  },
};
