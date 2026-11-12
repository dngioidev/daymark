import fs from 'node:fs';
import path from 'node:path';

export class DataLockError extends Error {}

interface DataLock {
  owner: 'server' | 'stdio';
  pid: number;
  startedAt: string;
}

/** Excludes another server or stdio process from using the same data directory. */
export function acquireDataLock(dir: string, owner: 'server' | 'stdio'): () => void {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, 'daymark.lock');
  const contents = JSON.stringify({ owner, pid: process.pid, startedAt: new Date().toISOString() } satisfies DataLock);
  for (;;) {
    try {
      fs.writeFileSync(file, contents, { flag: 'wx', mode: 0o600 });
      break;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    }
    let existing: DataLock;
    try {
      existing = JSON.parse(fs.readFileSync(file, 'utf8')) as DataLock;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw err;
    }
    let dead = false;
    try {
      process.kill(existing.pid, 0);
    } catch (err) {
      dead = (err as NodeJS.ErrnoException).code === 'ESRCH';
    }
    if (!dead) {
      throw new DataLockError(`Daymark data in ${dir} is in use by the ${existing.owner} (pid ${existing.pid}). Stop it first.`);
    }
    try {
      fs.unlinkSync(file);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    try {
      if (fs.readFileSync(file, 'utf8') === contents) fs.unlinkSync(file);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  };
}
