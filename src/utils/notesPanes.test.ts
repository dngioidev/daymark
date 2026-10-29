// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { loadPanePrefs, savePanePrefs, paneMode, notesEditorWidth, relatedPaneLayout, MIN_EDITOR_WIDTH } from './notesPanes';

afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });
it('persists graph panels without losing existing Notes preferences', () => {
  savePanePrefs({ tree: 'min', related: 'open', graphFilters: 'min', graphDetail: 'open' });
  expect(loadPanePrefs()).toEqual({ tree: 'min', related: 'open', graphFilters: 'min', graphDetail: 'open' });
});
it.each([[390, 'drawers'], [799, 'drawers'], [800, 'drawers'], [1099, 'drawers'], [1100, 'compactRelated'], [1279, 'compactRelated'], [1280, 'full'], [1440, 'full']])('paneMode(%s) is %s', (width, mode) => {
  expect(paneMode(Number(width))).toBe(mode);
});
it('persists both device preferences and rejects damaged values', () => {
  expect(loadPanePrefs()).toEqual({ tree: 'open', related: undefined });
  savePanePrefs({ tree: 'min', related: 'open' });
  expect(loadPanePrefs()).toEqual({ tree: 'min', related: 'open' });
  localStorage.setItem('daymark_notes_panes', '{"tree":"bad"}');
  expect(loadPanePrefs()).toEqual({ tree: 'open', related: undefined });
});
it('survives unavailable storage', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw Error('blocked'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('blocked'); });
  expect(loadPanePrefs()).toEqual({ tree: 'open', related: undefined });
  expect(() => savePanePrefs({ tree: 'min', related: 'min' })).not.toThrow();
});

for (const width of [1280, 1366, 1440, 1600, 1920]) for (const railCollapsed of [false, true]) for (const tree of ['open', 'min'] as const) {
  it(`budgets ${width}px with rail ${railCollapsed ? 'strip' : 'open'} and tree ${tree}`, () => {
    const available = Math.min(width - (railCollapsed ? 64 : 168), 1800);
    const expected = available - (tree === 'open' ? 288 : 56) - 256 - 64 - 24;
    expect(notesEditorWidth(width, { railCollapsed, tree, related: 'open' })).toBe(expected);
    expect(notesEditorWidth(width, { railCollapsed, tree, related: 'min' })).toBe(expected + 200);
    const layout = relatedPaneLayout(width, railCollapsed, { tree, related: undefined });
    expect(layout.related).toBe(expected >= MIN_EDITOR_WIDTH ? 'open' : 'min');
    expect(layout.overlay).toBe(false);
  });
}
it('keeps a 480px editor at narrow desktop widths and uses overlays for explicit expansion', () => {
  for (const width of [1100, 1200, 1280, 1366, 1440]) {
    const defaults = relatedPaneLayout(width, false, { tree: 'open', related: undefined });
    expect(notesEditorWidth(width, { railCollapsed: false, tree: defaults.tree, related: defaults.related })).toBeGreaterThanOrEqual(480);
    const explicit = relatedPaneLayout(width, false, { tree: 'open', related: 'open' });
    expect(explicit.overlay).toBe(notesEditorWidth(width, { railCollapsed: false, tree: defaults.tree, related: 'open' }) < 480);
    expect(explicit.tree).toBe(defaults.tree);
  }
});
it('preserves missing versus explicit choices across storage and layout changes', () => {
  savePanePrefs({ tree: 'min', related: undefined });
  expect(loadPanePrefs()).toEqual({ tree: 'min', related: undefined });
  savePanePrefs({ tree: 'open', related: 'open' });
  expect(relatedPaneLayout(1100, false, loadPanePrefs())).toMatchObject({ related: 'open', overlay: true });
  expect(relatedPaneLayout(1920, false, loadPanePrefs())).toMatchObject({ related: 'open', overlay: false });
  savePanePrefs({ tree: 'open', related: 'min' });
  expect(relatedPaneLayout(1920, false, loadPanePrefs()).related).toBe('min');
});
it('persists expansion independently and survives blocked or corrupt storage', async () => {
  const { loadNoteExpansion, saveNoteExpansion } = await import('./notesPanes');
  expect(loadNoteExpansion()).toBeUndefined();
  savePanePrefs({ tree: 'min', related: 'open' }); saveNoteExpansion(new Set(['tech', 'tech/java']));
  expect(loadNoteExpansion()).toEqual(new Set(['tech', 'tech/java']));
  expect(loadPanePrefs()).toEqual({ tree: 'min', related: 'open' });
  saveNoteExpansion(new Set()); expect(loadNoteExpansion()).toEqual(new Set());
  localStorage.setItem('daymark_notes_expanded', '[null]'); expect(loadNoteExpansion()).toBeUndefined();
  localStorage.setItem('daymark_notes_expanded', '{bad json'); expect(loadNoteExpansion()).toBeUndefined();
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw Error('blocked'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('blocked'); });
  expect(loadNoteExpansion()).toBeUndefined(); expect(() => saveNoteExpansion(new Set())).not.toThrow();
});
it('uses the reclaimed list width for the editor on a 1440px desktop', () => {
  expect(relatedPaneLayout(1440, false, { tree: 'open', related: undefined })).toMatchObject({ tree: 'open', related: 'open', overlay: false });
});
it('keeps the existing minimized-strip path within the editor budget at 1100px', () => {
  const layout = relatedPaneLayout(1100, false, { tree: 'min', related: undefined });
  expect(notesEditorWidth(1100, { railCollapsed: false, tree: layout.tree, related: layout.related })).toBeGreaterThanOrEqual(480);
});

it('reclaims the entire navigation column when minimized', () => {
  expect(notesEditorWidth(1280, { railCollapsed: false, tree: 'min', related: 'open' })).toBe(712);
});
