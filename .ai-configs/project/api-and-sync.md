# Daymark REST API & Sync Protocol

Self-hosted server: `server.ts` (entry) + `server/` (config, auth, file store, API) sharing the merge code in `src/sync/`.

## Cycle 10 backlog capability

Clients negotiate the `backlog` entity with `features: ['habits', 'backlog']` in `/api/sync` requests. The record is `{ items: BacklogItem[] }`; item-id merges retain independent additions and use `updatedAt` for true conflicts. Clients without the backlog feature never receive it. New clients retry without an unsupported entity when an older server rejects its key and remember that capability for the session.

Clients negotiate the `notemeta` entity with `'notemeta'` in the same `features` array. The record is `{ folders: NoteFolder[], dismissed: DismissedPair[] }`: synced empty folders (live or `removed` tombstones) and the pairs the user marked **Not related** (`restored: true` brings a suggestion back). Folder paths themselves travel in each note's `folder` string (`Tech/Java`), so notes never need the entity to appear in the right folder; an older client shows the path as one flat folder name and loses nothing. Requests that write `notemeta` without the feature are rejected with 400 and pulls omit the entity for clients without it. See `src/utils/noteFolders.ts` and `src/utils/noteRelated.ts`.

The first backlog-capable sync pulls from revision zero until `backlogSynced`. A damaged local backlog clears its sync base bookkeeping instead of pushing an empty deletion. Merges retain park/pick history even when another item's payload wins by timestamp. Genuine picks stay open; stale offline copies predating the latest park are closed with their fields and journal notes intact. No task or document is deleted by reconciliation. This closure protection also covers legacy document pushes without exposing or allowing them to change the backlog entity. Concurrent genuine picks onto different dates retain one same-id copy per picked date, following the normal carried-copy model. A repeated local pick is a no-op. Moving an open carried task uses its latest open copy and closes earlier copies with `moved_to_backlog` metadata.

Undo of a move to Backlog appends a cancellation targeting the park event, retained by history merges in both the backlog record and restored daily task. Reconciliation ignores canceled parks. First-sync daily deletion protection recognizes a same-day cancellation at or after the removal document timestamp as explicit restoration; older cancellations do not override later ordinary deletions.

---

## 1. Configuration (environment variables)

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `PORT` | `3000` | HTTP port |
| `DAYMARK_TRUST_PROXY` | `loopback` | Express `trust proxy` range/list; behind a reverse proxy in Docker set e.g. `uniquelocal` and bind the published port to `127.0.0.1` (example below). Controls HTTPS detection and per-client rate-limit IPs. |
| `DATA_DIR` | `./data` (`/data` in Docker) | `auth.json`, `vault.json`, `devices.json`, `sync-log.json`, picture bytes and metadata in `assets/`, MCP state in `mcp.json` and activity in `mcp-audit/` |
| `DAYMARK_USER` | `admin` | Account name |
| `DAYMARK_PASSWORD` | dev: `daymark-dev`; production: **required on first start** | Creates the account (stored scrypt-hashed). Ignored once `auth.json` exists. 8+ chars, known defaults refused. Reset: stop the server, delete `DATA_DIR/auth.json` and restart with a password; account recreation revokes all devices and clears refresh hashes, preserving the vault. |
| `DAYMARK_CORS_ORIGINS` | `*` | Origins allowed to call the API; does not enable cross-origin browser sign-in or credentialed CORS |
| `DAYMARK_REFRESH_TTL_DAYS` | `30` | Refresh token lifetime in days, reset on each refresh. Replaces `DAYMARK_TOKEN_TTL_DAYS`; access tokens always last 900 seconds (15 minutes). Use a positive, finite number; invalid or ≤ 0 values fall back to 30. |
| `DAYMARK_PUBLIC_URL` | dev: `http://localhost:<PORT>`; production: unset | External origin, without trailing slashes, used for MCP OAuth discovery and Connector address. Set an HTTPS origin for hosted use; HTTP is for localhost. If absent in production, the MCP/OAuth endpoint is not mounted. |
| `DAYMARK_MCP` | `on` | `off` (case-insensitive) prevents mounting hosted MCP/OAuth routes. Other values enable them when a public URL exists. Separate from the persisted AI access switch. |
| `DAYMARK_TZ` | unset | Valid IANA time zone fallback for MCP dates. Saved `mcp.json` time zone wins, then this value, then UTC. The AI connections tab adopts the first device's zone when the saved value is empty. |
| `NODE_ENV` / `--production` | dev | Production serves `dist/` (`npm start` passes `--production`) |

## 2. Authentication and site gate
- `POST /api/auth/login` accepts `{ username, password, deviceName, platform, installId? }` and returns `{ accessToken, expiresIn, username, device }`. `expiresIn` is 900 seconds and `device` contains `id` and `name`. Each login registers a **device**; a valid stable `installId` reuses its active entry.
- Web clients send `X-Daymark-Client: web` on login, refresh and logout. Login/refresh set the `daymark_refresh` cookie (`HttpOnly`, `SameSite=Strict`, path `/`) and the readable `daymark_signed_in` marker. Cookies are `Secure` when Express sees HTTPS, including through a proxy trusted by `DAYMARK_TRUST_PROXY` (default `loopback`). Plain HTTP is for LAN only because its cookie is not `Secure`; use HTTPS (e.g. Caddy) on a public address.
- Android omits the web header, receives `refreshToken` in the login/refresh response, stores it in app storage and sends `{ refreshToken }` in the body for refresh/logout. Access tokens stay in memory on both platforms.
- `POST /api/auth/refresh` accepts the refresh cookie for web clients or the body credential for Android. It returns a new access token and rotates the refresh token, extending its expiry by 30 days by default. Only refresh hashes are stored on the server. Reusing a retained retired token revokes that device's whole session and records `refresh_reuse` in the sync log. Detection has no grace window; a lost refresh response can require signing in again. Browser tabs coordinate refresh using Web Locks or a localStorage lease, with BroadcastChannel token sharing.
- `POST /api/auth/logout` uses the same refresh credentials, revokes the device session when valid, clears both cookies only for web-header requests and returns `{ ok: true }`.
- Except for `/api/health`, login, refresh and logout (and CORS preflight), all `/api/*` routes require `Authorization: Bearer <accessToken>`. Data routes are **Bearer-only**: a refresh cookie alone cannot read or change a vault.
- Access tokens use `base64url(payload).HMAC-SHA256` with `{ typ: 'access', sub, did, ver, exp }`. They are rejected when expired, when the device is revoked, or when the account token version differs. Changing the password bumps that version and revokes all devices, including the caller.
- Failed logins are rate-limited per IP (10 per 15 min → 429).
- The site gate (`server/gate.ts`) checks the refresh cookie before serving HTML navigation in development and production. Signed-out navigation returns the standalone **Sign in** page with status 401, `Cache-Control: no-store` and `X-Daymark-Sign-In: 1`; `/signin.html` can be opened directly and redirects signed-in visitors to `/`. App code files stay public but contain no user data. `/api/health` stays public.
- After upgrading, every device signs in once more: legacy 90-day tokens are not accepted. `DAYMARK_TOKEN_TTL_DAYS` is no longer read.

## 3. Endpoints

| Method | Path | Purpose |
| :--- | :--- | :--- |
| GET | `/api/health` | `{ status, service, version }` (no account details) |
| POST | `/api/auth/login` | Sign in a device |
| POST | `/api/auth/refresh` | Rotate refresh credentials and issue an access token |
| POST | `/api/auth/logout` | Revoke this device session and clear cookies; `{ ok: true }` |
| GET | `/api/auth/session` | Current account and device |
| POST | `/api/auth/change-password` | `{ currentPassword, newPassword }` → `{ ok: true }`; every device signed out, including the caller |
| GET | `/api/devices` | Connected devices (`current` marks the caller) |
| DELETE | `/api/devices/:id` | Revoke a device's session; on learning this, web wipes its local copy and Android keeps its notes |
| GET | `/api/server/stats` | Counts, last sync, version |
| GET | `/api/sync/log` | Last 100 audit entries |
| POST | `/api/sync` | Push changes and pull everything newer (below) |
| GET | `/api/sync?since=<rev>` | Pull only |
| GET | `/api/assets` | List saved picture metadata |
| GET | `/api/assets/:id` | Download picture bytes with their image Content-Type |
| PUT | `/api/assets/:id` | Upload `{ mime, data }`, where `data` is base64 picture bytes |
| DELETE | `/api/assets/:id` | Explicitly remove picture bytes and metadata |

### Picture assets

- Every `/api/assets` route requires `Authorization: Bearer <accessToken>` and a valid device session, just like the other protected data routes. A refresh cookie alone is insufficient. Responses use `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`.
- `:id` is the lowercase, 64-character SHA-256 hex digest of the decoded picture bytes, without a file extension. PUT verifies the digest and requires nonempty, canonical base64. Allowed MIME types are `image/webp`, `image/jpeg` and `image/png`.
- The decoded upload cap is **1.5 MB** (`1.5 * 1024 * 1024` = 1,572,864 bytes). Oversize uploads return 413; invalid ids, MIME types, base64 or digest mismatches return 400. Missing downloads return 404.
- GET list returns an array of `NoteAssetMeta` objects: `{ id, mime, width, height, bytes, createdAt }`. Server uploads record width/height as 0; clients can determine dimensions after downloading. Missing or damaged metadata entries are skipped so other pictures can still be listed.
- PUT and DELETE return `{ ok: true }`. Repeated PUTs of the same bytes preserve the original metadata; deleting an absent valid id succeeds. Files live under `DATA_DIR/assets/` as `<id>` bytes and `<id>.json` metadata. Include this directory in server backups.
- Picture bytes **never go through `/api/sync`**. Standalone notes sync their Markdown references as text; after successful note sync, `syncNoteAssets` uploads pending pictures and downloads missing referenced pictures separately. Downloads are hash-verified locally. Network failures leave pending work or placeholders for a later round rather than failing note-text sync.
- Update the server first. Devices on **1.6.0 or later** sync pictures; older apps keep syncing notes text and show picture links as text. There is no picture entity or picture feature flag in the JSON sync protocol, and no automatic picture deletion.

## 4. Sync protocol
- Entities: `doc:<YYYY-MM-DD>` (daily note), `note:<id>` (standalone note), `settings` (synced settings, excluding the device-local `syncConfig` and `simulatedToday`).
- The server keeps a global revision counter; each entity stores the `rev` of its last change and its value (`null` = deleted tombstone).
- Client keeps per-entity **bases**: the last version agreed with the server (`SyncState.bases`, stored in IndexedDB as `sync_state`).
- Request: `{ sinceRev, changes: [{ key, base, value }] }` for every entity whose current value differs from its base (new, edited, or deleted = `value: null`).
- Server: for each change, `merged = merge3(base, serverCurrent, incoming)` (`src/sync/merge.ts`); stores it with a new rev if it differs. Requests are serialized.
- Response: `{ rev, entities: [{ key, rev, value }], conflicts: [...] }` = everything with rev > sinceRev plus the merged result of every pushed key.
- Client applies each returned entity to its vault *as it is now*: unchanged since the request → take the server value; edited meanwhile → merge again with the sent snapshot as base (kept and pushed next round). Bases and `lastRev` are updated.
- Merge rules: one side changed → take it; both the same → take it; delete vs edit → keep the edit. Both edited: daily notes merge task by task; the same task edited on both merges field by field (completion fields as one group, history unioned) and only a field changed on both sides takes the incoming value. Without a base, a task that is the other side's rollover copy plus later history wins over that stale carry. After each pull the client drops carried copies made from stale data (still open, untouched since the carry, while their source copy was closed before the carry day began; `dropStaleCarries` in `src/utils/lifecycleEngine.ts`), so a device that rolled over before syncing cannot reopen a task finished elsewhere. heading notes text keeps both versions with a separator, standalone notes keep the server copy and add an incoming "(conflict copy)", settings → incoming wins. Every both-edited case is reported in `conflicts` and shown to the user.
- Triggers (`src/hooks/useSync.ts`): app start, 2.5 s after any local change, coming online, returning to the foreground, every 60 s. When the day changes (or the app opens on a new day) with sync on, the automatic rollover waits for one sync round, up to 8 s (`src/utils/syncBeforeRollover.ts`), so tasks finished elsewhere are not carried; offline or failed syncs roll over after the wait. The token manager refreshes expired access tokens and retries; a session-ended response stops sync. Server web clients wipe their local vault and return to sign-in; Android clears credentials and keeps its notes.

## 5. Clients
- Same-origin web/PWA: sign in at the server address, then sync automatically against that origin. No local-only choice or server-address field. A signed-in PWA can edit its local copy offline and sync when back online.
- A web build hosted on another origin is **local-only**, with no sign-in or sync. Move notes using **Backup & restore**. CORS configuration does not change this app mode.
- Android: the welcome screen offers **Sign in to sync** or local use (**Start fresh**, the current button label). Sign-in opens Settings → Sync for server address, username, password and device name, then **Connect and sync**. Local users can connect later; existing local data merges on first sync. Native HTTP supports LAN servers over `http://`; use HTTPS on a public address.
- Web **Settings → Sync → Sign out** first syncs. Failed sync or unsent changes opens **Sign out?**, showing the number of changes that would be deleted, with **Cancel** and **Sign out anyway**. Confirmed sign-out revokes the session, clears the vault in IndexedDB and its localStorage fallback, sync state, Daymark localStorage keys and service-worker caches, then returns to sign-in. If logout cannot reach the server, it records a pending logout for retry before showing the sign-in form.
- Android **Disconnect this device** stops syncing and keeps the local copy. Remote sign-out and password changes wipe the browser copy when it next receives a session-ended response, without the unsent-change confirmation; Android keeps its local notes.

## 6. Deployment
- Behind Docker + a host reverse proxy such as Caddy, trust the private proxy hop and prevent direct public access to the upstream port. Replace the default port mapping with this configuration, then proxy HTTPS traffic to `127.0.0.1:3000`. Restrict the trusted ranges to your deployment's proxy network:

  ```yaml
  services:
    daymark:
      ports:
        - "127.0.0.1:3000:3000"
      environment:
        DAYMARK_TRUST_PROXY: uniquelocal
  ```

- Docker: `DAYMARK_PASSWORD='…' docker compose up -d` (see `Dockerfile`, `docker-compose.yml`); data in `./data`; health check on `/api/health`; runs as the `node` user.
- Bare Node: `npm ci && npm run build && DAYMARK_PASSWORD='…' npm start`.
- Backup: stop the server/stdio process and copy all of `DATA_DIR`, including JSON files, picture `assets/`, **`mcp.json` and `mcp-audit/`**. A device vault ZIP exports content, not server OAuth credentials, connection settings or AI activity; it does not replace this server backup.

## 7. AI connections (Cycle 19 MCP)

The existing server exposes stateless Streamable HTTP MCP at `/mcp`, outside the HTML site gate. It shares the vault revision queue with sync: tool writes validate entities and use `writeEntity` plus backlog reconciliation, so devices receive them on their next normal sync. Daily views use shared rollover rules; deletes retain normal tombstones. No separate chatbot or database is introduced. Setup: [AI connections guide](../../docs/guide/ai-connections.md), [client skill](../../skills/daymark/SKILL.md).

### Protocol and OAuth routes

| Method | Path | Purpose |
| :--- | :--- | :--- |
| POST | `/mcp` | MCP JSON-RPC, with a connection bearer token; missing/invalid credentials receive 401 and a resource-metadata challenge. GET and DELETE return 405. |
| GET | `/.well-known/oauth-protected-resource/mcp` | Protected-resource metadata for `/mcp` |
| GET | `/.well-known/oauth-authorization-server` | OAuth discovery |
| POST | `/register` | Dynamic client registration |
| GET | `/authorize` | Authorization-code flow with PKCE S256; renders Daymark's password and scope consent page |
| POST | `/oauth/consent` | Password verification, connection creation, redirect with a single-use code |
| POST | `/token` | Exchange a code or rotate a connection refresh token |
| POST | `/revoke` | Revoke the client's connection token |

OAuth routes are mounted only when `DAYMARK_MCP` is enabled and `DAYMARK_PUBLIC_URL` resolves. Consent requires the account password for each new connection, independently of a device's refresh cookie. The SDK supplies protocol validation and PKCE. Pending sign-in requests and codes expire after 10 minutes and are held in memory; restarting requires starting consent again. Failed consent passwords are rate-limited per IP, and a failed attempt never renders the scope step. The consent POST creates the connection as `pending` (hidden from `/api/mcp`, authorizes nothing); it becomes active when its code is exchanged and is dropped after 10 minutes or on restart. The first PKCE lookup consumes the code, so a wrong `code_verifier` burns it; a `resource` at `/token` must be `<publicUrl>/mcp`. Each client id may hold 5 pending authorize requests (200 overall). Dynamic client registrations with no connection are pruned after 24 hours and capped at 200.

Device access tokens have `typ: 'access'` and `{ sub, did, ver, exp }`; MCP access tokens have `typ: 'mcp'` and `{ cid, ver, exp }`, with a 900-second lifetime. The token types are rejected in the opposite API: device tokens cannot call `/mcp`, and MCP tokens cannot call `/api/*`. OAuth metadata advertises this server's `/mcp` resource. MCP refresh tokens are stored only as hashes, rotate on refresh, and have **no idle expiry** (`DAYMARK_REFRESH_TTL_DAYS` applies only to devices). Reuse of a retained retired refresh hash revokes the connection. Password changes revoke hosted connections and invalidate old MCP access tokens through the account version. The built-in Local stdio connection remains an OS-user trust boundary.

### Device-only administration

These routes require a signed-in device bearer token, even when hosted MCP is disabled. Returned connection summaries omit OAuth credentials and hashes.

| Method | Path | Purpose |
| :--- | :--- | :--- |
| GET | `/api/mcp` | Settings, active connections, known headings/folders and connector endpoint (empty when unavailable) |
| PUT | `/api/mcp/settings` | Partial update of `enabled`, `timezone`, `auditRetentionDays` (integer 1–365), `feedback` |
| PUT | `/api/mcp/connections/:id` | Partial update of `name`, `access` (`full` / `read-only`) and `grants` |
| DELETE | `/api/mcp/connections/:id` | Revoke a hosted connection; `local` cannot be revoked |
| GET | `/api/mcp/audit` | Newest entries first; optional `connectionId`, `action`, `limit` (default 200, capped at 1000) |

Grants are `{ all, headings, folders, backlog, habits }`. Headings match after trimming and case folding on every date; folder paths match exactly or as an ancestor of subfolders (the empty root grant covers only root notes). Backlog and habits are whole-area grants. Read/search/review results are scoped before returning content or counts. Ordinary writes require full access and grants for both source and destination when moving. Unshared/missing items return the same generic error. The master `enabled` switch answers every `/mcp` call with HTTP 200 and JSON-RPC error -32000 ("AI access is turned off in Daymark."), audited at most once a minute per connection, without deleting connections; folder inputs are normalized and `.`/`..` segments are refused; MCP cannot change it, scope, retention or connection management.

### Tools and feedback

| Area | Registered tools |
| :--- | :--- |
| Connection | `ping` |
| Day and search | `get_day_summary`, `get_review`, `get_day`, `list_tasks`, `search` |
| Tasks and section notes | `create_task`, `update_task`, `complete_task`, `reopen_task`, `delete_task`, `append_section_notes` |
| Standalone notes | `list_notes`, `get_note`, `create_note`, `update_note`, `append_note`, `delete_note` |
| Note folders | `list_folders`, `create_folder`, `rename_folder`, `delete_folder` |
| Backlog | `list_backlog`, `add_backlog_item`, `update_backlog_item`, `delete_backlog_item`, `pick_backlog_item` |
| Habits | `list_habits`, `tick_habit` |
| App feedback | `submit_daymark_feedback` |

`get_day_summary` defaults to today and includes a compact `spoken` answer. `get_review` accepts at most 92 inclusive days. `list_tasks` returns up to 200 and `search` up to 50. Folder tools reuse the app's `noteFolders` operations on the `notemeta` entity and match paths case-insensitively. `delete_folder` never deletes notes: they move to the parent folder, so it needs write grants on the folder and its parent; `rename_folder` needs both paths. Picking a backlog item targets today and requires the backlog and destination heading grants. Feedback accepts `text` (1–4000 characters) and `kind` (`idea`, `bug`, `complaint`, `other`). It writes to the configured backlog (category `Daymark feedback`), today's heading, or a note folder, tagged `daymark-feedback` and attributed to the submitting connection. This submission-only exception works for read-only connections and destinations outside their grants; the result is only `{ filed: true }` and never grants read access.

### Persistence, activity and local mode

`DATA_DIR/mcp.json` holds settings, connections, client registrations and refresh hashes, separately from synced settings; writes use a serialized temp-file rename and mode `0o600`. Activity is appended to `DATA_DIR/mcp-audit/YYYY-MM-DD.jsonl` (UTC day files, mode `0o600`). Entries record connection, tool/action, target keys and optional titles/counts, without credentials or note/task bodies. Tool reads, writes, refused calls and errors are audited, as are successful connect/refresh/revoke events. Invalid bearer requests rejected before dispatch do not reach the tool audit wrapper. Audit write failures are logged; they do not roll back completed writes, but read-only tools return an error instead of data. Retention defaults to 30 days; the HTTP server prunes on startup and every 24 hours. Stdio appends activity but does not schedule retention pruning.

Option A runs the regular server with network access restricted to loopback and a localhost public URL, using OAuth and a browser against the same local vault. Option B runs `npm run mcp:stdio -- --data <folder>` (entry: `server/mcp-stdio.ts`), with no HTTP/OAuth. `--data` overrides `DATA_DIR`, default `./data`; `--timezone` overrides `DAYMARK_TZ` as the fallback beneath the saved zone. Stdio creates the built-in `local` connection, initially full access to everything; the same master switch, scopes and audit wrapper apply. Both server and stdio take a directory lock and refuse simultaneous ownership. Stop stdio before opening the same folder with the server to edit Local grants. Use a separate vault for local-only work; it never syncs to the hosted vault/phone. A cloud AI client can still transmit tool results to its provider.
