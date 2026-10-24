// Node 22 on Windows resolves an explicit test directory through its index.
// Import each helper suite so `node --test scripts/helpers/` runs them all.
import { readdir } from 'node:fs/promises';

for (const file of (await readdir(new URL('./', import.meta.url))).sort()) {
  if (file.endsWith('.test.mjs')) await import(new URL(file, import.meta.url).href);
}
