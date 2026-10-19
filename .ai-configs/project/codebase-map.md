# Daymark Codebase Map

Canonical map of key source directories, modules, and component responsibilities.

## Directory Organization

```text
daymark/
├── docs/                 # Authoritative technical documentation
├── mobile/               # Native Android Glance & iOS WidgetKit code
├── public/               # Static assets & PWA manifest
├── src/                  # React 19 frontend application
│   ├── components/       # Modular UI components (Desktop, Mobile, Server)
│   ├── types/            # Master TypeScript types (`daymark.ts`)
│   ├── utils/            # Core lifecycle, markdown, and storage engines
│   ├── App.tsx           # Global state orchestrator
│   └── main.tsx          # Client bootstrap
├── .ai-configs/          # Canonical universal AI agent configuration
├── package.json          # Dependencies & build scripts
├── server.ts             # Express REST server & Vite middleware host
└── vite.config.ts        # Vite configuration
```

## Critical Modules & Responsibilities

| File / Directory | Layer | Purpose |
| :--- | :--- | :--- |
| `src/types/daymark.ts` | Types | Master TypeScript interfaces (`TaskItem`, `DailyDocument`, `AppSettings`, `SyncPayload`). |
| `src/utils/lifecycleEngine.ts` | Logic | Pure algorithms for task rollover (`performDailyRollover`), aging calculation (`calculateTaskAge`, `getAgingSeverity`), and historical correction (`correctHistoricalCompletion`). |
| `src/utils/markdownEngine.ts` | Logic | Canonical Markdown parsing and serialization with frontmatter and `<!-- daymark: ... -->` comments. |
| `src/utils/vaultStore.ts` | Storage | LocalStorage I/O, seed data reset, JSON snapshot, and Obsidian-compatible ZIP export. |
| `src/components/TodayView.tsx` | UI | Daily notebook view with visual, split, and raw markdown modes. |
| `src/components/StandaloneNotesView.tsx` | UI | 3-column evergreen notes workspace with folder navigation and editor. |
| `src/components/DailyHistoryView.tsx` | UI | Historical calendar archive with heat-map and task reopen capabilities. |
| `src/components/TaskItemCard.tsx` | UI | Interactive task card with aging badges, status picker, and subtasks. |
| `src/components/MarkdownPreview.tsx` | UI | Markdown renderer supporting GFM checklists, callouts, and wikilinks. |
| `server.ts` | Backend | Express REST gateway (auth, devices, sync, health) and Vite development middleware. |
