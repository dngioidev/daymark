import React, { useEffect, useRef, useState } from 'react';
import type { WidgetStyle } from '../../types/daymark';
import { listWidgets, setWidgetStyle, WidgetList } from '../../native/daymarkBridge';
import { DEFAULT_WIDGET_STYLE, parseWidgetStyle, resolveWidgetColors, WidgetAppColors } from '../../utils/widgetStyle';
import { contrastRatio } from '../../utils/color';
import { buttonClass } from '../ui/Dialog';
import { ColorField } from './ColorField';
import { PreviewInput } from './PreviewInput';
import { WidgetPreview } from './WidgetPreview';

const swatches = ['#1c1917', '#fafaf9', '#7c2d12', '#1e3a5f', '#365314', '#f59e0b'];

export function WidgetTab({ initialWidgetId, app }: { initialWidgetId?: number; app: WidgetAppColors | null }) {
  const [list, setList] = useState<WidgetList | null>(null);
  const [selected, setSelected] = useState<number | 'default'>(initialWidgetId ?? 'default');
  const [draft, setDraft] = useState<WidgetStyle>(parseWidgetStyle(DEFAULT_WIDGET_STYLE));
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const queue = useRef(Promise.resolve());
  const revision = useRef(0);
  const load = useRef(0);
  const select = (id: number | 'default', data: WidgetList) => {
    ++revision.current;
    setSelected(id);
    setDraft(parseWidgetStyle(id === 'default' ? data.defaultStyle : data.widgets.find((w) => w.id === id)?.style));
    setStatus('');
    setError(null);
  };
  useEffect(() => {
    const request = ++load.current;
    void listWidgets().then((data) => {
      if (load.current !== request) return;
      setList(data);
      if (initialWidgetId !== undefined && !data.widgets.some((w) => w.id === initialWidgetId)) {
        select('default', data);
        setError('That widget is no longer on your home screen.');
      } else select(initialWidgetId ?? 'default', data);
    }).catch(() => { if (load.current === request) setError('Could not load your widgets. Close Settings and try again.'); });
    return () => { ++load.current; };
  }, [initialWidgetId]);

  const commit = (next: WidgetStyle) => {
    const style = parseWidgetStyle(next);
    const id = selected;
    const currentRevision = ++revision.current;
    setDraft(style);
    setError(null);
    setStatus('Saving…');
    setList((prev) => prev && (id === 'default' ? { ...prev, defaultStyle: style } : { ...prev, widgets: prev.widgets.map((w) => w.id === id ? { ...w, style } : w) }));
    // Keep rapid instant edits ordered across bridge refreshes.
    queue.current = queue.current.then(async () => {
      try {
        await setWidgetStyle({ id, style });
        if (revision.current === currentRevision) setStatus('Saved');
      } catch {
        if (revision.current === currentRevision) { setStatus(''); setError('Could not save this widget style. Try changing it again.'); }
      }
    });
  };
  const patch = (next: Partial<WidgetStyle>) => commit({ ...draft, ...next });
  const preview = (next: Partial<WidgetStyle>) => setDraft((prev) => ({ ...prev, ...next }));
  const colors = resolveWidgetColors(draft, app);
  const automatic = resolveWidgetColors({ ...draft, text: 'auto' }, app).text;
  const custom = draft.mode === 'custom';
  const textContrast = contrastRatio(colors.text, colors.bg);
  const accentContrast = contrastRatio(colors.accent, colors.bg);
  const choices = <K extends 'mode' | 'font' | 'size' | 'corners' | 'density'>(key: K, label: string, options: readonly (readonly [WidgetStyle[K], string])[]) =>
    <fieldset className="space-y-2"><legend className="font-semibold">{label}</legend><div className="flex flex-wrap gap-2">{options.map(([value, name]) => <button type="button" key={value} aria-pressed={draft[key] === value} className={`${buttonClass.secondary} aria-pressed:bg-stone-900 aria-pressed:text-white dark:aria-pressed:bg-stone-100 dark:aria-pressed:text-stone-900`} onClick={() => patch({ [key]: value })}>{name}</button>)}</div></fieldset>;
  const colorOptions = (key: 'background' | 'accent', label: string) => <fieldset className="space-y-2"><legend className="font-semibold">{label}</legend>
    <div className="flex flex-wrap items-center gap-2">{swatches.map((color) => <button type="button" key={color} aria-label={`${label} ${color}`} aria-pressed={draft[key] === color} style={{ backgroundColor: color }} className="w-11 h-11 rounded-full border border-stone-400 aria-pressed:ring-2 ring-offset-2 ring-stone-500" onClick={() => patch({ [key]: color })} />)}
      <label className="flex items-center gap-2">Custom<PreviewInput type="color" aria-label={`Custom ${label.toLowerCase()}`} value={draft[key]} onPreview={(value) => preview({ [key]: value })} onCommit={(value) => patch({ [key]: value })} className="w-11 h-11" /></label>
    </div>
  </fieldset>;

  return <div className="space-y-4">
    {error && <p role="alert">{error}</p>}
    {!list ? !error && <p role="status">Loading widgets…</p> : <>
      <button type="button" aria-pressed={selected === 'default'} className={buttonClass.secondary} onClick={() => select('default', list)}>Default for new widgets</button>
      <section className="space-y-2" aria-label="On your home screen">
        <h3 className="font-semibold">On your home screen</h3>
        {list.widgets.length === 0 && <p>No widgets yet. Add Daymark from your home screen.</p>}
        {list.widgets.map((widget, index) => <div className="flex items-center justify-between gap-2" key={widget.id}>
          <span>Widget {index + 1}</span><button type="button" aria-label={`Edit Widget ${index + 1}`} aria-pressed={selected === widget.id} className={buttonClass.secondary} onClick={() => select(widget.id, list)}>Edit</button>
        </div>)}
      </section>
      <h3 className="font-semibold">{selected === 'default' ? 'Default for new widgets' : `Widget ${list.widgets.findIndex((w) => w.id === selected) + 1}`}</h3>
      <div className="flex flex-col xl:flex-row gap-5 items-start">
        <div className="w-full xl:w-64 xl:sticky xl:top-0 shrink-0"><WidgetPreview style={draft} app={app} /><p className="mt-2 text-xs text-stone-600 dark:text-stone-400">Preview. Your launcher controls the final size.</p></div>
        <div className="min-w-0 space-y-4 flex-1">
          {choices('mode', 'Style', [['match-app', 'Match app'], ['custom', 'Custom']])}
          <fieldset disabled={!custom} className="space-y-4 disabled:opacity-50">
            <legend className="sr-only">Custom colours</legend>
            {colorOptions('background', 'Background')}
            <ColorField label="Text" value={draft.text} automaticColor={automatic} onPreview={(text) => preview({ text })} onChange={(text) => patch({ text })} warning={custom && draft.text !== 'auto' && textContrast < 4.5 ? textContrast : undefined} />
            {colorOptions('accent', 'Accent')}
            {custom && accentContrast < 4.5 && <p className="text-sm text-stone-600 dark:text-stone-400">Accent may be hard to read: contrast {accentContrast.toFixed(1)}:1 (needs 4.5:1).</p>}
          </fieldset>
          <label className="flex flex-wrap items-center gap-2">Opacity<PreviewInput type="range" min={0} max={100} value={draft.opacity} onPreview={(value) => preview({ opacity: Number(value) })} onCommit={(value) => patch({ opacity: Number(value) })} />{draft.opacity}%</label>
          {choices('font', 'Font', [['sans', 'Sans'], ['serif', 'Serif'], ['mono', 'Mono']])}
          {choices('size', 'Size', [['s', 'S'], ['m', 'M'], ['l', 'L'], ['xl', 'XL']])}
          {choices('corners', 'Corners', [['square', 'Square'], ['round', 'Round'], ['extra', 'Extra round']])}
          {choices('density', 'Density', [['compact', 'Compact'], ['comfy', 'Comfy']])}
          <fieldset><legend className="font-semibold">Show</legend>{([['done', 'Done tasks'], ['age', 'Age badges'], ['quickAdd', 'Quick add'], ['sections', 'Section names']] as const).map(([key, label]) => <label className="flex items-center gap-2 min-h-11" key={key}><input type="checkbox" checked={draft.show[key]} onChange={(e) => patch({ show: { ...draft.show, [key]: e.target.checked } })} />{label}</label>)}</fieldset>
          <button type="button" className={buttonClass.secondary} onClick={() => commit(selected === 'default' ? parseWidgetStyle(DEFAULT_WIDGET_STYLE) : list.defaultStyle)}>Reset to default</button>
          <p role="status" className="text-sm">{status}</p>
        </div>
      </div>
      <p className="text-sm text-stone-600 dark:text-stone-400">Android widgets can't blur what's behind them.</p>
    </>}
  </div>;
}
