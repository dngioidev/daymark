/** Wire format of the self-hosted sync API, shared by server.ts and the client. */

export interface SyncChange {
  key: string; // doc:<date> | note:<id> | settings
  /** The client's last synced version (null if the client never synced this entity). */
  base: unknown | null;
  /** The client's current version (null = deleted on the client). */
  value: unknown | null;
}

export interface SyncRequest {
  sinceRev: number;
  changes: SyncChange[];
}

export interface SyncEntity {
  key: string;
  rev: number;
  value: unknown | null; // null = deleted
}

export interface SyncResponse {
  rev: number;
  /** Every entity changed after sinceRev, plus the merged result of every pushed key. */
  entities: SyncEntity[];
  conflicts: string[];
}

export interface LoginRequest {
  username: string;
  password: string;
  deviceName: string;
  platform: string;
  /** Stable per-install id; a repeat sign-in from the same install replaces its old device entry. */
  installId?: string;
}

export interface LoginResponse {
  token: string;
  username: string;
  device: { id: string; name: string };
}

export const MAX_CHANGES_PER_SYNC = 5000;
