import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import type { NoteAssetMeta } from '../src/types/daymark';

const MAX_BYTES = 1.5 * 1024 * 1024;
const validId = (id: string) => /^[a-f0-9]{64}$/.test(id);

/** Publish complete files with owner-only permissions, matching FileStore. */
function writeAtomic(target: string, data: string | Buffer): void {
  const temporary = `${target}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, data, { mode: 0o600 });
    fs.renameSync(temporary, target);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

/** Mounted after the API's bearer/device authentication middleware. */
export function assetRoutes(dataDir: string): Router {
  const router = Router();
  const directory = path.join(dataDir, 'assets');
  const file = (id: string) => path.join(directory, id);
  const inventoryCache = new Map<string, { signature: string; meta: NoteAssetMeta | null }>();
  const signature = (id: string): string | null => {
    try {
      const picture = fs.statSync(file(id));
      const metadata = fs.statSync(file(`${id}.json`));
      return `${picture.mtimeMs}:${picture.size}:${metadata.mtimeMs}:${metadata.size}`;
    } catch {
      return null;
    }
  };
  // Inventory and downloads must agree about which files are safe. Omitting a
  // damaged file also lets an owning device discover it and re-upload its copy.
  const readAsset = (id: string): { meta: NoteAssetMeta; bytes: Buffer } | null => {
    try {
      const meta = JSON.parse(fs.readFileSync(file(`${id}.json`), 'utf8')) as NoteAssetMeta;
      if (!meta || meta.id !== id || !['image/webp', 'image/jpeg', 'image/png'].includes(meta.mime) ||
        !Number.isFinite(meta.bytes) || meta.bytes <= 0 || meta.bytes > MAX_BYTES ||
        !Number.isFinite(meta.width) || meta.width < 0 || !Number.isFinite(meta.height) || meta.height < 0 ||
        typeof meta.createdAt !== 'string') return null;
      const bytes = fs.readFileSync(file(id));
      if (bytes.length !== meta.bytes || createHash('sha256').update(bytes).digest('hex') !== id) return null;
      return { meta, bytes };
    } catch {
      // Missing, damaged or unreadable files are isolated to this picture.
      return null;
    }
  };
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });
  router.get('/', (_req, res) => {
    if (!fs.existsSync(directory)) {
      inventoryCache.clear();
      return res.json([]);
    }
    const metas: NoteAssetMeta[] = [];
    const present = new Set<string>();
    for (const name of fs.readdirSync(directory)) {
      if (!/^[a-f0-9]{64}\.json$/.test(name)) continue;
      const id = name.slice(0, -5);
      const current = signature(id);
      if (current === null) continue;
      present.add(id);
      let cached = inventoryCache.get(id);
      if (!cached || cached.signature !== current) {
        // Cache failures too: unchanged damaged files need no repeated reads/hash.
        cached = { signature: current, meta: readAsset(id)?.meta ?? null };
        inventoryCache.set(id, cached);
      }
      if (cached.meta) metas.push(cached.meta);
    }
    for (const id of inventoryCache.keys()) if (!present.has(id)) inventoryCache.delete(id);
    res.json(metas);
  });
  router.use('/:id', (req, res, next) => {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Invalid picture id.' });
    next();
  });
  router.put('/:id', (req, res) => {
    const id = req.params.id;
    const { mime, data } = req.body ?? {};
    if (!['image/webp', 'image/jpeg', 'image/png'].includes(mime) || typeof data !== 'string') {
      return res.status(400).json({ error: 'Expected a picture mime and base64 data.' });
    }
    if (data.length > Math.ceil(MAX_BYTES / 3) * 4) return res.status(413).json({ error: 'Picture exceeds 1.5 MB.' });
    const bytes = Buffer.from(data, 'base64');
    if (bytes.length > MAX_BYTES) return res.status(413).json({ error: 'Picture exceeds 1.5 MB.' });
    if (!bytes.length || bytes.toString('base64') !== data) return res.status(400).json({ error: 'Invalid base64 picture.' });
    if (createHash('sha256').update(bytes).digest('hex') !== id) return res.status(400).json({ error: 'Picture hash does not match its id.' });
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    try { fs.chmodSync(directory, 0o700); } catch {
      // Some volumes cannot tighten existing directory permissions (as in FileStore).
    }
    // Synchronous writes keep a PUT/DELETE pair indivisible within this server process.
    // Healthy repeated uploads preserve metadata; damaged files are repaired.
    inventoryCache.delete(id);
    if (!readAsset(id)) {
      const meta: NoteAssetMeta = { id, mime, width: 0, height: 0, bytes: bytes.length, createdAt: new Date().toISOString() };
      writeAtomic(file(id), bytes);
      writeAtomic(file(`${id}.json`), JSON.stringify(meta));
    }
    res.json({ ok: true });
  });
  router.get('/:id', (req, res) => {
    const id = req.params.id;
    const asset = readAsset(id);
    if (!asset) {
      inventoryCache.delete(id);
      return res.status(404).json({ error: 'Picture not found.' });
    }
    const { meta, bytes } = asset;
    if (req.query.format === 'base64') return res.json({ id, mime: meta.mime, data: bytes.toString('base64') });
    res.type(meta.mime).send(bytes);
  });
  router.delete('/:id', (req, res) => {
    inventoryCache.delete(req.params.id);
    fs.rmSync(file(req.params.id), { force: true });
    fs.rmSync(file(`${req.params.id}.json`), { force: true });
    res.json({ ok: true });
  });
  return router;
}
