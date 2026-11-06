import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadMarkdownRenderingCases } from './markdownRenderingFixtures';

const surface = { mode: 'native', visibleText: [], elements: [], sourceTokens: [] };
function dirWith(manifest: unknown, files: Record<string, string> = { 'a.md': 'x' }) {
  const dir = mkdtempSync(join(tmpdir(), 'md-fixtures-'));
  writeFileSync(join(dir, 'cases.json'), JSON.stringify(manifest));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return dir;
}
const entry = (over = {}) => ({ id: 'a', family: 'f', sourceFile: 'a.md', fidelity: 'verbatim', notes: surface, preview: surface, daily: { sourceTokens: [], taskIds: [] }, ...over });

describe('markdown rendering fixture loader', () => {
  it('loads the shipped corpus with unique ids and sources', () => {
    const cases = loadMarkdownRenderingCases();
    expect(cases.length).toBeGreaterThan(25);
    expect(new Set(cases.map(c => c.id)).size).toBe(cases.length);
  });
  it('rejects duplicate ids', () => {
    expect(() => loadMarkdownRenderingCases(dirWith([entry(), entry()]))).toThrow(/Duplicate/);
  });
  it('rejects missing source files', () => {
    expect(() => loadMarkdownRenderingCases(dirWith([entry({ sourceFile: 'nope.md' })]))).toThrow();
  });
  it('rejects missing surface expectations', () => {
    expect(() => loadMarkdownRenderingCases(dirWith([entry({ preview: undefined })]))).toThrow(/missing preview/);
  });
  it('rejects invalid modes', () => {
    expect(() => loadMarkdownRenderingCases(dirWith([entry({ notes: { ...surface, mode: 'magic' } })]))).toThrow(/invalid notes mode/);
  });
});
