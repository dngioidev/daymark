// @vitest-environment jsdom
import { Editor } from '@tiptap/core';
import { expect, it } from 'vitest';
import { editorExtensions } from './editorExtensions';
import { HIGHLIGHTER_COLORS } from '../../ink/inkColors';

const makeEditor = (content: string, legacy = false) => new Editor({
  extensions: editorExtensions.filter(extension => !legacy || extension.name !== 'highlight'),
  content, contentType: 'markdown',
});

it.each([
  ['Study learning and taking notes', 9, 23, 'learning and taking'],
  ['Study learning and taking notes', 6, 26, 'learning and taking'],
  ['Study **learn**ing\n\nand taking notes', 9, 26, 'learning and taking'],
  ['Study learning', 6, 7, null],
  ['```\nlearning\n```', 1, 5, null],
] as const)('snaps selection words in %s (%i..%i)', async (content, from, to, expected) => {
  const { wordRangeForSelection } = await import('./penHighlight');
  const editor = makeEditor(content);
  const range = wordRangeForSelection(editor.state.doc, from, to);
  expect(range ? editor.state.doc.textBetween(range.from, range.to, ' ') : null).toBe(expected);
  editor.destroy();
});

it('snaps middle-of-word endpoints and a single word, in either direction', async () => {
  const { wordRangeForStroke } = await import('./penHighlight');
  const editor = makeEditor('Study learning and taking notes');
  for (const positions of [[10, 29], [29, 10]]) {
    const range = wordRangeForStroke(editor.state.doc, positions)!;
    expect(editor.state.doc.textBetween(range.from, range.to)).toBe('learning and taking notes');
  }
  expect(wordRangeForStroke(editor.state.doc, [10, 11])).toEqual({ from: 7, to: 15 });
  expect(wordRangeForStroke(editor.state.doc, [])).toBeNull();
  expect(wordRangeForStroke(editor.state.doc, [6])).toBeNull();
  editor.destroy();
});

it('snaps across consecutive textblocks and formatting boundaries', async () => {
  const { wordRangeForStroke } = await import('./penHighlight');
  const editor = makeEditor('Study **learn**ing\n\nand taking notes');
  const range = wordRangeForStroke(editor.state.doc, [10, editor.state.doc.content.size - 3])!;
  expect(editor.state.doc.textBetween(range.from, range.to, ' ')).toBe('learning and taking notes');
  editor.destroy();
});

it.each(HIGHLIGHTER_COLORS)('saves real HTML marks and round trips editable text with colour %s', color => {
  const editor = makeEditor('Study learning');
  editor.chain().setTextSelection({ from: 7, to: 15 }).setHighlight({ color }).run();
  const markdown = `Study <mark data-color="${color}" style="background-color: ${color}">learning</mark>`;
  expect(editor.getMarkdown()).toBe(markdown);
  const loaded = makeEditor(markdown);
  expect(loaded.getMarkdown()).toBe(markdown);
  expect(loaded.state.doc.textContent).toBe('Study learning');
  expect(loaded.state.doc.rangeHasMark(7, 15, loaded.schema.marks.highlight)).toBe(true);
  expect(loaded.getJSON()).toEqual(editor.getJSON());
  loaded.destroy(); editor.destroy();
});

it('records 1.10.0 load/save behaviour: mark HTML survives as raw inline tags', () => {
  const markdown = 'Study <mark data-color="#fde047" style="background-color: #fde047">learning</mark>';
  const saved = makeEditor('Study learning');
  saved.chain().setTextSelection({ from: 7, to: 15 }).setHighlight({ color: '#fde047' }).run();
  expect(saved.getMarkdown()).toBe(markdown);
  const legacy = makeEditor(saved.getMarkdown(), true);
  expect(legacy.getMarkdown()).toBe(markdown);
  expect(legacy.schema.marks.highlight).toBeUndefined();
  expect(legacy.getJSON().content?.[0].content?.filter(node => node.type === 'rawInline')).toHaveLength(2);
  legacy.commands.insertContentAt(legacy.state.doc.content.size - 1, ' more');
  expect(legacy.getMarkdown()).toBe(markdown + ' more');
  const modern = makeEditor(legacy.getMarkdown());
  expect(modern.state.doc.rangeHasMark(8, 14, modern.schema.marks.highlight)).toBe(true);
  saved.destroy(); legacy.destroy(); modern.destroy();
});

it('keeps highlighted formatting and inline preserved content after editing elsewhere', () => {
  const editor = makeEditor('Study **learning** &amp; [[Notes]]\n\nElsewhere');
  editor.chain().setTextSelection({ from: 7, to: editor.state.doc.child(0).nodeSize - 1 }).setHighlight({ color: '#f9a8d4' }).run();
  const saved = editor.getMarkdown();
  const loaded = makeEditor(saved);
  expect(loaded.getJSON()).toEqual(editor.getJSON());
  loaded.commands.insertContentAt(loaded.state.doc.content.size - 1, ' updated');
  expect(loaded.getMarkdown()).toBe(saved + ' updated');
  loaded.destroy(); editor.destroy();
});

it('keeps == typing/paste syntax literal for existing users', () => {
  const editor = makeEditor('==ordinary==');
  expect(editor.state.doc.textContent).toBe('==ordinary==');
  expect(editor.getMarkdown()).toBe('==ordinary==');
  editor.destroy();
});
