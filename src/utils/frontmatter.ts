/** Recognise Daymark's mapping-style YAML header without consuming ordinary
 * Markdown between thematic breaks. Incomplete headers remain visible text. */
export function matchFrontmatter(source: string): RegExpMatchArray | null {
  const match = source.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?=\r?\n|$)/);
  if (!match) return null;
  const firstField = match[1].split(/\r?\n/).find(line => line.trim() && !/^\s*#/.test(line));
  return firstField && /^(?:"[^"\n]+"|'[^'\n]+'|[^\s#][^:\r\n]*):(?:[ \t]|$)/.test(firstField)
    ? match : null;
}
