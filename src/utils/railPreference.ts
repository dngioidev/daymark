const KEY = 'daymark_rail_collapsed';

/** Presentation choice belongs to this device; blocked storage must not block navigation. */
export function loadRailCollapsed(): boolean {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}

export function saveRailCollapsed(collapsed: boolean): void {
  try { localStorage.setItem(KEY, collapsed ? '1' : '0'); } catch { /* Keep the in-memory choice. */ }
}
