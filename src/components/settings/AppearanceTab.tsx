import React from 'react';
import type { AppearanceSettings, ThemeColors } from '../../types/daymark';
import { resolveAppearance } from '../../utils/appearance';
import { normalizeAppearance } from '../../utils/defaultData';
import { buttonClass } from '../ui/Dialog';
import { ColorField } from './ColorField';

interface AppearanceTabProps {
  appearance: AppearanceSettings;
  onChange: (next: AppearanceSettings) => void;
  /** Task 4: Background image thumbnails, Add, Dim and Blur belong here. */
  photoSection?: React.ReactNode;
}

export function AppearanceTab({ appearance, onChange, photoSection }: AppearanceTabProps) {
  const a = normalizeAppearance(appearance);
  const colors = a[a.theme];
  const resolved = resolveAppearance(a, null);
  const patchColors = (patch: Partial<ThemeColors>) => onChange({ ...a, [a.theme]: { ...colors, ...patch } });
  return <div className="space-y-5">
    <fieldset className="space-y-2">
      <legend className="font-semibold">Theme</legend>
      <div className="flex gap-2">
        {(['light', 'dark'] as const).map((theme) => <button type="button" key={theme} aria-pressed={a.theme === theme} className={`${buttonClass.secondary} aria-pressed:bg-stone-900 aria-pressed:text-white dark:aria-pressed:bg-stone-100 dark:aria-pressed:text-stone-900`} onClick={() => onChange({ ...a, theme })}>{theme === 'light' ? '\u2600 Light' : '\u263e Dark'}</button>)}
      </div>
      <p className="text-sm text-stone-600 dark:text-stone-400">Saved in the app and synced. Your browser or phone setting is ignored.</p>
    </fieldset>
    <fieldset className="space-y-2">
      <legend className="font-semibold">Text size</legend>
      <div className="flex gap-2">{(['s', 'm', 'l'] as const).map((textSize) => <button type="button" key={textSize} aria-pressed={a.textSize === textSize} className={`${buttonClass.secondary} aria-pressed:bg-stone-900 aria-pressed:text-white dark:aria-pressed:bg-stone-100 dark:aria-pressed:text-stone-900`} onClick={() => onChange({ ...a, textSize })}>{textSize.toUpperCase()}</button>)}</div>
    </fieldset>
    <p className="text-sm text-stone-600 dark:text-stone-400">Editing {a.theme === 'light' ? 'Light' : 'Dark'} colours.</p>
    <fieldset className="space-y-3">
      <legend className="font-semibold">Header</legend>
      <div className="flex flex-wrap gap-2 items-center">
        {['#fafaf9', '#1c1917', '#7c2d12', '#1e3a5f', '#365314'].map((color) => <button type="button" key={color} aria-label={`Header colour ${color}`} aria-pressed={colors.headerBg === color} style={{ backgroundColor: color }} className="w-11 h-11 rounded-full border border-stone-400 aria-pressed:ring-2 ring-offset-2 ring-stone-500" onClick={() => patchColors({ headerBg: color })} />)}
        <label className="flex items-center gap-2">Custom<input type="color" aria-label="Custom header colour" value={colors.headerBg} onChange={(e) => patchColors({ headerBg: e.target.value })} className="w-11 h-11" /></label>
      </div>
      <label className="flex flex-wrap items-center gap-2">Header opacity
        <input type="range" min={40} max={100} value={colors.headerOpacity} onChange={(e) => patchColors({ headerOpacity: Number(e.target.value) })} />{colors.headerOpacity}%
      </label>
    </fieldset>
    {(['headerText', 'pageText', 'accent'] as const).map((field) => <ColorField key={field} label={{ headerText: 'Header text', pageText: 'Page text', accent: 'Accent' }[field]} value={colors[field]} automaticColor={resolveAppearance({ ...a, [a.theme]: { ...colors, [field]: 'auto' } }, null)[field]} onChange={(value) => patchColors({ [field]: value })} warning={resolved.warnings.find((w) => w.field === field)?.ratio} />)}
    {/* Task 4 owns this Background image group. */}
    <section aria-label="Background image">{photoSection}</section>
  </div>;
}
