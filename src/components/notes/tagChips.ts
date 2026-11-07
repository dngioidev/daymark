import { Extension } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { cleanTag, isHexColour, TAG_PATTERN_SOURCE } from '../../utils/noteTags';

export interface TagChipOptions { onOpenTag(tag: string): void }

/** Inline decorations only: the document and its Markdown never change. */
export function tagDecorations(doc: ProseMirrorNode): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos, parent) => {
    if (node.type.spec.code) return false;
    if (!node.isText || !node.text) return true;
    if (parent?.type.spec.code || node.marks.some(mark => mark.type.name === 'code' || mark.type.name === 'link')) return false;
    for (const match of node.text.matchAll(new RegExp(TAG_PATTERN_SOURCE, 'gu'))) {
      const tag = cleanTag(match[1]);
      if (!tag || isHexColour(tag)) continue;
      const from = pos + match.index!, to = from + match[0].length - (match[1].length - tag.length);
      decorations.push(Decoration.inline(from, to, { class: 'dm-tag', 'data-tag': tag }));
    }
    return false;
  });
  return DecorationSet.create(doc, decorations);
}

const key = new PluginKey<DecorationSet>('tagChips');

export const TagChips = Extension.create<TagChipOptions>({
  name: 'tagChips',
  addOptions: () => ({ onOpenTag: () => {} }),
  addProseMirrorPlugins() {
    const options = this.options;
    return [new Plugin<DecorationSet>({
      key,
      state: {
        init: (_config, state) => tagDecorations(state.doc),
        apply: (tr, value) => tr.docChanged ? tagDecorations(tr.doc) : value,
      },
      props: {
        decorations: state => key.getState(state),
        handleDOMEvents: {
          click: (_view, event) => {
            const chip = (event.target as HTMLElement | null)?.closest?.<HTMLElement>('[data-tag]');
            if (!chip?.dataset.tag || event.button !== 0 || event.shiftKey || event.altKey) return false;
            options.onOpenTag(chip.dataset.tag);
            return true;
          },
        },
      },
    })];
  },
});
