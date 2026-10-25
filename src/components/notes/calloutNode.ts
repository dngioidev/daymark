import { Node } from '@tiptap/core';
import { calloutSnapshot } from '../../utils/noteTextSerialization';

const colourAlias: Record<string, string> = { danger: 'caution', success: 'tip', question: 'info', quote: 'note' };

export const Callout = Node.create({
  name: 'callout', group: 'block', content: 'block+', defining: true,
  addAttributes: () => ({ type: { default: 'note' }, title: { default: '' }, original: { default: null, rendered: false }, snapshot: { default: null, rendered: false } }),
  parseHTML: () => [{ tag: 'aside[data-callout]', getAttrs: (element) => ({ type: element.getAttribute('data-callout') || 'note', title: element.getAttribute('data-title') || '' }), contentElement: '.daymark-callout-content' }],
  renderHTML: ({ node }) => ['aside', { 'data-callout': node.attrs.type, 'data-title': node.attrs.title, class: `daymark-callout daymark-callout-${colourAlias[node.attrs.type] || node.attrs.type}` },
    ['div', { class: 'daymark-callout-header', contenteditable: 'false' }, node.attrs.title || node.attrs.type],
    ['div', { class: 'daymark-callout-content' }, 0]],
  markdownTokenizer: {
    name: 'callout', level: 'block',
    start: (src) => { const index = src.search(/\n(?=> ?\[!)/); return index < 0 ? -1 : index + 1; },
    tokenize: (src, _tokens, lexer) => {
      const match = src.match(/^> ?\[!(NOTE|TIP|INFO|WARNING|DANGER|SUCCESS|QUESTION|QUOTE)\]([^\n]*)(?:\n|$)((?:>[^\n]*(?:\n|$))*)/i);
      if (!match) return;
      const raw = match[0].replace(/\n$/, '');
      return { type: 'callout', raw, calloutType: match[1].toLowerCase(), title: match[2].trim(), tokens: lexer.blockTokens(match[3].replace(/^> ?/gm, '')) };
    },
  },
  parseMarkdown: (token, helpers) => {
    const content = helpers.parseChildren(token.tokens ?? []);
    if (!content.length) content.push({ type: 'paragraph' });
    const type = token.calloutType as string;
    const title = token.title as string;
    return { type: 'callout', attrs: { type, title, original: token.raw, snapshot: calloutSnapshot(type, title, content) }, content };
  },
  renderMarkdown: (node, helpers) => {
    const header = `> [!${String(node.attrs?.type || 'note').toUpperCase()}]${node.attrs?.title ? ` ${node.attrs.title}` : ''}`;
    const body = helpers.renderChildren(node.content ?? [], '\n\n');
    return header + (body ? '\n' + body.split('\n').map(line => line ? `> ${line}` : '>').join('\n') : '');
  },
});
