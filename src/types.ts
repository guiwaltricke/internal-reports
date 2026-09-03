export type AccessType = 'authenticated_only' | 'email_whitelist' | 'password_protected' | 'public_link';

export type ExpirationDuration = 'never' | '24h' | '7d' | '30d';

export interface SecuritySettings {
  accessType: AccessType;
  password?: string;
  allowedEmails: string[];
  expiresAt: string | null; // ISO string or null
  active: boolean;
  showWatermark: boolean;
  allowDownload: boolean;
  allowPrint: boolean;
}

export interface Report {
  id: string;
  slug: string;
  title: string;
  description?: string;
  ownerId: string;
  ownerEmail: string;
  ownerName: string;
  isOwner?: boolean;
  fileSize: number; // in bytes
  createdAt: string;
  updatedAt: string;
  viewsCount: number;
  lastViewedAt?: string;
  security: SecuritySettings;
  tags?: string[];
  htmlContent?: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  photoURL?: string;
  role?: 'admin' | 'member';
  createdAt: string;
  avatarColor?: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
}

export interface SampleReportTemplate {
  id: string;
  title: string;
  description: string;
  category: string;
  badge: string;
  html: string;
}
