import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { NO_GRANTS } from '../../../src/sync/mcpProtocol';
import { FileStore } from '../../store';
import { VaultQueue, writeEntity } from '../../vault';
import { McpStore } from '../mcpStore';
import { createCommit } from './define';

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
