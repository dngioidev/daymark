import { useEffect, useState } from 'react';
import { loadPanePrefs, paneMode, relatedPaneLayout } from '../../utils/notesPanes';

/** Device layout and pane choices are independent of navigation and vault state. */
export function useNotesLayout(compact: boolean, railCollapsed: boolean) {
  const [prefs, setPrefs] = useState(loadPanePrefs);
  const [width, setWidth] = useState(typeof window === 'undefined' ? 1440 : window.innerWidth ?? 1440);
  useEffect(() => {
    const resize = () => setWidth(window.innerWidth);
    window.addEventListener?.('resize', resize);
    return () => window.removeEventListener?.('resize', resize);
  }, []);
  const phone = compact || width < 768;
  const mode = phone ? 'drawers' : paneMode(width);
  const layout = relatedPaneLayout(width, railCollapsed, prefs);
  return { phone, mode, drawers: mode === 'drawers', layout, treeMinimized: layout.tree === 'min', prefs, setPrefs };
}
