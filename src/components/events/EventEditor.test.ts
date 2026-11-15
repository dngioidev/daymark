// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EventItem } from '../../types/daymark';
import { EventEditor } from './EventEditor';

afterEach(() => { vi.unstubAllGlobals(); document.body.replaceChildren(); });

async function mount(props: Partial<React.ComponentProps<typeof EventEditor>> = {}) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  const save = vi.fn(), close = vi.fn(), conflict = vi.fn();
  await act(async () => root.render(React.createElement(EventEditor, {
    date: '2026-11-15', headings: ['Work', 'Personal'], deviceZone: 'Asia/Saigon',
    onSave: save, onClose: close, onConflict: conflict, ...props,
  })));
  return { host: document.body, root, save, close, conflict, unmount: () => act(async () => root.unmount()) };
}

function fill(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

function choose(select: HTMLSelectElement, value: string) {
  act(() => { select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })); });
}

function click(host: HTMLElement, name: string) {
  const button = [...host.querySelectorAll<HTMLButtonElement>('button')].find(candidate => candidate.textContent?.trim() === name || candidate.getAttribute('aria-label') === name);
  if (!button) throw new Error(`Missing button: ${name}`);
  act(() => button.click());
}

function submit(host: HTMLElement) {
  const form = host.querySelector('form');
  if (!form) throw new Error('Missing event form');
  act(() => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
}

function startTime(host: HTMLElement, time: string, zone = 'America/Los_Angeles') {
  const toggle = host.querySelector<HTMLInputElement>('[aria-label="Add start time"]');
  if (toggle && !toggle.checked) act(() => toggle.click());
  const timeInput = host.querySelector<HTMLInputElement>('[aria-label="Start time"]');
  const zoneInput = host.querySelector<HTMLInputElement>('[aria-label="Time zone"]');
  if (!timeInput || !zoneInput) throw new Error('Missing timed-event inputs');
  fill(timeInput, time);
  fill(zoneInput, zone);
}

describe('EventEditor', () => {
  it('saves a date-only event with the selected date and section', async () => {
    const ui = await mount();
    try {
      fill(ui.host.querySelector<HTMLInputElement>('[aria-label="Event title"]')!, 'Team lunch');
      fill(ui.host.querySelector<HTMLInputElement>('[aria-label="Event date"]')!, '2026-11-20');
      choose(ui.host.querySelector<HTMLSelectElement>('[aria-label="Section"]')!, 'Personal');
      submit(ui.host);
      expect(ui.save).toHaveBeenCalledOnce();
      expect(ui.save.mock.calls[0][0]).toMatchObject({ title: 'Team lunch', date: '2026-11-20', heading: 'Personal' });
      expect(ui.save.mock.calls[0][0].timing).toBeUndefined();
      expect(ui.save.mock.calls[0][0].durationMinutes).toBeUndefined();
    } finally { await ui.unmount(); }
  });

  it('accepts duration without a start time and accepts a start without duration', async () => {
    const durationUi = await mount();
    try {
      fill(durationUi.host.querySelector<HTMLInputElement>('[aria-label="Event title"]')!, 'Pack');
      fill(durationUi.host.querySelector<HTMLInputElement>('[aria-label="Duration minutes"]')!, '45');
      submit(durationUi.host);
      expect(durationUi.save.mock.calls[0][0]).toMatchObject({ durationMinutes: 45 });
      expect(durationUi.save.mock.calls[0][0].timing).toBeUndefined();
    } finally { await durationUi.unmount(); }

    const timedUi = await mount();
    try {
      fill(timedUi.host.querySelector<HTMLInputElement>('[aria-label="Event title"]')!, 'Call');
      startTime(timedUi.host, '09:30');
      submit(timedUi.host);
      expect(timedUi.save.mock.calls[0][0].timing).toMatchObject({ localTime: '09:30', timeZone: 'America/Los_Angeles' });
      expect(timedUi.save.mock.calls[0][0].durationMinutes).toBeUndefined();
    } finally { await timedUi.unmount(); }
  });

  it('turns equivalent duration and end-time entry into the same elapsed span', async () => {
    const durationUi = await mount();
    try {
      fill(durationUi.host.querySelector<HTMLInputElement>('[aria-label="Event title"]')!, 'Review');
      startTime(durationUi.host, '09:00');
      fill(durationUi.host.querySelector<HTMLInputElement>('[aria-label="Duration hours"]')!, '1');
      fill(durationUi.host.querySelector<HTMLInputElement>('[aria-label="Duration minutes"]')!, '30');
      submit(durationUi.host);
      expect(durationUi.save.mock.calls[0][0].durationMinutes).toBe(90);
    } finally { await durationUi.unmount(); }

    const endUi = await mount();
    try {
      fill(endUi.host.querySelector<HTMLInputElement>('[aria-label="Event title"]')!, 'Review');
      startTime(endUi.host, '09:00');
      choose(endUi.host.querySelector<HTMLSelectElement>('[aria-label="Span entry"]')!, 'end');
      fill(endUi.host.querySelector<HTMLInputElement>('[aria-label="End time"]')!, '10:30');
      submit(endUi.host);
      expect(endUi.save.mock.calls[0][0].durationMinutes).toBe(90);
    } finally { await endUi.unmount(); }
  });

  it('requires an explicit next-day choice for an end time earlier than the start', async () => {
    const ui = await mount();
    try {
      fill(ui.host.querySelector<HTMLInputElement>('[aria-label="Event title"]')!, 'Overnight work');
      startTime(ui.host, '23:00');
      choose(ui.host.querySelector<HTMLSelectElement>('[aria-label="Span entry"]')!, 'end');
      fill(ui.host.querySelector<HTMLInputElement>('[aria-label="End time"]')!, '01:00');
      submit(ui.host);
      expect(ui.save).not.toHaveBeenCalled();
      expect(ui.host.textContent).toContain('Use next day');
      click(ui.host, 'Use next day');
      submit(ui.host);
      expect(ui.save.mock.calls[0][0].durationMinutes).toBe(120);
    } finally { await ui.unmount(); }
  });

  it('requires choosing which occurrence of a repeated local time to use', async () => {
    const ui = await mount();
    try {
      fill(ui.host.querySelector<HTMLInputElement>('[aria-label="Event title"]')!, 'DST overlap');
      fill(ui.host.querySelector<HTMLInputElement>('[aria-label="Event date"]')!, '2026-11-01');
      startTime(ui.host, '01:30');
      const occurrence = ui.host.querySelector<HTMLSelectElement>('[aria-label="Repeated time occurrence"]');
      expect(occurrence).not.toBeNull();
      submit(ui.host);
      expect(ui.save).not.toHaveBeenCalled();
      choose(occurrence!, '2026-11-01T09:30:00.000Z');
      submit(ui.host);
      expect(ui.save.mock.calls[0][0].timing?.startInstant).toBe('2026-11-01T09:30:00.000Z');
    } finally { await ui.unmount(); }
  });

  it('shows the local-zone preview and rejects nonexistent wall times', async () => {
    const ui = await mount();
    try {
      fill(ui.host.querySelector<HTMLInputElement>('[aria-label="Event title"]')!, 'DST gap');
      fill(ui.host.querySelector<HTMLInputElement>('[aria-label="Event date"]')!, '2026-03-08');
      startTime(ui.host, '02:30');
      submit(ui.host);
      expect(ui.save).not.toHaveBeenCalled();
      expect(ui.host.textContent).toContain('does not exist in this time zone');
      startTime(ui.host, '09:00');
      expect(ui.host.textContent).toContain('Your local time:');
      expect(ui.host.textContent).toContain('Asia/Saigon');
    } finally { await ui.unmount(); }
  });

  it('does not save a blank title and edits checklist text and completion', async () => {
    const ui = await mount();
    try {
      submit(ui.host);
      expect(ui.save).not.toHaveBeenCalled();
      fill(ui.host.querySelector<HTMLInputElement>('[aria-label="New checklist item"]')!, 'Bring handouts');
      click(ui.host, 'Add checklist item');
      const checkbox = ui.host.querySelector<HTMLInputElement>('[aria-label="Bring handouts"]');
      expect(checkbox).not.toBeNull();
      act(() => checkbox!.click());
      fill(ui.host.querySelector<HTMLInputElement>('[aria-label="Event title"]')!, 'Workshop');
      submit(ui.host);
      expect((ui.save.mock.calls[0][0] as EventItem).checklist).toContainEqual(expect.objectContaining({ text: 'Bring handouts', done: true }));
    } finally { await ui.unmount(); }
  });

  it('keeps the span when start time is cleared and keeps start time when span is cleared', async () => {
    const existing: EventItem = { id: 'event-1', title: 'Existing', date: '2026-11-15', heading: 'Work', order: 1,
      timing: { localTime: '09:00', timeZone: 'America/Los_Angeles', startInstant: '2026-11-15T17:00:00.000Z' },
      durationMinutes: 60, createdAt: '2026-11-01T10:00:00Z', updatedAt: '2026-11-01T10:00:00Z' };
    const ui = await mount({ event: existing });
    try {
      act(() => ui.host.querySelector<HTMLInputElement>('[aria-label="Add start time"]')!.click());
      submit(ui.host);
      expect(ui.save.mock.calls[0][0].timing).toBeUndefined();
      expect(ui.save.mock.calls[0][0].durationMinutes).toBe(60);
      expect(ui.save.mock.calls[0][0]).toMatchObject({ id: existing.id, createdAt: existing.createdAt });
    } finally { await ui.unmount(); }
  });

  it('allows clearing the end-time span while keeping its start time', async () => {
    const existing: EventItem = { id: 'event-2', title: 'Existing span', date: '2026-11-15', heading: 'Work', order: 1,
      timing: { localTime: '09:00', timeZone: 'America/Los_Angeles', startInstant: '2026-11-15T17:00:00.000Z' },
      durationMinutes: 60, createdAt: '2026-11-01T10:00:00Z', updatedAt: '2026-11-01T10:00:00Z' };
    const ui = await mount({ event: existing });
    try {
      fill(ui.host.querySelector<HTMLInputElement>('[aria-label="End time"]')!, '');
      submit(ui.host);
      expect(ui.save.mock.calls[0][0].timing).toEqual(existing.timing);
      expect(ui.save.mock.calls[0][0].durationMinutes).toBeUndefined();
    } finally { await ui.unmount(); }
  });

  it('does not restore an old duration after clearing an end time and switching modes', async () => {
    const existing: EventItem = { id: 'event-old-span', title: 'Planning', date: '2026-11-15', heading: 'Work', order: 1,
      timing: { localTime: '09:00', timeZone: 'America/Los_Angeles', startInstant: '2026-11-15T17:00:00.000Z' }, durationMinutes: 60,
      createdAt: '2026-11-01T10:00:00Z', updatedAt: '2026-11-01T10:00:00Z' };
    const ui = await mount({ event: existing });
    try {
      fill(ui.host.querySelector<HTMLInputElement>('[aria-label="End time"]')!, '');
      choose(ui.host.querySelector<HTMLSelectElement>('[aria-label="Span entry"]')!, 'duration');
      submit(ui.host);
      expect(ui.save.mock.calls[0][0].durationMinutes).toBeUndefined();
    } finally { await ui.unmount(); }
  });

  it('preserves whitespace-sensitive Markdown notes when changing the schedule', async () => {
    const notes = '## Agenda\n\n- First point\n  continuation\n';
    const existing: EventItem = { id: 'event-notes', title: 'Review', date: '2026-11-15', heading: 'Work', order: 1,
      description: notes, createdAt: '2026-11-01T10:00:00Z', updatedAt: '2026-11-01T10:00:00Z' };
    const ui = await mount({ event: existing });
    try {
      act(() => ui.host.querySelector<HTMLInputElement>('[aria-label="Add start time"]')!.click());
      fill(ui.host.querySelector<HTMLInputElement>('[aria-label="Start time"]')!, '09:00');
      submit(ui.host);
      expect(ui.save.mock.calls[0][0].description).toBe(notes);
    } finally { await ui.unmount(); }
  });

  it('uses selected fold instants when an earlier clock time is still later on the same day', async () => {
    const ui = await mount();
    try {
      fill(ui.host.querySelector<HTMLInputElement>('[aria-label="Event title"]')!, 'DST fold span');
      fill(ui.host.querySelector<HTMLInputElement>('[aria-label="Event date"]')!, '2026-11-01');
      startTime(ui.host, '01:45', 'America/New_York');
      choose(ui.host.querySelector<HTMLSelectElement>('[aria-label="Repeated time occurrence"]')!, '2026-11-01T05:45:00.000Z');
      choose(ui.host.querySelector<HTMLSelectElement>('[aria-label="Span entry"]')!, 'end');
      fill(ui.host.querySelector<HTMLInputElement>('[aria-label="End time"]')!, '01:15');
      expect(ui.host.querySelector('[aria-label="End time occurrence"]')).not.toBeNull();
      choose(ui.host.querySelector<HTMLSelectElement>('[aria-label="End time occurrence"]')!, '2026-11-01T06:15:00.000Z');
      submit(ui.host);
      expect(ui.save.mock.calls[0][0].durationMinutes).toBe(30);
    } finally { await ui.unmount(); }
  });

  it('keeps a dirty draft when the remote event changes and reports a merge conflict on save', async () => {
    const existing: EventItem = { id: 'event-1', title: 'Original', date: '2026-11-15', heading: 'Work', order: 1,
      description: 'Base notes', createdAt: '2026-11-01T10:00:00Z', updatedAt: '2026-11-01T10:00:00Z' };
    const latest = { ...existing, description: 'Remote notes', updatedAt: '2026-11-02T10:00:00Z' };
    const ui = await mount({ event: existing, latestEvent: existing });
    try {
      fill(ui.host.querySelector<HTMLInputElement>('[aria-label="Event title"]')!, 'My title');
      await act(async () => ui.root.render(React.createElement(EventEditor, { event: existing, latestEvent: latest,
        date: '2026-11-15', headings: ['Work', 'Personal'], deviceZone: 'Asia/Saigon', onSave: ui.save, onClose: ui.close, onConflict: ui.conflict })));
      expect(ui.host.querySelector<HTMLInputElement>('[aria-label="Event title"]')!.value).toBe('My title');
      expect(ui.host.textContent).toContain('changed on another device');
      fill(ui.host.querySelector<HTMLTextAreaElement>('[aria-label="Notes"]')!, 'Local notes');
      submit(ui.host);
      expect(ui.save.mock.calls[0][0].title).toBe('My title');
      expect(ui.save.mock.calls[0][0].description).toContain('Remote notes');
      expect(ui.save.mock.calls[0][0].description).toContain('Local notes');
      expect(ui.conflict).toHaveBeenCalled();
    } finally { await ui.unmount(); }
  });
});
