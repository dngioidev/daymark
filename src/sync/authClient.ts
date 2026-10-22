import { LoginRequest, LoginResponse, RefreshResponse, WEB_CLIENT_HEADER } from './protocol';
import { FetchLike, normalizeServerUrl, SyncHttpError } from './syncClient';

export type AuthMode = 'cookie' | 'body';

export class SessionEndedError extends Error {
  constructor() {
    super('This session has ended. Sign in again.');
  }
}

function authInit(mode: AuthMode, body?: unknown): RequestInit {
  return {
    method: 'POST',
    ...(mode === 'cookie' ? { credentials: 'same-origin' as const } : {}),
    headers: { 'Content-Type': 'application/json', ...(mode === 'cookie' ? { [WEB_CLIENT_HEADER]: 'web' } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  };
}

async function authRequest<T>(fetchFn: FetchLike, url: string, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetchFn(url, init);
  } catch {
    throw new SyncHttpError('Cannot reach the server. Check the address and your connection.', 0);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new SyncHttpError(data.error || `Server error (${response.status})`, response.status);
  return data as T;
}

export function signIn(fetchFn: FetchLike, serverUrl: string, mode: AuthMode, credentials: LoginRequest): Promise<LoginResponse> {
  return authRequest(fetchFn, `${normalizeServerUrl(serverUrl)}/api/auth/login`, authInit(mode, credentials));
}

interface AccessToken {
  accessToken: string;
  expiresAt: number;
}

interface TokenManagerOptions {
  fetchFn: FetchLike;
  serverUrl: string;
  mode: AuthMode;
  getRefreshToken: () => string | undefined;
  setRefreshToken: (t: string) => Promise<void> | void;
  onSessionEnded: () => void;
  onRefresh?: (session: RefreshResponse) => Promise<void> | void;
  locks?: LockManager | null;
  channel?: BroadcastChannel | null;
}

export class TokenManager {
  private token?: AccessToken;
  private pending?: Promise<string>;
  private ended = false;
  private closing = false;
  private readonly locks: LockManager | null;
  private readonly channel: BroadcastChannel | null;
  private readonly ownsChannel: boolean;
  private readonly serverUrl: string;
  private readonly storage: Storage | null;

  constructor(private readonly opts: TokenManagerOptions) {
    this.serverUrl = normalizeServerUrl(opts.serverUrl);
    this.locks = opts.locks === undefined ? (typeof navigator === 'undefined' ? null : navigator.locks ?? null) : opts.locks;
    try { this.storage = typeof localStorage === 'undefined' ? null : localStorage; }
    catch { this.storage = null; }
    this.ownsChannel = opts.channel === undefined && opts.mode === 'cookie' && typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined';
    this.channel = opts.channel === undefined ? (this.ownsChannel ? new BroadcastChannel('daymark-auth') : null) : opts.channel;
    this.channel?.addEventListener('message', this.onMessage);
  }

  private valid(token: AccessToken | undefined): token is AccessToken {
    return !!token && token.expiresAt - Date.now() > 60_000;
  }

  private onMessage = (event: MessageEvent) => {
    const data = event.data;
    if (!this.ended && !this.closing && data?.type === 'token' && typeof data.accessToken === 'string' &&
      typeof data.expiresAt === 'number' && this.valid(data)) {
      this.token = { accessToken: data.accessToken, expiresAt: data.expiresAt };
    }
    if (!this.ended && !this.closing && event.data?.type === 'need-token' && this.valid(this.token)) {
      this.channel?.postMessage({ type: 'token', ...this.token });
    }
  };

  private async withRefreshLock<T>(run: () => Promise<T>): Promise<T> {
    if (this.locks) return this.locks.request('daymark-refresh', run);
    const storage = this.storage;
    if (!storage) return run();
    const key = 'daymark_refresh_lock';
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const leaseMs = 10_000;
    const read = (): { id: string; until: number } | undefined => {
      try {
        const value = JSON.parse(storage.getItem(key) ?? 'null');
        if (typeof value?.id === 'string' && typeof value.until === 'number') return value;
      } catch { /* A malformed or unavailable entry cannot hold a lease. */ }
      return undefined;
    };
    const pause = () => new Promise((resolve) => setTimeout(resolve, 30 + Math.random() * 40));
    for (;;) {
      const held = read();
      if (!held || held.until <= Date.now()) {
        storage.setItem(key, JSON.stringify({ id, until: Date.now() + leaseMs }));
        // Give competing tabs time to publish their claim, then confirm ownership.
        await pause();
        if (read()?.id === id) break;
      }
      await pause();
    }
    // Keep a slow network request from outliving its lease in an active tab.
    const renew = setInterval(() => {
      if (read()?.id === id) storage.setItem(key, JSON.stringify({ id, until: Date.now() + leaseMs }));
    }, leaseMs / 3);
    try { return await run(); }
    finally {
      clearInterval(renew);
      if (read()?.id === id) storage.removeItem(key);
    }
  }

  private endSession() {
    this.token = undefined;
    if (this.ended) return;
    this.ended = true;
    this.channel?.removeEventListener('message', this.onMessage);
    if (this.ownsChannel) this.channel?.close();
    this.opts.onSessionEnded();
  }

  private peerToken(rejected?: AccessToken): Promise<AccessToken | undefined> {
    const channel = this.channel;
    if (!channel) return Promise.resolve(undefined);
    return new Promise((resolve) => {
      const finish = (token?: AccessToken) => {
        clearTimeout(timer);
        channel.removeEventListener('message', receive);
        resolve(token);
      };
      const receive = (event: MessageEvent) => {
        const data = event.data;
        if (data?.type === 'token' && typeof data.accessToken === 'string' && typeof data.expiresAt === 'number' &&
          this.valid(data) && data.accessToken !== rejected?.accessToken) {
          finish({ accessToken: data.accessToken, expiresAt: data.expiresAt });
        }
      };
      const timer = setTimeout(() => finish(), 300);
      channel.addEventListener('message', receive);
      channel.postMessage({ type: 'need-token' });
    });
  }

  getAccessToken(): Promise<string> {
    if (this.ended || this.closing) return Promise.reject(new SessionEndedError());
    if (this.valid(this.token)) return Promise.resolve(this.token.accessToken);
    return this.refresh();
  }

  private refresh(rejected?: AccessToken): Promise<string> {
    if (this.ended || this.closing) return Promise.reject(new SessionEndedError());
    if (this.pending) return this.pending;
    const run = async () => {
      if (this.ended) throw new SessionEndedError();
      if (this.valid(this.token) && this.token.accessToken !== rejected?.accessToken) return this.token.accessToken;
      const peer = await this.peerToken(rejected);
      if (peer) {
        this.token = peer;
        return peer.accessToken;
      }
      let data: RefreshResponse;
      try {
        data = await authRequest(this.opts.fetchFn, `${this.serverUrl}/api/auth/refresh`,
          authInit(this.opts.mode, this.opts.mode === 'body' ? { refreshToken: this.opts.getRefreshToken() } : undefined));
      } catch (error) {
        if (error instanceof SyncHttpError && error.status === 401) {
          this.endSession();
          throw new SessionEndedError();
        }
        throw error;
      }
      if (this.opts.mode === 'body' && data.refreshToken) await this.opts.setRefreshToken(data.refreshToken);
      await this.opts.onRefresh?.(data);
      this.token = { accessToken: data.accessToken, expiresAt: Date.now() + data.expiresIn * 1000 };
      this.channel?.postMessage({ type: 'token', ...this.token });
      return data.accessToken;
    };
    const operation = this.withRefreshLock(run);
    this.pending = operation.finally(() => { this.pending = undefined; });
    return this.pending;
  }

  async authFetch(path: string, init?: RequestInit): Promise<Response> {
    const send = (token: string) => {
      const headers = new Headers(init?.headers);
      headers.set('Authorization', `Bearer ${token}`);
      const { fetchFn } = this.opts;
      return fetchFn(`${this.serverUrl}${path}`, { ...init, headers });
    };
    const accessToken = await this.getAccessToken();
    const rejected = this.token;
    const response = await send(accessToken);
    if (response.status !== 401) return response;
    return send(await this.refresh(rejected));
  }

  async signOut(): Promise<void> {
    if (this.ended || this.closing) return;
    this.closing = true;
    // Wait for rotation before reading the credential used to revoke the session.
    await this.pending?.catch(() => undefined);
    const run = () => authRequest(this.opts.fetchFn, `${this.serverUrl}/api/auth/logout`,
      authInit(this.opts.mode, this.opts.mode === 'body' ? { refreshToken: this.opts.getRefreshToken() } : undefined));
    try {
      await this.withRefreshLock(run);
    } finally {
      this.endSession();
    }
  }
}
