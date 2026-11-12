import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { AuditAction, AuditEntry } from '../../src/sync/mcpProtocol';

const DAY_FILE = /^\d{4}-\d{2}-\d{2}\.jsonl$/;
const ACTIONS: readonly AuditAction[] = [
  'read', 'search', 'create', 'update', 'complete', 'delete',
  'refused', 'error', 'connect', 'refresh', 'revoke',
];

function isAuditEntry(value: unknown): value is AuditEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.id === 'string'
    && typeof entry.at === 'string' && Number.isFinite(Date.parse(entry.at))
    && typeof entry.connectionId === 'string'
    && typeof entry.connectionName === 'string'
    && typeof entry.tool === 'string'
    && ACTIONS.includes(entry.action as AuditAction)
    && Array.isArray(entry.targets)
    && entry.targets.every(target => target && typeof target === 'object'
      && typeof target.key === 'string'
      && (target.title === undefined || typeof target.title === 'string'))
    && (entry.count === undefined || typeof entry.count === 'number')
    && (entry.message === undefined || typeof entry.message === 'string');
}

/** Daily UTC audit files, with owner-only creation and serialized appends. */
export class AuditLog {
  private chain: Promise<void> = Promise.resolve();

  constructor(private readonly dir: string) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  append(entry: Omit<AuditEntry, 'id' | 'at'>, now = new Date()): Promise<void> {
    const at = now.toISOString();
    const line = `${JSON.stringify({ ...entry, id: crypto.randomUUID(), at })}\n`;
    const job = () => {
      fs.appendFileSync(path.join(this.dir, `${at.slice(0, 10)}.jsonl`), line, { mode: 0o600 });
    };
    const run = this.chain.then(job);
    this.chain = run.catch(() => {});
    return run;
  }

  async list(filter: { connectionId?: string; action?: AuditAction; limit?: number } = {}): Promise<AuditEntry[]> {
    await this.chain;
    const entries: AuditEntry[] = [];
    for (const file of this.dayFiles().sort()) {
      for (const line of fs.readFileSync(path.join(this.dir, file), 'utf8').split('\n')) {
        let entry: unknown;
        try { entry = JSON.parse(line); } catch { continue; }
        if (!isAuditEntry(entry)) continue;
        if (filter.connectionId !== undefined && entry.connectionId !== filter.connectionId) continue;
        if (filter.action !== undefined && entry.action !== filter.action) continue;
        entries.push(entry);
      }
    }
    // Reverse first so entries with the same timestamp retain newest append order.
    entries.reverse().sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    return entries.slice(0, Math.max(0, Math.min(filter.limit ?? 200, 1000)));
  }

  async prune(retentionDays: number, now = new Date()): Promise<number> {
    await this.chain;
    const cutoff = new Date(now);
    cutoff.setUTCDate(cutoff.getUTCDate() - retentionDays);
    const oldestDay = cutoff.toISOString().slice(0, 10);
    let removed = 0;
    for (const file of this.dayFiles()) {
      if (file.slice(0, 10) < oldestDay) {
        fs.unlinkSync(path.join(this.dir, file));
        removed++;
      }
    }
    return removed;
  }

  private dayFiles(): string[] {
    return fs.readdirSync(this.dir, { withFileTypes: true })
      .filter(file => file.isFile() && DAY_FILE.test(file.name))
      .map(file => file.name);
  }
}
