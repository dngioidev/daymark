import path from 'node:path';

export interface ServerConfig {
  port: number;
  dataDir: string;
  production: boolean;
  trustProxy: string;
  username: string;
  /** Only used to create the admin account on first start; afterwards data/auth.json is authoritative. */
  initialPassword: string | null;
  /** Allowed browser origins for the API ('*' = any; data routes use bearer tokens; same-origin web auth uses cookies). */
  corsOrigins: '*' | string[];
  accessTtlSeconds: number;
  refreshTtlDays: number;
}

const WEAK_PASSWORDS = new Set(['daymark2026', 'admin', 'password', 'change-me-before-deploying', '12345678']);
export const DEV_DEFAULT_PASSWORD = 'daymark-dev';
export const MIN_PASSWORD_LENGTH = 8;

/** Vite's default secret exclusions plus both the default and configured vault directories. */
export function devFileDeny(dataDir: string): string[] {
  return ['.env*', '*.{crt,pem,key,p12,pfx,cer,der}', '.npmrc', '.yarnrc.yml', '**/.git/**',
    '**/data/**', `${path.resolve(dataDir).replace(/\\/g, '/')}/**`];
}

export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `must be at least ${MIN_PASSWORD_LENGTH} characters`;
  if (WEAK_PASSWORDS.has(password.toLowerCase())) return 'is a known default; choose your own';
  return null;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const production = env.NODE_ENV === 'production';
  const origins = (env.DAYMARK_CORS_ORIGINS ?? '*').trim();
  const refreshTtlDays = Number(env.DAYMARK_REFRESH_TTL_DAYS);
  return {
    port: Number(env.PORT) || 3000,
    dataDir: path.resolve(env.DATA_DIR || 'data'),
    production,
    trustProxy: env.DAYMARK_TRUST_PROXY?.trim() || 'loopback',
    username: (env.DAYMARK_USER || 'admin').trim(),
    initialPassword: env.DAYMARK_PASSWORD || (production ? null : DEV_DEFAULT_PASSWORD),
    corsOrigins: origins === '*' ? '*' : origins.split(',').map((o) => o.trim()).filter(Boolean),
    accessTtlSeconds: 900,
    refreshTtlDays: Number.isFinite(refreshTtlDays) && refreshTtlDays > 0 ? refreshTtlDays : 30,
  };
}
