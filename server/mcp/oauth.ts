import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import { InvalidGrantError, InvalidTargetError, InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import type { AuthorizationParams, OAuthServerProvider } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { OAuthClientInformationFull, OAuthTokenRevocationRequest, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
import { NO_GRANTS } from '../../src/sync/mcpProtocol';
import type { AuditEntry, McpAccess, McpGrants } from '../../src/sync/mcpProtocol';
import { hashRefreshToken, LoginRateLimiter, newRefreshToken, signMcpToken, verifyMcpToken, verifyPassword } from '../auth';
import type { ServerConfig } from '../config';
import type { FileStore } from '../store';
import type { AuditLog } from './audit';
import { renderConsentPage } from './consentPage';
import type { McpStore } from './mcpStore';
import { knownFolders, knownHeadings, todayIn } from './vaultView';

const TTL_MS = 10 * 60 * 1000;
const ACCESS_TTL_SECONDS = 900;
const MAX_RETIRED = 50;
const MAX_PENDING = 200;
const MAX_LIST = 200;
const REVOKED_AUDIT_MS = 60_000;

interface PendingRequest {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state?: string;
  resource?: string;
  /** Set once the owner's password was accepted for this request; only then may a connection be created. */
  verified: boolean;
  name?: string;
  expiresAt: number;
}

interface IssuedCode {
  connectionId: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  expiresAt: number;
}

const randomId = () => crypto.randomBytes(32).toString('base64url');
const asList = (value: unknown): string[] => {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
  return raw.filter((v): v is string => typeof v === 'string' && v.length <= 300).slice(0, MAX_LIST);
};
const form = (value: unknown): string => (typeof value === 'string' ? value : '');

/** Daymark is its own OAuth 2.1 authorization server; the owner's password is the only credential. */
export class DaymarkOAuthProvider implements OAuthServerProvider {
  private readonly pending = new Map<string, PendingRequest>();
  private readonly codes = new Map<string, IssuedCode>();
  /** Codes whose PKCE challenge was served; the exchange consumes them, and a failed verifier leaves them unusable. */
  private readonly claimed = new Map<string, IssuedCode>();
  private readonly revokedAudited = new Map<string, number>();

  constructor(private readonly deps: { config: ServerConfig; store: FileStore; mcp: McpStore; audit: AuditLog; limiter: LoginRateLimiter }) {}

  get clientsStore(): OAuthRegisteredClientsStore {
    const { mcp } = this.deps;
    return {
      getClient: (clientId) => mcp.clients[clientId],
      registerClient: async (client) => {
        const full = client as OAuthClientInformationFull;
        mcp.pruneClients();
        mcp.clients[full.client_id] = { ...full, client_id_issued_at: full.client_id_issued_at ?? Math.floor(Date.now() / 1000) };
        await mcp.persist();
        return mcp.clients[full.client_id];
      },
    };
  }

  private today(): string {
    const { mcp, config } = this.deps;
    return todayIn(mcp.effectiveTimezone(config.timezone), new Date());
  }

  /** Step 1 (password) carries no vault data; the scope step lists headings and folders and is only built for a verified request. */
  private page(requestId: string, request: PendingRequest, clientName: string, error?: string, name?: string): string {
    const { store } = this.deps;
    const redirectHost = new URL(request.redirectUri).host;
    if (!request.verified) return renderConsentPage({ requestId, clientName, redirectHost, step: 'password', error, name });
    return renderConsentPage({
      requestId, clientName, redirectHost, step: 'scope', error,
      headings: knownHeadings(store, this.today()),
      folders: knownFolders(store),
    });
  }

  private sendPage(res: Response, status: number, html: string): void {
    res.status(status)
      .set({
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Frame-Options': 'DENY',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
      })
      .send(html);
  }

  private purge(now = Date.now()): void {
    for (const [id, p] of this.pending) if (p.expiresAt <= now) this.pending.delete(id);
    for (const [id, c] of this.codes) if (c.expiresAt <= now) this.codes.delete(id);
    for (const [id, c] of this.claimed) if (c.expiresAt <= now) this.claimed.delete(id);
  }

  private audit(entry: Omit<AuditEntry, 'id' | 'at'>): Promise<void> {
    return this.deps.audit.append(entry).catch((err) => console.error('Audit write failed:', (err as Error).message));
  }

  async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response): Promise<void> {
    this.purge();
    if (this.pending.size >= MAX_PENDING) this.pending.delete(this.pending.keys().next().value as string);
    const requestId = randomId();
    this.pending.set(requestId, {
      clientId: client.client_id,
      redirectUri: params.redirectUri,
      codeChallenge: params.codeChallenge,
      state: params.state,
      resource: params.resource?.href,
      verified: false,
      expiresAt: Date.now() + TTL_MS,
    });
    this.sendPage(res, 200, this.page(requestId, this.pending.get(requestId)!, client.client_name || 'AI assistant'));
  }

  /**
   * POST /oauth/consent, two stages. 'password' verifies the owner and unlocks the scope step for this request;
   * 'grant' creates the connection (only for a verified request) and redirects with a code.
   */
  consentHandler = async (req: Request, res: Response): Promise<void> => {
    const { store, mcp } = this.deps;
    this.purge();
    const body = (req.body ?? {}) as Record<string, unknown>;
    const requestId = form(body.requestId);
    const request = this.pending.get(requestId);
    if (!request) {
      res.status(400).type('text/plain').send('This sign-in request expired. Start the connection again from your AI app.');
      return;
    }
    const client = mcp.clients[request.clientId];
    const clientName = client?.client_name || 'AI assistant';
    const rerender = (status: number, error: string, name?: string) =>
      this.sendPage(res, status, this.page(requestId, request, clientName, error, name));

    if (form(body.stage) !== 'grant') {
      const name = form(body.name).trim().slice(0, 80);
      const ip = req.ip || 'unknown';
      if (this.deps.limiter.isBlocked(ip)) return rerender(429, 'Too many failed attempts. Try again in 15 minutes.', name || undefined);
      const password = form(body.password);
      if (!password || !verifyPassword(password, store.auth.salt, store.auth.hash)) {
        this.deps.limiter.recordFailure(ip);
        await this.audit({
          connectionId: '', connectionName: clientName, tool: 'oauth', action: 'refused', targets: [], message: 'wrong password',
        });
        return rerender(401, 'Wrong password.', name || undefined);
      }
      this.deps.limiter.reset(ip);
      if (!name) return rerender(400, 'Give this connection a name.');
      request.verified = true;
      request.name = name;
      return rerender(200, '');
    }

    if (!request.verified || !request.name) {
      this.sendPage(res, 403, renderConsentPage({
        requestId, clientName, redirectHost: new URL(request.redirectUri).host, step: 'password',
        error: 'Sign in with your password first.',
      }));
      return;
    }
    const name = request.name;

    const access: McpAccess = body.access === 'read-only' ? 'read-only' : 'full';
    const grants: McpGrants = {
      ...structuredClone(NO_GRANTS),
      all: body.everything !== undefined,
      headings: asList(body.headings),
      folders: asList(body.folders),
      backlog: body.backlog !== undefined,
      habits: body.habits !== undefined,
    };
    if (!grants.all && grants.headings.length === 0 && grants.folders.length === 0 && !grants.backlog && !grants.habits) {
      return rerender(400, 'Choose at least one thing to share.');
    }

    this.pending.delete(requestId);
    const connection = mcp.createConnection({ name, clientId: request.clientId, clientName, access, grants });
    const code = randomId();
    this.codes.set(code, {
      connectionId: connection.id,
      clientId: request.clientId,
      redirectUri: request.redirectUri,
      codeChallenge: request.codeChallenge,
      expiresAt: Date.now() + TTL_MS,
    });
    await mcp.persist();
    await this.audit({
      connectionId: connection.id, connectionName: connection.name, tool: 'oauth', action: 'connect', targets: [],
      message: `Connected ${clientName} (${access})`,
    });
    const target = new URL(request.redirectUri);
    target.searchParams.set('code', code);
    if (request.state !== undefined) target.searchParams.set('state', request.state);
    res.set('Cache-Control', 'no-store').redirect(302, target.href);
  };

  async challengeForAuthorizationCode(client: OAuthClientInformationFull, authorizationCode: string): Promise<string> {
    this.purge();
    const issued = this.codes.get(authorizationCode);
    if (!issued || issued.clientId !== client.client_id) throw new InvalidGrantError('Invalid authorization code.');
    // Single use from the first lookup: a wrong code_verifier burns the code instead of allowing guesses.
    this.codes.delete(authorizationCode);
    this.claimed.set(authorizationCode, issued);
    return issued.codeChallenge;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull, authorizationCode: string, _codeVerifier?: string, redirectUri?: string, resource?: URL,
  ): Promise<OAuthTokens> {
    this.purge();
    const issued = this.claimed.get(authorizationCode) ?? this.codes.get(authorizationCode);
    this.claimed.delete(authorizationCode); // single use, even when the exchange fails below
    this.codes.delete(authorizationCode);
    if (!issued || issued.clientId !== client.client_id) throw new InvalidGrantError('Invalid authorization code.');
    if (resource && resource.href !== new URL('/mcp', this.deps.config.publicUrl ?? undefined).href) {
      throw new InvalidTargetError('resource does not identify this server.');
    }
    if (redirectUri !== undefined && redirectUri !== issued.redirectUri) throw new InvalidGrantError('redirect_uri does not match.');
    const connection = this.deps.mcp.activeConnection(issued.connectionId);
    if (!connection) throw new InvalidGrantError('This connection was revoked.');
    return this.issueTokens(connection.id);
  }

  private async issueTokens(connectionId: string): Promise<OAuthTokens> {
    const { store, mcp } = this.deps;
    const connection = mcp.connections.find(c => c.id === connectionId)!;
    const refreshToken = newRefreshToken(connectionId);
    if (connection.refreshHash) connection.retiredRefreshHashes.push(connection.refreshHash);
    connection.retiredRefreshHashes = connection.retiredRefreshHashes.slice(-MAX_RETIRED);
    connection.refreshHash = hashRefreshToken(refreshToken);
    await mcp.persist();
    return {
      access_token: signMcpToken(
        { typ: 'mcp', cid: connectionId, ver: store.auth.tokenVersion, exp: Math.floor(Date.now() / 1000) + ACCESS_TTL_SECONDS },
        store.auth.secret,
      ),
      token_type: 'bearer',
      expires_in: ACCESS_TTL_SECONDS,
      refresh_token: refreshToken,
    };
  }

  async exchangeRefreshToken(client: OAuthClientInformationFull, refreshToken: string): Promise<OAuthTokens> {
    const { mcp } = this.deps;
    const connection = mcp.connections.find(c => c.id === refreshToken.split('.', 1)[0]);
    if (!connection || connection.revoked || connection.builtIn || connection.clientId !== client.client_id) {
      throw new InvalidGrantError('Invalid refresh token.');
    }
    const hash = hashRefreshToken(refreshToken);
    if (connection.retiredRefreshHashes.includes(hash)) {
      mcp.revoke(connection.id);
      await mcp.persist();
      await this.audit({
        connectionId: connection.id, connectionName: connection.name, tool: 'oauth', action: 'revoke', targets: [], message: 'refresh_reuse',
      });
      throw new InvalidGrantError('Invalid refresh token.');
    }
    if (connection.refreshHash !== hash) throw new InvalidGrantError('Invalid refresh token.');
    const tokens = await this.issueTokens(connection.id);
    await this.audit({ connectionId: connection.id, connectionName: connection.name, tool: 'oauth', action: 'refresh', targets: [] });
    return tokens;
  }

  /** A still-signed token for a revoked connection is worth a trail; at most once a minute per connection. */
  private async auditRevokedUse(connectionId: string): Promise<void> {
    const connection = this.deps.mcp.connections.find(c => c.id === connectionId);
    if (!connection) return;
    const now = Date.now();
    if (now - (this.revokedAudited.get(connectionId) ?? 0) < REVOKED_AUDIT_MS) return;
    this.revokedAudited.set(connectionId, now);
    await this.audit({
      connectionId, connectionName: connection.name, tool: 'auth', action: 'refused', targets: [], message: 'revoked connection',
    });
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const { store, mcp } = this.deps;
    const payload = verifyMcpToken(token, store.auth.secret);
    if (!payload || payload.ver !== store.auth.tokenVersion) throw new InvalidTokenError('Invalid or expired token.');
    const connection = mcp.activeConnection(payload.cid);
    if (!connection) {
      await this.auditRevokedUse(payload.cid);
      throw new InvalidTokenError('This connection was revoked.');
    }
    return {
      token, clientId: connection.clientId ?? 'local', scopes: ['daymark'], expiresAt: payload.exp,
      extra: { connectionId: connection.id },
    };
  }

  async revokeToken(client: OAuthClientInformationFull, request: OAuthTokenRevocationRequest): Promise<void> {
    const { store, mcp } = this.deps;
    const signed = verifyMcpToken(request.token, store.auth.secret);
    const cid = signed?.cid ?? request.token.split('.', 1)[0];
    const connection = mcp.connections.find(c => c.id === cid);
    if (!connection || connection.clientId !== client.client_id) return;
    // A refresh token must be the connection's current one; a bare connection id is not a credential.
    if (!signed && (!connection.refreshHash || hashRefreshToken(request.token) !== connection.refreshHash)) return;
    if (!mcp.revoke(cid)) return;
    await mcp.persist();
    await this.audit({ connectionId: connection.id, connectionName: connection.name, tool: 'oauth', action: 'revoke', targets: [], message: 'revoked by client' });
  }
}
