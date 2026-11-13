import express from 'express';
import { z } from 'zod';
import { MAX_AUDIT_RETENTION_DAYS } from '../../src/sync/mcpProtocol';
import type { McpConnectionSummary, McpOverview } from '../../src/sync/mcpProtocol';
import type { ServerConfig } from '../config';
import type { FileStore } from '../store';
import type { AuditLog } from './audit';
import type { McpConnection, McpStore } from './mcpStore';
import { knownFolders, knownHeadings, todayIn } from './vaultView';

const settingsUpdate = z.object({
  enabled: z.boolean(),
  timezone: z.string().refine(timeZone => {
    if (timeZone === '') return true;
    try {
      new Intl.DateTimeFormat('en-US', { timeZone });
      return true;
    } catch {
      return false;
    }
  }),
  auditRetentionDays: z.number().int().min(1).max(MAX_AUDIT_RETENTION_DAYS),
  feedback: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('backlog') }),
    z.object({ kind: z.literal('heading'), heading: z.string().min(1) }),
    z.object({ kind: z.literal('folder'), folder: z.string().min(1) }),
  ]),
}).partial();

const connectionUpdate = z.object({
  name: z.string(),
  access: z.enum(['full', 'read-only']),
  grants: z.object({
    all: z.boolean(), headings: z.array(z.string()), folders: z.array(z.string()),
    backlog: z.boolean(), habits: z.boolean(),
  }),
}).partial();

const auditQuery = z.object({
  connectionId: z.string().optional(),
  action: z.enum(['read', 'search', 'create', 'update', 'complete', 'delete', 'refused', 'error', 'connect', 'refresh', 'revoke']).optional(),
  limit: z.coerce.number().int().min(0).optional(),
});

/** Explicit allowlist: persisted OAuth credentials never leave the admin API. */
function summary(connection: McpConnection): McpConnectionSummary {
  const { id, name, clientName, createdAt, lastUsedAt, access, grants, builtIn, toolsListedAt } = connection;
  return { id, name, clientName, createdAt, lastUsedAt, access, grants, builtIn, toolsListedAt: toolsListedAt ?? null };
}

/** Mounted behind createApp's device authentication middleware. */
export function mcpAdminRoutes(deps: { config: ServerConfig; store: FileStore; mcp: McpStore; audit: AuditLog }): express.Router {
  const { config, store, mcp, audit } = deps;
  const router = express.Router();

  router.get('/', (_req, res) => {
    const today = todayIn(mcp.effectiveTimezone(config.timezone), new Date());
    const overview: McpOverview = {
      settings: mcp.settings,
      connections: mcp.connections.filter(connection => !connection.revoked && !connection.pending).map(summary),
      knownHeadings: knownHeadings(store, today),
      knownFolders: knownFolders(store),
      endpoint: config.mcpEnabled && config.publicUrl ? `${config.publicUrl}/mcp` : '',
      ...(mcp.toolset ? { toolset: { version: mcp.toolset.version, changedAt: mcp.toolset.changedAt, added: mcp.toolset.added } } : {}),
    };
    res.json(overview);
  });

  router.put('/settings', (req, res, next) => {
    const parsed = settingsUpdate.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid MCP settings.' });
    const previous = structuredClone(mcp.settings);
    Object.assign(mcp.settings, parsed.data);
    mcp.persist().then(() => res.json(mcp.settings)).catch((err) => {
      Object.assign(mcp.settings, previous); // the save failed, so do not leave the new settings live in memory
      next(err);
    });
  });

  router.put('/connections/:id', (req, res, next) => {
    const connection = mcp.activeConnection(req.params.id);
    if (!connection) return res.status(404).json({ error: 'Connection not found.' });
    const parsed = connectionUpdate.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid connection update.' });
    const previous = structuredClone(Object.fromEntries(Object.keys(parsed.data).map(key => [key, connection[key as keyof McpConnection]])));
    Object.assign(connection, parsed.data);
    mcp.persist().then(() => res.json(summary(connection))).catch((err) => {
      Object.assign(connection, previous); // keep the scope the owner last saved
      next(err);
    });
  });

  router.delete('/connections/:id', (req, res, next) => {
    if (req.params.id === 'local') return res.status(400).json({ error: 'The local connection cannot be revoked.' });
    const connection = mcp.activeConnection(req.params.id);
    if (!connection) return res.status(404).json({ error: 'Connection not found.' });
    if (!mcp.revoke(connection.id)) return res.status(400).json({ error: 'This connection cannot be revoked.' });
    mcp.persist().then(() => audit.append({
      connectionId: connection.id, connectionName: connection.name,
      tool: 'admin', action: 'revoke', targets: [],
    })).then(() => res.json({ ok: true })).catch(next);
  });

  router.get('/audit', (req, res, next) => {
    const parsed = auditQuery.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid audit filter.' });
    audit.list(parsed.data).then(entries => res.json({ entries })).catch(next);
  });

  return router;
}
