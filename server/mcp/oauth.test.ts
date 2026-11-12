import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { AddressInfo } from 'node:net';
import { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/utils/defaultData';
import { createApp } from '../app';
import { loadConfig } from '../config';
import { FileStore } from '../store';
import { AuditLog } from './audit';
import { McpStore } from './mcpStore';

const PASSWORD = 'correct horse battery';
const REDIRECT = 'http://localhost:9999/callback';
let dir: string;
let server: Server;
let base: string;
let store: FileStore;
let mcp: McpStore;
let audit: AuditLog;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'daymark-oauth-'));
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

const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('base64url');

async function register(): Promise<string> {
  const res = await fetch(`${base}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      redirect_uris: [REDIRECT], client_name: 'Test <Assistant>', token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'],
    }),
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as { client_id: string }).client_id;
}

async function authorize(clientId: string, challenge: string): Promise<{ html: string; requestId: string }> {
  const url = new URL(`${base}/authorize`);
  url.search = new URLSearchParams({
    response_type: 'code', client_id: clientId, redirect_uri: REDIRECT, code_challenge: challenge,
    code_challenge_method: 'S256', state: 'st-1',
  }).toString();
  const res = await fetch(url);
  expect(res.status).toBe(200);
  const html = await res.text();
  return { html, requestId: /name="requestId" value="([^"]+)"/.exec(html)![1] };
}

const consent = (fields: Record<string, string | string[]>) => {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) for (const item of Array.isArray(v) ? v : [v]) body.append(k, item);
  return fetch(`${base}/oauth/consent`, {
    method: 'POST', redirect: 'manual', body,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
};

const tokenRequest = (params: Record<string, string>) =>
  fetch(`${base}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });

/** Runs register, authorize and consent; returns the auth code and PKCE verifier. */
async function signIn(grants: Record<string, string | string[]> = { everything: '1' }) {
  const clientId = await register();
  const verifier = crypto.randomBytes(32).toString('base64url');
  const { requestId } = await authorize(clientId, sha256(verifier));
  const res = await consent({ requestId, name: 'My assistant', password: PASSWORD, access: 'full', ...grants });
  expect(res.status).toBe(302);
  const location = new URL(res.headers.get('location')!);
  expect(location.searchParams.get('state')).toBe('st-1');
  return { clientId, verifier, code: location.searchParams.get('code')! };
}

const exchange = (s: { clientId: string; verifier: string; code: string }, verifier = s.verifier) =>
  tokenRequest({ grant_type: 'authorization_code', code: s.code, code_verifier: verifier, client_id: s.clientId, redirect_uri: REDIRECT });

describe('OAuth connector sign-in', () => {
  it('discovery: /.well-known/oauth-protected-resource/mcp and /.well-known/oauth-authorization-server describe the endpoints', async () => {
    const resource = await (await fetch(`${base}/.well-known/oauth-protected-resource/mcp`)).json() as Record<string, unknown>;
    expect(resource.resource).toBe(`${base}/mcp`);
    expect(resource.authorization_servers).toEqual([`${base}/`]);
    const meta = await (await fetch(`${base}/.well-known/oauth-authorization-server`)).json() as Record<string, unknown>;
    expect(meta).toMatchObject({
      authorization_endpoint: `${base}/authorize`,
      token_endpoint: `${base}/token`,
      registration_endpoint: `${base}/register`,
      code_challenge_methods_supported: ['S256'],
    });
    expect(meta.scopes_supported).toEqual(['daymark']);
  });

  it('register → authorize page lists known headings and has nothing pre-selected', async () => {
    const { html } = await authorize(await register(), sha256('v'));
    expect(html).toContain(DEFAULT_SETTINGS.defaultHeadings[0]);
    expect(html).toContain('Test &lt;Assistant&gt;');
    expect(html).not.toContain('Test <Assistant>');
    expect(html.match(/checked/g)).toEqual(['checked']); // only "full" access
    expect(html).toMatch(/value="full" checked/);
    expect(html).toContain('name="everything"');
  });

  it('wrong password re-renders with an error and issues no code', async () => {
    const clientId = await register();
    const { requestId } = await authorize(clientId, sha256('v'));
    const res = await consent({ requestId, name: 'x', password: 'nope', everything: '1' });
    expect(res.status).toBe(401);
    expect(await res.text()).toContain('Wrong password.');
    expect(res.headers.get('location')).toBeNull();
    expect(mcp.connections.filter(c => !c.builtIn)).toHaveLength(0);
  });

  it('consent with no grants is rejected', async () => {
    const clientId = await register();
    const { requestId } = await authorize(clientId, sha256('v'));
    const res = await consent({ requestId, name: 'x', password: PASSWORD, access: 'full' });
    expect(res.status).toBe(400);
    expect(await res.text()).toContain('at least one');
    expect(mcp.connections).toHaveLength(0);
  });

  it('full flow with PKCE yields tokens; a wrong code_verifier is rejected', async () => {
    const bad = await signIn();
    expect((await exchange(bad, 'wrong-verifier-wrong-verifier-wrong-verifier-1')).status).toBe(400);

    const good = await signIn({ headings: ['Work'], backlog: '1' });
    const res = await exchange(good);
    expect(res.status).toBe(200);
    const tokens = await res.json() as { access_token: string; token_type: string; expires_in: number; refresh_token: string };
    expect(tokens).toMatchObject({ token_type: 'bearer', expires_in: 900 });
    const connection = mcp.connections.filter(c => c.name === 'My assistant').at(-1)!;
    expect(connection).toMatchObject({ access: 'full', clientName: 'Test <Assistant>' });
    expect(connection.grants).toEqual({ all: false, headings: ['Work'], folders: [], backlog: true, habits: false });
    expect(connection.refreshHash).not.toBeNull();
    // the code is single use
    expect((await exchange(good)).status).toBe(400);
    expect((await audit.list({ action: 'connect' })).length).toBe(2);
    const stored = fs.readFileSync(path.join(dir, 'mcp.json'), 'utf8');
    expect(stored).not.toContain(tokens.refresh_token);
  });

  it('refresh rotates; reusing the old refresh token revokes the connection', async () => {
    const s = await signIn();
    const first = await (await exchange(s)).json() as { refresh_token: string };
    const refresh = (token: string) => tokenRequest({ grant_type: 'refresh_token', refresh_token: token, client_id: s.clientId });

    const rotated = await refresh(first.refresh_token);
    expect(rotated.status).toBe(200);
    const second = await rotated.json() as { refresh_token: string; access_token: string };
    expect(second.refresh_token).not.toBe(first.refresh_token);
    expect((await audit.list({ action: 'refresh' })).length).toBe(1);

    expect((await refresh(first.refresh_token)).status).toBe(400);
    const connection = mcp.connections.find(c => c.name === 'My assistant')!;
    expect(connection.revoked).toBe(true);
    const revokes = await audit.list({ action: 'revoke' });
    expect(revokes).toHaveLength(1);
    expect(revokes[0].message).toBe('refresh_reuse');
    // the newest token no longer works either
    expect((await refresh(second.refresh_token)).status).toBe(400);
  });

  it('password change revokes connections', async () => {
    const s = await signIn();
    await exchange(s);
    const login = await (await fetch(`${base}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: PASSWORD, deviceName: 'd', platform: 'test' }),
    })).json() as { accessToken: string };
    const change = await fetch(`${base}/api/auth/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${login.accessToken}` },
      body: JSON.stringify({ currentPassword: PASSWORD, newPassword: 'a different long password' }),
    });
    expect(change.status).toBe(200);
    expect(mcp.connections.every(c => c.revoked)).toBe(true);
    const onDisk = JSON.parse(fs.readFileSync(path.join(dir, 'mcp.json'), 'utf8')) as { connections: { revoked: boolean }[] };
    expect(onDisk.connections.every(c => c.revoked)).toBe(true);
  });
});
