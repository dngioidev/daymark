import type { EventItem } from '../types/daymark';
import { validateEvent } from './events';
import { resolveEventTime } from './eventTime';

const NOTES_START = '<!-- daymark_event_notes:start -->';
const NOTES_END = '<!-- daymark_event_notes:end -->';
const CHECKLIST_START = '<!-- daymark_event_checklist:start -->';
const CHECKLIST_END = '<!-- daymark_event_checklist:end -->';
function escapeMarkers(text: string): string {
  return text.split('\n').map(line => {
    const match = /^(\\*)(<!-- daymark_event_(?:notes|checklist):(?:start|end) -->)$/.exec(line);
    return match ? `\\${line}` : line;
  }).join('\n');
}

function unescapeMarkers(text: string): string {
  return text.split('\n').map(line => {
    const match = /^\\+(<!-- daymark_event_(?:notes|checklist):(?:start|end) -->)$/.exec(line);
    return match ? line.slice(1) : line;
  }).join('\n');
}

function durationLabel(minutes: number): string {
  return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
}

function checklistLines(event: EventItem): string[] {
  return (event.checklist ?? []).flatMap(item => {
    const text = escapeMarkers(item.text);
    const lines = text.split('\n');
    return [`- [${item.done ? 'x' : ' '}] ${lines[0] ?? ''}`, ...lines.slice(1).map(line => `  ${line}`)];
  });
}

/** Human-readable record with versioned JSON frontmatter for stable typed fields and IDs. */
export function serializeEvent(event: EventItem): string {
  if (!validateEvent(event)) throw new Error('Cannot serialize an invalid event.');
  const metadata = JSON.stringify({ version: 1, event });
  const time = event.timing ? `${event.timing.localTime} (${event.timing.timeZone})` : 'No set time';
  const duration = event.durationMinutes === undefined ? 'No duration' : durationLabel(event.durationMinutes);
  const checklist = checklistLines(event);
  return [
    '---',
    `daymark_event: ${metadata}`,
    '---',
    `# ${event.title}`,
    '',
    `**Date:** ${event.date}`,
    `**Section:** ${event.heading}`,
    `**Order:** ${event.order}`,
    `**Time:** ${time}`,
    `**Duration:** ${duration}`,
    '',
    NOTES_START,
    escapeMarkers(event.description ?? ''),
    NOTES_END,
    CHECKLIST_START,
    ...checklist,
    CHECKLIST_END,
    '',
  ].join('\n');
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function findMarker(lines: string[], marker: string): number {
  const found: number[] = [];
  lines.forEach((line, index) => { if (line === marker) found.push(index); });
  if (found.length !== 1) throw new Error(`Event Markdown must contain exactly one ${marker} marker.`);
  return found[0];
}

function field(header: string[], name: string): string {
  const prefix = `**${name}:** `;
  const matches = header.filter(line => line.startsWith(prefix));
  if (matches.length !== 1) throw new Error(`Event Markdown is missing its ${name} field.`);
  return matches[0].slice(prefix.length);
}

function parseChecklist(lines: string[], previous: NonNullable<EventItem['checklist']>, eventId: string): NonNullable<EventItem['checklist']> {
  const rows: { done: boolean; lines: string[] }[] = [];
  let current: { done: boolean; lines: string[] } | undefined;
  for (const line of lines) {
    const match = /^- \[([ xX])\] (.*)$/.exec(line);
    if (match) {
      current = { done: match[1].toLowerCase() === 'x', lines: [match[2]] };
      rows.push(current);
    } else if (current) {
      current.lines.push(line.startsWith('  ') ? line.slice(2) : line);
    } else if (line.trim()) throw new Error('Event Markdown contains checklist text outside a checkbox.');
  }

  const used = new Set<string>();
  const assigned = new Map<number, string>();
  for (let index = 0; index < rows.length; index++) {
    const text = rows[index].lines.join('\n');
    const match = previous.find(item => item.text === text && !used.has(item.id));
    if (match) { assigned.set(index, match.id); used.add(match.id); }
  }
  for (let index = 0; index < rows.length; index++) {
    if (assigned.has(index)) continue;
    const prior = previous[index]?.id;
    if (prior && !used.has(prior)) { assigned.set(index, prior); used.add(prior); }
  }
  return rows.map((row, index) => {
    let id = assigned.get(index);
    if (!id) {
      const stem = `${eventId}-check-${index + 1}`;
      id = stem;
      for (let suffix = 2; used.has(id); suffix++) id = `${stem}-${suffix}`;
      used.add(id);
    }
    return { id, text: unescapeMarkers(row.lines.join('\n')), done: row.done };
  });
}

/** Parse a versioned event file; visible content is authoritative for editable fields. */
export function parseEvent(markdown: string): EventItem {
  if (typeof markdown !== 'string') throw new Error('Event Markdown must be text.');
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  if (lines[0] !== '---') throw new Error('Event Markdown frontmatter is missing.');
  const frontmatterEnd = lines.indexOf('---', 1);
  if (frontmatterEnd < 0) throw new Error('Event Markdown frontmatter is incomplete.');
  const metadataLines = lines.slice(1, frontmatterEnd).filter(line => line.startsWith('daymark_event: '));
  if (metadataLines.length !== 1) throw new Error('Event Markdown metadata is missing or duplicated.');
  let metadata: unknown;
  try { metadata = JSON.parse(metadataLines[0].slice('daymark_event: '.length)); }
  catch { throw new Error('Event Markdown metadata is malformed.'); }
  if (!object(metadata) || metadata.version !== 1 || !validateEvent(metadata.event)) throw new Error('Event Markdown metadata version or event data is invalid.');
  const stored = metadata.event;

  const notesStart = findMarker(lines, NOTES_START);
  const notesEnd = findMarker(lines, NOTES_END);
  const checklistStart = findMarker(lines, CHECKLIST_START);
  const checklistEnd = findMarker(lines, CHECKLIST_END);
  if (!(frontmatterEnd < notesStart && notesStart < notesEnd && notesEnd < checklistStart && checklistStart < checklistEnd)) {
    throw new Error('Event Markdown sections are out of order.');
  }

  const header = lines.slice(frontmatterEnd + 1, notesStart);
  const titleLine = header.find(line => line.startsWith('# '));
  if (!titleLine) throw new Error('Event Markdown title is missing.');
  const date = field(header, 'Date');
  const heading = field(header, 'Section');
  const order = Number(field(header, 'Order'));
  const timeText = field(header, 'Time');
  const durationText = field(header, 'Duration');
  let timing: EventItem['timing'];
  if (timeText !== 'No set time') {
    const match = /^(\d{2}:\d{2}) \(([^()]+)\)$/.exec(timeText);
    if (!match) throw new Error('Event Markdown time field is malformed.');
    const [localTime, timeZone] = match.slice(1);
    const resolved = resolveEventTime(date, localTime, timeZone);
    if (resolved.kind !== 'valid') throw new Error(resolved.message);
    const sameSavedWallTime = stored.date === date && stored.timing?.localTime === localTime && stored.timing.timeZone === timeZone;
    if (resolved.instants.length > 1 && !sameSavedWallTime) throw new Error('Event Markdown time is ambiguous; update metadata to select an occurrence.');
    const startInstant = sameSavedWallTime && resolved.instants.includes(stored.timing!.startInstant)
      ? stored.timing!.startInstant
      : resolved.instants[0];
    timing = { localTime, timeZone, startInstant };
  }

  let durationMinutes: number | undefined;
  if (durationText !== 'No duration') {
    const match = /^(\d+) (?:minute|minutes)$/.exec(durationText);
    durationMinutes = match ? Number(match[1]) : NaN;
  }
  const description = unescapeMarkers(lines.slice(notesStart + 1, notesEnd).join('\n'));
  const checklist = parseChecklist(lines.slice(checklistStart + 1, checklistEnd), stored.checklist ?? [], stored.id);
  const recovered: EventItem = {
    ...stored,
    title: titleLine.slice(2), date, heading, order, timing, durationMinutes,
    description: description === '' && stored.description === undefined ? undefined : description,
    checklist: checklist.length || stored.checklist !== undefined ? checklist : undefined,
  };
  if (!validateEvent(recovered)) throw new Error('Event Markdown readable fields are invalid.');
  return recovered;
}
