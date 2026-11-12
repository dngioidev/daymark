import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { FEEDBACK_CATEGORY, FEEDBACK_TAG } from '../../../src/sync/mcpProtocol';
import type { StandaloneNote, TaskItem } from '../../../src/types/daymark';
import { addBacklogItem } from '../../../src/utils/backlog';
import { assertWrite, normalizeHeading } from '../scope';
import { ensureDay, readBacklog } from '../vaultView';
import { defineTool, type ToolContext } from './define';

export function registerFeedbackTools(server: McpServer, initialContext: ToolContext): void {
  defineTool(server, initialContext, {
    name: 'submit_daymark_feedback',
    description: 'Files an idea, bug, complaint or other feedback about Daymark itself to the owner-configured destination.',
    input: { text: z.string().min(1).max(4000), kind: z.enum(['idea', 'bug', 'complaint', 'other']) },
    readOnly: false,
    allowReadOnlyConnection: true,
    run: async ({ text, kind }, ctx) => {
      let key = '';
      await ctx.commit(() => {
        const destination = ctx.mcp.settings.feedback;
        const title = text.split(/\r?\n/, 1)[0].slice(0, 120);
        const description = `${text}\n\nFrom: ${ctx.connection.name} · ${kind}`;
        const now = ctx.now().toISOString();
        switch (destination.kind) {
          case 'backlog': {
            assertWrite(ctx.connection, { kind: 'backlog' }, { feedback: true });
            const next = addBacklogItem(readBacklog(ctx.store), { title, description, category: FEEDBACK_CATEGORY }, now);
            // The backlog helpers do not accept tags.
            next.items.at(-1)!.tags = [FEEDBACK_TAG];
            key = 'backlog';
            return [{ key, value: next }];
          }
          case 'heading': {
            assertWrite(ctx.connection, { kind: 'heading', name: destination.heading }, { feedback: true });
            const date = ctx.today();
            const { doc } = ensureDay(ctx.store, date, date);
            const existing = doc.headings.find(section => normalizeHeading(section.name) === normalizeHeading(destination.heading));
            const section = existing ?? { name: destination.heading, items: [], notesContent: '' };
            const task: TaskItem = {
              id: `task-${crypto.randomUUID()}`, title, description, tags: [FEEDBACK_TAG], status: 'not-started',
              createdDate: date, originalNoteDate: date, heading: section.name, order: section.items.length + 1,
              historyLog: [{ id: `hist-${crypto.randomUUID()}`, timestamp: now, date, action: 'created', details: `Added to ${section.name}` }],
            };
            key = `doc:${date}`;
            return [{ key, value: { ...doc, updatedAt: now, headings: existing
              ? doc.headings.map(heading => heading === existing ? { ...heading, items: [...heading.items, task] } : heading)
              : [...doc.headings, { ...section, items: [task] }] } }];
          }
          case 'folder': {
            assertWrite(ctx.connection, { kind: 'folder', folder: destination.folder }, { feedback: true });
            let stamp = Date.now();
            while (ctx.store.vault.entities[`note:note-${stamp}`]) stamp++;
            const note: StandaloneNote = {
              id: `note-${stamp}`, title: `Daymark feedback: ${title}`, content: description, folder: destination.folder,
              tags: [FEEDBACK_TAG], createdAt: now, updatedAt: now, pinned: false,
            };
            key = `note:${note.id}`;
            return [{ key, value: note }];
          }
        }
      });
      return { result: { filed: true }, action: 'create', targets: [{ key }] };
    },
  });
}
