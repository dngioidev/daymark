import { Node, InputRule } from '@tiptap/core';
import { ReactRenderer } from '@tiptap/react';
import Suggestion, { exitSuggestion } from '@tiptap/suggestion';
import { PluginKey } from '@tiptap/pm/state';
import type { StandaloneNote } from '../../types/daymark';
import { WikiSuggest, type WikiSuggestHandle } from './WikiSuggest';

export type WikiNote = Pick<StandaloneNote, 'id' | 'title'>;
export interface WikiOption { title: string; create?: boolean; disabled?: boolean }
interface WikiLinkOptions {
  notes(): WikiNote[];
  onCreateNote(title: string): string;
  onOpenLink(title: string): void;
}
const wikiSuggestionKey = new PluginKey('wikiSuggestion');
const wikiPattern = /^\[\[([^\]|\n]+)(?:\|([^\]\n]*))?\]\]/;
const unsafeTitle = /[\[\]|]/;

export const WikiLink = Node.create<WikiLinkOptions>({
  name: 'wikiLink', group: 'inline', inline: true, atom: true,
  addOptions: () => ({ notes: () => [], onCreateNote: () => '', onOpenLink: () => {} }),
  addAttributes: () => ({ title: { default: '' }, alias: { default: null } }),
  parseHTML: () => [{ tag: 'span[data-wiki-title]', getAttrs: element => ({ title: element.getAttribute('data-wiki-title'), alias: element.getAttribute('data-wiki-alias') }) }],
  renderHTML: ({ node }) => ['span', {
    'data-wiki-title': node.attrs.title, ...(node.attrs.alias !== null ? { 'data-wiki-alias': node.attrs.alias } : {}),
    role: 'link', tabindex: '0', class: 'cursor-pointer rounded bg-stone-100 px-1 text-stone-900 underline dark:bg-stone-800 dark:text-stone-100',
  }, node.attrs.alias ?? node.attrs.title],
  addNodeView() {
    return ({ node, HTMLAttributes }) => {
      const dom = document.createElement('span');
      for (const [key, value] of Object.entries(HTMLAttributes)) if (value != null) dom.setAttribute(key, String(value));
      dom.dataset.wikiTitle = node.attrs.title;
      if (node.attrs.alias !== null) dom.dataset.wikiAlias = node.attrs.alias;
      dom.setAttribute('role', 'link'); dom.tabIndex = 0;
      dom.className = 'cursor-pointer rounded bg-stone-100 px-1 text-stone-900 underline dark:bg-stone-800 dark:text-stone-100';
      dom.textContent = node.attrs.alias ?? node.attrs.title;
      dom.addEventListener('click', event => { event.preventDefault(); this.options.onOpenLink(node.attrs.title); });
      dom.addEventListener('keydown', event => {
        if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); this.options.onOpenLink(node.attrs.title); }
      });
      return { dom, stopEvent: event => event.type === 'click' };
    };
  },
  parseMarkdown: token => ({ type: 'wikiLink', attrs: { title: token.title, alias: token.alias ?? null } }),
  renderMarkdown: node => `[[${node.attrs?.title ?? ''}${node.attrs?.alias != null ? `|${node.attrs.alias}` : ''}]]`,
  markdownTokenizer: {
    name: 'wikiLink', level: 'inline',
    start: src => src.search(/!?\[\[/),
    tokenize: src => {
      const embed = /^!\[\[[^\]\n]+\]\]/.exec(src);
      if (embed) return { type: 'rawInline', raw: embed[0] };
      const match = wikiPattern.exec(src);
      return match ? { type: 'wikiLink', raw: match[0], title: match[1], alias: match[2] ?? null } : undefined;
    },
  },
  addInputRules() {
    return [new InputRule({
      find: /(?<![!\\])\[\[([^\]|\n]+)(?:\|([^\]\n]*))?\]\]$/,
      handler: ({ state, range, match }) => {
        if ((state.storedMarks ?? state.selection.$from.marks()).some(mark => mark.type.spec.code)) return null;
        state.tr.replaceWith(range.from, range.to, this.type.create({ title: match[1], alias: match[2] ?? null }));
      },
    })];
  },
  addProseMirrorPlugins() {
    return [Suggestion<WikiOption>({
      editor: this.editor, pluginKey: wikiSuggestionKey, char: '[[', allowSpaces: true, allowedPrefixes: null,
      findSuggestionMatch: ({ $position }) => {
        const before = $position.nodeBefore;
        if (!before?.isText) return null;
        const match = /(?<![!\\])\[\[([^\[\]\n|]*)$/.exec(before.text ?? '');
        return match ? { range: { from: $position.pos - match[0].length, to: $position.pos }, query: match[1], text: match[0] } : null;
      },
      allow: ({ state, range }) => !state.doc.resolve(range.from).parent.type.spec.code && !state.doc.resolve(range.from).marks().some(mark => mark.type.name === 'code'),
      items: ({ query }) => {
        // The view supplies notes newest-first, keeping this interface {id,title}.
        const notes = this.options.notes();
        const title = query.trim();
        const normalized = title.toLocaleLowerCase();
        const items: WikiOption[] = notes.filter(note => note.title.toLocaleLowerCase().includes(normalized)).slice(0, 8).map(note => ({ title: note.title, disabled: unsafeTitle.test(note.title) }));
        if (title && !unsafeTitle.test(title) && !notes.some(note => note.title.toLocaleLowerCase() === normalized)) items.push({ title, create: true });
        return items;
      },
      command: ({ editor, range, props }) => {
        const title = props.create ? props.title.trim() : props.title;
        if (props.disabled || unsafeTitle.test(title) || !title.trim()) return;
        if (props.create && !this.options.onCreateNote(title)) return;
        editor.chain().focus().insertContentAt(range, { type: 'wikiLink', attrs: { title } }).run();
      },
      render: () => {
        let renderer: ReactRenderer<WikiSuggestHandle> | undefined;
        return {
          onStart: props => { renderer = new ReactRenderer(WikiSuggest, { editor: props.editor, props }); document.body.append(renderer.element); },
          onUpdate: props => renderer?.updateProps(props),
          onKeyDown: props => {
            if (props.event.key === 'Escape') { exitSuggestion(props.view, wikiSuggestionKey); return true; }
            return renderer?.ref?.onKeyDown(props.event) ?? false;
          },
          onExit: () => { renderer?.element.remove(); renderer?.destroy(); renderer = undefined; },
        };
      },
    })];
  },
});
