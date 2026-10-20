import path from 'node:path';

export interface ServerConfig {
  port: number;
  dataDir: string;
  production: boolean;
  username: string;
  /** Only used to create the admin account on first start; afterwards data/auth.json is authoritative. */
  initialPassword: string | null;
  /** Allowed browser origins for the API ('*' = any; auth is by bearer token, not cookies). */
  corsOrigins: '*' | string[];
  tokenTtlDays: number;
}

const WEAK_PASSWORDS = new Set(['daymark2026', 'admin', 'password', 'change-me-before-deploying', '12345678']);
export const DEV_DEFAULT_PASSWORD = 'daymark-dev';
export const MIN_PASSWORD_LENGTH = 8;

export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `must be at least ${MIN_PASSWORD_LENGTH} characters`;
  if (WEAK_PASSWORDS.has(password.toLowerCase())) return 'is a known default; choose your own';
  return null;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const production = env.NODE_ENV === 'production';
  const origins = (env.DAYMARK_CORS_ORIGINS ?? '*').trim();
  return {
    port: Number(env.PORT) || 3000,
    dataDir: path.resolve(env.DATA_DIR || 'data'),
    production,
    username: (env.DAYMARK_USER || 'admin').trim(),
    initialPassword: env.DAYMARK_PASSWORD || (production ? null : DEV_DEFAULT_PASSWORD),
    corsOrigins: origins === '*' ? '*' : origins.split(',').map((o) => o.trim()).filter(Boolean),
    tokenTtlDays: Number(env.DAYMARK_TOKEN_TTL_DAYS) || 90,
  };
}
