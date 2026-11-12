import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { AddressInfo } from 'node:net';
import { Server } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { z } from 'zod';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { VaultQueue } from '../vault';
import { defineTool } from './tools/define';
import { NO_GRANTS } from '../../src/sync/mcpProtocol';
import { createApp } from '../app';
import { signMcpToken, signToken } from '../auth';
import { loadConfig } from '../config';
import { FileStore } from '../store';
import { AuditLog } from './audit';
import { McpStore } from './mcpStore';

const PASSWORD = 'correct horse battery';
let dir: string;
let server: Server;
let base: string;
let store: FileStore;
let mcp: McpStore;
let audit: AuditLog;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'daymark-mcp-router-'));
  const holder = express();
  server = holder.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const config = { ...loadConfig({ NODE_ENV: 'test' }), dataDir: dir, initialPassword: PASSWORD, publicUrl: base };
  store = new FileStore(dir);
  store.init(config.username, config.initialPassword);
  mcp = new McpStore(dir);
  mcp.init();
  audit = new AuditLog(path.join(dir, 'mcp-audit'));
  holder.use(createApp(config, store, { store: mcp, audit }));
});
afterEach(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  fs.rmSync(dir, { recursive: true, force: true });
});

const connection = () => mcp.createConnection({
  name: 'Assistant', clientId: 'client-1', clientName: 'Test client', access: 'full', grants: { ...structuredClone(NO_GRANTS), all: true },
});
const mcpToken = (cid: string, ver = store.auth.tokenVersion) =>
  signMcpToken({ typ: 'mcp', cid, ver, exp: Math.floor(Date.now() / 1000) + 600 }, store.auth.secret);

async function connect(token: string): Promise<Client> {
  const client = new Client({ name: 'test', version: '1' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  }));
  return client;
}

const rpc = (token?: string) => fetch(`${base}/mcp`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json', Accept: 'application/json, text/event-stream',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
});

const callPing = async (client: Client) =>
  client.callTool({ name: 'ping', arguments: {} }) as Promise<{ isError?: boolean; content: { type: string; text: string }[] }>;

describe('/mcp endpoint', () => {
  it('ping works and writes one audit entry', async () => {
    const conn = connection();
    const client = await connect(mcpToken(conn.id));
    const result = await callPing(client);
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content[0].text)).toEqual({ ok: true });
    const tools = await client.listTools();
    expect(tools.tools[0].annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    await client.close();
    const entries = await audit.list({ connectionId: conn.id });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ tool: 'ping', action: 'read', connectionName: 'Assistant', targets: [] });
    expect(conn.lastUsedAt).not.toBeNull();
  });

  it('no token → 401 with WWW-Authenticate', async () => {
    const res = await rpc();
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toContain(`resource_metadata="${base}/.well-known/oauth-protected-resource/mcp"`);
  });

  it('GET and DELETE are 405', async () => {
    const token = mcpToken(connection().id);
    for (const method of ['GET', 'DELETE']) {
      expect((await fetch(`${base}/mcp`, { method, headers: { Authorization: `Bearer ${token}` } })).status).toBe(405);
    }
  });

  it('device access token is refused on /mcp', async () => {
    const deviceToken = signToken({
      typ: 'access', sub: store.auth.username, did: 'dev-1', ver: store.auth.tokenVersion, exp: Math.floor(Date.now() / 1000) + 600,
    }, store.auth.secret);
    expect((await rpc(deviceToken)).status).toBe(401);
  });

  it('MCP token is refused on /api/sync and /api/devices', async () => {
    const token = mcpToken(connection().id);
    for (const url of ['/api/sync', '/api/devices']) {
      expect((await fetch(base + url, { headers: { Authorization: `Bearer ${token}` } })).status).toBe(401);
    }
  });

  it('revoked connection is refused before token expiry', async () => {
    const conn = connection();
    const token = mcpToken(conn.id);
    expect((await rpc(token)).status).toBe(200);
    mcp.revoke(conn.id);
    expect((await rpc(token)).status).toBe(401);
    expect((await rpc(token)).status).toBe(401);
    // audited once (throttled per connection), with a stable shape
    const entries = await audit.list({ connectionId: conn.id });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ tool: 'auth', action: 'refused', message: 'revoked connection', connectionName: 'Assistant' });
  });

  it('a token with a stale version for a live connection is refused without an audit entry', async () => {
    const conn = connection();
    const token = mcpToken(conn.id);
    store.auth = { ...store.auth, tokenVersion: store.auth.tokenVersion + 1 };
    expect((await rpc(token)).status).toBe(401);
    expect(await audit.list({ connectionId: conn.id })).toHaveLength(0);
  });

  it('master switch off answers every /mcp call with a JSON-RPC error on HTTP 200, and audits once a minute', async () => {
    const conn = connection();
    const token = mcpToken(conn.id);
    mcp.settings.enabled = false;
    const res = await rpc(token);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'AI access is turned off in Daymark.' } });
    const init = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '1' } } }),
    });
    expect(init.status).toBe(200);
    expect(await init.json()).toMatchObject({ id: 2, error: { code: -32000 } });
    const entries = await audit.list({ connectionId: conn.id });
    expect(entries).toHaveLength(1); // throttled: the second refusal within a minute is not audited
    expect(entries[0]).toMatchObject({ tool: 'mcp', action: 'refused', connectionName: 'Assistant' });
  });

  it('master switch turned off mid-session refuses the next tool call', async () => {
    const conn = connection();
    const client = await connect(mcpToken(conn.id));
    mcp.settings.enabled = false;
    await expect(callPing(client)).rejects.toThrow();
    await client.close();
    const entries = await audit.list({ connectionId: conn.id });
    expect(entries.some(e => e.tool === 'mcp' && e.action === 'refused')).toBe(true);
  });

  it('token from before a password change is refused', async () => {
    const token = mcpToken(connection().id);
    store.auth = { ...store.auth, tokenVersion: store.auth.tokenVersion + 1 };
    expect((await rpc(token)).status).toBe(401);
  });

  it('the SDK still has the private validateToolInput hook that defineTool overrides', () => {
    expect(typeof (McpServer.prototype as unknown as { validateToolInput: unknown }).validateToolInput).toBe('function');
  });

  describe('tool wrapper argument validation', () => {
    async function wrapped() {
      const conn = connection();
      const server = new McpServer({ name: 'test', version: '1' });
      defineTool(server, {
        store, mcp, audit, vault: new VaultQueue(), connection: conn, now: () => new Date(), today: () => '2026-11-12',
        commit: async () => {},
      }, {
        name: 'echo', description: 'Echo', input: { text: z.string(), n: z.number().optional() }, readOnly: true,
        run: async (args) => ({ result: { text: args.text }, action: 'read' }),
      });
      const client = new Client({ name: 'test', version: '1' });
      const [a, b] = InMemoryTransport.createLinkedPair();
      await Promise.all([server.connect(a), client.connect(b)]);
      return { conn, client };
    }
    const call = (client: Client, args: Record<string, unknown>) =>
      client.callTool({ name: 'echo', arguments: args }) as Promise<{ isError?: boolean; content: { text: string }[] }>;

    it('advertises the real input schema', async () => {
      const { client } = await wrapped();
      const tool = (await client.listTools()).tools[0];
      expect(Object.keys(tool.inputSchema.properties ?? {})).toEqual(['text', 'n']);
      expect(tool.inputSchema.required).toEqual(['text']);
    });

    it('bad arguments return an error and write exactly one audit entry', async () => {
      const { conn, client } = await wrapped();
      const result = await call(client, { text: 42 });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('Invalid arguments: text');
      const entries = await audit.list({ connectionId: conn.id });
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ tool: 'echo', action: 'error', message: 'invalid_arguments' });
      expect(entries[0].targets).toEqual([]);
      const ok = await call(client, { text: 'hi' });
      expect(JSON.parse(ok.content[0].text)).toEqual({ text: 'hi' });
      expect(await audit.list({ connectionId: conn.id })).toHaveLength(2);
    });

    it('with the master switch off a bad-argument call is audited once as refused', async () => {
      const { conn, client } = await wrapped();
      mcp.settings.enabled = false;
      const result = await call(client, {});
      expect(result.content[0].text).toBe('AI access is turned off.');
      const entries = await audit.list({ connectionId: conn.id });
      expect(entries).toHaveLength(1);
      expect(entries[0].action).toBe('refused');
    });
  });
});
