// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MarkdownPreview } from '../MarkdownPreview';
import { TaskHistoryDrawer } from '../TaskHistoryDrawer';
import { NoteLinkContext, type NoteLinks } from './NoteLinkContext';
import { resolveNoteLink } from '../../utils/noteLinks';
import { DEFAULT_SETTINGS } from '../../utils/defaultData';
import type { TaskItem } from '../../types/daymark';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const BUG = 'Daymark - Refresh the open page after MCP changes';
const notes = [{ id: 'note-bug', title: BUG, folder: 'Daymark/Bugs', updatedAt: '2026-11-13T09:15:48Z' }];
let host: HTMLDivElement;
let root: Root;
let links: NoteLinks & { opened: string[] };

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const opened: string[] = [];
  links = {
    opened,
    exists: link => !!resolveNoteLink(notes, link),
    open: vi.fn((link: string) => { const target = resolveNoteLink(notes, link); if (target) opened.push(target.id); return !!target; }),
  };
});
afterEach(() => { act(() => root.unmount()); host.remove(); document.body.replaceChildren(); });

const render = (node: React.ReactNode) => act(() => root.render(<NoteLinkContext.Provider value={links}>{node}</NoteLinkContext.Provider>));
const linkNamed = (text: string) => [...document.querySelectorAll<HTMLElement>('[data-internal-note]')].find(el => el.textContent?.includes(text))!;

it('a [[link]] in daily notes opens the note in a nested folder; a missing one is marked unresolved', () => {
  render(<MarkdownPreview content={`See [[${BUG}]] and [[No such note]].`} />);
  act(() => linkNamed('Refresh the open page').click());
  expect(links.opened).toEqual(['note-bug']);
  expect(linkNamed('Refresh the open page').classList.contains('daymark-internal-link-missing')).toBe(false);
  expect(linkNamed('No such note').classList.contains('daymark-internal-link-missing')).toBe(true);
});

it('the task details sheet renders the description so its note link opens the note', () => {
  const task = {
    id: 'task-1', title: 'Daymark - Refresh the open page after MCP changes', status: 'not-started', heading: 'Daymark',
    createdDate: '2026-11-13', originalNoteDate: '2026-11-13', order: 1, historyLog: [],
    description: `Show changes without a reload. See [[${BUG}]] for reproduction steps.`,
  } as unknown as TaskItem;
  render(<TaskHistoryDrawer task={task} currentDate="2026-11-13" statuses={DEFAULT_SETTINGS.statuses} onClose={() => {}}
    onReopenTask={() => {}} onOpenHistoricalCorrection={() => {}} onUpdateTask={() => {}} />);
  expect(document.querySelector('#task-notes')).toBeNull();
  act(() => linkNamed('Refresh the open page').click());
  expect(links.opened).toEqual(['note-bug']);
  const edit = [...document.querySelectorAll('button')].find(button => button.textContent === 'Edit notes')!;
  act(() => edit.click());
  expect((document.querySelector('#task-notes') as HTMLTextAreaElement).value).toContain(`[[${BUG}]]`);
});
