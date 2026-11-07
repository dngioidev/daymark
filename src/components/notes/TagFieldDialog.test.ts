// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { TagFieldDialog } from './TagFieldDialog';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; document.body.innerHTML = ''; });

it('edits a note tag field: shows current tags, parses #, commas and spaces on Save', async () => {
  const host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  const onSave = vi.fn(), onClose = vi.fn();
  const note = { id: 'ink', title: 'Sketch', folder: '', content: '', tags: ['old'], createdAt: '', updatedAt: '', kind: 'handwritten' as const };
  await act(async () => root!.render(React.createElement(TagFieldDialog, { note, onSave, onClose })));
  const input = document.querySelector<HTMLInputElement>('input[aria-label="Tags"]')!;
  expect(input.value).toBe('#old');
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '#plan, ideas #1x');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  act(() => [...document.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent === 'Save')!.click());
  expect(onSave).toHaveBeenCalledWith(['plan', 'ideas']);
});
