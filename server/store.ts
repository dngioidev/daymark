import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { hashPassword } from './auth';

export interface AuthRecord {
  username: string;
  salt: string;
  hash: string;
  tokenVersion: number;
  secret: string;
}

export interface DeviceRecord {
  id: string;
  name: string;
  platform: string;
  createdAt: string;
  lastSyncAt: string | null;
  lastIp: string;
  revoked: boolean;
  /** Random id the app keeps per install, so signing in again reuses this record. */
  installId?: string;
}

export interface StoredEntity {
  rev: number;
  value: unknown | null; // null = deleted (tombstone)
  updatedBy: string;
  updatedAt: string;
}

export interface VaultRecord {
  rev: number;
  entities: Record<string, StoredEntity>;
}

export interface SyncLogEntry {
  id: string;
  timestamp: string;
  deviceId: string;
  deviceName: string;
  action: string;
  details: string;
}

const MAX_LOG_ENTRIES = 500;

/**
 * File-based persistence in DATA_DIR (single user, small data): auth.json, vault.json,
 * devices.json, sync-log.json. Writes are atomic (temp file + rename) and serialized.
 */
export class FileStore {
  auth!: AuthRecord;
  vault: VaultRecord = { rev: 0, entities: Object.create(null) };
  devices: DeviceRecord[] = [];
  log: SyncLogEntry[] = [];
  private queue: Promise<void> = Promise.resolve();

  constructor(readonly dir: string) {}

  private file(name: string) {
    return path.join(this.dir, name);
  }

  private read<T>(name: string, fallback: T): T {
    try {
      return JSON.parse(fs.readFileSync(this.file(name), 'utf8')) as T;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
      throw new Error(`Could not read ${this.file(name)}: ${(err as Error).message}`);
    }
  }

  /** Loads all files. Creates the admin account from `initialPassword` if none exists yet. */
  init(username: string, initialPassword: string | null): { createdAccount: boolean } {
    // Owner-only: auth.json holds the password hash and the token signing secret
    fs.mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    try {
      fs.chmodSync(this.dir, 0o700); // tighten a directory created earlier (no-op on Windows)
    } catch {
      // not permitted on some volume types; the file modes below still apply
    }
    const auth = this.read<AuthRecord | null>('auth.json', null);
    let createdAccount = false;
    if (auth) {
      this.auth = auth;
    } else {
      if (!initialPassword) {
        throw new Error('No admin account yet: set DAYMARK_PASSWORD for the first start.');
      }
      const { salt, hash } = hashPassword(initialPassword);
      this.auth = { username, salt, hash, tokenVersion: 1, secret: crypto.randomBytes(32).toString('hex') };
      this.writeNow('auth.json', this.auth);
      createdAccount = true;
    }
    const vault = this.read<VaultRecord>('vault.json', { rev: 0, entities: {} });
    this.vault = { rev: vault.rev, entities: Object.assign(Object.create(null), vault.entities) };
    this.devices = this.read<DeviceRecord[]>('devices.json', []);
    this.log = this.read<SyncLogEntry[]>('sync-log.json', []);
    return { createdAccount };
  }

  private writeNow(name: string, data: unknown) {
    const target = this.file(name);
    const tmp = `${target}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data), { mode: 0o600 });
    fs.renameSync(tmp, target);
  }

  /** Queues an atomic write of the named file(s); resolves when written. */
  persist(...names: Array<'auth.json' | 'vault.json' | 'devices.json' | 'sync-log.json'>): Promise<void> {
    const snapshot = names.map((n) => [n, this.dataFor(n)] as const);
    this.queue = this.queue.then(() => {
      for (const [n, data] of snapshot) this.writeNow(n, data);
    });
    return this.queue;
  }

  private dataFor(name: string): unknown {
    switch (name) {
      case 'auth.json':
        return this.auth;
      case 'vault.json':
        return { rev: this.vault.rev, entities: { ...this.vault.entities } };
      case 'devices.json':
        return this.devices;
      default:
        return this.log;
    }
  }

  addLog(entry: Omit<SyncLogEntry, 'id' | 'timestamp'>): void {
    this.log.unshift({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), ...entry });
    if (this.log.length > MAX_LOG_ENTRIES) this.log.length = MAX_LOG_ENTRIES;
  }
}
