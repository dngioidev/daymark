import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { FileStore } from './store';

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'daymark-store-')); });
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

it('init without account leaves auth unset and writes nothing when requireAccount is false', () => {
  const store = new FileStore(dir);
  expect(store.init('admin', null, { requireAccount: false })).toEqual({ createdAccount: false });
  expect(store.auth).toBeUndefined();
  expect(fs.readdirSync(dir)).toEqual([]);
});

it('does not create an account in local mode even if a password is supplied', () => {
  const store = new FileStore(dir);
  store.init('admin', 'test-password', { requireAccount: false });
  expect(store.auth).toBeUndefined();
  expect(fs.readdirSync(dir)).toEqual([]);
});

it('loads an existing account and vault in local mode', async () => {
  const original = new FileStore(dir);
  original.init('admin', 'test-password');
  original.vault.rev = 7;
  await original.persist('vault.json');
  const store = new FileStore(dir);
  expect(store.init('admin', null, { requireAccount: false })).toEqual({ createdAccount: false });
  expect(store.auth).toEqual(original.auth);
  expect(store.vault.rev).toBe(7);
});

it('still requires an account by default', () => {
  expect(() => new FileStore(dir).init('admin', null)).toThrow('No admin account yet: set DAYMARK_PASSWORD for the first start.');
});
