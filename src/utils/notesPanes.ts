export interface PanePrefs { tree: 'open' | 'min'; related: 'open' | 'min' }
const KEY = 'daymark_notes_panes';
export function loadPanePrefs(): PanePrefs {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (value && ['open', 'min'].includes(value.tree) && ['open', 'min'].includes(value.related)) return { tree: value.tree, related: value.related };
  } catch { /* Device storage is optional. */ }
  return { tree: 'open', related: 'open' };
}
export function savePanePrefs(prefs: PanePrefs): void {
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* Retain the in-memory preference. */ }
}
export function paneMode(width: number): 'full' | 'compactRelated' | 'drawers' {
  return width >= 1280 ? 'full' : width >= 1100 ? 'compactRelated' : 'drawers';
}
