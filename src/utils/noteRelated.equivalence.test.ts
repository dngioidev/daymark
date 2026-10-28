import { expect, it } from 'vitest';
import { buildNoteIndex, pairKey, suggestRelated, type NoteIndex, type RelatedSuggestion } from './noteRelated';
import { relatedNotes } from './fixtures/relatedNotes';
import { graphPerformanceNotes } from './fixtures/graphPerformance';

// Straightforward pre-optimization algorithm, intentionally independent of postings.
function reference(index: NoteIndex, id: string, dismissed = new Set<string>()): RelatedSuggestion[] {
  const source = index.notes.get(id)!;
  if (!source.hasBody || !source.norm) return [];
  const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
  const overlap = (a: ReadonlySet<string>, b: ReadonlySet<string>) => [...a].some(v => b.has(v));
  const mention = (body: string, phrase: string) => !!phrase && ` ${body} `.includes(` ${phrase} `);
  const result: RelatedSuggestion[] = [];
  for (const [otherId, target] of index.notes) {
    if (otherId === id || !target.hasBody || !target.norm || source.outgoing.has(otherId) || source.incoming.has(otherId) || dismissed.has(pairKey(id, otherId))) continue;
    const terms = [...source.weights.keys()].filter(term => target.weights.has(term)).sort(compare);
    if (terms.length < 2 && !terms.some(term => source.titleTerms.has(term) || target.titleTerms.has(term))) continue;
    const dot = terms.reduce((sum, term) => sum + source.weights.get(term)! * target.weights.get(term)!, 0);
    const score = dot / (source.norm * target.norm) + (overlap(source.tags, target.tags) ? .08 : 0) + (overlap(source.outgoing, target.outgoing) ? .06 : 0) + (mention(source.body, target.titlePhrase) || mention(target.body, source.titlePhrase) ? .12 : 0);
    if (score >= .30) result.push({ noteId: otherId, score, sharedTerms: terms });
  }
  return result.sort((a, b) => b.score - a.score || compare(index.notes.get(a.noteId)!.title, index.notes.get(b.noteId)!.title) || compare(a.noteId, b.noteId)).slice(0, 5);
}
// Links and unlinked full-title mentions (including a title that is a prefix of
// another and a repeated title) exercise the mention bonus and link exclusions.
const generated = graphPerformanceNotes(320);
const mentioned = generated.map((note, i) => ({ ...note, title: i === 7 ? generated[3].title : note.title,
  content: note.content + (i % 3 === 0 ? `
[[${generated[(i + 1) % 320].title}]]` : '') + (i % 4 === 1 ? `
See ${generated[(i + 20) % 320].title} and ${generated[(i + 40) % 320].title}s.` : '') }));
it.each([['labelled', relatedNotes], ['generated', generated], ['linked and mentioned', mentioned]] as const)('matches the original scoring exactly on %s notes', (_, notes) => {
  const index = buildNoteIndex([...notes]), dismissed = new Set([pairKey(notes[0].id, notes[1].id)]);
  for (const note of notes) {
    const actual = suggestRelated(index, note.id, { dismissed }), expected = reference(index, note.id, dismissed);
    expect(actual.map(s => s.noteId)).toEqual(expected.map(s => s.noteId));
    actual.forEach((suggestion, i) => { expect(Math.abs(suggestion.score - expected[i].score)).toBeLessThan(1e-9); expect(suggestion.sharedTerms).toEqual(expected[i].sharedTerms); });
  }
});
it('builds meaningful weighted postings once and avoids rescanning unrelated notes', () => {
  const index = buildNoteIndex(graphPerformanceNotes(100));
  expect(index.postings.size).toBeGreaterThan(1000);
  for (const [term, postings] of index.postings) for (const [id, weight] of postings) expect(weight).toBe(index.notes.get(id)!.weights.get(term));
});
