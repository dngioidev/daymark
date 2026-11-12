import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { NO_GRANTS } from '../../../src/sync/mcpProtocol';
import type { DailyDocument } from '../../../src/types/daymark';
import { FileStore } from '../../store';
import { VaultQueue } from '../../vault';
import { AuditLog } from '../audit';
import { McpStore } from '../mcpStore';
import { NOT_SHARED } from '../scope';
import { registerAllTools } from './index';

let dir: string;
let store: FileStore;
let mcp: McpStore;
let audit: AuditLog;
let client: Client;
let server: McpServer;
const date = '2026-11-12';
function put(key: string, value: unknown) {
  store.vault.entities[key] = { rev: 1, value, updatedBy: 'test', updatedAt: `${date}T00:00:00Z` };
}
function day(date: string): DailyDocument {
  return { date, type: 'daily', updatedAt: `${date}T00:00:00Z`, rawMarkdown: 'secret', removedTaskIds: ['private-id'],
    headings: ['Work', 'Personal'].map(name => ({ name, notesContent: '', items: [{
      id: `${name}-${date}`, title: `needle ${name}`, status: 'in-progress', heading: name, order: 1,
      createdDate: date, originalNoteDate: date, historyLog: [], tags: ['tag'],
    }] })) };
}
beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'daymark-read-'));
  store = new FileStore(dir);
  mcp = new McpStore(dir);
  mcp.settings.enabled = true;
  audit = new AuditLog(path.join(dir, 'audit'));
  const connection = mcp.createConnection({ name: 'Test', clientName: 'Test', clientId: 'test', access: 'read-only', grants: { ...NO_GRANTS, headings: ['Work'], folders: ['Work'] } });
  put('doc:2026-11-11', day('2026-11-11'));
  for (const folder of ['Work', 'Private']) put(`note:${folder}`, { id: folder, title: `needle ${folder}`, folder, content: 'needle', tags: [], createdAt: `${date}T00:00:00Z`, updatedAt: `${date}T00:00:00Z` });
  server = new McpServer({ name: 'test', version: '1' });
  registerAllTools(server, { store, mcp, audit, vault: new VaultQueue(), connection, today: () => date, now: () => new Date(`${date}T12:00:00Z`), commit: async () => { throw new Error('Read tool wrote to vault'); } });
  client = new Client({ name: 'test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
});
afterEach(async () => {
  await client.close();
  await server.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
const call = (name: string, args: Record<string, unknown> = {}) => client.callTool({ name, arguments: args }) as Promise<{ isError?: boolean; content: { text: string }[] }>;
const data = async (name: string, args: Record<string, unknown> = {}) => {
  const result = await call(name, args);
  expect(result.isError).toBeFalsy();
  return JSON.parse(result.content[0].text);
};

it('search never returns out-of-scope hits', async () => {
  expect(await data('search', { query: 'needle' })).toEqual([
    expect.objectContaining({ kind: 'task', title: 'needle Work' }), expect.objectContaining({ kind: 'note', noteId: 'Work' }),
  ]);
});
it('get_note outside scope and a missing id give the same message', async () => {
  for (const id of ['Private', 'missing']) {
    const result = await call('get_note', { id });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe(NOT_SHARED);
  }
});
it('list_tasks across days hides other headings', async () => {
  put(`doc:${date}`, day(date));
  const result = await data('list_tasks', { from: '2026-11-11', to: date });
  expect(result).toHaveLength(2);
  expect(result.every((item: { heading: string }) => item.heading === 'Work')).toBe(true);
  expect(await data('list_tasks', { from: '2026-11-11', to: date, heading: 'Personal' })).toEqual([]);
  expect(await data('list_tasks', { tag: 'absent' })).toEqual([]);
});
it('habits not granted → list_habits refused and summary.habits null', async () => {
  expect(await call('list_habits')).toMatchObject({ isError: true, content: [{ text: NOT_SHARED }] });
  expect(await data('get_day_summary')).toMatchObject({ habits: null, backlogPicked: null });
});
it("get_day_summary before rollover shows yesterday's open task", async () => {
  const before = structuredClone(store.vault);
  expect(await data('get_day_summary')).toMatchObject({ date, counts: { open: 1 }, sections: [expect.objectContaining({ heading: 'Work', open: [expect.objectContaining({ id: 'Work-2026-11-11' })] })] });
  expect(store.vault).toEqual(before);
});
it('get_day strips internal fields even with all grants', async () => {
  mcp.connections[0].grants.all = true;
  const result = await data('get_day', { date: '2026-11-11' });
  expect(result).not.toHaveProperty('rawMarkdown');
  expect(result).not.toHaveProperty('removedTaskIds');
});
it('notes, backlog and habits use their grants and helpers', async () => {
  expect(await data('list_notes')).toEqual([expect.objectContaining({ id: 'Work', folder: 'Work' })]);
  expect(await data('list_notes', { folder: 'Private' })).toEqual([]);
  expect(await data('get_note', { id: 'Work' })).toMatchObject({ content: 'needle' });
  expect(await call('list_backlog')).toMatchObject({ isError: true });
  mcp.connections[0].grants.all = true;
  put('backlog', { items: [{ id: 'b', title: 'visible', order: 1, createdAt: '', updatedAt: '' }, { id: 'hidden', title: 'hidden', pickedOn: date, order: 2, createdAt: '', updatedAt: '' }] });
  put('habits', { habits: [{ id: 'h', name: 'Read', order: 0, warnAfterDays: 3, addedOn: date, updatedAt: '' }] });
  expect(await data('list_backlog')).toEqual([expect.objectContaining({ id: 'b' })]);
  expect(await data('list_habits')).toEqual([expect.objectContaining({ habit: expect.objectContaining({ id: 'h' }), done: false })]);
});
it('review and read calls carry the required audit metadata', async () => {
  expect(await data('get_review', { from: '2026-11-11', to: date })).toMatchObject({ from: '2026-11-11', to: date, created: 1, notesTouched: [{ id: 'Work', title: 'needle Work' }] });
  await data('get_day_summary');
  await data('search', { query: 'needle', limit: 1 });
  const entries = await audit.list({ connectionId: mcp.connections[0].id });
  expect(entries).toEqual(expect.arrayContaining([
    expect.objectContaining({ tool: 'get_review', action: 'read', count: 2 }),
    expect.objectContaining({ tool: 'get_day_summary', targets: [{ key: `doc:${date}` }] }),
    expect.objectContaining({ tool: 'search', action: 'search', count: 1 }),
  ]));
});
it('rejects invalid dates, oversized limits and reviews over 92 days', async () => {
  for (const [name, args] of [
    ['get_day', { date: '2026-02-30' }], ['list_tasks', { limit: 201 }], ['search', { query: 'needle', limit: 51 }],
    ['get_review', { from: '2026-01-01', to: date }], ['get_review', { from: date, to: '2026-11-11' }],
  ] as const) expect(await call(name, args)).toMatchObject({ isError: true });
});

it('advertises all read tools, applies result limits and accepts 92 inclusive days', async () => {
  const tools = (await client.listTools()).tools;
  expect(tools.map(tool => tool.name)).toEqual(expect.arrayContaining(['ping', 'get_day_summary', 'get_review', 'get_day', 'list_tasks', 'search', 'list_notes', 'get_note', 'list_backlog', 'list_habits']));
  expect(tools.filter(tool => !/^(create|update|complete|reopen|delete|append)_/.test(tool.name)).every(tool => tool.annotations?.readOnlyHint === true)).toBe(true);
  expect(await data('list_tasks', { from: '2026-11-11', to: date, limit: 1, status: 'in-progress', tag: 'tag', heading: 'work' })).toHaveLength(1);
  expect(await data('get_review', { from: '2026-08-13', to: date })).toMatchObject({ from: '2026-08-13', to: date });
});
