// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { Editor } from '@tiptap/core';
import RichNoteEditor from './RichNoteEditor';
import { extractTags } from '../../utils/noteTags';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = () => new DOMRect();
afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); });

async function mount(markdown: string) {
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  const onChange = vi.fn(), onOpenTag = vi.fn();
  await act(async () => root.render(React.createElement(RichNoteEditor, {
    noteId: 'tags', markdown, onChange, onOpenLink() {}, onOpenTag, notes: [], onCreateNote: () => '',
  })));
  const editor = (host.querySelector('.tiptap') as HTMLElement & { editor: Editor }).editor;
  return { host, editor, onChange, onOpenTag, root };
}

it('shows #tags as chips, skipping inline code, code blocks and links', async () => {
  const { host } = await mount('Plan #project and `#code`\n\n```\n#fenced\n```\n\n[#linked](https://x.dev) #Daymark/ui');
  const chips = [...host.querySelectorAll<HTMLElement>('.dm-tag')];
  expect(chips.map(chip => chip.dataset.tag)).toEqual(['project', 'Daymark/ui']);
  expect(chips.map(chip => chip.textContent)).toEqual(['#project', '#Daymark/ui']);
});

it('opens the tag when a chip is clicked', async () => {
  const { host, onOpenTag } = await mount('Plan #project');
  const chip = host.querySelector<HTMLElement>('.dm-tag')!;
  await act(async () => chip.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })));
  expect(onOpenTag).toHaveBeenCalledWith('project');
});

it('keeps chips out of the saved Markdown and follows edits', async () => {
  const { host, editor, onChange } = await mount('Plan #project');
  await act(async () => { editor.commands.setTextSelection(editor.state.doc.content.size - 1); editor.commands.insertContent(' #next'); });
  const saved = onChange.mock.calls.at(-1)![0] as string;
  expect(saved).toContain('#project');
  expect(saved).not.toMatch(/dm-tag|data-tag|<span/);
  expect([...host.querySelectorAll<HTMLElement>('.dm-tag')].map(chip => chip.dataset.tag)).toEqual(['project', 'next']);
});

it('a tag typed at the start of a new line still reads as a tag after saving', async () => {
  const { editor, onChange } = await mount('First line');
  await act(async () => { editor.commands.setTextSelection(editor.state.doc.content.size - 1); editor.commands.splitBlock(); editor.commands.insertContent('#later on'); });
  const saved = onChange.mock.calls.at(-1)![0] as string;
  expect(extractTags(saved)).toEqual(['later']);
  expect(saved).not.toMatch(/^# /m);
});
