import type { StandaloneNote } from '../types/daymark';

// Fixed field weights keep titles strongest without drowning out body overlap.
const FIELD_WEIGHT = { title: 3, tags: 2, body: 1 };
// Drop near-universal vocabulary only with enough documents to establish frequency.
const COMMON_RATIO = 0.8;
// Four notes avoid treating overlap in a tiny vault as meaningless vocabulary.
const COMMON_MIN_NOTES = 4;
// Fixture tuning: weak incidental overlaps stay below the suggestion cutoff.
const MIN_SCORE = 0.16;
// Shared tags provide a small boost after the meaningful-term gate passes.
const TAG_BONUS = 0.08;
// A common resolved third-note target is supporting evidence, not sufficient alone.
const LINK_BONUS = 0.06;
// An unlinked full-title mention is stronger evidence than a shared tag.
const MENTION_BONUS = 0.12;
const STOP_WORDS = new Set('the and for with this that from into are was were have has had not but you your our their they them then than can will would should could about also'.split(' '));
const titleKey = (title: string): string => title.trim().toLowerCase();
const normalize = (text: string): string => text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd');
const words = (text: string): string => (normalize(text).match(/[\p{L}\p{N}]+/gu) ?? []).join(' ');
const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;

/** Mask rather than remove code so section offsets still address the original bytes. */
function maskCode(markdown: string): string {
  let fence: { char: string; length: number } | undefined;
  let indented = false;
  let previousBlank = true;
  const masked = markdown.replace(/[^\n]*(?:\n|$)/g, line => {
    const opening = /^ {0,3}(`{3,}|~{3,})(.*)/.exec(line);
    if (fence) {
      if (opening && opening[1][0] === fence.char && opening[1].length >= fence.length && !opening[2].trim()) fence = undefined;
      return line.replace(/[^\r\n]/g, ' ');
    }
    if (opening) {
      fence = { char: opening[1][0], length: opening[1].length };
      return line.replace(/[^\r\n]/g, ' ');
    }
    if (/^(?: {4}|\t)/.test(line) && (indented || previousBlank)) {
      indented = true;
      return line.replace(/[^\r\n]/g, ' ');
    }
    previousBlank = !line.trim();
    if (!previousBlank) indented = false;
    return line;
  });
  return masked.replace(/(`+)[\s\S]*?\1(?!`)/g, code => code.replace(/[^\r\n]/g, ' '));
}

export function extractWikiTargets(markdown: string): string[] {
  return [...maskCode(markdown).matchAll(/(?<![!\\])\[\[([^\[\]\n]+)\]\]/g)]
    .map(match => match[1].split(/[|#]/)[0].trim()).filter(Boolean);
}

function plainText(text: string): string {
  return maskCode(text)
    .replace(/\]\([^\n)]*\)/g, ']')
    .replace(/\b(?:[a-z][a-z\d+.-]*:\/\/|www\.)[^\s<>\]]+/gi, ' ');
}

export function tokenize(text: string): string[] {
  return (normalize(plainText(text)).match(/[\p{L}\p{N}]+/gu) ?? [])
    .filter(term => [...term].length >= 3 && !/^\p{N}+$/u.test(term) && !STOP_WORDS.has(term));
}

interface IndexedNote {
  readonly title: string;
  readonly titlePhrase: string;
  readonly titleTerms: ReadonlySet<string>;
  readonly body: string;
  readonly hasBody: boolean;
  readonly tags: ReadonlySet<string>;
  readonly weights: ReadonlyMap<string, number>;
  readonly norm: number;
  readonly outgoing: ReadonlySet<string>;
  readonly incoming: ReadonlySet<string>;
}

/** Snapshot of derived values; never holds or edits the caller's note objects. */
export interface NoteIndex {
  readonly notes: ReadonlyMap<string, IndexedNote>;
  readonly idf: ReadonlyMap<string, number>;
}
export interface RelatedSuggestion { noteId: string; score: number; sharedTerms: string[] }

export function buildNoteIndex(notes: StandaloneNote[]): NoteIndex {
  const titles = new Map<string, string>();
  const incoming = new Map(notes.map(note => [note.id, new Set<string>()]));
  for (const note of notes) if (!titles.has(titleKey(note.title))) titles.set(titleKey(note.title), note.id);
  const frequency = new Map<string, number>();
  const entries = notes.map(note => {
    const titleTerms = tokenize(note.title);
    const bodyTerms = tokenize(note.content);
    const weights = new Map<string, number>();
    for (const [terms, weight] of [[titleTerms, FIELD_WEIGHT.title], [tokenize(note.tags.join(' ')), FIELD_WEIGHT.tags], [bodyTerms, FIELD_WEIGHT.body]] as const) {
      for (const term of terms) weights.set(term, (weights.get(term) ?? 0) + weight);
    }
    for (const term of weights.keys()) frequency.set(term, (frequency.get(term) ?? 0) + 1);
    const outgoing = new Set<string>();
    for (const target of extractWikiTargets(note.content)) {
      const id = titles.get(titleKey(target));
      if (id && id !== note.id) { outgoing.add(id); incoming.get(id)!.add(note.id); }
    }
    return { id: note.id, title: note.title, titlePhrase: words(note.title), titleTerms: new Set(titleTerms),
      body: words(plainText(note.content)), hasBody: bodyTerms.length > 0,
      tags: new Set(note.tags.map(tag => normalize(tag.trim()))), weights, outgoing };
  });
  const idf = new Map<string, number>();
  for (const [term, count] of frequency) {
    if (notes.length < COMMON_MIN_NOTES || count / notes.length <= COMMON_RATIO) {
      idf.set(term, Math.log((notes.length + 1) / (count + 1)) + 1);
    }
  }
  const indexed = new Map<string, IndexedNote>();
  for (const entry of entries) {
    let squaredNorm = 0;
    for (const [term, count] of entry.weights) {
      const importance = idf.get(term);
      if (importance === undefined) { entry.weights.delete(term); continue; }
      const weight = count * importance;
      entry.weights.set(term, weight);
      squaredNorm += weight * weight;
    }
    indexed.set(entry.id, { ...entry, norm: Math.sqrt(squaredNorm), incoming: incoming.get(entry.id)! });
  }
  return { notes: indexed, idf };
}

export function linksOf(index: NoteIndex, noteId: string): { outgoing: string[]; incoming: string[] } {
  const note = index.notes.get(noteId);
  return { outgoing: [...(note?.outgoing ?? [])].sort(compare), incoming: [...(note?.incoming ?? [])].sort(compare) };
}

export function pairKey(a: string, b: string): string { return [a, b].sort().join('|'); }

function overlaps(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  for (const value of a) if (b.has(value)) return true;
  return false;
}

function mentions(body: string, phrase: string): boolean {
  return !!phrase && ` ${body} `.includes(` ${phrase} `);
}

export function suggestRelated(index: NoteIndex, noteId: string, opts?: { dismissed?: Set<string>; limit?: number }): RelatedSuggestion[] {
  const source = index.notes.get(noteId);
  const limit = Math.max(0, Math.floor(opts?.limit ?? 5));
  if (!source?.hasBody || !source.norm || !limit) return [];
  const result: RelatedSuggestion[] = [];
  for (const [id, target] of index.notes) {
    if (id === noteId || !target.hasBody || !target.norm || source.outgoing.has(id) || source.incoming.has(id) || opts?.dismissed?.has(pairKey(noteId, id))) continue;
    const sharedTerms = [...source.weights.keys()].filter(term => target.weights.has(term)).sort(compare);
    if (sharedTerms.length < 2 && !sharedTerms.some(term => source.titleTerms.has(term) || target.titleTerms.has(term))) continue;
    const dot = sharedTerms.reduce((sum, term) => sum + source.weights.get(term)! * target.weights.get(term)!, 0);
    const score = dot / (source.norm * target.norm)
      + (overlaps(source.tags, target.tags) ? TAG_BONUS : 0)
      + (overlaps(source.outgoing, target.outgoing) ? LINK_BONUS : 0)
      + (mentions(source.body, target.titlePhrase) || mentions(target.body, source.titlePhrase) ? MENTION_BONUS : 0);
    if (score >= MIN_SCORE) result.push({ noteId: id, score, sharedTerms });
  }
  return result.sort((a, b) => b.score - a.score || compare(index.notes.get(a.noteId)!.title, index.notes.get(b.noteId)!.title) || compare(a.noteId, b.noteId)).slice(0, limit);
}

export function addRelatedLink(markdown: string, title: string): string {
  const newline = markdown.includes('\r\n') ? '\r\n' : '\n';
  const finish = (text: string) => text.replace(/(?:\r?\n)+$/, '') + newline;
  const headings = [...maskCode(markdown).matchAll(/^ {0,3}(#{1,2})[\t ]+([^\r\n]*)(?:\r?\n|$)/gm)];
  const related = headings.filter(match => match[1] === '##' && match[2].replace(/[\t ]+#+[\t ]*$/, '').trim() === 'Related').at(-1);
  if (!related) {
    const gap = !markdown ? '' : markdown.endsWith(newline + newline) ? '' : markdown.endsWith(newline) ? newline : newline + newline;
    return finish(markdown + gap + '## Related' + newline + `- [[${title}]]`);
  }
  const start = related.index! + related[0].length;
  const end = headings.find(match => match.index! >= start)?.index ?? markdown.length;
  if (extractWikiTargets(markdown.slice(start, end)).some(target => titleKey(target) === titleKey(title))) return finish(markdown);
  const before = markdown.slice(0, end);
  return finish(before + (before.endsWith('\n') ? '' : newline) + `- [[${title}]]` + newline + markdown.slice(end));
}
