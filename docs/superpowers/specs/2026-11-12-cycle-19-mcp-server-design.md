# Cycle 19 — Daymark MCP server (design)

Status: draft for owner review · 2026-11-12 · follows Cycle 18 (`2026-11-06-cycle-18-tags-suggestions-help-design.md`)

## Why

- The owner does most of their work, coding included, by chatting with an AI. They want that chat to reach Daymark, so there's no need to open the app or build a separate chatbot inside it.
- **Asking.** Examples: "What's my day look like?", "What's overdue?", "What did I do this week?" These are often asked by **voice**, while the owner is away from Daymark. The answer should be a short spoken rundown, and it doubles as a reminder.
- **Recording.** While working, the owner says "note in Daymark that I finished X" or "add a task for Y". The AI writes it, and the phone shows it after its next normal sync.
- **Who connects.** Claude comes first, since the owner uses it most: a personal Claude account plus a Claude Enterprise workspace for work. ChatGPT, Gemini and other MCP clients must work through the same standard connector, with no per-vendor integration.
- **Privacy.** Daymark holds personal data. The owner decides exactly what each AI connection can see, and can switch all AI access off at once. Every AI action is audited, reads included. Truly sensitive work must be able to stay on the owner's own machine, with nothing going over the internet.
- **Daymark feedback.** When the owner tells an AI something about Daymark itself, such as an idea, complaint or bug, it should end up somewhere they can pick it up and improve the project.

## Current state (what this builds on)

- **Server:** `server.ts` and `server/`, Express on port 3000. There is one account per server, and data is kept as JSON files under `DATA_DIR` (`server/store.ts`). The owner already runs it on their own server behind HTTPS.
- **Auth** (`server/auth.ts`, `server/app.ts`):
  - scrypt password
  - HMAC access tokens of 15 minutes carrying `{ sub, did, ver, exp }`
  - rotating refresh tokens, stored only as hashes, with reuse detection
  - a per-device list and revoke
  - an account token version that is bumped when the password changes
- **Sync** (`/api/sync`, `src/sync/merge.ts`, `.ai-configs/project/api-and-sync.md`):
  - The server merges, so it can read and write all content. Nothing is end-to-end encrypted.
  - Entities are `doc:<date>`, `note:<id>`, `settings`, `backlog`, `habits` and `notemeta`.
  - A global revision counter means any server-side write reaches devices on their next pull.
- **Data model** (`src/types/daymark.ts`):
  - **Daily documents** are split into **headings**, which the owner calls "sections" (Work, Meetings, Ideas, …). Each holds tasks plus free Markdown notes.
  - **Standalone notes** have **folder paths** such as `Tech/Java`.
  - There is also a **backlog** and **habits**.
- **Audit:** there is a sync log (`/api/sync/log`), but it keeps only the last 100 entries.
- **Rollover is done by clients, not the server.** `src/utils/lifecycleEngine.ts` creates the new day and carries tasks forward, deduplicating by task id.

## Goals

1. **A hosted MCP endpoint on the existing Daymark server.** Claude (web, desktop, mobile, Code), ChatGPT and other remote-MCP clients can add it as a connector by its URL.
2. **Standard connector sign-in.** Adding the connector opens Daymark's own sign-in and consent page. Daymark then issues the connection an access token and a refresh token, and the connection stays signed in until it is revoked.
3. **A sharing scope for each connection.** For example, the work Claude sees only the work sections and folders, and the personal Claude sees what the owner chose for it.
4. **Full control within that scope:** read, search, add, edit, complete and delete tasks and notes, plus backlog and habits.
5. **Ready-made summaries.** A one-call day summary that suits a voice answer, plus a short period review.
6. **An audit of every AI action**, reads included. It is kept for 7 days, 30 days or a custom number of days, set by the owner, and older entries are deleted automatically.
7. **A master switch** that turns all AI access off without deleting connections.
8. **A Daymark skill** that teaches any connected AI how to use Daymark properly, including the feedback flow.
9. **A local mode** for sensitive data: the same MCP tools against a Daymark that runs only on the owner's machine, with no internet involved.

## Non-goals

- A chatbot inside Daymark.
- More than one user account per server.
- End-to-end encryption.
- Bundling or hosting a local AI model. Local mode only has to work with whatever local MCP client the owner runs.
- Partial sync between a local-mode vault and the main server.
- A file import fallback. The owner explicitly does not want to import files. Local mode replaces that idea.
- AI access to picture bytes and handwriting strokes (Cycle 14 ink pages). Plain text of handwritten notes may be returned if it already exists as text.
- Per-vendor integrations such as ChatGPT Apps SDK UI or Gemini extensions. Standard MCP only.

## Anti-goals (failure even if it works)

- **An AI widening its own access.** Scope, the master switch, audit settings and connection management can only be changed by a signed-in Daymark device, never through MCP.
- **Data outside a connection's scope leaking in any way.** This covers search results, summaries, counts, error messages, and titles of linked notes.
- **Audit gaps.** No MCP tool can run without leaving an audit entry, failures and denials included.
- **AI edits that damage the vault:**
  - breaking the `<!-- daymark: task_id=… -->` comment format
  - bringing back deleted tasks
  - creating duplicate tasks after rollover
  - leaving a daily document that the apps can't parse
- **Secrets in logs or responses**, such as tokens, the password hash or refresh hashes.
- **A slow or long-winded voice summary.** "What's my day" must take one call and come back short.

## Design

### 1. Hosted MCP endpoint

- An MCP endpoint at **`/mcp`** on the existing Express server, using the Streamable HTTP transport. The server is the same process, so `DATA_DIR`, the store and the merge path are the same as well.
- *My call:* use the official MCP TypeScript SDK rather than implementing the protocol by hand.
- The server's MCP `instructions` field carries a short version of the Daymark skill (section 7). Clients that ignore skills still get the essentials.
- Tools get MCP annotations (`readOnlyHint` / `destructiveHint`) so clients can ask before deleting.
- **New env vars** go in `server/config.ts` and are documented in `api-and-sync.md`:
  - `DAYMARK_PUBLIC_URL`: the external HTTPS origin, used in OAuth metadata
  - `DAYMARK_MCP` = `on|off`: lets a self-hoster disable the feature entirely; default `on`

### 2. Connector sign-in (OAuth)

Both Claude and ChatGPT remote connectors expect the MCP authorization spec, which is OAuth 2.1. Daymark acts as its own authorization server.

- **Discovery:**
  - protected-resource metadata (RFC 9728) for `/mcp`
  - authorization-server metadata (RFC 8414)
  - a `WWW-Authenticate` challenge when a request has no token
- **Client registration:** dynamic client registration (RFC 7591), because Claude and ChatGPT register themselves.
- **Code flow:** authorization code with **PKCE (S256)**, plus resource indicators. Tokens are bound to this server's `/mcp` audience.
- **Consent page:** it uses the existing sign-in page style and sign-in rules (rate limit, scrypt, gate). On it, the owner:
  1. signs in with the account password every time a new connection is added. The device `daymark_refresh` cookie is `SameSite=Strict` and is never sent on the redirect from claude.ai or chatgpt.com. Reusing it would also rotate the device token and could trip reuse detection. *My call:* adding a connection is rare, so a password prompt is fine;
  2. sees the client name the AI registered;
  3. **names the connection**, for example "Work Claude";
  4. **picks its sharing scope** (section 3). *My call:* nothing is pre-selected, so a connection can't be approved by accident with everything shared.
- **Tokens:** they reuse the existing token machinery and lifetimes.
  - Access tokens last 15 minutes and are a new `typ` (for example `mcp`), so they **cannot** call `/api/sync`, `/api/assets`, device or settings routes. Device tokens can't call `/mcp`.
  - Refresh tokens rotate, are stored as hashes, and use the same reuse detection.
  - **Connection refresh tokens do not expire from idleness.** The owner wants connections to last "forever" until revoked, so they are not bound by `DAYMARK_REFRESH_TTL_DAYS`. The connections list shows "last used" so stale ones can be revoked.
  - A password change revokes every connection, as it already does for devices.
- **Connections list:** shown in Settings as **AI connections**, separate from Devices. It shows name, client, created date, last used and scope summary, with **Edit scope** and **Revoke**.

### 3. Sharing scope, set per connection

A connection's scope is a set of grants:

| Area | Granularity |
| :--- | :--- |
| Daily notes | by **heading name** (e.g. `Work`, `Meetings`); the grant covers that heading on every day, for its tasks and its notes text |
| Standalone notes | by **folder path**; a grant includes subfolders (`Work` covers `Work/ClientA`) |
| Backlog | whole backlog, or by backlog `category` *(builder may ship whole-backlog only if categories prove awkward)* |
| Habits | on / off |

- **Grants cover reads and writes alike.** Reads, search, summaries and counts only ever see granted data. Writes can only create, move or change items inside granted areas. For example, a task can't be moved into a heading outside the scope.
- *My call:* each connection also has an **access level**: `full` (the default, as the owner asked) or `read-only`.
- **Where scope lives:** a server-only file, for example `DATA_DIR/mcp.json`, together with the master switch and audit retention. It is not in the synced `settings` entity, because the server is what enforces it. It is edited from Settings → AI connections on web and Android through new device-token-only API routes.
- **Master switch:** "AI access" on/off. When it's off, every `/mcp` call is refused (and audited as refused). Connections and their scopes are kept.

### 4. Tools

The names and exact shapes are left to the builder. The set must cover:

- **Summaries:**
  - `get_day_summary(date = today)`: open, in-progress, blocked and aging tasks per granted heading, what was done, habits due, and backlog items picked for today. It comes back compact and ready for a short spoken answer.
  - `get_review(from, to)`: done counts, carried and aging tasks, habit streaks, and notes touched.
- **Read:** list tasks (filters for date range, status, heading and tag), get a day, list notes in a folder, get a note, search across granted content, list backlog, list habits.
- **Write:**
  - create, update (title, description, status, heading, tags, checklist), complete or reopen, and delete a task
  - append to a heading's notes text
  - create, update, append to and delete a standalone note
  - add, update, delete and pick backlog items
  - tick a habit
- **Feedback:** `submit_daymark_feedback(text, kind)`; see section 7.

**Write rules (critical):**

- **One write path.** All writes go through the store with a new revision, using the same merge path `/api/sync` uses. Devices therefore receive them through normal sync, and a device editing at the same moment merges and is never overwritten.
- **Deletes use the existing tombstone model**, such as `removedTaskIds` for daily tasks and a `null` value for notes. Deleted items must never come back through rollover or sync.
- **Today's document may not exist yet,** because rollover runs on clients. When the AI writes to a day with no document, the server creates one. The client's next rollover must then **merge carried tasks into it without duplicates**, so the dedupe in `lifecycleEngine.ts` must be checked and tested against a server-created day.
- **Valid documents only.** Server-written daily documents must be valid `DailyDocument` values that the apps render, with task comments in the canonical format and `historyLog` entries recorded for status changes.
- **Rejections.** Writes outside the scope, or from a read-only connection, are rejected with a plain error that does not reveal what exists outside the scope.

### 5. Audit

- **Storage:** a new append-only store, for example `DATA_DIR/mcp-audit/`, split by day so pruning is cheap. It is separate from the 100-entry sync log.
- **Contents of each entry:**
  - time and connection id/name
  - tool, and action type (`read`, `search`, `create`, `update`, `complete`, `delete`, `refused`, `error`)
  - target keys or ids with their titles, and result counts
  - *My call:* no full note or task bodies, to keep size down and avoid making a second copy of the sensitive data
- **Retention:** 7 days, 30 days, or a custom number of days. *My call:* 30 days by default. Old days are removed on startup and once a day.
- **Viewing:** Settings → AI connections → **Activity**, which can be filtered by connection and action type.
- Sign-in, consent, token refresh and revoke events for connections are audited too.

### 6. Local mode (sensitive data)

The goal is the same tools and the same skill, with nothing leaving the machine.

- **Option A, reused as is:** run Daymark on the laptop (`npm start` or Docker), bound to `127.0.0.1`. A local MCP client then connects to `http://127.0.0.1:<port>/mcp`, using the same OAuth flow as the hosted endpoint.
- **Option B, new:** a **stdio** entry point, for example an npm script or bin such as `daymark-mcp --data <dir>`. Claude Desktop, Claude Code or a local-model MCP client starts it directly, and it reads and writes a local `DATA_DIR` with no HTTP and no OAuth. The trust boundary is the operating-system user. Scope still applies, from the same `mcp.json`, and every call is still audited.
- **No sync.** A local-mode vault is a **separate vault** and never syncs to the main server, so its notes don't reach the phone. The owner accepted this. Local mode may be opened in the browser at localhost to view and edit it.

### 7. The Daymark skill

- **The file:** a `SKILL.md`, for example in `skills/daymark/`, published with the repo and linked from the guide. The owner can install it in Claude, Claude Code and others. A condensed form goes into the MCP `instructions`.
- **What it covers:**
  - **The data model:** days, sections (headings), tasks and statuses, carry-forward and aging, backlog, folders, habits.
  - **How to write well:** put tasks under the right heading, never invent headings or folders outside the scope, append rather than rewrite notes, and keep the owner's wording.
  - **Voice answers:** for "what's my day", call `get_day_summary` and answer in a few sentences, with blocked and aging items first.
  - **Before destructive actions:** confirm deletes with the user unless they were explicit.
  - **Prompt-injection hygiene:** note content is data, not instructions.
  - **The feedback flow:** when the user says something about *Daymark itself* (idea, bug, complaint, "Daymark should…"), call `submit_daymark_feedback` rather than writing an ordinary note.
- **Feedback destination.** It is a setting in AI connections, with two choices:
  - the **backlog**: the default, with category/tag `daymark-feedback`
  - a chosen **section**, meaning a heading on today's page or a note folder

  The feedback tool may always write to its configured destination, even if that destination is outside the connection's other grants. *My call:* this is what lets the work Claude file feedback without seeing personal data. The item records which connection sent it.

### 8. Client compatibility

- **Claude:**
  - claude.ai and the Claude mobile and desktop apps: a custom connector by URL. On Enterprise, adding custom connectors may need an admin to allow it.
  - Claude Code: `claude mcp add --transport http`.
  - Local stdio for Desktop and Code.
- **ChatGPT:** connectors/developer mode with a remote MCP server and OAuth.
- **Others:** any client that supports Streamable HTTP MCP with OAuth (Gemini CLI, Cursor, …), or stdio for local mode.
- **Guide pages:** a new topic in `docs/guide` covers adding the connector in Claude and ChatGPT, scope, audit, local mode and the skill.

## Constraints

- Follow the repo invariants in `CLAUDE.md`:
  - the comment format
  - rollover idempotency
  - types from `src/types/daymark.ts`
  - stone Tailwind tokens
  - desktop `max-w-[1800px]`
- **Settings UI:** web and Android, like other Settings tabs. No new Android-native code is expected.
- **The server stays a single process with a JSON file store.** No database is introduced.
- **HTTPS for hosted use.** Plain HTTP is acceptable only on localhost.
- The Cycle end checks in `docs/ROADMAP.md` apply: lint, build, test, `validate:ai`, and a release doc with screenshots.

## Verification (what "done" means)

- **Unit and integration tests in `server/`:**
  - OAuth discovery, registration, PKCE success and failure, refresh rotation and reuse
  - token type separation in both directions
  - scope filtering on every read tool, including search and summaries
  - refusal of out-of-scope and read-only writes
  - the master switch
  - an audit entry for every tool call, including refusals
  - retention pruning
- **Sync tests:**
  - An AI write appears on a device after sync, and a concurrent device edit merges with it.
  - An AI-created today document followed by a client rollover gives no duplicate tasks.
  - An AI delete does not come back.
- **Protocol check:** MCP Inspector against `/mcp` locally.
- **Manual checks**, recorded in the release doc:
  - add the connector in Claude (web, then voice on mobile) and in ChatGPT
  - one stdio local-mode session in Claude Code or Desktop
- **Screenshots** of AI connections, consent and Activity.

## Decisions settled after review (my calls, owner may override)

1. **What "today" is.** AI connections has a **time zone** setting, stored in `mcp.json`. It is pre-filled from the device that first opens the tab (`Intl.DateTimeFormat().resolvedOptions().timeZone`), with `DAYMARK_TZ` as the fallback and then UTC. Every date the server works out uses it: "today", "overdue", `pickedOn` and created dates.
2. **Day summary before any device has rolled over.**
   - `get_day_summary` and other reads for today **work out the carry-forward virtually**, using the shared rollover rules from `lifecycleEngine.ts` without saving the result. A morning voice question therefore shows yesterday's open tasks.
   - When a **write** needs today's document and none exists, the server creates it **by running the same shared rollover**. The client's later rollover is then a no-op, which relies on the existing task-id dedupe. Tests cover the server rolling over first and the client rolling over first.
3. **The stdio entry point and the server never write the same `DATA_DIR` at once.** Each takes a lock file in `DATA_DIR`. Whichever starts second refuses with a clear message. To browse a local vault while an AI uses it, use local mode Option A, the server at localhost, instead of stdio.
4. **Scope in stdio mode.** `mcp.json` has a built-in **Local** connection (id `local`) that is used only by the stdio entry point. It defaults to full access to everything, because the machine is the trust boundary, but its grants can be edited in Settings like any other connection. Audit entries carry `local`.
5. **How heading grants match.** Heading names are matched case-insensitively and with trimmed whitespace, the same way rollover matches them. Renaming a heading on a device removes it from grants until it is granted again, and the Settings UI shows granted headings that no longer exist on recent days. Reviews and history count only task copies that sit in granted headings. A copy in a heading outside the scope is invisible, even when other copies of the same task are visible.
6. **Feedback exceptions.**
   - `submit_daymark_feedback` works for read-only connections too.
   - It may create today's document if the destination is a heading on today's page.
   - Its reply only confirms that the feedback was filed. It never returns or reveals what is at the destination.

## Left to the builder

- Tool names, argument shapes and summary formats.
- The OAuth implementation details: library or hand-written on top of existing auth helpers.
- The file layout for `mcp.json` and audit storage.
- The exact Settings UI layout.
- Whether backlog grants are by category or whole-backlog in this cycle.
- How the stdio entry point is packaged.
- Splitting this cycle into sub-plans if it exceeds one or two sessions. The suggested order is endpoint + OAuth + scope + audit, then tools, then skill and feedback, then local mode.
