import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export type RenderingExpectation = {
  mode: 'native' | 'preserved-source' | 'restricted';
  visibleText: string[];
  elements: { selector: string; count: number }[];
  sourceTokens: string[];
};
export type MarkdownRenderingCase = {
  id: string;
  family: string;
  sourceFile: string;
  notes: RenderingExpectation;
  preview: RenderingExpectation;
  daily: { sourceTokens: string[]; taskIds: string[] };
  fidelity: 'verbatim' | 'semantic';
};

const DIR = join(process.cwd(), 'fixtures', 'notes', 'rendering');
const MODES = ['native', 'preserved-source', 'restricted'];

export function loadMarkdownRenderingCases(dir = DIR): Array<MarkdownRenderingCase & { source: string }> {
  const manifest = JSON.parse(readFileSync(join(dir, 'cases.json'), 'utf8')) as MarkdownRenderingCase[];
  const seen = new Set<string>();
  return manifest.map(entry => {
    if (seen.has(entry.id)) throw new Error(`Duplicate fixture id: ${entry.id}`);
    seen.add(entry.id);
    for (const surface of ['notes', 'preview'] as const) {
      const expectation = entry[surface];
      if (!expectation) throw new Error(`${entry.id}: missing ${surface} expectation`);
      if (!MODES.includes(expectation.mode)) throw new Error(`${entry.id}: invalid ${surface} mode ${expectation.mode}`);
    }
    if (!entry.daily) throw new Error(`${entry.id}: missing daily expectation`);
    return { ...entry, source: readFileSync(join(dir, entry.sourceFile), 'utf8') };
  });
}
