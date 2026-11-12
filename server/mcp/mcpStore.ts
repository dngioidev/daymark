import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';
import { DEFAULT_MCP_SETTINGS, NO_GRANTS } from '../../src/sync/mcpProtocol';
import type { McpAccess, McpConnectionSummary, McpGrants, McpSettings } from '../../src/sync/mcpProtocol';

export interface McpConnection extends McpConnectionSummary {
  clientId: string | null;
  revoked: boolean;
  refreshHash: string | null;
  retiredRefreshHashes: string[];
}

interface McpData {
  settings: McpSettings;
  connections: McpConnection[];
  clients: Record<string, OAuthClientInformationFull>;
}

/** MCP state in DATA_DIR, with owner-only atomic writes serialized per store. */
export class McpStore {
  settings: McpSettings = structuredClone(DEFAULT_MCP_SETTINGS);
  connections: McpConnection[] = [];
  clients: Record<string, OAuthClientInformationFull> = {};
  private queue: Promise<void> = Promise.resolve();

  constructor(readonly dir: string) {}

  init(): void {
    fs.mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    const file = path.join(this.dir, 'mcp.json');
    let data: McpData;
    try {
      data = JSON.parse(fs.readFileSync(file, 'utf8')) as McpData;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw new Error(`Could not read ${file}: ${(err as Error).message}`);
      }
      data = { settings: structuredClone(DEFAULT_MCP_SETTINGS), connections: [], clients: {} };
    }
    this.settings = data.settings;
    this.connections = data.connections;
    this.clients = data.clients;
  }

  persist(): Promise<void> {
    const snapshot = JSON.stringify({ settings: this.settings, connections: this.connections, clients: this.clients });
    this.queue = this.queue.then(() => {
      const target = path.join(this.dir, 'mcp.json');
      const tmp = `${target}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, snapshot, { mode: 0o600 });
      fs.renameSync(tmp, target);
    });
    return this.queue;
  }

  activeConnection(id: string): McpConnection | null {
    return this.connections.find(connection => connection.id === id && !connection.revoked) ?? null;
  }

  createConnection(input: { name: string; clientId: string; clientName: string; access: McpAccess; grants: McpGrants }): McpConnection {
    const connection: McpConnection = {
      ...input,
      grants: structuredClone(input.grants),
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      builtIn: false,
      revoked: false,
      refreshHash: null,
      retiredRefreshHashes: [],
    };
    this.connections.push(connection);
    return connection;
  }

  revoke(id: string): boolean {
    const connection = this.connections.find(connection => connection.id === id);
    if (!connection || id === 'local' || connection.builtIn) return false;
    connection.revoked = true;
    connection.refreshHash = null;
    connection.retiredRefreshHashes = [];
    return true;
  }

  revokeAll(): void {
    for (const connection of this.connections) this.revoke(connection.id);
  }

  ensureLocalConnection(): McpConnection {
    const existing = this.connections.find(connection => connection.id === 'local');
    if (existing) return existing;
    const local: McpConnection = {
      id: 'local', name: 'Local', clientId: null, clientName: 'Local',
      createdAt: new Date().toISOString(), lastUsedAt: null,
      builtIn: true, access: 'full', grants: { ...structuredClone(NO_GRANTS), all: true },
      revoked: false, refreshHash: null, retiredRefreshHashes: [],
    };
    this.connections.push(local);
    return local;
  }

  effectiveTimezone(fallback: string | null): string {
    return this.settings.timezone || fallback || 'UTC';
  }
}
