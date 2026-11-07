import { matchFrontmatter } from './frontmatter';
import { maskNonText } from './markdownMask';

/** One tag rule for the extractor and the rich-editor chips: `#`, a letter, then
 * letters, digits, `_`, `-` or `/`. The look-behind keeps `a#b`, `&#123;` and the
 * second `#` of `##` out; an optional backslash covers the editor's `\#tag`. */
export const TAG_PATTERN_SOURCE = '(?<![\\p{L}\\p{N}_&/#\\\\])\\\\?#(\\p{L}[\\p{L}\\p{N}_\\-/]*)';
const TAG = new RegExp(`^\\p{L}[\\p{L}\\p{N}_\\-/]*$`, 'u');

/** `#fff`, `#ffcc00` and `#1a2b3c4d` are colours, not tags. All-letter words such as `#cafe` stay tags. */
export const isHexColour = (tag: string): boolean => /\d/.test(tag) && /^(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(tag);

export const tagKey = (tag: string): string => tag.normalize('NFC').toLocaleLowerCase();

/** Drop trailing `-` and `/`, which end a sentence rather than the tag. */
export const cleanTag = (tag: string): string => tag.replace(/[-/]+$/, '');

export function mergeTags(...lists: string[][]): string[] {
  const seen = new Set<string>(), out: string[] = [];
  for (const list of lists) for (const tag of list) {
    const key = tagKey(tag);
    if (!seen.has(key)) { seen.add(key); out.push(tag); }
  }
  return out;
}

function validTag(raw: string): string | null {
  const tag = cleanTag(raw.trim().replace(/^["']|["']$/g, '').replace(/^#/, ''));
  return TAG.test(tag) && !isHexColour(tag) ? tag : null;
}

function frontmatterTags(block: string): string[] {
  const lines = block.split(/\r?\n/);
  const at = lines.findIndex(line => /^tags:/.test(line));
  if (at < 0) return [];
  const inline = lines[at].slice('tags:'.length).trim();
  const items = inline
    ? inline.replace(/^\[|\]$/g, '').split(',')
    : lines.slice(at + 1).filter((line, i, rest) => rest.slice(0, i + 1).every(l => /^\s+-\s|^-\s/.test(l))).map(line => line.replace(/^\s*-\s*/, ''));
  return items.flatMap(item => validTag(item) ?? []);
}

export function extractTags(markdown: string): string[] {
  const header = matchFrontmatter(markdown);
  const fromHeader = header ? frontmatterTags(header[1]) : [];
  const body = header ? ' '.repeat(header[0].length) + markdown.slice(header[0].length) : markdown;
  const fromBody = [...maskNonText(body).matchAll(new RegExp(TAG_PATTERN_SOURCE, 'gu'))].map(match => cleanTag(match[1])).filter(tag => tag && !isHexColour(tag));
  return mergeTags(fromHeader, fromBody);
}

export function parseTagField(input: string): string[] {
  return mergeTags(input.split(/[\s,]+/).flatMap(part => validTag(part) ?? []));
}

/** True for the tag itself and its nested children (`project` matches `project/daymark`). */
export function hasTag(tags: readonly string[], filter: string): boolean {
  const key = tagKey(filter);
  return tags.some(tag => { const k = tagKey(tag); return k === key || k.startsWith(key + '/'); });
}

export interface TagRow { tag: string; name: string; depth: number; count: number }

/** Tags section rows: every tag path (parents implied by nested tags), sorted by
 * path, counting distinct notes tagged with it or one of its children. */
export function buildTagRows(notes: readonly { id: string; tags: readonly string[] }[]): TagRow[] {
  const rows = new Map<string, { tag: string; notes: Set<string> }>();
  for (const note of notes) for (const tag of note.tags) {
    const parts = tag.split('/');
    for (let i = 1; i <= parts.length; i++) {
      const path = parts.slice(0, i).join('/'), key = tagKey(path);
      if (!rows.has(key)) rows.set(key, { tag: path, notes: new Set() });
      rows.get(key)!.notes.add(note.id);
    }
  }
  const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
  return [...rows.values()]
    .sort((a, b) => { const x = a.tag.split('/'), y = b.tag.split('/');
      for (let i = 0; i < Math.min(x.length, y.length); i++) { const c = collator.compare(x[i], y[i]); if (c) return c; }
      return x.length - y.length; })
    .map(({ tag, notes: ids }) => ({ tag, name: tag.split('/').at(-1)!, depth: tag.split('/').length - 1, count: ids.size }));
}

/** A whole search query that is exactly one valid `#tag` becomes a tag filter;
 * anything else (`#123`, `#ff 00`) stays ordinary text search. */
export function tagQuery(query: string): string | null {
  const match = /^#(\S+)$/u.exec(query.trim());
  const tag = match ? cleanTag(match[1]) : '';
  return TAG.test(tag) && !isHexColour(tag) ? tag : null;
}
