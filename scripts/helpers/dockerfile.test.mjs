import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// Follows the server's relative imports and returns every src/<folder> it reaches.
function serverSourceFolders() {
  const seen = new Set();
  const folders = new Set();
  const visit = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const source = readFileSync(file, 'utf8');
    for (const [, spec] of source.matchAll(/(?:from|import)\s*\(?\s*'(\.{1,2}\/[^']+)'/g)) {
      const base = resolve(dirname(file), spec);
      const target = [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts')].find((p) => existsSync(p) && !p.endsWith('/'));
      if (!target || !/\.tsx?$/.test(target)) continue;
      const rel = relative(root, target).replace(/\\/g, '/');
      if (rel.startsWith('src/')) folders.add(rel.split('/')[1]);
      visit(target);
    }
  };
  visit(join(root, 'server.ts'));
  return folders;
}

test('the server image copies every src folder the server imports', () => {
  const dockerfile = readFileSync(join(root, 'Dockerfile'), 'utf8');
  const copied = new Set([...dockerfile.matchAll(/COPY --from=build \/app\/src\/([a-z]+) /g)].map((m) => m[1]));
  const missing = [...serverSourceFolders()].filter((folder) => !copied.has(folder));
  assert.deepEqual(missing, [], `Dockerfile is missing COPY lines for src/${missing.join(', src/')}`);
});

// Docker's .dockerignore: the last matching line wins and `!` re-includes.
function dockerIgnored(path) {
  let ignored = false;
  for (const raw of readFileSync(join(root, '.dockerignore'), 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const negate = line.startsWith('!');
    const pattern = (negate ? line.slice(1) : line).replace(/\/$/, '');
    const body = pattern.replace(/[.+^$(){}|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*');
    const regex = new RegExp('^' + body + '(?:/.*)?$');
    if (regex.test(path)) ignored = !negate;
  }
  return ignored;
}

test('the web build inside the server image gets the guide that Help is built from', () => {
  // src/utils/guideData.ts bundles docs/guide/*.md and docs/guide/images at build time.
  assert.match(readFileSync(join(root, 'src/utils/guideData.ts'), 'utf8'), /docs\/guide/);
  for (const path of ['docs/guide/tags.md', 'docs/guide/images/tags.png']) assert.equal(dockerIgnored(path), false, `${path} must reach the Docker build`);
  for (const path of ['docs/releases/cycle-18/README.md', 'node_modules/x', 'data/auth.json']) assert.equal(dockerIgnored(path), true, `${path} stays out of the image`);
});
