# Cycle 20: MCP feedback round 1 (design and plan)

Date: 2026-11-13 · Status: **approved 2026-11-13** · Follows 1.13.1

## Why

Using the Daymark connector on 2026-11-13 produced four items under today's **Daymark** heading, plus a bug note (`Daymark/Bugs/Daymark - Refresh the open page after MCP changes`). Each one is something an AI connection, or the owner using one, ran into.

| # | Feedback (owner's task) | Root cause found in the code |
|---|---|---|
| F1 | Refresh the open page after MCP changes | Clients only pull on a 60 s timer (`PERIODIC_SYNC_MS`, `src/hooks/useSync.ts:40`), on tab focus and when going online. There is no server push. An open note editor may also keep its local copy. |
| F2 | Add folder deletion to the MCP server | MCP has `delete_note` but no folder tools. `list_notes` returns only notes, so empty folders are invisible. The app already has `createFolder`, `renameFolder` and `deleteFolder` in `src/utils/noteFolders.ts`, synced through the `notemeta` entity. |
| F3 | Fix note links in task descriptions | Task descriptions render as plain text (`TaskHistoryDrawer.tsx:153`, `whitespace-pre-wrap`), so `[[Note title]]` never becomes a link. Daily section notes go through `MarkdownPreview`, but no caller passes `onInternalLinkClick` (`TodayView.tsx:724`, `CalendarView.tsx:370`), so their wiki links do nothing either. |
| F4 | Clarify task, feedback and folder guidance in the skill | `skills/daymark/SKILL.md` and `server/mcp/instructions.ts` say "never invent folders" and push every app issue to `submit_daymark_feedback`, even when the owner explicitly asks for a task or note. |

## Scope

### F1: Live refresh after server-side changes
- **Server:** add an authenticated `GET /api/events` Server-Sent Events stream. After any committed vault write (sync push, MCP tool, restore), send `{ type: "changed", entities: [...] }`. Debounce to about 300 ms. Send a heartbeat every 25 s so proxies keep the connection open. The connection authenticates the same way as `/api/sync`.
- **Client:** `useSync` opens the stream while the page is visible and server sync is on. A `changed` event triggers `run()`, the same path as the 60 s timer. On error it falls back to the timer and reconnects with backoff. It closes when the page is hidden.
- **Open views:** confirm Today, Calendar, Backlog and Habits re-render from the store after a pull. In the open note editor, apply the remote version only when there are no unsaved local edits. Otherwise keep the user's text and use the existing conflict/merge path. Never overwrite typing.
- **Android (Capacitor):** same stream over the authenticated server URL. If the WebView drops SSE in the background, focus-triggered sync still covers it.
- **Fallback if SSE is rejected:** poll every 10 s while the page is visible and every 60 s while hidden.

### F2: Folder tools in MCP
- `list_folders`: shared folder paths, including empty ones (from `notemeta` plus note folders, filtered by scope).
- `create_folder`: wraps `createFolder`. Needs write access to the new path, which a parent-folder grant or **Everything** provides.
- `delete_folder`: wraps `deleteFolder`. It never deletes notes: notes inside move to the parent folder, as in the app. Needs write access to the folder and its parent. Marked destructive, so clients ask for confirmation.
- Optional: `rename_folder` wrapping `renameFolder`, needing write access to both paths.
- Audit entries for each, and tests for scope refusals, empty and non-empty folders, nested paths and case-only path differences.

### F3: Note links in task descriptions and daily notes
- Show task descriptions in `TaskHistoryDrawer` with `MarkdownPreview`, keeping the plain-text editor for editing.
- One shared resolver: `[[Title]]` matches a note title case-insensitively, ignoring surrounding whitespace, across nested folders. `[[Folder/Sub/Title]]` narrows the match. If several notes match, prefer the same-folder match, then the most recently updated. A missing target shows as an unresolved-link style, not a dead click.
- Wire `onInternalLinkClick` to open the note in Notes (desktop and phone) from task descriptions, Today section notes and Calendar section notes.
- Regression test: the exact case from the feedback, a task linking to a note in `Daymark/Bugs`, plus a link that still works after the note moves folder.

### F4: Skill and instruction guidance
- If the owner explicitly asks for a task or note about a Daymark issue, create that task or note. Use `submit_daymark_feedback` only when they report an app issue without saying how to track it.
- Folders: create a new folder when the owner asks for one and the connection allows it (using `create_folder` from F2). Ask which folder when several fit and the intent is unclear.
- Update `skills/daymark/SKILL.md`, `server/mcp/instructions.ts` and the tool descriptions together. The existing drift test checks that every tool is documented. Add the new folder tools to the skill and the guide.

### Carried over from cycle 19
- Owner connector checks still pending: Claude web and mobile voice, ChatGPT, Claude Code, Codex, and MCP Inspector in local mode. Record the results in the cycle 19 notes.
- Redeploy the owner's server with 1.13.1 or later. 1.13.1 only adds a Help topic; F1 and F2 need the server.
- Optional (from the 1.13.1 review): serve the skill as an MCP resource (`daymark://skill`) so clients without skill upload can read the full guidance.

## Order of work

1. **F4 + F2** (server and skill only, smallest risk). Folder tools first, then the guidance that depends on them.
2. **F3** (client only). Shared resolver, description preview, wiring, tests.
3. **F1** (server + client). SSE endpoint, client subscription, open-editor safety, Android check.
4. Two-device sync e2e plus a new e2e: an MCP write appears on an open page without reload in a few seconds. QA scenario, cycle 20 screenshots, release notes, release **1.13.2**, deploy.

## Verification

- Unit tests for each new tool, the resolver and the SSE broadcaster, including auth refusal, heartbeat and debounce.
- `npm run lint`, `npm test`, `npm run test:helpers`, `npm run build`, `npm run test:sync`, `npm run test:qa`, `npm run validate:ai`.
- New e2e (F1): open Today, call `create_task` and `update_note` through MCP, and check that both appear within about 3 s with no reload, and that an unsaved note edit survives.
- Signed Android release build with Kotlin tests. On a real phone, check that an MCP change shows on the open app.

## Owner decisions (2026-11-13)

1. **F1:** the server notifies open, active pages so they update instantly (SSE push). The 60 s timer stays as the fallback.
2. **F2:** include `rename_folder` alongside list, create and delete.
3. **Release:** ship the cycle as **1.13.2**.
