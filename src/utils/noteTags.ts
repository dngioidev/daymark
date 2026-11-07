import { matchFrontmatter } from './frontmatter';
import { maskNonText } from './markdownMask';

/** One tag rule for the extractor and the rich-editor chips: `#`, a letter, then
 * letters, digits, `_`, `-` or `/`. The look-behind keeps `a#b`, `&#123;` and the
 * second `#` of `##` out; an optional backslash covers the editor's `\#tag`. */
export const TAG_PATTERN_SOURCE = '(?<![\\p{L}\\p{N}_&/#\\\\])\\\\?#(\\p{L}[\\p{L}\\p{N}_\\-/]*)';
const TAG = new RegExp(`^\\p{L}[\\p{L}\\p{N}_\\-/]*$`, 'u');

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
  return TAG.test(tag) ? tag : null;
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
  const fromBody = [...maskNonText(body).matchAll(new RegExp(TAG_PATTERN_SOURCE, 'gu'))].map(match => cleanTag(match[1])).filter(Boolean);
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
