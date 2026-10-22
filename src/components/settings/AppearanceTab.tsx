import React, { useEffect, useRef, useState } from 'react';
import type { AppearanceSettings, ThemeColors } from '../../types/daymark';
import { resolveAppearance } from '../../utils/appearance';
import { normalizeAppearance } from '../../utils/defaultData';
import { buttonClass } from '../ui/Dialog';
import { ColorField } from './ColorField';
import { PreviewInput } from './PreviewInput';
import { previewAppearance } from '../../hooks/useAppearance';
import { isPhotoStorageAvailable } from '../../utils/vaultStore';

interface AppearanceTabProps {
  appearance: AppearanceSettings;
  onChange: (next: AppearanceSettings) => void;
  /** Task 4: Background image thumbnails, Add, Dim and Blur belong here. */
  photoSection?: React.ReactNode;
  photoMeta?: { luminance: number } | null;
}

export function AppearanceTab({ appearance, onChange, photoSection, photoMeta = null }: AppearanceTabProps) {
  const [draft, setDraft] = useState(appearance);
  const latest = useRef({ appearance, photoMeta });
  latest.current = { appearance, photoMeta };
  useEffect(() => setDraft(appearance), [appearance]);
  useEffect(() => () => previewAppearance(latest.current.appearance, latest.current.photoMeta), []);
  const a = normalizeAppearance(draft);
  const colors = a[a.theme];
  const resolved = resolveAppearance(a, photoMeta);
  const patchColors = (patch: Partial<ThemeColors>) => onChange({ ...a, [a.theme]: { ...colors, ...patch } });
  const preview = (next: AppearanceSettings) => { setDraft(next); previewAppearance(next, photoMeta); };
  const previewColors = (patch: Partial<ThemeColors>) => preview({ ...a, [a.theme]: { ...colors, ...patch } });
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
        <label className="flex items-center gap-2">Custom<PreviewInput type="color" aria-label="Custom header colour" value={colors.headerBg} onPreview={(headerBg) => previewColors({ headerBg })} onCommit={(headerBg) => patchColors({ headerBg })} className="w-11 h-11" /></label>
      </div>
      <label className="flex flex-wrap items-center gap-2">Header opacity
        <PreviewInput type="range" min={40} max={100} value={colors.headerOpacity} onPreview={(value) => previewColors({ headerOpacity: Number(value) })} onCommit={(value) => patchColors({ headerOpacity: Number(value) })} />{colors.headerOpacity}%
      </label>
    </fieldset>
    {(['headerText', 'pageText', 'accent'] as const).map((field) => <ColorField key={field} label={{ headerText: 'Header text', pageText: 'Page text', accent: 'Accent' }[field]} value={colors[field]} automaticColor={resolveAppearance({ ...a, [a.theme]: { ...colors, [field]: 'auto' } }, photoMeta)[field]} onPreview={(value) => previewColors({ [field]: value })} onChange={(value) => patchColors({ [field]: value })} warning={resolved.warnings.find((w) => w.field === field)?.ratio} />)}
    {/* Task 4 owns this Background image group. */}
    <section aria-label="Background image" className="space-y-3">
      <h3 className="font-semibold">Background image</h3>
      {photoSection ?? <p>Photos need browser storage, which is unavailable here.</p>}
      {isPhotoStorageAvailable() && <>
        <label className="flex flex-wrap items-center gap-2">Dim
          <PreviewInput type="range" min={0} max={90} value={a.dim} onPreview={(value) => preview({ ...a, dim: Number(value) })} onCommit={(value) => onChange({ ...a, dim: Number(value) })} />{a.dim}%
        </label>
        <label className="flex flex-wrap items-center gap-2">Blur
          <PreviewInput type="range" min={0} max={12} value={a.blur} onPreview={(value) => preview({ ...a, blur: Number(value) })} onCommit={(value) => onChange({ ...a, blur: Number(value) })} />{a.blur} px
        </label>
      </>}
    </section>
  </div>;
}
