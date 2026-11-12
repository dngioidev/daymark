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
  store.clients['client-1'] = { client_id: 'client-1', redirect_uris: ['http://localhost/callback'] };
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
