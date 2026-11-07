import type { StandaloneNote } from '../types/daymark';
import { maskCode } from './markdownMask';
import { TAG_PATTERN_SOURCE, tagKey } from './noteTags';
import { HANDWRITTEN_PLACEHOLDER } from '../ink/handwrittenNotes';

// Fixed field weights keep titles strongest without drowning out body overlap.
// Tags are scored as tags (TAG_BONUS), not as words.
const FIELD_WEIGHT = { title: 3, body: 1 };
// Drop near-universal vocabulary only with enough documents to establish frequency.
const COMMON_RATIO = 0.8;
// Four notes avoid treating overlap in a tiny vault as meaningless vocabulary.
const COMMON_MIN_NOTES = 4;
// Enlarged fixture: reject tag-only scores <= 0.276 while retaining related pairs >= 0.445.
const MIN_SCORE = 0.30;
// A shared tag admits a suggestion on its own: the bonus equals MIN_SCORE.
const TAG_BONUS = 0.30;
// Graph keeps its pre-tag behaviour: a small boost after the meaningful-term gate.
const GRAPH_TAG_BONUS = 0.08;
// "Possibly related" floor, used together with the two-shared-terms rule. Short
// notes share body words while their titles dominate the vector, so cosines are
// small: the fixture possiblePairs score 0.074 and 0.118 (relatedNotes.ts), and
// no unrelated or adversarial fixture pair shares two meaningful terms at all.
const POSSIBLE_SCORE = 0.05;
const STRONG_LIMIT = 5;
const POSSIBLE_LIMIT = 3;
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

/** Blank #tag spans so tags count once, as tags, and nested tags are not split into words. */
const maskTagSpans = (text: string): string => text.replace(new RegExp(TAG_PATTERN_SOURCE, 'gu'), match => ' '.repeat(match.length));

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
  /** Tag key -> display spelling. */
  readonly tags: ReadonlyMap<string, string>;
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
  /** Tag key -> ordinals of notes carrying it. */
  readonly tagPostings: ReadonlyMap<string, Int32Array>;
}
export interface RelatedSuggestion { noteId: string; score: number; sharedTerms: string[]; sharedTags: string[] }

export function buildNoteIndex(notes: StandaloneNote[]): NoteIndex {
  const titles = new Map<string, string>();
  const incoming = new Map(notes.map(note => [note.id, new Set<string>()]));
  // Duplicate normalized titles resolve to the first note in input order, like openLinkedNote.
  for (const note of notes) if (!titles.has(titleKey(note.title))) titles.set(titleKey(note.title), note.id);
  const frequency = new Map<string, number>();
  const entries = notes.map(note => {
    // Callers pass knowledge notes: handwritten notes carry their text-box text.
    const content = note.kind === 'handwritten' && note.content === HANDWRITTEN_PLACEHOLDER ? '' : note.content;
    const tags = note.tags;
    const titleTerms = tokenize(note.title);
    const bodyTerms = tokenize(maskTagSpans(content));
    const weights = new Map<string, number>();
    for (const [terms, weight] of [[titleTerms, FIELD_WEIGHT.title], [bodyTerms, FIELD_WEIGHT.body]] as const) {
      for (const term of terms) weights.set(term, (weights.get(term) ?? 0) + weight);
    }
    for (const term of weights.keys()) frequency.set(term, (frequency.get(term) ?? 0) + 1);
    const outgoing = new Set<string>();
    for (const target of extractWikiTargets(content)) {
      const id = resolveWikiTarget(target, titles);
      if (id && id !== note.id) { outgoing.add(id); incoming.get(id)!.add(note.id); }
    }
    return { id: note.id, title: note.title, titlePhrase: words(note.title), titleTerms: new Set(titleTerms),
      body: words(plainText(content)), hasBody: bodyTerms.length > 0,
      tags: new Map(tags.map(tag => [tagKey(tag.trim()), tag.trim()] as const).filter(([key]) => key)), weights, outgoing };
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
  const tagLists = new Map<string, number[]>();
  ids.forEach((id, i) => { for (const key of indexed.get(id)!.tags.keys()) { if (!tagLists.has(key)) tagLists.set(key, []); tagLists.get(key)!.push(i); } });
  const tagPostings = new Map([...tagLists].map(([key, list]) => [key, Int32Array.from(list)] as const));
  return { notes: indexed, idf, postings, ids, postingArrays, tagPostings };
}

export function linksOf(index: NoteIndex, noteId: string): { outgoing: string[]; incoming: string[] } {
  const note = index.notes.get(noteId);
  return { outgoing: [...(note?.outgoing ?? [])].sort(compare), incoming: [...(note?.incoming ?? [])].sort(compare) };
}

export function pairKey(a: string, b: string): string { return [a, b].sort().join('|'); }

const scratchBuffers = new WeakMap<NoteIndex, { dot: Float64Array; count: Int32Array; first: Int32Array; touched: Int32Array; tagged: Uint8Array }>();
function scratchFor(index: NoteIndex) {
  let scratch = scratchBuffers.get(index);
  if (!scratch) {
    const n = index.ids.length;
    scratch = { dot: new Float64Array(n), count: new Int32Array(n), first: new Int32Array(n), touched: new Int32Array(n), tagged: new Uint8Array(n) };
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

function sharesKey(a: ReadonlyMap<string, string>, b: ReadonlyMap<string, string>): boolean {
  for (const key of a.keys()) if (b.has(key)) return true;
  return false;
}

interface Scored { noteId: string; score: number; terms: number }
interface ScoreOptions { dismissed?: Set<string>; tagAdmission: boolean; floor: number }

/** One scoring pass over every candidate reaching `floor`. With tag admission a
 * shared tag makes a candidate on its own and adds TAG_BONUS; without it (Graph)
 * the meaningful-term gate applies to every candidate and tags add GRAPH_TAG_BONUS. */
function scoreCandidates(index: NoteIndex, noteId: string, opts: ScoreOptions): Scored[] {
  const source = index.notes.get(noteId);
  const byTag = opts.tagAdmission && !!source?.tags.size;
  if (!source || (!(source.hasBody && source.norm) && !byTag)) return [];
  const result: Scored[] = [];
  const terms = [...source.weights.keys()].sort(compare);
  // Per candidate ordinal: accumulated dot product, shared-term count, the first
  // shared term and whether it shares a tag. Buffers are reused per index.
  const { dot, count, first, touched, tagged } = scratchFor(index);
  let candidates = 0;
  // Sorted accumulation preserves the reference algorithm's floating-point order.
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
  if (byTag) for (const key of source.tags.keys()) for (const o of index.tagPostings.get(key) ?? []) {
    if (count[o] === 0 && !tagged[o]) touched[candidates++] = o;
    tagged[o] = 1;
  }
  const dismissed = opts.dismissed?.size ? opts.dismissed : undefined;
  const tagBonus = opts.tagAdmission ? TAG_BONUS : GRAPH_TAG_BONUS;
  try {
    for (let c = 0; c < candidates; c++) {
      const o = touched[c], id = index.ids[o], target = index.notes.get(id)!;
      if (id === noteId || source.outgoing.has(id) || source.incoming.has(id) || dismissed?.has(pairKey(noteId, id))) continue;
      const shared = count[o] ? terms[first[o]] : undefined;
      const termGate = !!shared && target.hasBody && !!target.norm
        && (count[o] >= 2 || source.titleTerms.has(shared) || target.titleTerms.has(shared));
      const sharesTag = byTag ? tagged[o] === 1 : sharesKey(source.tags, target.tags);
      if (!termGate && !(byTag && sharesTag)) continue;
      const cosine = source.norm && target.norm ? dot[o] / (source.norm * target.norm) : 0;
      // Even every bonus cannot lift this pair to the floor: skip the overlap and
      // full-title scans (the epsilon keeps the bound safe).
      if (cosine + (sharesTag ? tagBonus : 0) + LINK_BONUS + MENTION_BONUS < opts.floor - 1e-9) continue;
      const score = cosine
        + (sharesTag ? tagBonus : 0)
        + (overlaps(source.outgoing, target.outgoing) ? LINK_BONUS : 0)
        + (mentionsOf(index, noteId).has(id) || mentionsOf(index, id).has(noteId) ? MENTION_BONUS : 0);
      if (score >= opts.floor) result.push({ noteId: id, score, terms: count[o] });
    }
  } finally {
    for (let c = 0; c < candidates; c++) { const o = touched[c]; dot[o] = 0; count[o] = 0; tagged[o] = 0; }
  }
  return result.sort((x, y) => y.score - x.score || compare(index.notes.get(x.noteId)!.title, index.notes.get(y.noteId)!.title) || compare(x.noteId, y.noteId));
}

/** Reasons for the returned few: shared weighted terms (sorted) and shared tags
 * in the source note's spelling, sorted by tag key. */
function explain(index: NoteIndex, noteId: string, scored: Scored[]): RelatedSuggestion[] {
  const source = index.notes.get(noteId);
  if (!source || !scored.length) return [];
  const terms = [...source.weights.keys()].sort(compare);
  return scored.map(({ noteId: id, score }) => {
    const target = index.notes.get(id)!;
    return { noteId: id, score, sharedTerms: terms.filter(term => target.weights.has(term)),
      sharedTags: [...source.tags].filter(([key]) => target.tags.has(key)).sort(([a], [b]) => compare(a, b)).map(([, tag]) => tag) };
  });
}

export function suggestRelated(index: NoteIndex, noteId: string, opts?: { dismissed?: Set<string>; limit?: number; tagAdmission?: boolean }): RelatedSuggestion[] {
  const limit = Math.max(0, Math.floor(opts?.limit ?? STRONG_LIMIT));
  if (!limit) return [];
  const scored = scoreCandidates(index, noteId, { dismissed: opts?.dismissed, tagAdmission: opts?.tagAdmission ?? true, floor: MIN_SCORE });
  return explain(index, noteId, scored.slice(0, limit));
}

/** The Related panel: up to five strong matches, then (only when there are fewer
 * than five) up to three weaker ones sharing at least two meaningful terms. */
export function relatedGroups(index: NoteIndex, noteId: string, opts?: { dismissed?: Set<string> }): { strong: RelatedSuggestion[]; possible: RelatedSuggestion[] } {
  const scored = scoreCandidates(index, noteId, { dismissed: opts?.dismissed, tagAdmission: true, floor: POSSIBLE_SCORE });
  const strong = scored.filter(item => item.score >= MIN_SCORE).slice(0, STRONG_LIMIT);
  const possible = strong.length < STRONG_LIMIT ? scored.filter(item => item.score < MIN_SCORE && item.terms >= 2).slice(0, POSSIBLE_LIMIT) : [];
  return { strong: explain(index, noteId, strong), possible: explain(index, noteId, possible) };
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
