// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { useNoteNavigationState } from './useNoteNavigationState';
import * as prefs from '../../utils/notesPanes';
import { EMPTY_NOTE_META, type StandaloneNote, type NoteMeta } from '../../types/daymark';
const note = (folder: string): StandaloneNote => ({ id: 'one', title: 'One', folder, content: '', tags: [], createdAt: '', updatedAt: '' });
let api: ReturnType<typeof useNoteNavigationState>; let root: Root | undefined;
function Harness({ notes = [note('Work/Deep/Child')], meta = EMPTY_NOTE_META }: { notes?: StandaloneNote[]; meta?: NoteMeta }) { api = useNoteNavigationState(notes, '', '', meta); return null; }
function mount(meta?: NoteMeta) { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); root = createRoot(document.createElement('div')); act(() => root!.render(React.createElement(Harness, { meta }))); }
afterEach(() => { if (root) act(() => root!.unmount()); root = undefined; vi.restoreAllMocks(); localStorage.clear(); });
it('prunes persisted keys against note folders and live empty metadata folders on load', () => {
  localStorage.setItem('daymark_notes_expanded', JSON.stringify(['work', 'work/deep', 'ghost', 'empty/child', 'removed']));
  mount({ folders: [{ path: 'Empty/Child', updatedAt: '' }, { path: 'Removed', removed: true, updatedAt: '' }], dismissed: [] });
  expect(api.expanded).toEqual(new Set(['work', 'work/deep', 'empty/child']));
  expect(prefs.loadNoteExpansion()).toEqual(api.expanded);
});
it('saves expansion in an effect, never synchronously inside its state updater', () => {
  mount(); const save = vi.spyOn(prefs, 'saveNoteExpansion');
  act(() => { api.setExpanded(new Set(['work', 'work/deep'])); expect(save).not.toHaveBeenCalled(); });
  expect(save).toHaveBeenCalledOnce(); expect(prefs.loadNoteExpansion()).toEqual(new Set(['work', 'work/deep']));
});
it.each(['rename', 'move', 'delete'])('migrates subtree expansion and prunes stale keys after %s', action => {
  localStorage.setItem('daymark_notes_expanded', JSON.stringify(['work', 'work/deep', 'work/deep/child'])); mount();
  const destination = action === 'rename' ? 'Renamed' : action === 'move' ? 'Archive/Work' : undefined;
  act(() => { api.migrateFolderExpansion('Work', destination); root!.render(React.createElement(Harness, { notes: [note(destination ? destination + '/Deep/Child' : '')] })); });
  expect(api.expanded).toEqual(new Set(destination ? (action === 'move' ? ['archive', 'archive/work', 'archive/work/deep', 'archive/work/deep/child'] : ['renamed', 'renamed/deep', 'renamed/deep/child']) : []));
  expect(prefs.loadNoteExpansion()).toEqual(api.expanded);
});
it('remembers folder expansion in memory while its only note is deleted so Undo restores it expanded', () => {
  localStorage.setItem('daymark_notes_expanded', JSON.stringify(['work', 'work/deep', 'work/deep/child'])); mount();
  act(() => root!.render(React.createElement(Harness, { notes: [] })));
  expect(api.expanded).toEqual(new Set());
  expect(prefs.loadNoteExpansion()).toEqual(new Set());
  act(() => root!.render(React.createElement(Harness, {})));
  expect(api.expanded).toEqual(new Set(['work', 'work/deep', 'work/deep/child']));
});
