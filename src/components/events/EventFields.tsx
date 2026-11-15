import React, { useMemo, useState } from 'react';
import { CalendarDays, Plus, Trash2 } from 'lucide-react';
import type { ChecklistItem, EventItem } from '../../types/daymark';
import { formatEventSchedule, resolveEventTime } from '../../utils/eventTime';
import { getNextDate } from '../../utils/lifecycleEngine';
import { changeSpanMode, eventFromDraft, EventDraft, shouldOfferNextDay, validateEventDraft } from '../../utils/eventDraft';

interface EventFieldsProps {
  draft: EventDraft;
  onChange: (draft: EventDraft) => void;
  headings: string[];
  deviceZone?: string;
  showValidation?: boolean;
  existingEvent?: EventItem | null;
}

const fieldClass = 'w-full min-h-11 px-3 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-hidden focus:ring-2 focus:ring-amber-500';
const labelClass = 'block text-sm font-semibold text-stone-800 dark:text-stone-200 mb-1.5';

function occurrenceLabel(instant: string, zone: string, index: number): string {
  const ordinal = index === 0 ? 'First occurrence' : 'Second occurrence';
  try {
    const name = new Intl.DateTimeFormat('en', { timeZone: zone, timeZoneName: 'longOffset' }).formatToParts(new Date(instant)).find(part => part.type === 'timeZoneName')?.value;
    const offset = name?.replace(/^GMT/, 'UTC');
    return offset ? `${ordinal} · ${offset}` : ordinal;
  } catch { return ordinal; }
}

export const EventFields: React.FC<EventFieldsProps> = ({ draft, onChange, headings, deviceZone, showValidation = false, existingEvent }) => {
  const [newChecklistItem, setNewChecklistItem] = useState('');
  const patch = (change: Partial<EventDraft>) => onChange({ ...draft, ...change });
  const start = draft.hasStartTime ? resolveEventTime(draft.date, draft.localTime, draft.timeZone) : null;
  const end = draft.hasStartTime && draft.spanMode === 'end' && draft.endDate && draft.endTime
    ? resolveEventTime(draft.endDate, draft.endTime, draft.timeZone) : null;
  const startInstants = start?.kind === 'valid' ? start.instants : [];
  const endInstants = end?.kind === 'valid' ? end.instants : [];
  const startNeedsFold = startInstants.length > 1;
  const endNeedsFold = endInstants.length > 1;
  const invalidWallTime = start?.kind === 'invalid' ? start.message : end?.kind === 'invalid' ? end.message : undefined;
  const preview = useMemo(() => {
    if (!draft.hasStartTime || start?.kind !== 'valid') return undefined;
    const selected = start.instants.includes(draft.startOccurrence) ? draft.startOccurrence : start.instants.length === 1 ? start.instants[0] : undefined;
    if (!selected) return undefined;
    const result = eventFromDraft({ ...draft, startOccurrence: selected }, existingEvent);
    return result.event ? formatEventSchedule(result.event, deviceZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone) : undefined;
  }, [draft, start, existingEvent, deviceZone]);
  const validation = validateEventDraft(draft);
  const endIsEarlierSameDay = shouldOfferNextDay(draft);
  const currentHeadings = [...new Set([...(headings.length ? headings : ['Work']), draft.heading].filter(Boolean))];

  const addChecklist = () => {
    const text = newChecklistItem.trim();
    if (!text) return;
    const item: ChecklistItem = { id: `event-check-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, text, done: false };
    patch({ checklist: [...draft.checklist, item] });
    setNewChecklistItem('');
  };

  return (
    <div className="px-5 py-4 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_12rem] gap-3">
        <div>
          <label htmlFor="event-title" className={labelClass}>Title</label>
          <input id="event-title" aria-label="Event title" autoComplete="off" value={draft.title} onChange={e => patch({ title: e.target.value })} className={`${fieldClass} font-medium`} />
        </div>
        <div>
          <label htmlFor="event-date" className={labelClass}>Date</label>
          <input id="event-date" aria-label="Event date" type="date" value={draft.date} onChange={e => patch({ date: e.target.value, endDate: draft.spanMode === 'end' || draft.endDate === draft.date ? e.target.value : draft.endDate, startOccurrence: '', endOccurrence: '' })} className={fieldClass} />
        </div>
      </div>

      <div>
        <label htmlFor="event-section" className={labelClass}>Section</label>
        <select id="event-section" aria-label="Section" value={draft.heading} onChange={e => patch({ heading: e.target.value })} className={fieldClass}>
          {currentHeadings.map(heading => <option key={heading} value={heading}>{heading}</option>)}
        </select>
      </div>

      <section aria-label="Schedule" className="rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-50/70 dark:bg-stone-900/60 p-3.5 space-y-3">
        <div className="flex items-center gap-3">
          <CalendarDays className="w-4 h-4 text-amber-700 dark:text-amber-400" aria-hidden="true" />
          <span className="text-sm font-semibold text-stone-800 dark:text-stone-200">Schedule</span>
          <label className="ml-auto inline-flex items-center gap-2 min-h-11 text-sm text-stone-700 dark:text-stone-300">
            <input aria-label="Add start time" type="checkbox" checked={draft.hasStartTime} onChange={e => onChange(e.target.checked
              ? { ...draft, hasStartTime: true, startOccurrence: '', endOccurrence: '' }
              : { ...changeSpanMode(draft, 'duration'), hasStartTime: false, startOccurrence: '', endOccurrence: '' })} className="w-4 h-4 accent-amber-700" />
            Start time
          </label>
        </div>

        {draft.hasStartTime && <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="event-start-time" className={labelClass}>Start time</label>
            <input id="event-start-time" aria-label="Start time" type="time" value={draft.localTime} onChange={e => patch({ localTime: e.target.value, startOccurrence: '' })} className={fieldClass} />
          </div>
          <div>
            <label htmlFor="event-time-zone" className={labelClass}>Time zone</label>
            <input id="event-time-zone" aria-label="Time zone" list="event-time-zones" value={draft.timeZone} onChange={e => patch({ timeZone: e.target.value, startOccurrence: '', endOccurrence: '' })} className={fieldClass} />
            <datalist id="event-time-zones"><option value={Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'} /></datalist>
          </div>
        </div>}

        {startNeedsFold && <div>
          <label htmlFor="event-start-occurrence" className={labelClass}>This time occurs twice</label>
          <select id="event-start-occurrence" aria-label="Repeated time occurrence" value={draft.startOccurrence} onChange={e => patch({ startOccurrence: e.target.value })} className={fieldClass}>
            <option value="">Choose an occurrence</option>
            {startInstants.map((instant, index) => <option key={instant} value={instant}>{occurrenceLabel(instant, draft.timeZone, index)}</option>)}
          </select>
        </div>}

        {draft.hasStartTime && <div>
          <label htmlFor="event-span-mode" className={labelClass}>Enter the span as</label>
          <select id="event-span-mode" aria-label="Span entry" value={draft.spanMode} onChange={e => onChange(changeSpanMode(draft, e.target.value as EventDraft['spanMode']))} className={fieldClass}>
            <option value="duration">Duration</option>
            <option value="end">End time</option>
          </select>
        </div>}

        {(!draft.hasStartTime || draft.spanMode === 'duration') ? <div>
          <label className={labelClass}>Duration</label>
          <div className="grid grid-cols-2 gap-3">
            <div><label htmlFor="event-duration-hours" className="sr-only">Duration hours</label><input id="event-duration-hours" aria-label="Duration hours" inputMode="numeric" placeholder="Hours" value={draft.durationHours} onChange={e => patch({ durationHours: e.target.value })} className={fieldClass} /></div>
            <div><label htmlFor="event-duration-minutes" className="sr-only">Duration minutes</label><input id="event-duration-minutes" aria-label="Duration minutes" inputMode="numeric" placeholder="Minutes" value={draft.durationMinutes} onChange={e => patch({ durationMinutes: e.target.value })} className={fieldClass} /></div>
          </div>
          <p className="mt-1 text-xs text-stone-600 dark:text-stone-400">Optional elapsed time. Leave both blank if unknown.</p>
        </div> : <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label htmlFor="event-end-date" className={labelClass}>End date</label><input id="event-end-date" aria-label="End date" type="date" value={draft.endDate} onChange={e => patch({ endDate: e.target.value, endOccurrence: '' })} className={fieldClass} /></div>
          <div><label htmlFor="event-end-time" className={labelClass}>End time</label><input id="event-end-time" aria-label="End time" type="time" value={draft.endTime} onChange={e => patch({ endTime: e.target.value, endOccurrence: '' })} className={fieldClass} /></div>
          {endNeedsFold && <div className="sm:col-span-2"><label htmlFor="event-end-occurrence" className={labelClass}>This end time occurs twice</label><select id="event-end-occurrence" aria-label="End time occurrence" value={draft.endOccurrence} onChange={e => patch({ endOccurrence: e.target.value })} className={fieldClass}><option value="">Choose an occurrence</option>{endInstants.map((instant, index) => <option key={instant} value={instant}>{occurrenceLabel(instant, draft.timeZone, index)}</option>)}</select></div>}
          <p className="sm:col-span-2 text-xs text-stone-600 dark:text-stone-400">The end uses elapsed time between the selected instants.</p>
        </div>}

        {endIsEarlierSameDay && <div className="rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm text-amber-950 dark:text-amber-100">
          <p>End time is earlier than start time. Choose the next day explicitly.</p>
          <button type="button" className="mt-2 min-h-11 sm:min-h-9 px-3 rounded-lg border border-amber-400 dark:border-amber-700 font-semibold hover:bg-amber-100 dark:hover:bg-amber-900/40" onClick={() => patch({ endDate: getNextDate(draft.date), endOccurrence: '' })}>Use next day</button>
        </div>}
        {(invalidWallTime || (showValidation && validation)) && <p role="alert" className="text-sm text-rose-700 dark:text-rose-400">{invalidWallTime ?? validation}</p>}
        {preview && <div className="border-t border-stone-200 dark:border-stone-700 pt-2 text-sm" aria-live="polite"><p className="font-medium text-stone-800 dark:text-stone-200">{preview.primary}</p>{preview.secondary && <p className="mt-0.5 text-xs text-stone-600 dark:text-stone-400">{preview.secondary}</p>}</div>}
      </section>

      <div>
        <label htmlFor="event-notes" className={labelClass}>Notes <span className="font-normal text-stone-500">(optional)</span></label>
        <textarea id="event-notes" aria-label="Notes" rows={3} value={draft.description} onChange={e => patch({ description: e.target.value })} placeholder="Details, links, or context" className={`${fieldClass} py-2 leading-relaxed`} />
      </div>

      <section aria-label="Checklist" className="space-y-2">
        <h3 className={labelClass}>Checklist <span className="font-normal text-stone-500">(optional)</span></h3>
        {draft.checklist.map(item => <div key={item.id} className="flex items-center gap-2">
          <input type="checkbox" aria-label={item.text} checked={item.done} onChange={e => patch({ checklist: draft.checklist.map(current => current.id === item.id ? { ...current, done: e.target.checked } : current) })} className="w-4 h-4 shrink-0 accent-amber-700" />
          <input aria-label={`Checklist item: ${item.text}`} value={item.text} onChange={e => patch({ checklist: draft.checklist.map(current => current.id === item.id ? { ...current, text: e.target.value } : current) })} className={`${fieldClass} min-h-10`} />
          <button type="button" aria-label={`Remove ${item.text}`} onClick={() => patch({ checklist: draft.checklist.filter(current => current.id !== item.id) })} className="inline-flex items-center justify-center w-11 h-11 text-stone-600 hover:text-rose-700 dark:text-stone-400 dark:hover:text-rose-400"><Trash2 className="w-4 h-4" /></button>
        </div>)}
        <div className="flex items-center gap-2">
          <label htmlFor="event-checklist-add" className="sr-only">New checklist item</label>
          <input id="event-checklist-add" aria-label="New checklist item" value={newChecklistItem} onChange={e => setNewChecklistItem(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addChecklist(); } }} placeholder="Add a checklist item" className={`${fieldClass} min-h-11`} />
          <button type="button" aria-label="Add checklist item" onClick={addChecklist} disabled={!newChecklistItem.trim()} className="inline-flex items-center justify-center w-11 h-11 shrink-0 rounded-lg text-stone-700 hover:bg-stone-100 disabled:opacity-50 dark:text-stone-300 dark:hover:bg-stone-800"><Plus className="w-4 h-4" /></button>
        </div>
      </section>
    </div>
  );
};
