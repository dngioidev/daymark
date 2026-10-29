import React, { useEffect, useRef } from 'react';

export interface ViewSwitchProps {
  value: 'list' | 'graph';
  onChange(value: 'list' | 'graph', keyboard?: boolean): void;
  focusOnMount?: React.RefObject<boolean>;
}

/** One tab stop; arrow keys select and focus the adjacent presentation. */
export function ViewSwitch({ value, onChange, focusOnMount }: ViewSwitchProps) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => {
    if (focusOnMount?.current) { buttons.current[value === 'list' ? 0 : 1]?.focus(); focusOnMount.current = false; }
  }, []);
  return <div role="radiogroup" aria-label="Notes presentation" className="hidden md:inline-flex shrink-0 rounded border border-stone-300 dark:border-stone-700 text-stone-900 dark:text-stone-100">
    {(['list', 'graph'] as const).map((mode, index) => <button key={mode} ref={el => { buttons.current[index] = el; }}
      type="button" role="radio" data-autofocus={focusOnMount?.current && value === mode ? '' : undefined} aria-checked={value === mode} tabIndex={value === mode ? 0 : -1}
      className="min-h-9 px-1 rounded text-xs aria-checked:bg-stone-200 dark:aria-checked:bg-stone-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-stone-500"
      onClick={() => onChange(mode)} onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
        event.preventDefault();
        const next = index === 0 ? 1 : 0;
        onChange(next === 0 ? 'list' : 'graph', true); buttons.current[next]?.focus();
      }}>{mode === 'list' ? 'List' : 'Graph'}</button>)}
  </div>;
}
