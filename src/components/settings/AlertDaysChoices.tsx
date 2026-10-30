import React from 'react';
import type { AlertDaysSettings, CountingDays } from '../../types/daymark';

const options: { value: CountingDays; label: string }[] = [
  { value: 'weekdays', label: 'Weekdays (Mon to Fri)' },
  { value: 'weekend', label: 'Weekends (Sat and Sun)' },
  { value: 'all', label: 'All week' },
];

export function AlertDaysChoices({ value, onChange }: {
  value: AlertDaysSettings;
  /** Reports only the key the user changed, never the untouched one. */
  onChange: (key: keyof AlertDaysSettings, next: CountingDays) => void;
}) {
  return <>
    {([['tasks', 'Task aging counts'], ['habits', 'Habit warnings count']] as const).map(([key, label]) => (
      <fieldset key={key} className="p-4 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900">
        <legend className="px-1 font-semibold">{label}</legend>
        {options.map(option => (
          <label key={option.value} className="flex items-center gap-3 min-h-11 cursor-pointer text-stone-700 dark:text-stone-300">
            <input type="radio" name={`alert-days-${key}`} value={option.value}
              checked={value[key] === option.value}
              onChange={() => onChange(key, option.value)}
              className="w-5 h-5 accent-stone-700 dark:accent-stone-300" />
            {option.label}
          </label>
        ))}
      </fieldset>
    ))}
  </>;
}
