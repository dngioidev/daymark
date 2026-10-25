import type { JSONContent } from '@tiptap/core';
import type { MarkdownManager } from '@tiptap/markdown';
import { Marked } from 'marked';

const lexer = new Marked();

/** Compare parsed and live callouts despite schema-added null attributes and
 * attribute ordering. Mermaid's editing flag is transient view state. */
export function calloutSnapshot(type: string, title: string, content: JSONContent[] = []): string {
  return JSON.stringify({ type, title, content }, (key, value) => {
    if (key === 'editing') return undefined;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry != null).sort(([a], [b]) => a.localeCompare(b)));
    }
    return value;
  });
}

function escapeLiteral(text: string, linePrefix: string, suffix: string, inLink: boolean): string {
  // Ask the Markdown lexer which spans would acquire formatting. Ordinary
  // intraword underscores, operators and < comparisons stay text. Literal wiki
  // brackets and entity-like text need escapes now that they have node parsers.
  let result = lexer.Lexer.lexInline(text).map((token) => {
    if (token.type === 'text') return token.raw
      .replace(/&(?=(?:#[xX][\da-fA-F]+|#\d+|[A-Za-z][A-Za-z\d]*);)/g, '\\&')
      .replace(/\[\[([^\]\n]+)\]\]/g, '\\[\\[$1\\]\\]');
    if (inLink && token.type === 'link' && !/^[<[]/.test(token.raw)) return token.raw;
    return token.raw.replace(/[\\`*_\[\]~<>:&]/g, '\\$&');
  }).join('');
  const atBlockStart = /^(?:\s*> ?)*(?:\s*(?:[-+*]|\d+[.)]) )?\s*$/.test(linePrefix);
  if (atBlockStart) {
    if (/^ {0,3}(?:`{3,}|~{3,}|(?:-\s*){3,}$|(?:_\s*){3,}$|(?:\*\s*){3,}$)/.test(result)) {
      result = result.replace(/^( {0,3})(.)/, '$1\\$2');
    }
    result = result.replace(/^( {0,3})(#{1,6}|[-+*>])(?=\s|$)/, '$1\\$2')
      .replace(/^( {0,3}\d+)([.)])(?=\s)/, '$1\\$2');
  }
  // A literal delimiter can pair with a neighbouring generated mark delimiter.
  if (/^[*_~`]/.test(result) && result[0] === linePrefix.at(-1)) result = `\\${result}`;
  if (/(?<!\\)[*_~`]$/.test(result) && result.at(-1) === suffix[0]) result = `${result.slice(0, -1)}\\${result.at(-1)}`;
  if (result.endsWith('!') && suffix.startsWith('[')) result = `${result.slice(0, -1)}\\!`;
  return result.replace(/\n( {0,3})(#{1,6}|[-+*>])(?=\s|$)/g, '\n$1\\$2')
    .replace(/\n( {0,3}\d+)([.)])(?=\s)/g, '\n$1\\$2');
}

/** Keep TipTap's public structural/mark serializer, replacing only text encoding.
 * Opaque text slots prevent its unconditional HTML encoding/backslash escaping.
 * Restoring slots after structural rendering supplies actual line context. */
export function preserveNoteText(manager: MarkdownManager): MarkdownManager {
  const serialize = manager.serialize.bind(manager);
  manager.serialize = (doc) => {
    let prefix = '\uE000';
    const json = JSON.stringify(doc);
    while (json.includes(prefix)) prefix += '\uE000';
    const literals: { text: string; verbatim: boolean; inTable: boolean; inLink: boolean }[] = [];
    const slots = (text: string, verbatim = false, inTable = false, inLink = false) => text.split('\n').map((line) => {
      if (!line.trim()) return line;
      const [, leading, body, trailing] = line.match(/^(\s*)([\s\S]*?)(\s*)$/)!;
      const index = literals.push({ text: body, verbatim, inTable, inLink }) - 1;
      return `${leading}${prefix}${index}\uE001${trailing}`;
    }).join('\n');
    const visit = (node: JSONContent, inCode = false, inTable = false): JSONContent => {
      // Preserve untouched callouts byte-for-byte even when another block changes.
      if (node.type === 'callout' && node.attrs?.original != null && node.attrs.snapshot === calloutSnapshot(node.attrs.type, node.attrs.title, node.content)) {
        return { type: 'rawMarkdown', attrs: { source: node.attrs.original } };
      }
      const code = inCode || node.type === 'codeBlock' || !!node.marks?.some((mark) => mark.type === 'code');
      const table = inTable || node.type === 'tableCell' || node.type === 'tableHeader';
      if (node.type === 'text' && !code && node.text?.trim()) {
        return { ...node, text: slots(node.text, false, table, !!node.marks?.some((mark) => mark.type === 'link')) };
      }
      if (node.type === 'rawInline' && typeof node.attrs?.source === 'string') {
        // A temporary text slot also lets the mark serializer keep a single
        // emphasis span across inline HTML/entities. The live document stays atomic.
        return { type: 'text', text: slots(node.attrs.source, true, table), marks: node.marks };
      }
      if (node.type === 'wikiLink') {
        const source = `[[${node.attrs?.title ?? ''}${node.attrs?.alias != null ? `|${node.attrs.alias}` : ''}]]`;
        return { type: 'text', text: slots(source, true, table), marks: node.marks };
      }
      return node.content ? { ...node, content: node.content.map((child) => visit(child, code, table)) } : node;
    };
    const output = serialize(visit(doc));
    const pattern = new RegExp(`${prefix}(\\d+)\uE001`, 'g');
    return output.replace(pattern, (slot: string, index: string, offset: number) => {
      const linePrefix = output.slice(output.lastIndexOf('\n', offset - 1) + 1, offset);
      const literal = literals[Number(index)];
      const text = literal.verbatim ? literal.text : escapeLiteral(literal.text, linePrefix, output.slice(offset + slot.length), literal.inLink);
      return literal.inTable ? text.replace(/(?<!\\)\|/g, '\\|') : text;
    });
  };
  return manager;
}
