/** Wire format of the self-hosted sync API, shared by server.ts and the client. */

export interface SyncChange {
  key: string; // doc:<date> | note:<id> | settings | habits | habitday:<date>
  /** The client's last synced version (null if the client never synced this entity). */
  base: unknown | null;
  /** The client's current version (null = deleted on the client). */
  value: unknown | null;
}

export interface SyncRequest {
  features?: string[];
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
  accessToken: string;
  expiresIn: number;
  username: string;
  device: { id: string; name: string };
  refreshToken?: string;
}

export type RefreshResponse = LoginResponse;
export const WEB_CLIENT_HEADER = 'X-Daymark-Client';
export const REFRESH_COOKIE = 'daymark_refresh';
export const SIGNED_IN_COOKIE = 'daymark_signed_in';

export const MAX_CHANGES_PER_SYNC = 5000;
