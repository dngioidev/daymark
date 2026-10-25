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
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });
  router.get('/', (_req, res) => {
    if (!fs.existsSync(directory)) return res.json([]);
    const metas: NoteAssetMeta[] = [];
    for (const name of fs.readdirSync(directory)) {
      if (!/^[a-f0-9]{64}\.json$/.test(name) || !fs.existsSync(file(name.slice(0, -5)))) continue;
      try {
        const meta = JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8')) as NoteAssetMeta;
        if (meta && meta.id === name.slice(0, -5) && ['image/webp', 'image/jpeg', 'image/png'].includes(meta.mime) &&
          Number.isFinite(meta.bytes) && meta.bytes > 0 && Number.isFinite(meta.width) && meta.width >= 0 &&
          Number.isFinite(meta.height) && meta.height >= 0 && typeof meta.createdAt === 'string') metas.push(meta);
      } catch {
        // A damaged or unreadable metadata file must not hide healthy pictures.
      }
    }
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
    // Repeated uploads preserve metadata, including the original creation time.
    if (!fs.existsSync(file(id)) || !fs.existsSync(file(`${id}.json`))) {
      const meta: NoteAssetMeta = { id, mime, width: 0, height: 0, bytes: bytes.length, createdAt: new Date().toISOString() };
      writeAtomic(file(id), bytes);
      writeAtomic(file(`${id}.json`), JSON.stringify(meta));
    }
    res.json({ ok: true });
  });
  router.get('/:id', (req, res) => {
    const id = req.params.id;
    if (!fs.existsSync(file(id)) || !fs.existsSync(file(`${id}.json`))) return res.status(404).json({ error: 'Picture not found.' });
    const meta = JSON.parse(fs.readFileSync(file(`${id}.json`), 'utf8')) as NoteAssetMeta;
    res.type(meta.mime).send(fs.readFileSync(file(id)));
  });
  router.delete('/:id', (req, res) => {
    fs.rmSync(file(req.params.id), { force: true });
    fs.rmSync(file(`${req.params.id}.json`), { force: true });
    res.json({ ok: true });
  });
  return router;
}
