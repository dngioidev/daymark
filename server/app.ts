import crypto from 'node:crypto';
import express, { NextFunction, Request, Response } from 'express';
import { isDailyDocument, isStandaloneNote, isSyncedSettings } from '../src/utils/vaultValidation';
import { isValidEntityKey, mergeEntity, sameValue } from '../src/sync/merge';
import { LoginRequest, MAX_CHANGES_PER_SYNC, SyncEntity, SyncRequest, SyncResponse } from '../src/sync/protocol';
import { hashPassword, LoginRateLimiter, signToken, TokenPayload, verifyPassword, verifyToken } from './auth';
import { passwordProblem, ServerConfig } from './config';
import { DeviceRecord, FileStore } from './store';

export const SERVER_VERSION = '2.0.0';

type AuthedRequest = Request & { auth: TokenPayload; device: DeviceRecord };
const authed = (req: Request) => req as unknown as AuthedRequest;

/**
 * Builds the REST API (no listening, no static files) so it can be tested in-process.
 * Every /api route except /api/health and /api/auth/login requires a bearer token.
 */
export function createApp(config: ServerConfig, store: FileStore) {
  const app = express();
  const limiter = new LoginRateLimiter();
  // Serialize sync requests so concurrent devices merge against a consistent state
  let syncQueue: Promise<unknown> = Promise.resolve();

  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback'); // honour X-Forwarded-For from a local reverse proxy
  app.use('/api', express.json({ limit: '25mb' }));

  // CORS: the Android app and PWAs on other origins call the API directly
  app.use('/api', (req, res, next) => {
    const origin = req.headers.origin;
    if (origin && (config.corsOrigins === '*' || config.corsOrigins.includes(origin))) {
      res.setHeader('Access-Control-Allow-Origin', config.corsOrigins === '*' ? '*' : origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      res.setHeader('Access-Control-Max-Age', '600');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  const issueToken = (deviceId: string) =>
    signToken(
      {
        sub: store.auth.username,
        did: deviceId,
        ver: store.auth.tokenVersion,
        exp: Math.floor(Date.now() / 1000) + config.tokenTtlDays * 86400,
      },
      store.auth.secret
    );

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'Daymark sync server', version: SERVER_VERSION });
  });

  app.post('/api/auth/login', async (req, res) => {
    const ip = req.ip || 'unknown';
    if (limiter.isBlocked(ip)) {
      return res.status(429).json({ error: 'Too many failed sign-in attempts. Try again in 15 minutes.' });
    }
    const body = (req.body ?? {}) as Partial<LoginRequest>;
    const ok =
      typeof body.username === 'string' &&
      typeof body.password === 'string' &&
      body.username === store.auth.username &&
      verifyPassword(body.password, store.auth.salt, store.auth.hash);
    if (!ok) {
      limiter.recordFailure(ip);
      return res.status(401).json({ error: 'Wrong username or password.' });
    }
    limiter.reset(ip);
    const installId = typeof body.installId === 'string' && /^[\w-]{8,64}$/.test(body.installId) ? body.installId : undefined;
    const name = String(body.deviceName || 'Unnamed device').slice(0, 80);
    const platform = String(body.platform || 'web').slice(0, 20);
    // Signing in again from the same install reuses its entry instead of adding a duplicate
    const existing = installId ? store.devices.find((d) => d.installId === installId && !d.revoked) : undefined;
    const device: DeviceRecord = existing ?? {
      id: `dev-${crypto.randomUUID()}`,
      name,
      platform,
      createdAt: new Date().toISOString(),
      lastSyncAt: null,
      lastIp: ip,
      revoked: false,
      installId,
    };
    if (existing) Object.assign(existing, { name, platform, lastIp: ip });
    else store.devices.push(device);
    store.addLog({ deviceId: device.id, deviceName: device.name, action: 'device_connected', details: `Signed in (${device.platform})` });
    await store.persist('devices.json', 'sync-log.json');
    res.json({ token: issueToken(device.id), username: store.auth.username, device: { id: device.id, name: device.name } });
  });

  // ---- authenticated routes ----
  app.use('/api', (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const payload = token ? verifyToken(token, store.auth.secret) : null;
    const device = payload ? store.devices.find((d) => d.id === payload.did) : undefined;
    if (!payload || payload.ver !== store.auth.tokenVersion || payload.sub !== store.auth.username || !device || device.revoked) {
      return res.status(401).json({ error: 'Not signed in, or this device was disconnected.' });
    }
    authed(req).auth = payload;
    authed(req).device = device;
    next();
  });

  app.get('/api/auth/session', (req, res) => {
    const { device } = authed(req);
    res.json({ username: store.auth.username, device: { id: device.id, name: device.name } });
  });

  app.post('/api/auth/change-password', async (req, res) => {
    const { currentPassword, newPassword } = (req.body ?? {}) as { currentPassword?: string; newPassword?: string };
    if (typeof currentPassword !== 'string' || !verifyPassword(currentPassword, store.auth.salt, store.auth.hash)) {
      return res.status(401).json({ error: 'Current password is wrong.' });
    }
    const problem = typeof newPassword === 'string' ? passwordProblem(newPassword) : 'is required';
    if (problem) return res.status(400).json({ error: `New password ${problem}.` });
    const { salt, hash } = hashPassword(newPassword as string);
    // Bumping the version signs out every other device; this one gets a fresh token
    store.auth = { ...store.auth, salt, hash, tokenVersion: store.auth.tokenVersion + 1 };
    const { device } = authed(req);
    store.addLog({ deviceId: device.id, deviceName: device.name, action: 'password_changed', details: 'All other devices were signed out' });
    await store.persist('auth.json', 'sync-log.json');
    res.json({ token: issueToken(device.id) });
  });

  app.get('/api/devices', (req, res) => {
    const { device } = authed(req);
    res.json({
      devices: store.devices.filter((d) => !d.revoked).map((d) => ({ ...d, current: d.id === device.id })),
    });
  });

  app.delete('/api/devices/:id', async (req, res) => {
    const target = store.devices.find((d) => d.id === req.params.id && !d.revoked);
    if (!target) return res.status(404).json({ error: 'Device not found.' });
    target.revoked = true;
    const { device } = authed(req);
    store.addLog({ deviceId: device.id, deviceName: device.name, action: 'device_disconnected', details: `Disconnected "${target.name}"` });
    await store.persist('devices.json', 'sync-log.json');
    res.json({ ok: true });
  });

  app.get('/api/server/stats', (_req, res) => {
    const live = Object.entries(store.vault.entities).filter(([, e]) => e.value !== null);
    res.json({
      version: SERVER_VERSION,
      rev: store.vault.rev,
      dailyNotes: live.filter(([k]) => k.startsWith('doc:')).length,
      notes: live.filter(([k]) => k.startsWith('note:')).length,
      devices: store.devices.filter((d) => !d.revoked).length,
      lastSyncAt: store.devices.reduce<string | null>((max, d) => (d.lastSyncAt && (!max || d.lastSyncAt > max) ? d.lastSyncAt : max), null),
    });
  });

  app.get('/api/sync/log', (_req, res) => {
    res.json({ entries: store.log.slice(0, 100) });
  });

  /** Shape check for a sync value against its entity key. */
  const validValue = (key: string, value: unknown): boolean => {
    if (key.startsWith('doc:')) return isDailyDocument(value) && value.date === key.slice(4);
    if (key.startsWith('note:')) return isStandaloneNote(value) && value.id === key.slice(5);
    return isSyncedSettings(value);
  };

  const runSync = (req: Request, res: Response, body: SyncRequest) => {
    const job = syncQueue.then(async () => {
      const { device } = authed(req);
      const sinceRev = Number.isInteger(body.sinceRev) && body.sinceRev >= 0 ? body.sinceRev : 0;
      const changes = Array.isArray(body.changes) ? body.changes : [];
      if (changes.length > MAX_CHANGES_PER_SYNC) {
        return res.status(413).json({ error: `Too many changes in one sync (max ${MAX_CHANGES_PER_SYNC}).` });
      }
      if (changes.some((c) => !c || !isValidEntityKey(c.key))) {
        return res.status(400).json({ error: 'Invalid entity key in sync request.' });
      }
      const invalid = changes.find((c) => c.value !== null && c.value !== undefined && !validValue(c.key, c.value));
      if (invalid) {
        return res.status(400).json({ error: `Invalid value for ${invalid.key}.` });
      }

      const conflicts: string[] = [];
      const touched = new Set<string>();
      const now = new Date().toISOString();
      const write = (key: string, value: unknown | null) => {
        store.vault.rev += 1;
        store.vault.entities[key] = { rev: store.vault.rev, value, updatedBy: device.id, updatedAt: now };
      };

      for (const change of changes) {
        const stored = store.vault.entities[change.key]?.value ?? null;
        // A corrupt stored entity is treated as absent so a valid push can repair it.
        const current = stored !== null && !validValue(change.key, stored) ? null : stored;
        const merged = mergeEntity(change.key, change.base ?? null, current, change.value ?? null);
        conflicts.push(...merged.conflicts);
        if (!sameValue(merged.value, current)) write(change.key, merged.value);
        for (const extra of merged.extraNotes ?? []) {
          write(`note:${extra.id}`, extra);
          touched.add(`note:${extra.id}`);
        }
        touched.add(change.key);
      }

      const entities: SyncEntity[] = Object.entries(store.vault.entities)
        .filter(([key, e]) => e.rev > sinceRev || touched.has(key))
        // Keep damaged legacy entries available for repair, but never send them to another device.
        .filter(([key, e]) => e.value === null || validValue(key, e.value))
        .map(([key, e]) => ({ key, rev: e.rev, value: e.value }));

      device.lastSyncAt = now;
      device.lastIp = req.ip || device.lastIp;
      if (changes.length > 0 || conflicts.length > 0) {
        store.addLog({
          deviceId: device.id,
          deviceName: device.name,
          action: conflicts.length ? 'sync_with_conflicts' : 'sync',
          details: `Pushed ${changes.length} change(s), received ${entities.length}${conflicts.length ? `; ${conflicts.length} conflict(s) resolved` : ''}`,
        });
      }
      await store.persist('vault.json', 'devices.json', 'sync-log.json');
      const response: SyncResponse = { rev: store.vault.rev, entities, conflicts };
      res.json(response);
    });
    syncQueue = job.catch(() => undefined);
    return job;
  };

  app.post('/api/sync', (req, res, next) => {
    runSync(req, res, (req.body ?? {}) as SyncRequest).catch(next);
  });

  app.get('/api/sync', (req, res, next) => {
    runSync(req, res, { sinceRev: Number(req.query.since) || 0, changes: [] }).catch(next);
  });

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Unknown API route.' }));

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error & { type?: string }, _req: Request, res: Response, _next: NextFunction) => {
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large.' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON.' });
    console.error(err);
    res.status(500).json({ error: 'Internal server error.' });
  });

  return app;
}
