import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { FEEDBACK_CATEGORY, FEEDBACK_TAG, NO_GRANTS } from '../../../src/sync/mcpProtocol';
import type { FeedbackDestination } from '../../../src/sync/mcpProtocol';
import { createApp } from '../../app';
import { signMcpToken } from '../../auth';
import { loadConfig } from '../../config';
import { FileStore } from '../../store';
import { AuditLog } from '../audit';
import { McpStore } from '../mcpStore';
import { readBacklog, readDocs, readNotes, todayIn } from '../vaultView';

let dir: string;
let server: Server;
let store: FileStore;
let mcp: McpStore;
let audit: AuditLog;
let client: Client;
let today: string;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'daymark-mcp-feedback-'));
  const holder = express();
  server = holder.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const config = { ...loadConfig({ NODE_ENV: 'test' }), dataDir: dir, initialPassword: 'correct horse battery', publicUrl: base };
  store = new FileStore(dir);
  store.init(config.username, config.initialPassword);
  mcp = new McpStore(dir);
  mcp.init();
  audit = new AuditLog(path.join(dir, 'mcp-audit'));
  holder.use(createApp(config, store, { store: mcp, audit }));
  today = todayIn(mcp.effectiveTimezone(config.timezone), new Date());
  const connection = mcp.createConnection({ name: 'Work assistant', clientId: 'c', clientName: 'Test', access: 'read-only', grants: structuredClone(NO_GRANTS) });
  const token = signMcpToken({ typ: 'mcp', cid: connection.id, ver: store.auth.tokenVersion, exp: Math.floor(Date.now() / 1000) + 600 }, store.auth.secret);
  client = new Client({ name: 'test', version: '1' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
});

afterEach(async () => {
  await client.close();
  await new Promise<void>(resolve => server.close(() => resolve()));
  fs.rmSync(dir, { recursive: true, force: true });
});

async function submit(text = 'Daymark should help\nMore detail', kind = 'idea') {
  const result = await client.callTool({ name: 'submit_daymark_feedback', arguments: { text, kind } });
  expect(result.isError).toBeFalsy();
  return JSON.parse((result.content as { text: string }[])[0].text);
}

it('read-only connection with no backlog grant can file feedback to the backlog', async () => {
  const text = `${'x'.repeat(130)}\nKeep all the detail`;
  await submit(text, 'bug');
  expect(readBacklog(store).items).toEqual([expect.objectContaining({
    title: 'x'.repeat(120), description: `${text}\n\nFrom: Work assistant · bug`, category: FEEDBACK_CATEGORY, tags: [FEEDBACK_TAG],
  })]);
  expect((await client.listTools()).tools.find(tool => tool.name === 'submit_daymark_feedback')?.annotations?.readOnlyHint).toBe(false);
  const entries = await audit.list({ connectionId: mcp.connections[0].id });
  expect(entries).toEqual([expect.objectContaining({ action: 'create', targets: [{ key: 'backlog' }] })]);
  expect(JSON.stringify(entries)).not.toContain('Keep all the detail');
});

it('result reveals nothing about the destination', async () => {
  const destinations: FeedbackDestination[] = [{ kind: 'backlog' }, { kind: 'heading', heading: 'Private feedback' }, { kind: 'folder', folder: 'Private/Feedback' }];
  for (const destination of destinations) {
    mcp.settings.feedback = destination;
    expect(await submit()).toEqual({ filed: true });
  }
});

it('heading destination creates today if missing', async () => {
  mcp.settings.feedback = { kind: 'heading', heading: 'Private feedback' };
  expect(readDocs(store)).toEqual([]);
  await submit();
  expect(readDocs(store)).toEqual([expect.objectContaining({ date: today, headings: expect.arrayContaining([
    expect.objectContaining({ name: 'Private feedback', items: [expect.objectContaining({
      title: 'Daymark should help', description: 'Daymark should help\nMore detail\n\nFrom: Work assistant · idea',
      tags: [FEEDBACK_TAG], status: 'not-started', createdDate: today, originalNoteDate: today, heading: 'Private feedback',
    })] }),
  ]) })]);
  expect((await audit.list({ connectionId: mcp.connections[0].id }))[0]).toMatchObject({ action: 'create', targets: [{ key: `doc:${today}` }] });
});

it('folder destination creates a tagged note', async () => {
  mcp.settings.feedback = { kind: 'folder', folder: 'Private/Feedback' };
  await submit();
  const notes = readNotes(store);
  expect(notes).toEqual([expect.objectContaining({
    title: 'Daymark feedback: Daymark should help', folder: 'Private/Feedback', tags: [FEEDBACK_TAG],
    content: 'Daymark should help\nMore detail\n\nFrom: Work assistant · idea',
  })]);
  expect((await audit.list({ connectionId: mcp.connections[0].id }))[0]).toMatchObject({ action: 'create', targets: [{ key: `note:${notes[0].id}` }] });
});

it('validates feedback text and kind without writing', async () => {
  const rev = store.vault.rev;
  for (const args of [{ text: '', kind: 'idea' }, { text: 'x'.repeat(4001), kind: 'bug' }, { text: 'hi', kind: 'unknown' }]) {
    expect((await client.callTool({ name: 'submit_daymark_feedback', arguments: args })).isError).toBe(true);
  }
  expect(store.vault.rev).toBe(rev);
});
