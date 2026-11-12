import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { NO_GRANTS } from '../../../src/sync/mcpProtocol';
import { FileStore } from '../../store';
import { VaultQueue, writeEntity } from '../../vault';
import { McpStore } from '../mcpStore';
import { createCommit, defineTool } from './define';
import type { ToolContext } from './define';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { vi } from 'vitest';

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'daymark-define-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

it('createCommit runs the builder inside the queue, so it sees a doc changed after it was enqueued', async () => {
  const store = new FileStore(dir);
  const mcp = new McpStore(dir);
  const connection = mcp.createConnection({ name: 'A', clientId: 'c', clientName: 'C', access: 'full', grants: { ...structuredClone(NO_GRANTS), all: true } });
  const vault = new VaultQueue();
  const doc = (title: string) => ({ date: '2026-11-12', type: 'daily', updatedAt: '2026-11-12T00:00:00Z', headings: [{ name: 'Work', notesContent: '', items: [{ id: 't', title }] }] });
  writeEntity(store, 'doc:2026-11-12', doc('original'), 'test', '2026-11-12T00:00:00Z');

  let release!: () => void;
  // a sync job that is already running when the commit is enqueued, and changes the doc only once released
  const held = vault.run(async () => {
    await new Promise<void>((resolve) => { release = resolve; });
    writeEntity(store, 'doc:2026-11-12', doc('from the phone'), 'device', '2026-11-12T00:00:01Z');
  });
  let seen: string | undefined;
  const commit = createCommit(store, vault, connection, () => new Date('2026-11-12T12:00:00Z'));
  const pending = commit(() => {
    seen = (store.vault.entities['doc:2026-11-12'].value as { headings: { items: { title: string }[] }[] }).headings[0].items[0].title;
    return [];
  });
  await new Promise((resolve) => setTimeout(resolve, 0)); // let the held job start
  release();
  await Promise.all([held, pending]);
  expect(seen).toBe('from the phone');
});

async function runWithFailingAudit(readOnly: boolean) {
  const mcp = new McpStore(dir);
  mcp.settings.enabled = true;
  const connection = mcp.createConnection({ name: 'A', clientId: 'c', clientName: 'C', access: 'full', grants: { ...structuredClone(NO_GRANTS), all: true } });
  let handler!: (args: unknown) => Promise<{ content: { text: string }[]; isError?: boolean }>;
  const server = { registerTool: (_n: string, _c: unknown, h: typeof handler) => { handler = h; } } as unknown as McpServer;
  const ctx = {
    store: new FileStore(dir), mcp, vault: new VaultQueue(), connection, now: () => new Date(), today: () => '2026-11-12',
    audit: { append: () => Promise.reject(new Error('disk full')) }, commit: async () => {},
  } as unknown as ToolContext;
  defineTool(server, ctx, { name: 't', description: 'd', input: { x: z.string().optional() }, readOnly, run: async () => ({ result: { secret: 'data' }, action: 'read' }) });
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
  const result = await handler({});
  const logged = spy.mock.calls.map(c => String(c[0]));
  spy.mockRestore();
  return { result, logged };
}

it('a read-only tool fails closed when the audit entry cannot be written', async () => {
  const { result } = await runWithFailingAudit(true);
  expect(result.isError).toBe(true);
  expect(result.content[0].text).not.toContain('secret');
});

it('a write tool keeps its result when the audit write fails, and logs the gap', async () => {
  const { result, logged } = await runWithFailingAudit(false);
  expect(result.isError).toBeUndefined();
  expect(result.content[0].text).toContain('secret');
  expect(logged.some(line => line.includes('AUDIT GAP'))).toBe(true);
});
