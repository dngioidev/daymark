import React, { useEffect, useRef, useState } from 'react';
import type { HabitData } from '../../types/daymark';
import { activeHabits, addHabit, moveHabit, removeHabit, renameHabit, setWarnAfter } from '../../utils/habits';
import { Dialog, buttonClass } from '../ui/Dialog';
import { confirmDialog, showToast } from '../ui/feedback';

interface HabitEditorProps {
  isOpen: boolean;
  onClose: () => void;
  data: HabitData;
  today: string;
  onChange: (next: HabitData) => void;
  startAdding?: boolean;
}

const inputClass = 'min-h-11 min-w-0 rounded-lg border border-stone-300 bg-white px-3 text-sm text-stone-900 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent';
const timestamp = () => new Date().toISOString();

export const HabitEditor: React.FC<HabitEditorProps> = ({ isOpen, onClose, data, today, onChange, startAdding = false }) => {
  const [name, setName] = useState('');
  const latest = useRef({ data, today, onChange });
  latest.current = { data, today, onChange };
  useEffect(() => { if (isOpen) setName(''); }, [isOpen]);
  const habits = activeHabits(data, today);

  const remove = async (id: string, habitName: string) => {
    if (!await confirmDialog({
      title: `Remove "${habitName}"?`,
      message: `Remove "${habitName}"? Its ticks on past days are kept.`,
      confirmLabel: 'Remove', danger: true,
    })) return;
    // Sync or another edit may have arrived while the confirmation was open.
    const current = latest.current;
    current.onChange(removeHabit(current.data, id, current.today, timestamp()));
  };

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="Daily habits" size="md"
      footer={<button type="button" className={buttonClass.secondary} onClick={onClose}>Done</button>}>
      <div className="space-y-4 p-5">
        <form className="flex items-end gap-2" onSubmit={(event) => {
          event.preventDefault();
          const next = addHabit(data, name, today, timestamp());
          if (next === data) { showToast('Use a habit name of 1–80 characters.', { tone: 'error' }); return; }
          onChange(next);
          setName('');
        }}>
          <label className="min-w-0 flex-1 space-y-1 text-sm font-medium">
            <span>Add a daily habit</span>
            <input className={`${inputClass} w-full`} value={name} onChange={(event) => setName(event.target.value)}
              maxLength={80} placeholder="Habit name" data-autofocus={startAdding || undefined} />
          </label>
          <button className={buttonClass.primary} type="submit" disabled={!name.trim()}>Add</button>
        </form>
        <ul className="space-y-3">
          {habits.map((habit, index) => (
            <li key={habit.id} className="space-y-2 rounded-xl border border-stone-200 p-3 dark:border-stone-800">
              <label className="block space-y-1 text-sm font-medium">
                <span className="sr-only">Name for {habit.name}</span>
                <input key={habit.name} className={`${inputClass} w-full`} defaultValue={habit.name} maxLength={80}
                  onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }}
                  onBlur={(event) => {
                    const value = event.currentTarget.value.trim();
                    if (!value || value.length > 80) {
                      event.currentTarget.value = habit.name;
                      showToast('Use a habit name of 1–80 characters.', { tone: 'error' });
                      return;
                    } else if (value !== habit.name) onChange(renameHabit(data, habit.id, value, timestamp()));
                    event.currentTarget.value = value || habit.name;
                  }} />
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className={`${buttonClass.secondary} min-w-11 px-2`} aria-label={`Move ${habit.name} up`}
                  disabled={index === 0} onClick={() => onChange(moveHabit(data, habit.id, -1, timestamp()))}>↑</button>
                <button type="button" className={`${buttonClass.secondary} min-w-11 px-2`} aria-label={`Move ${habit.name} down`}
                  disabled={index === habits.length - 1} onClick={() => onChange(moveHabit(data, habit.id, 1, timestamp()))}>↓</button>
                <label className="flex items-center gap-2 text-sm">
                  <span>Warn after</span>
                  <input key={habit.warnAfterDays} type="number" min={1} max={365} step={1}
                    aria-label={`Warn after days for ${habit.name}`} defaultValue={habit.warnAfterDays}
                    className={`${inputClass} w-20`}
                    onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }}
                    onBlur={(event) => {
                      const days = event.currentTarget.valueAsNumber;
                      if (!Number.isFinite(days)) { event.currentTarget.value = String(habit.warnAfterDays); return; }
                      const clamped = Math.max(1, Math.min(365, Math.round(days)));
                      if (clamped !== habit.warnAfterDays) onChange(setWarnAfter(data, habit.id, clamped, timestamp()));
                      event.currentTarget.value = String(clamped);
                    }} />
                  <span>days</span>
                </label>
                <button type="button" className={buttonClass.ghost} onClick={() => void remove(habit.id, habit.name)}>Remove</button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Dialog>
  );
};
