export interface PanePrefs { tree: 'open' | 'min'; related: 'open' | 'min' | undefined; graphFilters?: 'open' | 'min'; graphDetail?: 'open' | 'min' }
export const MIN_EDITOR_WIDTH = 480;
// Expanded navigation is one column. Keep the legacy strip + list budget until Task 4.
export const NOTES_WIDTHS = { rail: 168, railMin: 64, tree: 288, strip: 56, list: 256, related: 256,
  padding: 64, compactPadding: 32, paneGap: 12, navigationGap: 8, maxContent: 1800 };

export function notesEditorWidth(windowWidth: number, panes: { railCollapsed: boolean; tree: 'open' | 'min'; related: 'open' | 'min' }): number {
  const w = NOTES_WIDTHS;
  return Math.min(windowWidth - (panes.railCollapsed ? w.railMin : w.rail), w.maxContent)
    - (panes.tree === 'open' ? w.tree : w.strip + w.list + w.navigationGap) - (panes.related === 'open' ? w.related : w.strip)
    - (windowWidth >= 1280 ? w.padding : w.compactPadding) - 2 * w.paneGap;
}

export function relatedPaneLayout(width: number, railCollapsed: boolean, prefs: PanePrefs) {
  // At narrow desktop widths the tree temporarily uses its strip, preserving its saved choice.
  const tree = notesEditorWidth(width, { railCollapsed, tree: prefs.tree, related: 'min' }) < MIN_EDITOR_WIDTH ? 'min' : prefs.tree;
  const fits = notesEditorWidth(width, { railCollapsed, tree, related: 'open' }) >= MIN_EDITOR_WIDTH;
  const related = prefs.related ?? (fits ? 'open' : 'min');
  return { tree, related, overlay: related === 'open' && !fits };
}
const KEY = 'daymark_notes_panes';
export function loadPanePrefs(): PanePrefs {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (value && ['open', 'min'].includes(value.tree) && (value.related === undefined || ['open', 'min'].includes(value.related))) return {
      tree: value.tree, related: value.related,
      ...(['open', 'min'].includes(value.graphFilters) ? { graphFilters: value.graphFilters } : {}),
      ...(['open', 'min'].includes(value.graphDetail) ? { graphDetail: value.graphDetail } : {}),
    };
  } catch { /* Device storage is optional. */ }
  return { tree: 'open', related: undefined };
}
export function savePanePrefs(prefs: PanePrefs): void {
  try { localStorage.setItem(KEY, JSON.stringify({ ...loadPanePrefs(), ...prefs })); } catch { /* Retain the in-memory preference. */ }
}
export function paneMode(width: number): 'full' | 'compactRelated' | 'drawers' {
  return width >= 1280 ? 'full' : width >= 1100 ? 'compactRelated' : 'drawers';
}

const EXPANSION_KEY = 'daymark_notes_expanded';
export function loadNoteExpansion(): Set<string> | undefined {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(EXPANSION_KEY) || 'null');
    if (Array.isArray(value) && value.every(path => typeof path === 'string')) return new Set(value);
  } catch { /* Device storage is optional. */ }
  return undefined;
}
export function saveNoteExpansion(expanded: ReadonlySet<string>): void {
  try { localStorage.setItem(EXPANSION_KEY, JSON.stringify([...expanded])); } catch { /* Keep in memory. */ }
}
