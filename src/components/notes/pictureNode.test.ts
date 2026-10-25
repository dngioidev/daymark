// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Editor } from '@tiptap/core';
import RichNoteEditor from './RichNoteEditor';

const fixtures = vi.hoisted(() => ({ id: 'a'.repeat(64), url: null as string | null }));
vi.mock('../../utils/notePicture', () => ({ encodeNotePicture: vi.fn(async () => ({ blob: new Blob(['encoded'], { type: 'image/webp' }), width: 100, height: 80, mime: 'image/webp' })) }));
vi.mock('../../utils/noteAssets', async (original) => ({
  ...await original<typeof import('../../utils/noteAssets')>(),
  putAsset: vi.fn(async () => fixtures.id),
  getAssetUrl: vi.fn(async () => fixtures.url),
}));
import { putAsset } from '../../utils/noteAssets';
import { encodeNotePicture } from '../../utils/notePicture';
import { markdownToDoc } from '../../utils/noteMarkdown';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = () => new DOMRect();
let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  fixtures.url = null;
  vi.stubGlobal('ClipboardEvent', Event);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  document.body.innerHTML = '';
  vi.clearAllMocks(); vi.unstubAllGlobals();
});
async function mount(markdown = '') {
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  const onChange = vi.fn();
  await act(async () => root.render(React.createElement(RichNoteEditor, { noteId: 'pictures', markdown, onChange, onOpenLink() {}, notes: [], onCreateNote: () => '' })));
  const editor = (host.querySelector('.tiptap') as HTMLElement & { editor: Editor }).editor;
  return { editor, onChange };
}
function fileEvent(type: 'paste' | 'drop', files: File[]) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, type === 'paste' ? 'clipboardData' : 'dataTransfer', { value: { files, getData: () => '', types: ['Files'] } });
  return event;
}
it('pasted image becomes an asset reference', async () => {
  const { editor, onChange } = await mount();
  await act(async () => { editor.view.dom.dispatchEvent(fileEvent('paste', [new File(['pixels'], 'Screen shot.png', { type: 'image/png' })])); });
  expect(onChange).toHaveBeenLastCalledWith(`![Screen shot](daymark-asset:${fixtures.id}.webp)`);
});
it('dropped image files become asset references in order', async () => {
  const { editor, onChange } = await mount();
  vi.spyOn(editor.view, 'posAtCoords').mockReturnValue({ pos: 1, inside: 0 });
  await act(async () => { editor.view.dom.dispatchEvent(fileEvent('drop', [new File(['one'], 'one.gif', { type: 'image/gif' }), new File(['two'], 'two.jpg', { type: 'image/jpeg' })])); });
  expect(onChange.mock.calls.at(-1)?.[0]).toBe(`![one](daymark-asset:${fixtures.id}.webp)![two](daymark-asset:${fixtures.id}.webp)`);
});
it('https image stays a link', async () => {
  const { editor, onChange } = await mount();
  await act(async () => { editor.view.pasteHTML('<p><img src="https://example.com/a.png" alt="Remote"></p>'); });
  expect(onChange).toHaveBeenLastCalledWith('![Remote](https://example.com/a.png)');
  const image = host.querySelector('img[src]')!;
  expect(image.getAttribute('loading')).toBe('lazy');
  expect(image.getAttribute('referrerpolicy')).toBe('no-referrer');
});
it('missing asset shows placeholder and retries on sync without saving the note', async () => {
  const { onChange } = await mount(`![Local](daymark-asset:${fixtures.id}.webp)`);
  expect(host.textContent).toContain('Picture not synced yet');
  fixtures.url = 'blob:arrived';
  await act(async () => { window.dispatchEvent(new CustomEvent('daymark-assets-changed', { detail: { ids: [fixtures.id] } })); });
  expect(host.querySelector('img[src]')?.getAttribute('src')).toBe('blob:arrived');
  expect(host.textContent).not.toContain('Picture not synced yet');
  expect(onChange).not.toHaveBeenCalled();
});
it('sanitises image sources while preserving asset references in serialised Markdown', async () => {
  const { editor } = await mount();
  await act(async () => { editor.view.pasteHTML(`<p><img alt="Safe" src="daymark-asset:${fixtures.id}.webp"><img src="http://example.com/a.png"><img src="data:image/png;base64,eA=="><img src="javascript:alert(1)"><img src="/relative.png"><img src="blob:other"><img src="https://example.com/safe.png" srcset="http://example.com/unsafe.png 2x" onerror="alert(1)"></p>`); });
  const markdown = editor.getMarkdown();
  expect(markdown).toContain(`![Safe](daymark-asset:${fixtures.id}.webp)`);
  for (const unsafe of ['http:', 'data:', 'javascript:', '/relative.png', 'blob:', 'unsafe.png', 'onerror']) expect(markdown).not.toContain(unsafe);
  expect(host.querySelector('[srcset], [onerror]')).toBeNull();
});
it('storage failures show a toast and do not insert or save a broken reference', async () => {
  const { FeedbackHost } = await import('../ui/feedback');
  const feedback = document.createElement('div'); document.body.append(feedback); const feedbackRoot = createRoot(feedback);
  await act(async () => feedbackRoot.render(React.createElement(FeedbackHost)));
  const { editor, onChange } = await mount('Original');
  vi.mocked(putAsset).mockRejectedValueOnce(new Error('Pictures need browser storage, which is unavailable here.'));
  await act(async () => { editor.view.dom.dispatchEvent(fileEvent('paste', [new File(['x'], 'a.png', { type: 'image/png' })])); });
  expect(document.body.textContent).toContain('Pictures need browser storage');
  expect(editor.getMarkdown()).toBe('Original'); expect(onChange).not.toHaveBeenCalled();
  await act(async () => feedbackRoot.unmount());
});
it('Picture offers a file picker and a Dialog for https links', async () => {
  const { onChange } = await mount();
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Picture"]')!.click());
  const fromLink = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')).find(button => button.textContent?.includes('From link'))!;
  expect(fromLink).toBeTruthy();
  await act(async () => fromLink.click());
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  const input = document.querySelector<HTMLInputElement>('[aria-label="Picture URL"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'https://example.com/link.png');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => document.querySelector('form[data-picture-link]')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(onChange).toHaveBeenLastCalledWith('![](https://example.com/link.png)');
  expect(document.querySelector('input[type="file"][accept="image/*"]')).not.toBeNull();
});

it('file picker inserts the selected image as Markdown and resets for the same file', async () => {
  const { onChange } = await mount();
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Picture"]')!.click());
  const choose = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')).find(button => button.textContent?.includes('Choose file'))!;
  const picker = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  const click = vi.spyOn(picker, 'click');
  await act(async () => choose.click());
  expect(click).toHaveBeenCalledOnce();
  Object.defineProperty(picker, 'files', { value: [new File(['x'], 'holiday.jpeg', { type: 'image/jpeg' })] });
  await act(async () => { picker.dispatchEvent(new Event('change', { bubbles: true })); });
  expect(onChange).toHaveBeenLastCalledWith(`![holiday](daymark-asset:${fixtures.id}.webp)`);
  expect(picker.value).toBe('');
});

it('escapes picture filenames so serialised Markdown reloads with the same alt text', async () => {
  const { editor } = await mount();
  await act(async () => { editor.view.dom.dispatchEvent(fileEvent('paste', [new File(['x'], 'shot [1] *copy*.png', { type: 'image/png' })])); });
  const markdown = editor.getMarkdown();
  expect(markdown).toContain('![shot \\[1\\] *copy*]');
  expect(markdownToDoc(markdown).content?.[0].content?.[0]).toMatchObject({ type: 'image', attrs: { alt: 'shot [1] *copy*' } });
});

it('keeps https URLs with unmatched parentheses intact through serialisation', async () => {
  const { editor } = await mount();
  await act(async () => { editor.commands.setImage({ src: 'https://example.com/a)b.png', alt: 'Remote' }); });
  const markdown = editor.getMarkdown();
  expect(markdown).toBe('![Remote](<https://example.com/a)b.png>)');
  expect(markdownToDoc(markdown).content?.[0].content?.[0]).toMatchObject({ type: 'image', attrs: { src: 'https://example.com/a)b.png' } });
});

it('maps the insertion point through typing while a picture is being encoded', async () => {
  const { editor } = await mount('Tail');
  let finish!: (value: Awaited<ReturnType<typeof encodeNotePicture>>) => void;
  vi.mocked(encodeNotePicture).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await act(async () => { editor.view.dom.dispatchEvent(fileEvent('paste', [new File(['x'], 'async.png', { type: 'image/png' })])); });
  await act(async () => { editor.view.dispatch(editor.state.tr.insertText('New ', 1)); });
  await act(async () => { finish({ blob: new Blob(['x'], { type: 'image/webp' }), width: 1, height: 1, mime: 'image/webp' }); });
  expect(editor.getMarkdown()).toBe(`New ![async](daymark-asset:${fixtures.id}.webp)Tail`);
});

it('never inserts a pending picture into a different note after switching', async () => {
  const { editor } = await mount('First');
  let finish!: (value: Awaited<ReturnType<typeof encodeNotePicture>>) => void;
  vi.mocked(encodeNotePicture).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await act(async () => { editor.view.dom.dispatchEvent(fileEvent('paste', [new File(['x'], 'async.png', { type: 'image/png' })])); });
  const onChange = vi.fn();
  await act(async () => root.render(React.createElement(RichNoteEditor, { noteId: 'second', markdown: 'Second', onChange, onOpenLink() {}, notes: [], onCreateNote: () => '' })));
  await act(async () => { finish({ blob: new Blob(['x'], { type: 'image/webp' }), width: 1, height: 1, mime: 'image/webp' }); });
  expect((host.querySelector('.tiptap') as HTMLElement & { editor: Editor }).editor.getMarkdown()).toBe('Second');
  expect(onChange).not.toHaveBeenCalled();
});

it('leaves non-image file paste to the normal editor handler', async () => {
  const { editor, onChange } = await mount();
  const event = fileEvent('paste', [new File(['text'], 'text.txt', { type: 'text/plain' })]);
  await act(async () => { editor.view.dom.dispatchEvent(event); });
  expect(event.defaultPrevented).toBe(false);
  expect(onChange).not.toHaveBeenCalled();
});

