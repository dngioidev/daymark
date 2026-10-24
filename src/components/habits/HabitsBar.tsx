import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { HabitData } from '../../types/daymark';
import { daySummary, habitsForDay, setTick } from '../../utils/habits';
import { formatDay } from '../../utils/dateFormat';
import { loadHabitsOpen, saveHabitsOpen } from '../../utils/habitsOpen';
import { buttonClass } from '../ui/Dialog';
import { showToast } from '../ui/feedback';
import { HabitChecklist } from './HabitChecklist';
import { HabitEditor } from './HabitEditor';

interface HabitsBarProps {
  data: HabitData;
  date: string;
  today: string;
  onChange: (next: HabitData) => void;
  compact?: boolean;
  openSignal?: number;
}

export function barLabel(summary: ReturnType<typeof daySummary>, date: string, today: string): string {
  if (!summary.total) return 'Habits · Add a daily habit';
  const progress = `${summary.done} of ${summary.total}`;
  return date === today ? progress : `Habits · ${formatDay(date, today)} · ${progress}`;
}

export const HabitsBar: React.FC<HabitsBarProps> = ({ data, date, today, onChange, compact = false, openSignal = 0 }) => {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const interacted = useRef(false);
  const lastSignal = useRef(0);
  const panelId = useId();
  const summary = daySummary(data, date, today);
  const changeOpen = useCallback((next: boolean) => {
    interacted.current = true;
    setOpen(next);
    void saveHabitsOpen(next).catch(() => showToast('Could not save the habits bar preference.', { tone: 'error' }));
  }, []);

  useEffect(() => {
    let mounted = true;
    void loadHabitsOpen().then((saved) => { if (mounted && !interacted.current) setOpen(saved); });
    return () => { mounted = false; };
  }, []);
  useEffect(() => {
    if (openSignal !== lastSignal.current) {
      lastSignal.current = openSignal;
      changeOpen(true);
      if (!summary.total) setEditing(true);
    }
  }, [openSignal, changeOpen, summary.total]);

  const label = barLabel(summary, date, today);
  const warnings = summary.warnings;
  const warningLabel = warnings.length === 1 ? `⚠ 1 missed ${warnings[0].days} days` : `⚠ ${warnings.length}`;
  return (
    <section aria-label="Daily habits" className="dm-card rounded-xl border border-stone-200 bg-white text-stone-900 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-100">
      <button type="button" aria-expanded={open} aria-controls={panelId}
        className={`flex min-h-11 w-full items-center gap-3 rounded-xl text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${compact ? 'px-3 py-2' : 'px-4 py-2'}`}
        onClick={() => {
          changeOpen(!open);
          if (!open && !summary.total) setEditing(true);
        }}>
        {summary.total > 0 && <svg aria-hidden="true" viewBox="0 0 36 36" className="h-7 w-7 shrink-0 -rotate-90">
          <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="3" className="text-stone-200 dark:text-stone-700" />
          <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="3" pathLength="100"
            strokeDasharray={`${100 * summary.done / summary.total} 100`} className="text-accent" />
        </svg>}
        <span className={`min-w-0 flex-1 ${summary.total ? '' : 'text-stone-600 dark:text-stone-400'}`}>
          {summary.total > 0 && date === today && <span className="mr-2 font-semibold">Habits</span>}
          {label}
        </span>
        {warnings.length > 0 && <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">{warningLabel}</span>}
        <ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>
      <div id={panelId} hidden={!open}>
        {open && <div className={`border-t border-stone-200 pb-2 dark:border-stone-800 ${compact ? 'px-3' : 'px-4'}`}>
          <HabitChecklist items={habitsForDay(data, date, today)} onToggle={(id, done) => onChange(setTick(data, id, date, done, today, new Date().toISOString()))} />
          <button type="button" className={buttonClass.ghost} onClick={() => setEditing(true)}>Edit</button>
        </div>}
      </div>
      <HabitEditor isOpen={editing} onClose={() => setEditing(false)} data={data} today={today} onChange={onChange} startAdding={!summary.total} />
    </section>
  );
};
