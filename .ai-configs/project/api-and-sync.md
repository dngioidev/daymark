# Daymark REST API & Sync Protocol

Self-hosted server: `server.ts` (entry) + `server/` (config, auth, file store, API) sharing the merge code in `src/sync/`.

---

## 1. Configuration (environment variables)

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `PORT` | `3000` | HTTP port |
| `DATA_DIR` | `./data` (`/data` in Docker) | `auth.json`, `vault.json`, `devices.json`, `sync-log.json` |
| `DAYMARK_USER` | `admin` | Account name |
| `DAYMARK_PASSWORD` | dev: `daymark-dev`; production: **required on first start** | Creates the account (stored scrypt-hashed). Ignored once `auth.json` exists. 8+ chars, known defaults refused. Reset: stop the server, delete `DATA_DIR/auth.json`. |
| `DAYMARK_CORS_ORIGINS` | `*` | Origins allowed to call the API (bearer auth, no cookies) |
| `DAYMARK_TOKEN_TTL_DAYS` | `90` | Device token lifetime |
| `NODE_ENV` / `--production` | dev | Production serves `dist/` (`npm start` passes `--production`) |

## 2. Authentication
- `POST /api/auth/login` `{ username, password, deviceName, platform }` → `{ token, username, device }`. Each login registers a **device**.
- Every other `/api/*` route (except `/api/health`) needs `Authorization: Bearer <token>`.
- Tokens: `base64url(payload).HMAC-SHA256` with `{ sub, did, ver, exp }`. Rejected when expired, when the device is disconnected, or when `ver` ≠ the account's token version (changing the password bumps it and signs out every device).
- Failed logins are rate-limited per IP (10 per 15 min → 429).

## 3. Endpoints

| Method | Path | Purpose |
| :--- | :--- | :--- |
| GET | `/api/health` | `{ status, service, version }` (no account details) |
| POST | `/api/auth/login` | Sign in a device |
| GET | `/api/auth/session` | Current account and device |
| POST | `/api/auth/change-password` | `{ currentPassword, newPassword }` → new token for this device; all others signed out |
| GET | `/api/devices` | Connected devices (`current` marks the caller) |
| DELETE | `/api/devices/:id` | Disconnect a device (revokes its token; its local data is untouched) |
| GET | `/api/server/stats` | Counts, last sync, version |
| GET | `/api/sync/log` | Last 100 audit entries |
| POST | `/api/sync` | Push changes and pull everything newer (below) |
| GET | `/api/sync?since=<rev>` | Pull only |

## 4. Sync protocol
- Entities: `doc:<YYYY-MM-DD>` (daily note), `note:<id>` (standalone note), `settings` (synced settings, excluding the device-local `syncConfig` and `simulatedToday`).
- The server keeps a global revision counter; each entity stores the `rev` of its last change and its value (`null` = deleted tombstone).
- Client keeps per-entity **bases**: the last version agreed with the server (`SyncState.bases`, stored in IndexedDB as `sync_state`).
- Request: `{ sinceRev, changes: [{ key, base, value }] }` for every entity whose current value differs from its base (new, edited, or deleted = `value: null`).
- Server: for each change, `merged = merge3(base, serverCurrent, incoming)` (`src/sync/merge.ts`); stores it with a new rev if it differs. Requests are serialized.
- Response: `{ rev, entities: [{ key, rev, value }], conflicts: [...] }` = everything with rev > sinceRev plus the merged result of every pushed key.
- Client applies each returned entity to its vault *as it is now*: unchanged since the request → take the server value; edited meanwhile → merge again with the sent snapshot as base (kept and pushed next round). Bases and `lastRev` are updated.
- Merge rules: one side changed → take it; both the same → take it; delete vs edit → keep the edit. Both edited: daily notes merge task by task (same task on both → incoming wins), heading notes text keeps both versions with a separator, standalone notes keep the server copy and add an incoming "(conflict copy)", settings → incoming wins. Every both-edited case is reported in `conflicts` and shown to the user.
- Triggers (`src/hooks/useSync.ts`): app start, 2.5 s after any local change, coming online, returning to the foreground, every 60 s. A 401 stops auto-sync and asks the user to reconnect.

## 5. Clients
- Same-origin PWA (served by the server) and other-origin browsers use `fetch` with CORS.
- Android app: `CapacitorHttp` (native HTTP, no CORS/mixed-content limits) and `usesCleartextTraffic` so LAN servers on `http://` work. Prefer HTTPS via a reverse proxy when the server is reachable from the internet.

## 6. Deployment
- Docker: `DAYMARK_PASSWORD='…' docker compose up -d` (see `Dockerfile`, `docker-compose.yml`); data in `./data`; health check on `/api/health`; runs as the `node` user.
- Bare Node: `npm ci && npm run build && DAYMARK_PASSWORD='…' npm start`.
- Backup: copy `DATA_DIR` (plain JSON files) while the server is stopped, or export a vault ZIP from any device.
