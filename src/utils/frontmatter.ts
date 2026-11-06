/** Recognise Daymark's mapping-style YAML header without consuming ordinary
 * Markdown between thematic breaks. The header must start at character zero,
 * hold at least one top-level `key:` entry, and contain only mapping entries,
 * comments, `- ` list items or indented continuations; a bare top-level prose
 * line means the block is ordinary Markdown and stays visible. */
const KEY = /^(?:"[^"\n]+"|'[^'\n]+'|[^\s#-][^:\r\n]*):(?:[ \t]|$)/;

export function matchFrontmatter(source: string): RegExpMatchArray | null {
  const match = source.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?=\r?\n|$)/);
  if (!match) return null;
  const lines = match[1].split(/\r?\n/).filter(line => line.trim() && !/^\s*#/.test(line));
  if (!lines.length || !KEY.test(lines[0])) return null;
  const valid = lines.every(line => /^\s/.test(line) || /^-(?:\s|$)/.test(line) || KEY.test(line));
  return valid ? match : null;
}
