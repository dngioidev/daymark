import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { AuditLog } from './audit';
import { acquireDataLock } from './lock';

let root: string;
let dir: string;
let clients: Client[];
let releases: (() => void)[];
const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'daymark-mcp-stdio-'));
  dir = path.join(root, 'new-vault');
  clients = [];
  releases = [];
});

afterEach(async () => {
  await Promise.all(clients.map(client => client.close()));
  for (const release of releases) release();
  fs.rmSync(root, { recursive: true, force: true });
});

async function assistant(options: { args?: string[]; env?: Record<string, string>; cwd?: string } = {}) {
  const client = new Client({ name: 'stdio-test', version: '1' });
  clients.push(client);
  const transport = new StdioClientTransport({
    // Outside the repository, use its installed shim so npx cannot try to download tsx.
    command: options.cwd ? path.resolve(`node_modules/.bin/tsx${process.platform === 'win32' ? '.cmd' : ''}`) : command,
    args: [...(options.cwd ? [] : ['tsx']), path.resolve('server/mcp-stdio.ts'), ...(options.args ?? ['--data', dir])], stderr: 'pipe',
    env: { ...(process.env.NODE_OPTIONS ? { NODE_OPTIONS: process.env.NODE_OPTIONS } : {}), ...options.env },
    cwd: options.cwd,
  });
  let stderr = '';
  transport.stderr!.on('data', chunk => { stderr += chunk.toString(); });
  const errors: Error[] = [];
  client.onerror = error => errors.push(error);
  await client.connect(transport);
  return { client, stderr: () => stderr, errors };
}

async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args });
  expect(result.isError).toBeFalsy();
  const content = result.content as { type: string; text: string }[];
  expect(content[0].type).toBe('text');
  return JSON.parse(content[0].text);
}

async function refusedProcess() {
  const child = spawn(command, ['tsx', 'server/mcp-stdio.ts', '--data', process.platform === 'win32' ? `"${dir}"` : dir], {
    shell: process.platform === 'win32', stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk.toString(); });
  child.stderr.on('data', chunk => { stderr += chunk.toString(); });
  let timeout: ReturnType<typeof setTimeout>;
  try {
    const code = await new Promise<number | null>((resolve, reject) => {
      timeout = setTimeout(() => reject(new Error('Lock refusal process did not exit')), 15_000);
      child.once('error', reject);
      child.once('close', resolve);
    });
    return { code, stdout, stderr };
  } finally {
    clearTimeout(timeout!);
    child.stdin.end();
    if (child.exitCode === null) child.kill();
  }
}

it('create_note then list_notes works on an empty local vault', async () => {
  const ai = await assistant();
  expect(await call(ai.client, 'list_notes')).toEqual([]);
  const note = await call(ai.client, 'create_note', { title: 'Local plan', folder: '', content: 'local draft' });
  expect(await call(ai.client, 'list_notes')).toEqual([expect.objectContaining({ id: note.id, title: 'Local plan' })]);
  const saved = JSON.parse(fs.readFileSync(path.join(dir, 'vault.json'), 'utf8'));
  expect(saved.entities[`note:${note.id}`]).toMatchObject({ updatedBy: 'mcp:local', value: { content: 'local draft' } });
  expect(fs.existsSync(path.join(dir, 'auth.json'))).toBe(false);
  expect(ai.stderr()).toBe('');
  expect(ai.errors).toEqual([]);
  await ai.client.close();
  await expect.poll(() => fs.existsSync(path.join(dir, 'daymark.lock'))).toBe(false);
}, 20_000);

it.each([
  { mode: 'environment', timezone: 'Pacific/Kiritimati' },
  { mode: 'CLI overrides environment', timezone: 'Pacific/Pago_Pago' },
  { mode: 'default data folder', timezone: 'UTC' },
])('uses $mode for its data folder and timezone', async ({ mode, timezone }) => {
  const defaultMode = mode === 'default data folder';
  const cliMode = mode === 'CLI overrides environment';
  const target = defaultMode ? path.join(root, 'data') : dir;
  const { client } = await assistant({
    args: cliMode ? ['--data', dir, '--timezone', timezone] : [],
    cwd: defaultMode ? root : undefined,
    env: defaultMode ? {} : { DATA_DIR: cliMode ? path.join(root, 'unused') : dir, DAYMARK_TZ: 'Pacific/Kiritimati' },
  });
  const before = new Intl.DateTimeFormat('sv-SE', { timeZone: timezone }).format(new Date());
  const day = await call(client, 'get_day');
  const after = new Intl.DateTimeFormat('sv-SE', { timeZone: timezone }).format(new Date());
  expect([before, after]).toContain(day.date);
  expect(fs.existsSync(path.join(target, 'daymark.lock'))).toBe(true);
  expect(fs.existsSync(path.join(root, 'unused'))).toBe(false);
}, 20_000);

it('audit entries are written under local', async () => {
  const { client } = await assistant();
  await call(client, 'create_note', { title: 'Private title', folder: '', content: 'Private body' });
  await call(client, 'list_notes');
  const entries = await new AuditLog(path.join(dir, 'mcp-audit')).list();
  expect(entries).toHaveLength(2);
  expect(entries).toEqual(expect.arrayContaining([
    expect.objectContaining({ connectionId: 'local', tool: 'create_note', action: 'create' }),
    expect.objectContaining({ connectionId: 'local', tool: 'list_notes', action: 'read' }),
  ]));
  expect(JSON.stringify(entries)).not.toMatch(/Private title|Private body/);
}, 20_000);

it('second stdio process on the same dir exits 1 with the lock message', async () => {
  await assistant();
  const result = await refusedProcess();
  expect(result.code).toBe(1);
  expect(result.stdout).toBe('');
  expect(result.stderr).toContain(`Daymark data in ${dir} is in use by the stdio (pid `);
  expect(result.stderr).toContain('Stop it first.');
}, 20_000);

it('stdio refuses while a server holds the lock', async () => {
  releases.push(acquireDataLock(dir, 'server'));
  const result = await refusedProcess();
  expect(result.code).toBe(1);
  expect(result.stdout).toBe('');
  expect(result.stderr).toContain(`Daymark data in ${dir} is in use by the server (pid ${process.pid}). Stop it first.`);
  expect(fs.existsSync(path.join(dir, 'vault.json'))).toBe(false);
}, 20_000);
