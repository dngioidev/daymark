import crypto from 'node:crypto';

/** scrypt password hashing (Node built-in, no native dependency). */
export function hashPassword(password: string, salt = crypto.randomBytes(16).toString('hex')): { salt: string; hash: string } {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

export function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  const actual = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export interface TokenPayload {
  typ: 'access';
  sub: string; // username
  did: string; // device id
  ver: number; // token version; bumped on password change to revoke every token
  exp: number; // unix seconds
}

const b64url = (buf: Buffer | string) => Buffer.from(buf).toString('base64url');

/** Compact signed token: base64url(payload).base64url(HMAC-SHA256). */
export function signToken(payload: TokenPayload, secret: string): string {
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(crypto.createHmac('sha256', secret).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyToken(token: string, secret: string, now = Date.now()): TokenPayload | null {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', secret).update(body).digest();
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TokenPayload;
    if (payload.typ !== 'access' || typeof payload.exp !== 'number' || payload.exp * 1000 <= now) return null;
    return payload;
  } catch {
    return null;
  }
}

export function newRefreshToken(deviceId: string): string {
  return `${deviceId}.${crypto.randomBytes(32).toString('base64url')}`;
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = Object.create(null);
  for (const part of (header || '').split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    try {
      cookies[name] = decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      // Ignore malformed cookie values.
    }
  }
  return cookies;
}

/** Fixed-window limiter for failed logins, keyed by client IP. */
export class LoginRateLimiter {
  private attempts = new Map<string, { count: number; resetAt: number }>();
  constructor(
    private readonly maxFailures = 10,
    private readonly windowMs = 15 * 60 * 1000
  ) {}

  isBlocked(key: string, now = Date.now()): boolean {
    const entry = this.attempts.get(key);
    if (!entry || entry.resetAt <= now) return false;
    return entry.count >= this.maxFailures;
  }

  recordFailure(key: string, now = Date.now()): void {
    const entry = this.attempts.get(key);
    if (!entry || entry.resetAt <= now) this.attempts.set(key, { count: 1, resetAt: now + this.windowMs });
    else entry.count++;
  }

  reset(key: string): void {
    this.attempts.delete(key);
  }
}
