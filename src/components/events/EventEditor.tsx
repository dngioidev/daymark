import React, { useEffect, useRef, useState } from 'react';
import type { EventItem } from '../../types/daymark';
import { mergeEvent } from '../../sync/eventMerge';
import { sameValue } from '../../sync/merge';
import { Dialog, buttonClass } from '../ui/Dialog';
import { EventFields } from './EventFields';
import { createEventDraft, eventFromDraft, EventDraft, validateEventDraft } from '../../utils/eventDraft';

export interface EventEditorProps {
  event?: EventItem | null;
  /** Latest sync value; changes do not replace a dirty draft. */
  latestEvent?: EventItem | null;
  date: string;
  headings: string[];
  deviceZone?: string;
  onSave: (event: EventItem, base: EventItem | null) => void;
  onClose: () => void;
  onConflict?: (messages: string[]) => void;
}

export const EventEditor: React.FC<EventEditorProps> = ({ event = null, latestEvent, date, headings, deviceZone, onSave, onClose, onConflict }) => {
  const initialEvent = useRef<EventItem | null>(event);
  const [draft, setDraft] = useState<EventDraft>(() => createEventDraft(event, date, headings));
  const [dirty, setDirty] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const actualLatest = latestEvent === undefined ? event : latestEvent;
  const remoteChanged = !!initialEvent.current && !sameValue(initialEvent.current, actualLatest);

  useEffect(() => {
    if (dirty || !actualLatest) return;
    initialEvent.current = actualLatest;
    setDraft(createEventDraft(actualLatest, date, headings));
  }, [actualLatest, dirty, date, headings]);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    setAttempted(true);
    const built = eventFromDraft(draft, initialEvent.current);
    if (!built.event) return;
    const latest = latestEvent === undefined ? initialEvent.current : latestEvent;
    const merged = mergeEvent(initialEvent.current, latest, built.event);
    if (merged.conflicts.length) onConflict?.(merged.conflicts);
    if (!merged.value) {
      onConflict?.(['This event was deleted on another device. Your changes were kept open for review.']);
      return;
    }
    onSave(merged.value, latest);
  };

  const validation = validateEventDraft(draft);
  const remoteMessage = remoteChanged
    ? actualLatest ? 'This event changed on another device. Your draft is preserved and will merge when saved.'
      : 'This event was deleted on another device. Your draft is preserved.'
    : undefined;

  return (
    <Dialog
      isOpen
      onClose={onClose}
      variant="sheet"
      size="lg"
      title={event ? 'Edit event' : 'New event'}
      headerStatus={remoteMessage ? <span role="status" className="text-xs text-amber-800 dark:text-amber-300">Changed elsewhere</span> : undefined}
      footer={<>
        <button type="button" className={buttonClass.ghost} onClick={onClose}>Cancel</button>
        <button type="submit" form="event-editor-form" className={buttonClass.primary} disabled={!!validation}>
          {event ? 'Save changes' : 'Save event'}
        </button>
      </>}
    >
      <form id="event-editor-form" onSubmit={save}>
        {remoteMessage && <p role="status" className="mx-5 mt-4 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-sm text-amber-950 dark:text-amber-100">{remoteMessage}</p>}
        <EventFields draft={draft} headings={headings} deviceZone={deviceZone} existingEvent={event}
          showValidation={attempted || dirty} onChange={next => { setDraft(next); setDirty(true); }} />
      </form>
    </Dialog>
  );
};
