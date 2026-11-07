/** Mask rather than remove code so section offsets still address the original bytes. */
export function maskCode(markdown: string): string {
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

const blank = (text: string): string => text.replace(/[^\r\n]/g, ' ');

/** Blank everything that is not ordinary prose: code, HTML comments, wiki links,
 * Markdown links and images (text and target) and bare URLs. Offsets are kept. */
export function maskNonText(markdown: string): string {
  return maskCode(markdown)
    .replace(/<!--[\s\S]*?-->/g, blank)
    // Raw HTML tags (attributes can hold #anchors and #colours) and reference definitions.
    .replace(/<\/?[a-z][^>\r\n]*>/gi, blank)
    .replace(/^ {0,3}\[[^\]\r\n]+\]:[^\r\n]*/gm, blank)
    .replace(/\[\[[^\r\n]*?\]\]/g, blank)
    .replace(/!?\[[^\]\r\n]*\]\([^)\r\n]*\)/g, blank)
    .replace(/\b(?:[a-z][a-z\d+.-]*:\/\/|www\.)[^\s<>\]]+/gi, blank);
}
