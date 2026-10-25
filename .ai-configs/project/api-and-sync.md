# Daymark REST API & Sync Protocol

Self-hosted server: `server.ts` (entry) + `server/` (config, auth, file store, API) sharing the merge code in `src/sync/`.

---

## 1. Configuration (environment variables)

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `PORT` | `3000` | HTTP port |
| `DAYMARK_TRUST_PROXY` | `loopback` | Express `trust proxy` range/list; behind a reverse proxy in Docker set e.g. `uniquelocal` and bind the published port to `127.0.0.1` (example below). Controls HTTPS detection and per-client rate-limit IPs. |
| `DATA_DIR` | `./data` (`/data` in Docker) | `auth.json`, `vault.json`, `devices.json`, `sync-log.json`, picture bytes and metadata in `assets/` |
| `DAYMARK_USER` | `admin` | Account name |
| `DAYMARK_PASSWORD` | dev: `daymark-dev`; production: **required on first start** | Creates the account (stored scrypt-hashed). Ignored once `auth.json` exists. 8+ chars, known defaults refused. Reset: stop the server, delete `DATA_DIR/auth.json` and restart with a password; account recreation revokes all devices and clears refresh hashes, preserving the vault. |
| `DAYMARK_CORS_ORIGINS` | `*` | Origins allowed to call the API; does not enable cross-origin browser sign-in or credentialed CORS |
| `DAYMARK_REFRESH_TTL_DAYS` | `30` | Refresh token lifetime in days, reset on each refresh. Replaces `DAYMARK_TOKEN_TTL_DAYS`; access tokens always last 900 seconds (15 minutes). Use a positive, finite number; invalid or ≤ 0 values fall back to 30. |
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
- Merge rules: one side changed → take it; both the same → take it; delete vs edit → keep the edit. Both edited: daily notes merge task by task (same task on both → incoming wins), heading notes text keeps both versions with a separator, standalone notes keep the server copy and add an incoming "(conflict copy)", settings → incoming wins. Every both-edited case is reported in `conflicts` and shown to the user.
- Triggers (`src/hooks/useSync.ts`): app start, 2.5 s after any local change, coming online, returning to the foreground, every 60 s. The token manager refreshes expired access tokens and retries; a session-ended response stops sync. Server web clients wipe their local vault and return to sign-in; Android clears credentials and keeps its notes.

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
- Backup: copy all of `DATA_DIR` (JSON files and the picture `assets/` directory) while the server is stopped, or export a vault ZIP from any device.
