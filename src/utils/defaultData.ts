import { parseHex } from './color';
import { AppearanceSettings, AppSettings, DailyDocument, StandaloneNote, StatusDefinition } from '../types/daymark';

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  theme: 'light', textSize: 'm', dim: 35, blur: 4,
  light: { headerBg: '#fafaf9', headerOpacity: 100, headerText: 'auto', pageText: 'auto', accent: 'auto' },
  dark: { headerBg: '#0c0a09', headerOpacity: 100, headerText: 'auto', pageText: 'auto', accent: 'auto' },
};

/** Sanitize imported/synced appearance at both the storage and render boundaries. */
export function normalizeAppearance(value?: AppearanceSettings): AppearanceSettings {
  const a = { ...DEFAULT_APPEARANCE, ...value };
  const clamp = (v: number, min: number, max: number, fallback: number) =>
    Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;
  const themeColors = (theme: 'light' | 'dark') => {
    const defaults = DEFAULT_APPEARANCE[theme];
    const colors = { ...defaults, ...value?.[theme] };
    const hex = (v: string) => typeof v === 'string' && parseHex(v) !== null;
    return {
      headerBg: hex(colors.headerBg) ? colors.headerBg : defaults.headerBg,
      headerOpacity: clamp(colors.headerOpacity, 40, 100, defaults.headerOpacity),
      headerText: hex(colors.headerText) ? colors.headerText : 'auto',
      pageText: hex(colors.pageText) ? colors.pageText : 'auto',
      accent: hex(colors.accent) ? colors.accent : 'auto',
    };
  };
  return {
    theme: a.theme === 'dark' ? 'dark' : 'light',
    textSize: ['s', 'm', 'l'].includes(a.textSize) ? a.textSize : 'm',
    dim: clamp(a.dim, 0, 90, DEFAULT_APPEARANCE.dim),
    blur: clamp(a.blur, 0, 12, DEFAULT_APPEARANCE.blur),
    light: themeColors('light'), dark: themeColors('dark'),
  };
}

export const DEFAULT_STATUSES: StatusDefinition[] = [
  {
    id: 'note',
    label: 'Note',
    action: 'keep',
    color: 'text-stone-700 bg-stone-100 border-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:border-stone-700',
    icon: 'FileText',
    isSystem: true,
    participatesInAging: false,
  },
  {
    id: 'not-started',
    label: 'Not started',
    action: 'keep',
    color: 'text-stone-700 bg-stone-100 border-stone-200 dark:bg-stone-800 dark:text-stone-200 dark:border-stone-700',
    icon: 'Circle',
    isSystem: true,
    participatesInAging: false,
  },
  {
    id: 'in-progress',
    label: 'In progress',
    action: 'carry-forward',
    color: 'text-sky-800 bg-sky-50 border-sky-200 dark:bg-sky-950/50 dark:text-sky-300 dark:border-sky-800',
    icon: 'PlayCircle',
    isSystem: true,
    participatesInAging: true,
  },
  {
    id: 'blocked',
    label: 'Blocked',
    action: 'carry-forward',
    color: 'text-amber-900 bg-amber-50 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800',
    icon: 'AlertCircle',
    isSystem: true,
    participatesInAging: true,
  },
  {
    id: 'waiting',
    label: 'Waiting',
    action: 'carry-forward',
    color: 'text-purple-800 bg-purple-50 border-purple-200 dark:bg-purple-950/50 dark:text-purple-300 dark:border-purple-800',
    icon: 'Clock',
    isSystem: true,
    participatesInAging: true,
  },
  {
    id: 'done',
    label: 'Done',
    action: 'keep',
    color: 'text-emerald-800 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800',
    icon: 'CheckCircle2',
    isSystem: true,
    participatesInAging: false,
  },
  {
    id: 'archived',
    label: 'Archived',
    action: 'archive',
    color: 'text-stone-600 bg-stone-100 border-stone-200 dark:bg-stone-800 dark:text-stone-400 dark:border-stone-700',
    icon: 'Archive',
    isSystem: true,
    participatesInAging: false,
  },
];

/**
 * Brings settings saved by older versions up to date: built-in statuses get the current
 * (accessible) colours, and the old "Waiting / Dependency" label becomes "Waiting".
 * User-renamed labels and custom statuses are left alone.
 */
export function normalizeSettings(settings: AppSettings): AppSettings {
  const statuses = settings.statuses.map((s) => {
    const builtIn = DEFAULT_STATUSES.find((d) => d.id === s.id);
    if (!builtIn) return s;
    const label = s.id === 'waiting' && s.label === 'Waiting / Dependency' ? builtIn.label : s.label;
    return label === s.label && s.color === builtIn.color ? s : { ...s, label, color: builtIn.color };
  });
  const defaultHeadings = settings.defaultHeadings.length ? settings.defaultHeadings : [...DEFAULT_HEADINGS];
  const filledAppearance = normalizeAppearance(settings.appearance);
  const appearance = JSON.stringify(filledAppearance) === JSON.stringify(settings.appearance)
    ? settings.appearance : filledAppearance;
  return appearance === settings.appearance && defaultHeadings === settings.defaultHeadings && statuses.every((s, i) => s === settings.statuses[i])
    ? settings : { ...settings, statuses, defaultHeadings, appearance };
}

export const DEFAULT_HEADINGS = ['Work', 'Meetings', 'Ideas', 'Attention'];

export const DEFAULT_SETTINGS: AppSettings = {
  appearance: DEFAULT_APPEARANCE,
  defaultHeadings: DEFAULT_HEADINGS,
  agingThresholds: {
    attentionDays: 3,
    criticalDays: 7,
    enabled: true,
    statuses: ['in-progress', 'blocked', 'waiting'],
  },
  statuses: DEFAULT_STATUSES,
  simulatedToday: '', // empty = use the real local date (developer override otherwise)
  timeZone: 'America/Los_Angeles',
  syncConfig: {
    enabled: false,
    serverUrl: 'https://sync.daymark.local:8443/api/v1',
    deviceId: 'mbp-local-client-01',
    authToken: 'dm_tok_9f81a7b29e1',
    lastSyncAt: '2026-10-16T04:15:00Z',
    status: 'synced',
  },
};

export const SEED_DAILY_DOCUMENTS: DailyDocument[] = [
  {
    date: '2026-10-14',
    type: 'daily',
    updatedAt: '2026-10-14T17:45:00Z',
    headings: [
      {
        name: 'Work',
        items: [
          {
            id: 'task-101',
            title: 'Investigate build pipeline failure',
            description: 'Docker image cache corruption in runner pool 3 during staging deployment.',
            status: 'in-progress',
            createdDate: '2026-10-14',
            originalNoteDate: '2026-10-14',
            heading: 'Work',
            order: 1,
            historyLog: [
              {
                id: 'hist-1',
                timestamp: '2026-10-14T09:15:00Z',
                date: '2026-10-14',
                action: 'created',
                details: 'Created task in # Work',
              },
            ],
          },
          {
            id: 'task-102',
            title: 'Upgrade Tailwind CSS dependencies',
            status: 'done',
            createdDate: '2026-10-14',
            originalNoteDate: '2026-10-14',
            completedDate: '2026-10-14',
            heading: 'Work',
            order: 2,
            historyLog: [
              {
                id: 'hist-2',
                timestamp: '2026-10-14T10:00:00Z',
                date: '2026-10-14',
                action: 'created',
                details: 'Created task',
              },
              {
                id: 'hist-3',
                timestamp: '2026-10-14T16:20:00Z',
                date: '2026-10-14',
                action: 'status_changed',
                details: 'Marked done',
              },
            ],
          },
        ],
        notesContent: 'Team standup went smoothly. Discussed test runner instability.',
      },
      {
        name: 'Meetings',
        items: [],
        notesContent: 'Sprint review preparation notes.',
      },
      {
        name: 'Attention',
        items: [
          {
            id: 'task-103',
            title: 'Resolve legacy database connection leak',
            description: 'Connection pool exhausting under high load in notification service.',
            status: 'waiting',
            createdDate: '2026-10-09', // 7 days prior to Oct 16!
            originalNoteDate: '2026-10-09',
            carriedFromDate: '2026-10-13',
            heading: 'Attention',
            order: 1,
            historyLog: [
              {
                id: 'hist-4',
                timestamp: '2026-10-09T11:00:00Z',
                date: '2026-10-09',
                action: 'created',
                details: 'Created task',
              },
              {
                id: 'hist-5',
                timestamp: '2026-10-14T08:00:00Z',
                date: '2026-10-14',
                action: 'carried_forward',
                details: 'Carried forward from Oct 13',
              },
            ],
          },
        ],
      },
    ],
  },
  {
    date: '2026-10-15',
    type: 'daily',
    updatedAt: '2026-10-15T18:30:00Z',
    headings: [
      {
        name: 'Work',
        items: [
          {
            id: 'task-001',
            title: 'Review discipline soft-delete PR',
            description: 'Verify cascade behavior and audit log triggers on deletion.',
            status: 'done',
            createdDate: '2026-10-15',
            originalNoteDate: '2026-10-15',
            completedDate: '2026-10-15',
            heading: 'Work',
            order: 1,
            historyLog: [
              {
                id: 'hist-6',
                timestamp: '2026-10-15T09:30:00Z',
                date: '2026-10-15',
                action: 'created',
                details: 'Created task',
              },
              {
                id: 'hist-7',
                timestamp: '2026-10-15T15:45:00Z',
                date: '2026-10-15',
                action: 'status_changed',
                details: 'Completed PR review and approved',
              },
            ],
          },
          {
            id: 'task-101',
            title: 'Investigate build pipeline failure',
            description: 'Docker image cache corruption in runner pool 3 during staging deployment.',
            status: 'in-progress',
            createdDate: '2026-10-14',
            originalNoteDate: '2026-10-14',
            carriedFromDate: '2026-10-14',
            heading: 'Work',
            order: 2,
            historyLog: [
              {
                id: 'hist-8',
                timestamp: '2026-10-15T08:00:00Z',
                date: '2026-10-15',
                action: 'carried_forward',
                details: 'Carried forward from Oct 14',
              },
            ],
          },
          {
            id: 'task-003',
            title: 'Prepare QA test scenarios for offline sync',
            description: 'Cover disconnected device re-pairing and non-destructive merges.',
            status: 'blocked',
            createdDate: '2026-10-13',
            originalNoteDate: '2026-10-13',
            carriedFromDate: '2026-10-14',
            heading: 'Work',
            order: 3,
            historyLog: [
              {
                id: 'hist-9',
                timestamp: '2026-10-13T14:00:00Z',
                date: '2026-10-13',
                action: 'created',
                details: 'Created task',
              },
              {
                id: 'hist-10',
                timestamp: '2026-10-15T08:00:00Z',
                date: '2026-10-15',
                action: 'carried_forward',
                details: 'Carried forward from Oct 14',
              },
            ],
          },
        ],
        notesContent: 'Discussed build errors with DevOps; runner images being regenerated.',
      },
      {
        name: 'Meetings',
        items: [
          {
            id: 'task-004',
            title: 'Discuss testing timeline with product manager',
            status: 'not-started',
            createdDate: '2026-10-15',
            originalNoteDate: '2026-10-15',
            heading: 'Meetings',
            order: 1,
            historyLog: [
              {
                id: 'hist-11',
                timestamp: '2026-10-15T11:00:00Z',
                date: '2026-10-15',
                action: 'created',
                details: 'Created task',
              },
            ],
          },
        ],
      },
      {
        name: 'Attention',
        items: [
          {
            id: 'task-103',
            title: 'Resolve legacy database connection leak',
            status: 'waiting',
            createdDate: '2026-10-09',
            originalNoteDate: '2026-10-09',
            carriedFromDate: '2026-10-14',
            heading: 'Attention',
            order: 1,
            historyLog: [
              {
                id: 'hist-12',
                timestamp: '2026-10-15T08:00:00Z',
                date: '2026-10-15',
                action: 'carried_forward',
                details: 'Carried forward from Oct 14',
              },
            ],
          },
        ],
      },
      {
        name: 'Ideas',
        items: [],
        notesContent: 'Consider a simpler way to configure task carry-forward rules without breaking plain markdown.',
      },
    ],
  },
  {
    date: '2026-10-16', // TODAY
    type: 'daily',
    updatedAt: '2026-10-16T08:15:00Z',
    headings: [
      {
        name: 'Work',
        items: [
          {
            id: 'task-101',
            title: 'Investigate build pipeline failure',
            description: 'Docker image cache corruption in runner pool 3 during staging deployment.',
            status: 'in-progress',
            createdDate: '2026-10-14',
            originalNoteDate: '2026-10-14',
            carriedFromDate: '2026-10-15',
            heading: 'Work',
            order: 1,
            historyLog: [
              {
                id: 'hist-13',
                timestamp: '2026-10-16T08:00:00Z',
                date: '2026-10-16',
                action: 'carried_forward',
                details: 'Carried forward from Oct 15',
              },
            ],
          },
          {
            id: 'task-003',
            title: 'Prepare QA test scenarios for offline sync',
            description: 'Cover disconnected device re-pairing and non-destructive merges.',
            status: 'blocked',
            createdDate: '2026-10-13', // 3 days ago -> Attention!
            originalNoteDate: '2026-10-13',
            carriedFromDate: '2026-10-15',
            heading: 'Work',
            order: 2,
            historyLog: [
              {
                id: 'hist-14',
                timestamp: '2026-10-16T08:00:00Z',
                date: '2026-10-16',
                action: 'carried_forward',
                details: 'Carried forward from Oct 15',
              },
            ],
          },
          {
            id: 'task-005',
            title: 'Draft RFC for offline markdown conflict resolution',
            description: 'Specify 3-way merge behavior when headers are renamed while tasks are carried forward.',
            status: 'in-progress',
            createdDate: '2026-10-16',
            originalNoteDate: '2026-10-16',
            heading: 'Work',
            order: 3,
            historyLog: [
              {
                id: 'hist-15',
                timestamp: '2026-10-16T08:30:00Z',
                date: '2026-10-16',
                action: 'created',
                details: 'Created task today',
              },
            ],
          },
        ],
        notesContent: 'Priority today: unblock QA test cases and resolve runner cache issue.',
      },
      {
        name: 'Meetings',
        items: [
          {
            id: 'task-006',
            title: '1:1 Sync with engineering lead',
            status: 'not-started',
            createdDate: '2026-10-16',
            originalNoteDate: '2026-10-16',
            heading: 'Meetings',
            order: 1,
            historyLog: [
              {
                id: 'hist-16',
                timestamp: '2026-10-16T09:00:00Z',
                date: '2026-10-16',
                action: 'created',
                details: 'Scheduled for 2:30 PM',
              },
            ],
          },
        ],
        notesContent: 'Agenda: Q4 architecture roadmap & self-hosted sync protocol milestones.',
      },
      {
        name: 'Attention',
        items: [
          {
            id: 'task-103',
            title: 'Resolve legacy database connection leak',
            description: 'Connection pool exhausting under high load in notification service.',
            status: 'waiting',
            createdDate: '2026-10-09', // 7 days old! Critical aging alert!
            originalNoteDate: '2026-10-09',
            carriedFromDate: '2026-10-15',
            heading: 'Attention',
            order: 1,
            historyLog: [
              {
                id: 'hist-17',
                timestamp: '2026-10-16T08:00:00Z',
                date: '2026-10-16',
                action: 'carried_forward',
                details: 'Carried forward from Oct 15 (Aging: 7 days)',
              },
            ],
          },
        ],
      },
      {
        name: 'Ideas',
        items: [],
        notesContent: 'Explore mobile widget lock-screen integration for zero-friction task capture.',
      },
    ],
  },
];

export const SEED_STANDALONE_NOTES: StandaloneNote[] = [
  {
    id: 'note-001',
    title: 'Architecture Decision: Canonical Markdown & Task Identity',
    folder: 'Technical',
    tags: ['architecture', 'markdown', 'adr'],
    pinned: true,
    createdAt: '2026-10-10T14:00:00Z',
    updatedAt: '2026-10-15T11:20:00Z',
    content: `# ADR 004: Canonical Markdown & Task Identity Preservation

## Context
Daymark prioritizes local-first ownership and plain-text portability. However, task lifecycle features like historical completion and carry-forward aging require stable task identity across successive daily files.

## Decision
1. **Canonical format:** Human-readable standard Markdown with HTML comments for machine-parsable metadata:
   \`- [ ] Task Title <!-- daymark: task_id=task-001 status=in-progress created=2026-10-14 -->\`
2. **Portability:** If a user opens the files in Obsidian, VS Code, or Typora, the file looks like a clean GFM checklist. The HTML comment is invisible in render mode and uninjurious in raw mode.
3. **Idempotence:** Rollover operates deterministically using \`task_id\` so multiple passes will never duplicate entries.
4. **Historical completion:** Updating a carried-forward task with "Done on Oct 15" marks the canonical record done on that date and safely purges future active references.

## Consequences
- No proprietary database lock-in.
- Full zip vault export remains 100% standard markdown.
`,
  },
  {
    id: 'note-002',
    title: 'Weekly Sprint Sync Notes',
    folder: 'Meetings',
    tags: ['sync', 'sprint', 'team'],
    createdAt: '2026-10-13T10:00:00Z',
    updatedAt: '2026-10-13T11:00:00Z',
    content: `# Weekly Sprint Sync - Oct 13, 2026

## Attendees
- Alex (Engineering)
- Morgan (Product)
- Taylor (QA)

## Key Takeaways
- Target release for v1.2 local-first carry-forward core is end of month.
- Android home-screen widget contract finalized: quick status toggle & 1-tap capture.
- Historical completion correction workflow received top feedback from dogfooding group.
`,
  },
  {
    id: 'note-003',
    title: 'Self-Hosted Sync Security Guidelines',
    folder: 'Technical',
    tags: ['security', 'self-host', 'sync'],
    createdAt: '2026-10-11T16:00:00Z',
    updatedAt: '2026-10-14T09:30:00Z',
    content: `# Self-Hosted Sync Security Guidelines

## Threat Model
1. Man-in-the-middle attacks prevented via mandatory TLS 1.3.
2. Device token rotation on authorization revocation.
3. Offline queue reconciliation with vector clock cursors.

## Backup Verification
- Automated nightly snapshots of \`/data/vault/\` directory.
- Test restore drills conducted quarterly.
`,
  },
  {
    id: 'note-004',
    title: 'Q4 Reading List & Research Papers',
    folder: 'Personal',
    tags: ['reading', 'books', 'research'],
    createdAt: '2026-10-08T19:00:00Z',
    updatedAt: '2026-10-12T20:15:00Z',
    content: `# Q4 Reading List

- [ ] *Local-First Software: You Own Your Data, in spite of the Cloud* (Kleppmann et al.)
- [x] *Designing Data-Intensive Applications* - Chapter on Consistency and Consensus
- [ ] *The Design of Everyday Things* - Don Norman
- [x] *Working in Public: The Making and Maintenance of Open Source Software* - Nadia Eghbal
`,
  },
];
