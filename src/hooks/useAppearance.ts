import { useLayoutEffect, useMemo } from 'react';
import type { AppearanceSettings, ResolvedAppearance } from '../types/daymark';
import { appearanceVars, resolveAppearance, THEME_MIRROR_KEY } from '../utils/appearance';

export function useAppearance(appearance: AppearanceSettings, photo: { luminance: number } | null): ResolvedAppearance {
  const luminance = photo?.luminance;
  const resolved = useMemo(() => resolveAppearance(appearance, luminance === undefined ? null : { luminance }), [appearance, luminance]);
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', resolved.theme === 'dark');
    root.style.fontSize = `${resolved.rootFontPx}px`;
    for (const [key, value] of Object.entries(appearanceVars(resolved))) root.style.setProperty(key, value);
    try {
      localStorage.setItem(THEME_MIRROR_KEY, JSON.stringify({ theme: appearance.theme, textSize: appearance.textSize }));
    } catch {
      // Appearance still applies when synchronous browser storage is blocked.
    }
  }, [appearance.theme, appearance.textSize, resolved]);
  return resolved;
}
