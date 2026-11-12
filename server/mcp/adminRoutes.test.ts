import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NO_GRANTS } from '../../src/sync/mcpProtocol';
import { createApp } from '../app';
import { signMcpToken } from '../auth';
import { loadConfig, type ServerConfig } from '../config';
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
let config: ServerConfig;
let token: string;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'daymark-mcp-admin-'));
  const holder = express();
  server = holder.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  config = { ...loadConfig({ NODE_ENV: 'test' }), dataDir: dir, initialPassword: PASSWORD, publicUrl: base };
  store = new FileStore(dir);
  store.init(config.username, config.initialPassword);
  mcp = new McpStore(dir);
  mcp.init();
  mcp.ensureLocalConnection();
  audit = new AuditLog(path.join(dir, 'mcp-audit'));
  holder.use(createApp(config, store, { store: mcp, audit }));
  const login = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: PASSWORD, deviceName: 'Settings' }),
  });
  expect(login.status).toBe(200);
  token = (await login.json()).accessToken;
});

afterEach(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
  fs.rmSync(dir, { recursive: true, force: true });
});

const request = (url = '', method = 'GET', body?: unknown, bearer = token) => fetch(`${base}/api/mcp${url}`, {
  method, headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const connection = () => mcp.createConnection({
  name: 'Assistant', clientId: 'private-client', clientName: 'Test client', access: 'full',
  grants: { ...structuredClone(NO_GRANTS), all: true },
});
const mcpToken = (cid: string) => signMcpToken({
  typ: 'mcp', cid, ver: store.auth.tokenVersion, exp: Math.floor(Date.now() / 1000) + 600,
}, store.auth.secret);

it('MCP token cannot reach /api/mcp', async () => {
  const bearer = mcpToken(connection().id);
  for (const [url, method, body] of [
    ['', 'GET', undefined], ['/settings', 'PUT', { enabled: false }],
    ['/connections/local', 'PUT', { name: 'Changed' }], ['/connections/local', 'DELETE', undefined],
    ['/audit', 'GET', undefined],
  ] as const) {
    expect((await request(url, method, body, bearer)).status).toBe(401);
  }
});

it('device can change scope and the next tool call sees the new scope', async () => {
  const conn = connection();
  const client = new Client({ name: 'test', version: '1' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${mcpToken(conn.id)}` } },
  }));
  try {
    expect((await client.callTool({ name: 'list_backlog', arguments: {} })).isError).toBeFalsy();
    const res = await request(`/connections/${conn.id}`, 'PUT', { name: 'Restricted', access: 'read-only', grants: NO_GRANTS });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ name: 'Restricted', access: 'read-only', grants: NO_GRANTS });
    expect((await client.callTool({ name: 'list_backlog', arguments: {} })).isError).toBe(true);
    const persisted = new McpStore(dir);
    persisted.init();
    expect(persisted.activeConnection(conn.id)).toMatchObject({ access: 'read-only', grants: NO_GRANTS });
  } finally {
    await client.close();
  }
});

it('a failed save leaves settings and connection scope as they were', async () => {
  const conn = connection();
  const before = structuredClone({ settings: mcp.settings, name: conn.name, access: conn.access, grants: conn.grants });
  const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
  const persist = vi.spyOn(mcp, 'persist').mockRejectedValue(new Error('disk full'));
  try {
    expect((await request('/settings', 'PUT', { enabled: false, auditRetentionDays: 7, feedback: { kind: 'heading', heading: 'Work' } })).status).toBe(500);
    expect((await request(`/connections/${conn.id}`, 'PUT', { name: 'Narrow', access: 'read-only', grants: NO_GRANTS })).status).toBe(500);
  } finally {
    persist.mockRestore();
    quiet.mockRestore();
  }
  expect(mcp.settings).toEqual(before.settings);
  expect({ name: conn.name, access: conn.access, grants: conn.grants }).toEqual({ name: before.name, access: before.access, grants: before.grants });
});

it('settings validation rejects retention 0 and 366 and timezone "Mars/Base"', async () => {
  for (const body of [
    { auditRetentionDays: 0 }, { auditRetentionDays: 366 }, { auditRetentionDays: 1.5 },
    { timezone: 'Mars/Base' }, { timezone: null }, { enabled: 'true' },
    { feedback: { kind: 'heading' } }, { feedback: { kind: 'folder', folder: 1 } },
    { feedback: { kind: 'unknown' } }, { feedback: null }, [],
  ]) expect((await request('/settings', 'PUT', body)).status).toBe(400);
  expect(mcp.settings).toMatchObject({ enabled: true, timezone: '', auditRetentionDays: 30, feedback: { kind: 'backlog' } });
});

it('persists valid partial settings including unset timezone and retention boundaries', async () => {
  for (const body of [
    { auditRetentionDays: 1, timezone: 'Asia/Ho_Chi_Minh', feedback: { kind: 'heading', heading: 'Work' } },
    { auditRetentionDays: 365, timezone: '', enabled: false, feedback: { kind: 'folder', folder: 'Feedback' } },
    { feedback: { kind: 'backlog' } },
  ]) {
    const res = await request('/settings', 'PUT', body);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject(body);
  }
  const persisted = new McpStore(dir);
  persisted.init();
  expect(persisted.settings).toEqual({ enabled: false, timezone: '', auditRetentionDays: 365, feedback: { kind: 'backlog' } });
});

it('delete local → 400', async () => {
  expect((await request('/connections/local', 'DELETE')).status).toBe(400);
  expect(mcp.activeConnection('local')).not.toBeNull();
  expect(await audit.list()).toEqual([]);
});

it('responses contain no hashes', async () => {
  const conn = connection();
  conn.refreshHash = 'private-hash';
  conn.retiredRefreshHashes = ['retired-hash'];
  for (const res of [await request(), await request(`/connections/${conn.id}`, 'PUT', { name: 'Renamed' })]) {
    expect(res.status).toBe(200);
    const json = JSON.stringify(await res.json());
    for (const key of ['refreshHash', 'retiredRefreshHashes', 'clientId', 'private-hash', 'retired-hash']) expect(json).not.toContain(key);
  }
});

it('revokes, persists, audits and filters the audit log', async () => {
  const conn = connection();
  const res = await request(`/connections/${conn.id}`, 'DELETE');
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
  expect(mcp.activeConnection(conn.id)).toBeNull();
  const persisted = new McpStore(dir);
  persisted.init();
  expect(persisted.activeConnection(conn.id)).toBeNull();
  await audit.append({ connectionId: 'local', connectionName: 'Local', action: 'read', tool: 'ping', targets: [] });
  const filtered = await request(`/audit?connectionId=${conn.id}&action=revoke&limit=1`);
  expect(filtered.status).toBe(200);
  const { entries } = await filtered.json();
  expect(entries).toHaveLength(1);
  expect(entries[0]).toMatchObject({ connectionId: conn.id, connectionName: 'Assistant', action: 'revoke', targets: [] });
  expect((await (await request('/audit?limit=1')).json()).entries).toHaveLength(1);
  expect((await (await request('/audit?action=search')).json()).entries).toEqual([]);
  expect((await (await request()).json()).connections.map((c: { id: string }) => c.id)).not.toContain(conn.id);
  for (const id of [conn.id, 'missing']) {
    expect((await request(`/connections/${id}`, 'PUT', { name: 'No' })).status).toBe(404);
    expect((await request(`/connections/${id}`, 'DELETE')).status).toBe(404);
  }
});

it('rejects malformed connection updates without changing permissions', async () => {
  const conn = connection();
  for (const body of [{ access: 'write' }, { name: 42 }, { grants: { all: true } }, { grants: { ...NO_GRANTS, folders: [42] } }]) {
    expect((await request(`/connections/${conn.id}`, 'PUT', body)).status).toBe(400);
  }
  expect(conn.access).toBe('full');
  expect(conn.grants.all).toBe(true);
});

it('overview advertises the mounted endpoint and known scopes', async () => {
  const res = await request();
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ endpoint: `${base}/mcp`, connections: [{ id: 'local', builtIn: true }], knownHeadings: expect.any(Array), knownFolders: [] });
});

it.each([{ mcpEnabled: false }, { publicUrl: null }])('overview has no endpoint when MCP is not mounted: %j', async override => {
  const app = express();
  app.use(createApp({ ...config, ...override }, store, { store: mcp, audit }));
  const other = app.listen(0);
  try {
    const res = await fetch(`http://127.0.0.1:${(other.address() as AddressInfo).port}/api/mcp`, { headers: { Authorization: `Bearer ${token}` } });
    expect(res.status).toBe(200);
    expect((await res.json()).endpoint).toBe('');
  } finally {
    await new Promise<void>(resolve => other.close(() => resolve()));
  }
});
