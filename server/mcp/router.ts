import express from 'express';
import type { Request, Response } from 'express';
import { mcpAuthRouter, getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SERVER_VERSION } from '../app';
import type { LoginRateLimiter } from '../auth';
import type { ServerConfig } from '../config';
import type { FileStore } from '../store';
import type { VaultQueue } from '../vault';
import type { AuditLog } from './audit';
import { MCP_INSTRUCTIONS } from './instructions';
import type { McpStore } from './mcpStore';
import { DaymarkOAuthProvider } from './oauth';
import { createCommit } from './tools/define';
import type { ToolContext } from './tools/define';
import { registerAllTools } from './tools/index';
import { todayIn } from './vaultView';

const LAST_USED_PERSIST_MS = 60_000;
const OFF_AUDIT_MS = 60_000;

export function mountMcp(app: express.Express, deps: { config: ServerConfig; store: FileStore; mcp: McpStore; audit: AuditLog; vault: VaultQueue; limiter: LoginRateLimiter }): void {
  const { config, store, mcp, audit, vault, limiter } = deps;
  if (!config.publicUrl) throw new Error('mountMcp needs config.publicUrl');
  const issuerUrl = new URL(config.publicUrl);
  const resourceServerUrl = new URL('/mcp', config.publicUrl);
  const provider = new DaymarkOAuthProvider({ config, store, mcp, audit, limiter });

  app.use(mcpAuthRouter({ provider, issuerUrl, resourceServerUrl, scopesSupported: ['daymark'] }));
  app.post('/oauth/consent', express.urlencoded({ extended: false, limit: '64kb' }), (req, res, next) => {
    provider.consentHandler(req, res).catch(next);
  });

  const lastPersisted = new Map<string, number>();
  const offAudited = new Map<string, number>();
  const touchConnection = (connectionId: string) => {
    const connection = mcp.activeConnection(connectionId);
    if (!connection) return;
    const now = Date.now();
    connection.lastUsedAt = new Date(now).toISOString();
    if (now - (lastPersisted.get(connectionId) ?? 0) < LAST_USED_PERSIST_MS) return;
    lastPersisted.set(connectionId, now);
    mcp.persist().catch((err) => console.error('Could not save MCP connection state:', (err as Error).message));
  };

  const methodNotAllowed = (_req: Request, res: Response) => {
    res.status(405).set('Allow', 'POST').json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null });
  };

  app.post(
    '/mcp',
    requireBearerAuth({ verifier: provider, resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(resourceServerUrl) }),
    express.json({ limit: '1mb' }),
    async (req, res) => {
      const connectionId = String(req.auth?.extra?.connectionId ?? '');
      const connection = mcp.activeConnection(connectionId);
      if (!connection) return res.status(401).json({ error: 'invalid_token' });
      if (!mcp.settings.enabled) {
        // Refuse every call (initialize and tools/list included) before any transport exists. This is a JSON-RPC
        // error on HTTP 200, not an auth failure, so clients do not drop the connection. One audit entry a minute.
        const nowMs = Date.now();
        if (nowMs - (offAudited.get(connection.id) ?? 0) >= OFF_AUDIT_MS) {
          offAudited.set(connection.id, nowMs);
          await audit.append({
            connectionId: connection.id, connectionName: connection.name, tool: 'mcp', action: 'refused', targets: [], message: 'AI access is turned off.',
          }).catch((err) => console.error('Audit write failed:', (err as Error).message));
        }
        const id = (req.body as { id?: unknown } | undefined)?.id;
        return res.status(200).json({ jsonrpc: '2.0', error: { code: -32000, message: 'AI access is turned off in Daymark.' }, id: typeof id === 'string' || typeof id === 'number' ? id : null });
      }
      touchConnection(connectionId);
      const now = () => new Date();
      const ctx: ToolContext = {
        store, mcp, audit, vault, connection, now,
        today: () => todayIn(mcp.effectiveTimezone(config.timezone), now()),
        commit: createCommit(store, vault, connection, now),
      };
      const server = new McpServer({ name: 'daymark', version: SERVER_VERSION }, { instructions: MCP_INSTRUCTIONS });
      registerAllTools(server, ctx);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on('close', () => {
        void transport.close();
        void server.close();
      });
      try {
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
      } catch (err) {
        console.error('MCP request failed:', err);
        if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error.' }, id: null });
      }
    },
  );
  app.get('/mcp', methodNotAllowed);
  app.delete('/mcp', methodNotAllowed);
}
