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
