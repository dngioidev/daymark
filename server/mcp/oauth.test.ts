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
import { renderConsentPage } from './consentPage';
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
  expect((await consent({ requestId, stage: 'password', name: 'My assistant', password: PASSWORD })).status).toBe(200);
  const res = await consent({ requestId, stage: 'grant', access: 'full', ...grants });
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

  it('registering a client drops old orphan registrations', async () => {
    const old = await register();
    mcp.clients[old].client_id_issued_at = Math.floor(Date.now() / 1000) - 2 * 86400;
    const fresh = await register();
    expect(mcp.clients[old]).toBeUndefined();
    expect(mcp.clients[fresh]).toBeDefined();
  });

  it('registration never prunes a client with a live pending request, and consent fails closed without its client', async () => {
    const id = await register();
    mcp.clients[id].client_id_issued_at = Math.floor(Date.now() / 1000) - 2 * 86400;
    const { requestId } = await authorize(id, sha256('v'));
    await register();
    expect(mcp.clients[id]).toBeDefined();
    delete mcp.clients[id];
    const res = await consent({ requestId, stage: 'password', name: 'x', password: PASSWORD });
    expect(res.status).toBe(400);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(mcp.connections.filter(c => !c.builtIn)).toHaveLength(0);
    const grant = await consent({ requestId, stage: 'grant', access: 'full', everything: '1' });
    expect(grant.status).toBe(400);
    expect(mcp.connections.filter(c => !c.builtIn)).toHaveLength(0);
  });

  it('a flood from one client does not evict another client pending request; its 6th request evicts its own oldest', async () => {
    const quiet = await register();
    const victim = await authorize(quiet, sha256('v'));
    const noisy = await register();
    const mine: string[] = [];
    for (let i = 0; i < 6; i++) mine.push((await authorize(noisy, sha256('v'))).requestId);
    const check = (requestId: string) => consent({ requestId, stage: 'password', name: 'x', password: 'nope' }).then(r => r.status);
    expect(await check(victim.requestId)).toBe(401); // still pending (wrong password, not expired)
    expect(await check(mine[0])).toBe(400); // oldest of the noisy client evicted
    expect(await check(mine[1])).toBe(401);
    expect(await check(mine[5])).toBe(401);
  });

  it('over the per-client cap, unverified requests are evicted before a verified one', async () => {
    const id = await register();
    const first = await authorize(id, sha256('v'));
    expect((await consent({ requestId: first.requestId, stage: 'password', name: 'x', password: PASSWORD })).status).toBe(200);
    const others: string[] = [];
    for (let i = 0; i < 5; i++) others.push((await authorize(id, sha256('v'))).requestId);
    // 6 requests were made; the verified (oldest) one survives and the oldest unverified went
    expect((await consent({ requestId: first.requestId, stage: 'grant', access: 'full', everything: '1' })).status).toBe(302);
    expect((await consent({ requestId: others[0], stage: 'password', name: 'x', password: 'nope' })).status).toBe(400);
  });

  it('after verification, a wrong password unverifies the request', async () => {
    const id = await register();
    const { requestId } = await authorize(id, sha256('v'));
    await consent({ requestId, stage: 'password', name: 'x', password: PASSWORD });
    expect((await consent({ requestId, stage: 'password', name: 'x', password: 'nope' })).status).toBe(401);
    const empty = await consent({ requestId, stage: 'grant', access: 'full' });
    expect(empty.status).toBe(403);
    const html = await empty.text();
    expect(html).not.toContain('name="headings"');
    expect(html).not.toContain('name="folders"');
    expect((await consent({ requestId, stage: 'grant', access: 'full', everything: '1' })).status).toBe(403);
    expect(mcp.connections.filter(c => !c.builtIn)).toHaveLength(0);
  });

  it('a refresh request with a foreign resource is rejected with invalid_target', async () => {
    const s = await signIn();
    const tokens = await (await exchange(s)).json() as { refresh_token: string };
    const bad = await tokenRequest({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: s.clientId, resource: 'https://evil.example.com/mcp' });
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { error: string }).error).toBe('invalid_target');
    const ok = await tokenRequest({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: s.clientId, resource: `${base}/mcp` });
    expect(ok.status).toBe(200);
  });

  it('dropping a stale pending connection is saved to mcp.json', async () => {
    await signIn();
    const pendingOne = mcp.connections.find(c => c.pending)!;
    pendingOne.createdAt = new Date(Date.now() - 11 * 60 * 1000).toISOString();
    await authorize(await register(), sha256('v'));
    await mcp.persist(); // queued behind the purge save
    const onDisk = JSON.parse(fs.readFileSync(path.join(dir, 'mcp.json'), 'utf8')) as { connections: { id: string }[] };
    expect(onDisk.connections.some(c => c.id === pendingOne.id)).toBe(false);
  });

  it('register → authorize page shows no vault data and asks for the password', async () => {
    const { html } = await authorize(await register(), sha256('v'));
    expect(html).not.toContain(DEFAULT_SETTINGS.defaultHeadings[0]);
    expect(html).not.toContain('name="headings"');
    expect(html).not.toContain('name="folders"');
    expect(html).toContain('name="password"');
    expect(html).toContain('Test &lt;Assistant&gt;');
    expect(html).not.toContain('Test <Assistant>');
    expect(html).not.toContain('checked');
  });

  it('shows where access will be sent, with a warning only for unknown hosts', async () => {
    const { html } = await authorize(await register(), sha256('v'));
    expect(html).toContain('Daymark will send access to <strong>localhost:9999</strong>');
    expect(html).not.toContain('is not a known AI app');
    const cases: [string, boolean][] = [
      ['claude.ai', true], ['api.claude.com', true], ['gemini.google.com', true], ['evil.example', false], ['claude.ai.evil.example', false],
    ];
    for (const [host, known] of cases) {
      const page = renderConsentPage({ requestId: 'r', clientName: 'c', redirectHost: host, step: 'password' });
      expect(page.includes('is not a known AI app')).toBe(!known);
    }
  });

  it('after the password the scope step lists headings and the scope controls', async () => {
    const clientId = await register();
    const { requestId } = await authorize(clientId, sha256('v'));
    const res = await consent({ requestId, stage: 'password', name: 'x', password: PASSWORD });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain(DEFAULT_SETTINGS.defaultHeadings[0]);
    expect(html).toContain('name="everything"');
    expect(html).not.toContain('name="password"');
    expect(html.match(/checked/g)).toEqual(['checked']); // only "full" access
    expect(res.headers.get('x-frame-options')).toBe('DENY');
  });

  it('a final POST on an unverified request is refused', async () => {
    const clientId = await register();
    const { requestId } = await authorize(clientId, sha256('v'));
    const res = await consent({ requestId, stage: 'grant', access: 'full', everything: '1' });
    expect(res.status).toBe(403);
    expect(res.headers.get('location')).toBeNull();
    expect(mcp.connections.filter(c => !c.builtIn)).toHaveLength(0);
    // a name and password sent with the grant stage do not count as verification
    const sneaky = await consent({ requestId, stage: 'grant', name: 'x', password: PASSWORD, everything: '1' });
    expect(sneaky.status).toBe(403);
    expect(mcp.connections.filter(c => !c.builtIn)).toHaveLength(0);
  });

  it('wrong password re-renders with an error, shows no vault data, issues no code and is audited', async () => {
    const clientId = await register();
    const { requestId } = await authorize(clientId, sha256('v'));
    const res = await consent({ requestId, stage: 'password', name: 'x', password: 'nope' });
    expect(res.status).toBe(401);
    const html = await res.text();
    expect(html).toContain('Wrong password.');
    expect(html).not.toContain('name="headings"');
    expect(res.headers.get('location')).toBeNull();
    expect(mcp.connections.filter(c => !c.builtIn)).toHaveLength(0);
    const refused = await audit.list({ action: 'refused' });
    expect(refused).toHaveLength(1);
    expect(refused[0]).toMatchObject({ tool: 'oauth', connectionId: '', connectionName: 'Test <Assistant>' });
  });

  it('a wrong or rate-limited password on an already verified request does not show the scope step', async () => {
    const clientId = await register();
    const { requestId } = await authorize(clientId, sha256('v'));
    expect((await consent({ requestId, stage: 'password', name: 'x', password: PASSWORD })).status).toBe(200);
    const wrong = await consent({ requestId, stage: 'password', name: 'x', password: 'nope' });
    expect(wrong.status).toBe(401);
    const html = await wrong.text();
    expect(html).toContain('Wrong password.');
    expect(html).not.toContain('name="headings"');
    expect(html).not.toContain('name="folders"');
    expect(html).not.toContain(DEFAULT_SETTINGS.defaultHeadings[0]);
    for (let i = 0; i < 10; i++) await consent({ requestId, stage: 'password', name: 'x', password: 'nope' });
    const limited = await consent({ requestId, stage: 'password', name: 'x', password: PASSWORD });
    expect(limited.status).toBe(429);
    expect(await limited.text()).not.toContain('name="headings"');
  });

  it('login failures count toward the consent lockout (shared limiter)', async () => {
    for (let i = 0; i < 10; i++) {
      await fetch(`${base}/api/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'wrong', deviceName: 'd', platform: 'test' }),
      });
    }
    const clientId = await register();
    const { requestId } = await authorize(clientId, sha256('v'));
    const res = await consent({ requestId, stage: 'password', name: 'x', password: PASSWORD });
    expect(res.status).toBe(429);
    expect(await res.text()).toContain('Too many failed attempts');
  });

  it('consent with no grants is rejected', async () => {
    const clientId = await register();
    const { requestId } = await authorize(clientId, sha256('v'));
    await consent({ requestId, stage: 'password', name: 'x', password: PASSWORD });
    const res = await consent({ requestId, stage: 'grant', access: 'full' });
    expect(res.status).toBe(400);
    expect(await res.text()).toContain('at least one');
    expect(mcp.connections.filter(c => !c.builtIn)).toHaveLength(0);
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

  it('a wrong code_verifier burns the code, so the right verifier cannot be retried', async () => {
    const s = await signIn();
    expect((await exchange(s, 'wrong-verifier-wrong-verifier-wrong-verifier-1')).status).toBe(400);
    expect((await exchange(s)).status).toBe(400);
  });

  it('the token endpoint rejects a resource that is not this servers /mcp', async () => {
    const s = await signIn();
    const params = { grant_type: 'authorization_code', code: s.code, code_verifier: s.verifier, client_id: s.clientId, redirect_uri: REDIRECT };
    const bad = await tokenRequest({ ...params, resource: 'https://evil.example.com/mcp' });
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { error: string }).error).toBe('invalid_target');
    const ok = await signIn();
    const good = await tokenRequest({ ...params, code: ok.code, code_verifier: ok.verifier, client_id: ok.clientId, resource: `${base}/mcp` });
    expect(good.status).toBe(200);
  });

  it('a connection stays pending until its code is exchanged, and stale pending ones are dropped', async () => {
    const s = await signIn();
    const connection = mcp.connections.find(c => c.name === 'My assistant')!;
    expect(connection.pending).toBe(true);
    expect(mcp.activeConnection(connection.id)).toBeNull();
    expect((await exchange(s)).status).toBe(200);
    expect(connection.pending).toBeUndefined();
    expect(mcp.activeConnection(connection.id)).toBe(connection);

    const stale = await signIn();
    const pendingOne = mcp.connections.filter(c => c.pending).at(-1)!;
    pendingOne.createdAt = new Date(Date.now() - 11 * 60 * 1000).toISOString();
    await register(); // any provider call purges
    await authorize(await register(), sha256('v'));
    expect(mcp.connections.some(c => c.id === pendingOne.id)).toBe(false);
    expect((await exchange(stale)).status).toBe(400);
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

  it('/revoke by connection id alone does nothing; the real refresh token revokes', async () => {
    const s = await signIn();
    const tokens = await (await exchange(s)).json() as { refresh_token: string };
    const connection = mcp.connections.find(c => c.name === 'My assistant')!;
    const revoke = (token: string) => fetch(`${base}/revoke`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token, client_id: s.clientId }),
    });
    expect((await revoke(`${connection.id}.not-the-token`)).status).toBe(200);
    expect(connection.revoked).toBe(false);
    expect(await audit.list({ action: 'revoke' })).toHaveLength(0);
    expect((await revoke(tokens.refresh_token)).status).toBe(200);
    expect(connection.revoked).toBe(true);
    expect(await audit.list({ action: 'revoke' })).toHaveLength(1);
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
