import type { StandaloneNote } from '../types/daymark';

// Fixed field weights keep titles strongest without drowning out body overlap.
const FIELD_WEIGHT = { title: 3, tags: 2, body: 1 };
// Drop near-universal vocabulary only with enough documents to establish frequency.
const COMMON_RATIO = 0.8;
// Four notes avoid treating overlap in a tiny vault as meaningless vocabulary.
const COMMON_MIN_NOTES = 4;
// Enlarged fixture: reject tag-only scores <= 0.276 while retaining related pairs >= 0.445.
const MIN_SCORE = 0.30;
// Shared tags provide a small boost after the meaningful-term gate passes.
const TAG_BONUS = 0.08;
// A common resolved third-note target is supporting evidence, not sufficient alone.
const LINK_BONUS = 0.06;
// An unlinked full-title mention is stronger evidence than a shared tag.
const MENTION_BONUS = 0.12;
const STOP_WORDS = new Set((
  'a an the and or for with this that from into are was were have has had not but you your yours our ours their theirs they them then than can will would should could about also ' +
  'there what which when where who whom whose why how just more most some any all each every both either neither other another these those over under only very been being be is am do does did doing we us it its as at by if in of on out so such too up no nor same through until while ' +
  'cua cac nhung khong duoc mot nhu nay khi cho voi trong cung nhieu rat la va de den ra vao se da dang neu thi ma tu theo tren duoi nguoi hon'
).split(' '));
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

/** Trimmed raw bracket text, including #/| suffixes; consumers resolve raw first. */
export function extractWikiTargets(markdown: string): string[] {
  return [...maskCode(markdown).matchAll(/(?<![!\\])\[\[([^\r\n\u2028\u2029]+?)\]\](?!\])/g)]
    .map(match => match[1].trim()).filter(Boolean);
}

function resolveWikiTarget(target: string, titles: ReadonlyMap<string, string>): string | undefined {
  return titles.get(titleKey(target)) ?? titles.get(titleKey(target.split(/[|#]/)[0]));
}

/** The UI disables Link for titles that cannot safely be written as [[title]]. */
export function canLinkToTitle(title: string): boolean {
  return !!title.trim() && !/\]\]|\[\[|[|\r\n\u2028\u2029]/.test(title);
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
  readonly postings: ReadonlyMap<string, ReadonlyMap<string, number>>;
  /** The same postings over note ordinals (`ids[ordinal]`) for allocation-free scoring. */
  readonly ids: readonly string[];
  readonly postingArrays: ReadonlyMap<string, { readonly ordinals: Int32Array; readonly weights: Float64Array }>;
}
export interface RelatedSuggestion { noteId: string; score: number; sharedTerms: string[] }

export function buildNoteIndex(notes: StandaloneNote[]): NoteIndex {
  const titles = new Map<string, string>();
  const incoming = new Map(notes.map(note => [note.id, new Set<string>()]));
  // Duplicate normalized titles resolve to the first note in input order, like openLinkedNote.
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
      const id = resolveWikiTarget(target, titles);
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
  const postings = new Map<string, Map<string, number>>();
  for (const entry of entries) {
    let squaredNorm = 0;
    for (const [term, count] of entry.weights) {
      const importance = idf.get(term);
      if (importance === undefined) { entry.weights.delete(term); continue; }
      const weight = count * importance;
      entry.weights.set(term, weight);
      if (!postings.has(term)) postings.set(term, new Map());
      postings.get(term)!.set(entry.id, weight);
      squaredNorm += weight * weight;
    }
    indexed.set(entry.id, { ...entry, norm: Math.sqrt(squaredNorm), incoming: incoming.get(entry.id)! });
  }
  const ids = [...indexed.keys()], ordinal = new Map(ids.map((id, i) => [id, i]));
  const postingArrays = new Map<string, { ordinals: Int32Array; weights: Float64Array }>();
  for (const [term, list] of postings) {
    const ordinals = new Int32Array(list.size), weights = new Float64Array(list.size);
    let i = 0;
    for (const [id, weight] of list) { ordinals[i] = ordinal.get(id)!; weights[i++] = weight; }
    postingArrays.set(term, { ordinals, weights });
  }
  return { notes: indexed, idf, postings, ids, postingArrays };
}

export function linksOf(index: NoteIndex, noteId: string): { outgoing: string[]; incoming: string[] } {
  const note = index.notes.get(noteId);
  return { outgoing: [...(note?.outgoing ?? [])].sort(compare), incoming: [...(note?.incoming ?? [])].sort(compare) };
}

export function pairKey(a: string, b: string): string { return [a, b].sort().join('|'); }

const scratchBuffers = new WeakMap<NoteIndex, { dot: Float64Array; count: Int32Array; first: Int32Array; touched: Int32Array }>();
function scratchFor(index: NoteIndex) {
  let scratch = scratchBuffers.get(index);
  if (!scratch) {
    const n = index.ids.length;
    scratch = { dot: new Float64Array(n), count: new Int32Array(n), first: new Int32Array(n), touched: new Int32Array(n) };
    scratchBuffers.set(index, scratch);
  }
  return scratch;
}

/** Full-title mentions, computed lazily once per note and index: the IDs whose
 * normalized title phrase occurs as a contiguous word run in this note's body.
 * Equivalent to ` ${body} `.includes(` ${title} `) (both are single-space word
 * joins) without a substring scan for every candidate pair. */
const mentionIndexes = new WeakMap<NoteIndex, { lengths: number[]; byPhrase: Map<string, string[]>; sets: Map<string, ReadonlySet<string>> }>();
function mentionsOf(index: NoteIndex, noteId: string): ReadonlySet<string> {
  let mentions = mentionIndexes.get(index);
  if (!mentions) {
    const byPhrase = new Map<string, string[]>(), lengths = new Set<number>();
    for (const [id, note] of index.notes) {
      if (!note.titlePhrase) continue;
      if (!byPhrase.has(note.titlePhrase)) byPhrase.set(note.titlePhrase, []);
      byPhrase.get(note.titlePhrase)!.push(id); lengths.add(note.titlePhrase.split(' ').length);
    }
    mentions = { lengths: [...lengths], byPhrase, sets: new Map() };
    mentionIndexes.set(index, mentions);
  }
  let found = mentions.sets.get(noteId);
  if (!found) {
    const set = new Set<string>(), body = index.notes.get(noteId)?.body ?? '', terms = body ? body.split(' ') : [];
    for (let i = 0; i < terms.length; i++) for (const length of mentions.lengths) {
      if (i + length > terms.length) continue;
      for (const id of mentions.byPhrase.get(length === 1 ? terms[i] : terms.slice(i, i + length).join(' ')) ?? []) set.add(id);
    }
    mentions.sets.set(noteId, found = set);
  }
  return found;
}

function overlaps(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  for (const value of a) if (b.has(value)) return true;
  return false;
}

export function suggestRelated(index: NoteIndex, noteId: string, opts?: { dismissed?: Set<string>; limit?: number }): RelatedSuggestion[] {
  const source = index.notes.get(noteId);
  const limit = Math.max(0, Math.floor(opts?.limit ?? 5));
  if (!source?.hasBody || !source.norm || !limit) return [];
  const result: RelatedSuggestion[] = [];
  const terms = [...source.weights.keys()].sort(compare);
  // Per candidate ordinal: accumulated dot product, shared-term count and the
  // first shared term. Buffers are reused per index; `touched` lists candidates.
  const scratch = scratchFor(index), { dot, count, first, touched } = scratch;
  let candidates = 0;
  // Sorted accumulation preserves the reference algorithm's floating-point order.
  // Only meaningful, post-IDF terms can admit a candidate. Title mention scans
  // happen below, only for candidates passing the original meaningful-term gate.
  for (let t = 0; t < terms.length; t++) {
    const sourceWeight = source.weights.get(terms[t])!, posting = index.postingArrays.get(terms[t]);
    if (!posting) continue;
    const { ordinals, weights } = posting;
    for (let i = 0; i < ordinals.length; i++) {
      const o = ordinals[i];
      if (count[o] === 0) { touched[candidates++] = o; first[o] = t; }
      dot[o] += sourceWeight * weights[i]; count[o]++;
    }
  }
  const dismissed = opts?.dismissed?.size ? opts.dismissed : undefined;
  try {
    for (let c = 0; c < candidates; c++) {
      const o = touched[c], id = index.ids[o], target = index.notes.get(id)!;
      if (id === noteId || !target.hasBody || !target.norm || source.outgoing.has(id) || source.incoming.has(id) || dismissed?.has(pairKey(noteId, id))) continue;
      const shared = terms[first[o]];
      if (count[o] < 2 && !source.titleTerms.has(shared) && !target.titleTerms.has(shared)) continue;
      const cosine = dot[o] / (source.norm * target.norm);
      // Even every bonus cannot lift this pair to the threshold: skip the
      // overlap and full-title substring scans (the epsilon keeps the bound safe).
      if (cosine + TAG_BONUS + LINK_BONUS + MENTION_BONUS < MIN_SCORE - 1e-9) continue;
      const score = cosine
        + (overlaps(source.tags, target.tags) ? TAG_BONUS : 0)
        + (overlaps(source.outgoing, target.outgoing) ? LINK_BONUS : 0)
        + (mentionsOf(index, noteId).has(id) || mentionsOf(index, id).has(noteId) ? MENTION_BONUS : 0);
      if (score >= MIN_SCORE) result.push({ noteId: id, score, sharedTerms: [] });
    }
  } finally {
    for (let c = 0; c < candidates; c++) { const o = touched[c]; dot[o] = 0; count[o] = 0; }
  }
  const top = result.sort((a, b) => b.score - a.score || compare(index.notes.get(a.noteId)!.title, index.notes.get(b.noteId)!.title) || compare(a.noteId, b.noteId)).slice(0, limit);
  // A posting for id exists exactly when the target retains that weighted term,
  // so this is the sorted shared-term list; only the returned top few need it.
  for (const suggestion of top) { const target = index.notes.get(suggestion.noteId)!; suggestion.sharedTerms = terms.filter(term => target.weights.has(term)); }
  return top;
}

export function addRelatedLink(markdown: string, title: string): string {
  if (!canLinkToTitle(title)) return markdown;
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
  const section = markdown.slice(start, end);
  const knownTitle = new Map([[titleKey(title), title]]);
  if (extractWikiTargets(section).some(target => resolveWikiTarget(target, knownTitle) !== undefined)) return markdown;
  const lastLine = [...section.matchAll(/^[^\r\n]*\S[^\r\n]*(?:\r?\n|$)/gm)].at(-1);
  const insertAt = lastLine ? start + lastLine.index! + lastLine[0].length : start;
  const before = markdown.slice(0, insertAt);
  return finish(before + (before.endsWith('\n') ? '' : newline) + `- [[${title}]]` + newline + markdown.slice(insertAt));
}
