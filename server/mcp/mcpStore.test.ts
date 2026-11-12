import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_MCP_SETTINGS, NO_GRANTS } from '../../src/sync/mcpProtocol';
import { McpStore } from './mcpStore';

let dir: string;
let store: McpStore;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'daymark-mcp-'));
  store = new McpStore(dir);
  store.init();
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

const create = () => store.createConnection({
  name: 'Assistant', clientId: 'client-1', clientName: 'Test client',
  access: 'read-only', grants: structuredClone(NO_GRANTS),
});

it('round-trips settings and connections through mcp.json', async () => {
  store.settings.timezone = 'Asia/Saigon';
  const connection = create();
  connection.refreshHash = 'test-hash';
  connection.retiredRefreshHashes.push('retired-test-hash');
  store.clients['client-1'] = { client_id: 'client-1', redirect_uris: ['http://localhost/callback'], client_id_issued_at: 1_700_000_000 };
  await store.persist();
  const loaded = new McpStore(dir);
  loaded.init();
  expect(loaded.settings).toEqual(store.settings);
  expect(loaded.connections).toEqual([connection]);
  expect(loaded.clients).toEqual(store.clients);
  expect(fs.readdirSync(dir)).toEqual(['mcp.json']);
  if (process.platform !== 'win32') expect(fs.statSync(path.join(dir, 'mcp.json')).mode & 0o777).toBe(0o600);
});

it('revoke refuses the built-in local connection', () => {
  const local = store.ensureLocalConnection();
  expect(local).toMatchObject({ id: 'local', name: 'Local', builtIn: true, access: 'full', grants: { ...NO_GRANTS, all: true } });
  expect(store.ensureLocalConnection()).toBe(local);
  expect(store.connections).toHaveLength(1);
  expect(store.revoke('local')).toBe(false);
  expect(store.activeConnection('local')).toBe(local);
  expect(store.revoke('missing')).toBe(false);
});

it('revokeAll keeps local', () => {
  const local = store.ensureLocalConnection();
  const remote = create();
  remote.refreshHash = 'test-hash';
  store.revokeAll();
  expect(store.activeConnection('local')).toBe(local);
  expect(remote.revoked).toBe(true);
  expect(remote.refreshHash).toBeNull();
});

it('activeConnection returns null for revoked', () => {
  const connection = create();
  expect(store.activeConnection(connection.id)).toBe(connection);
  expect(store.revoke(connection.id)).toBe(true);
  expect(store.activeConnection(connection.id)).toBeNull();
  expect(store.activeConnection('missing')).toBeNull();
});

it('effectiveTimezone falls back to config then UTC', () => {
  expect(store.effectiveTimezone(null)).toBe('UTC');
  expect(store.effectiveTimezone('Europe/Paris')).toBe('Europe/Paris');
  store.settings.timezone = 'Asia/Saigon';
  expect(store.effectiveTimezone('Europe/Paris')).toBe('Asia/Saigon');
});

it('clones defaults and input grants before storing them', () => {
  const other = new McpStore(dir);
  other.init();
  const grants = structuredClone(NO_GRANTS);
  const connection = store.createConnection({ name: 'Test', clientId: 'test', clientName: 'Test', access: 'full', grants });
  connection.grants.headings.push('Private');
  store.settings.feedback = { kind: 'heading', heading: 'Inbox' };
  const local = store.ensureLocalConnection();
  local.grants.folders.push('Folder');
  expect(grants).toEqual(NO_GRANTS);
  expect(NO_GRANTS.headings).toEqual([]);
  expect(NO_GRANTS.folders).toEqual([]);
  expect(other.settings).toEqual(DEFAULT_MCP_SETTINGS);
  expect(fs.readdirSync(dir)).toEqual([]);
});

it('serializes queued persistence with a snapshot for each call', async () => {
  const writes = vi.spyOn(fs, 'writeFileSync');
  store.settings.timezone = 'Europe/Paris';
  const first = store.persist();
  store.settings.timezone = 'Asia/Saigon';
  const second = store.persist();
  await Promise.all([first, second]);
  expect(writes.mock.calls.map(call => JSON.parse(call[1] as string).settings.timezone)).toEqual(['Europe/Paris', 'Asia/Saigon']);
  expect(JSON.parse(fs.readFileSync(path.join(dir, 'mcp.json'), 'utf8')).settings.timezone).toBe('Asia/Saigon');
});

it.each(['write', 'rename'] as const)('recovers after a failed %s and removes the temp file', async (operation) => {
  const failure = new Error('transient persistence failure');
  if (operation === 'write') {
    const write = fs.writeFileSync;
    vi.spyOn(fs, 'writeFileSync').mockImplementationOnce((file, data, options) => {
      write(file, data, options);
      throw failure;
    });
  } else {
    vi.spyOn(fs, 'renameSync').mockImplementationOnce(() => { throw failure; });
  }
  await expect(store.persist()).rejects.toBe(failure);
  expect.soft(fs.readdirSync(dir)).toEqual([]);

  const connection = create();
  store.revoke(connection.id);
  await expect(store.persist()).resolves.toBeUndefined();
  const loaded = new McpStore(dir);
  loaded.init();
  expect(loaded.connections).toEqual([connection]);
  expect(fs.readdirSync(dir)).toEqual(['mcp.json']);
});

const DAY_MS = 24 * 60 * 60 * 1000;
const client = (id: string, issuedAt?: number) => ({ client_id: id, redirect_uris: ['http://localhost/callback'], ...(issuedAt === undefined ? {} : { client_id_issued_at: issuedAt }) });

it('prunes clients with no connection that are older than 24 hours, and keeps the rest', () => {
  const now = Date.now();
  const sec = (ms: number) => Math.floor(ms / 1000);
  store.clients['old-orphan'] = client('old-orphan', sec(now - 25 * 60 * 60 * 1000));
  store.clients['fresh-orphan'] = client('fresh-orphan', sec(now - 60 * 60 * 1000));
  store.clients['client-1'] = client('client-1', sec(now - 3 * DAY_MS));
  create();
  expect(store.pruneClients(now)).toBe(true);
  expect(Object.keys(store.clients).sort()).toEqual(['client-1', 'fresh-orphan']);
});

it('on load prunes old orphans and gives clients without a timestamp a fresh one', async () => {
  store.clients['old-orphan'] = client('old-orphan', Math.floor(Date.now() / 1000) - 2 * 86400);
  store.clients['legacy'] = client('legacy');
  await store.persist();
  const loaded = new McpStore(dir);
  loaded.init();
  expect(Object.keys(loaded.clients)).toEqual(['legacy']);
  expect(loaded.clients.legacy.client_id_issued_at).toBeGreaterThan(Date.now() / 1000 - 5);
});

it('pending connections never authorize, and are dropped when stale or on load', async () => {
  const pending = store.createConnection({ name: 'P', clientId: 'client-1', clientName: 'C', access: 'full', grants: structuredClone(NO_GRANTS), pending: true });
  expect(store.activeConnection(pending.id)).toBeNull();
  expect(store.dropStalePending(600_000, Date.now() + 1000)).toBe(false);
  await store.persist();
  const loaded = new McpStore(dir);
  loaded.init();
  expect(loaded.connections).toHaveLength(0);
  expect(store.dropStalePending(600_000, Date.now() + 601_000)).toBe(true);
});
