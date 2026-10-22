import React, { useId } from 'react';
import { buttonClass } from '../ui/Dialog';

interface ColorFieldProps {
  label: string;
  value: string;
  automaticColor: string;
  onChange: (color: string) => void;
  warning?: number;
}

export function ColorField({ label, value, automaticColor, onChange, warning }: ColorFieldProps) {
  const id = useId();
  return <fieldset className="space-y-2">
    <legend className="font-semibold">{label}</legend>
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" aria-pressed={value === 'auto'} className={`${buttonClass.secondary} aria-pressed:bg-stone-900 aria-pressed:text-white dark:aria-pressed:bg-stone-100 dark:aria-pressed:text-stone-900`} onClick={() => onChange('auto')}>Automatic</button>
      <button type="button" aria-pressed={value !== 'auto'} className={`${buttonClass.secondary} aria-pressed:bg-stone-900 aria-pressed:text-white dark:aria-pressed:bg-stone-100 dark:aria-pressed:text-stone-900`} onClick={() => onChange(value === 'auto' ? automaticColor : value)}>Custom</button>
      <label htmlFor={id} className="sr-only">{label} custom colour</label>
      <input id={id} type="color" value={value === 'auto' ? automaticColor : value} onChange={(e) => onChange(e.target.value)} className="w-11 h-11 cursor-pointer" />
    </div>
    {warning !== undefined && <p className="text-sm text-stone-600 dark:text-stone-400">Hard to read: contrast {warning.toFixed(1)}:1 (needs 4.5:1)</p>}
  </fieldset>;
}
