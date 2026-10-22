import { describe, expect, it } from 'vitest';
import { devFileDeny, loadConfig } from './config';
import path from 'node:path';
import { isFileServingAllowed, normalizePath, resolveConfig } from 'vite';

it('denies default/custom vaults and env files through Vite filesystem URLs without starting Vite', async () => {
  const custom = path.resolve('private-vault');
  const config = await resolveConfig({ configFile: false, server: { fs: { deny: devFileDeny(custom) } } }, 'serve');
  for (const file of ['data/auth.json', 'data/vault.json', 'private-vault/auth.json', 'private-vault/vault.json', '.env', '.env.production']) {
    expect(isFileServingAllowed(config, '/@fs/' + normalizePath(path.resolve(file))), file).toBe(false);
  }
  expect(isFileServingAllowed(config, '/@fs/' + normalizePath(path.resolve('src/main.tsx')))).toBe(true);
});

it('defaults to loopback proxy trust and accepts an explicit proxy range', () => {
  expect(loadConfig({}).trustProxy).toBe('loopback');
  expect(loadConfig({ DAYMARK_TRUST_PROXY: 'uniquelocal' }).trustProxy).toBe('uniquelocal');
});

describe('loadConfig refresh TTL', () => {
  it('reads DAYMARK_REFRESH_TTL_DAYS', () => {
    expect(loadConfig({ DAYMARK_REFRESH_TTL_DAYS: '14' }).refreshTtlDays).toBe(14);
  });

  it.each([undefined, '', 'invalid', '0', '-5', 'Infinity', '1e400', 'abc'])('defaults to 30 days for %s', (value) => {
    expect(loadConfig({ DAYMARK_REFRESH_TTL_DAYS: value }).refreshTtlDays).toBe(30);
  });

  it('ignores the legacy token TTL setting', () => {
    expect(loadConfig({ DAYMARK_TOKEN_TTL_DAYS: '90' }).refreshTtlDays).toBe(30);
  });
});
