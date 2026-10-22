import React from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
const hooks = vi.hoisted(() => ({ values: [] as unknown[], index: 0 }));
vi.mock('react', async (original) => ({ ...await original<typeof React>(),
  useState: (initial: unknown) => {
    const index = hooks.index++;
    if (!(index in hooks.values)) hooks.values[index] = initial;
    return [hooks.values[index], (value: unknown) => { hooks.values[index] = value; }];
  }, useRef: () => ({ current: null }),
}));
vi.mock('../../utils/vaultStore', () => ({ isPhotoStorageAvailable: () => true }));
import { BackgroundPhotoSection } from './BackgroundPhotoSection';
import { Dialog } from '../ui/Dialog';
const photos = Array.from({ length: 5 }, (_, slot) => ({ slot, addedAt: '2026-10-22', width: 800, height: 600, luminance: 0.5 }));
function elements(node: React.ReactNode): React.ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...elements(node.props.children as React.ReactNode)];
}
beforeEach(() => { hooks.values = []; hooks.index = 0; });
it('asks which of five photos to replace, then passes the chosen slot and file', async () => {
  const add = vi.fn(async () => {});
  const background = { photos, meta: photos[0], url: null, add, remove: vi.fn(), select: vi.fn() };
  const render = () => { hooks.index = 0; return elements(BackgroundPhotoSection({ background })); };
  const file = new File(['photo'], 'sixth.png');
  const input = render().find((node) => node.props.type === 'file')!;
  (input.props.onChange as (event: unknown) => void)({ currentTarget: { files: [file], value: 'sixth.png' } });
  expect(add).not.toHaveBeenCalled();
  const nodes = render();
  const dialog = nodes.find((node) => node.type === Dialog)!;
  expect(dialog.props.isOpen).toBe(true);
  expect(dialog.props.title).toBe('Replace which photo?');
  expect(elements(dialog.props.footer as React.ReactNode)[0].props.children).toBe('Cancel');
  const replace = nodes.find((node) => node.props['aria-label'] === 'Replace photo 4')!;
  (replace.props.onClick as () => void)();
  await vi.waitFor(() => expect(add).toHaveBeenCalledWith(file, 3));
  await vi.waitFor(() => expect(render().find((node) => node.type === Dialog)!.props.isOpen).toBe(false));
});
