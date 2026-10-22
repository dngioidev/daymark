# Server sign-in: design

Date: 2026-10-22 · Status: draft for approval

## 1. Why

The owner self-hosts Daymark on a public address (soon `https://daymark.dngioi.com`). Today the server hands the
full web app to anyone who opens the URL; only the sync API needs a password. A stranger cannot read the owner's
notes, but can use the site as a notebook, and the owner wants the site to be private: **nothing usable until you
sign in**. Notes can be sensitive, so signing out must leave nothing behind in the browser.

The owner also wants a proper token model ("OAuth2-style"): a short-lived **access token** plus a long-lived,
rotating **refresh token**, instead of today's single 90-day bearer token.

This goes into the public `daymark` repo so every self-hoster gets it.

## 2. Goals

1. A browser visiting a Daymark server sees only a sign-in page (username + password) until signed in.
2. Sign-in issues an access token (15 min) and a refresh token (30 days, sliding, rotating with reuse detection).
3. You stay signed in on a device for as long as you use it at least once every 30 days. No idle lock.
4. Signing out on the web syncs first, then wipes every trace of the vault from that browser.
5. Android: first open offers **Use locally** (no account, works as today) or **Sign in to sync** (server address,
   then username/password), using the same token pair.
6. Settings › Devices lists signed-in devices; any can be signed out remotely (existing feature, kept working).
7. Changing the password signs out every device, including the current one.

## 3. Non-goals

- More than one account. The server stays single-user: the existing admin account (`DAYMARK_USER` /
  `DAYMARK_PASSWORD`, stored hashed in `data/auth.json`) is the account.
- Third-party sign-in (Google, GitHub, …), two-factor, idle lock.
- Changing local-only use: the Android app in **Use locally** mode and a web build opened without a server keep
  working with no account. Moving data without a server stays export/import of a backup file.
- Domain and HTTPS setup on the owner's server (separate deploy step after this ships).

## 4. Anti-goals (fail even if it "works")

- Any of the owner's notes readable in a browser after sign-out, or reachable on the server without a valid token.
- Losing unsynced edits on sign-out without a clear warning first.
- A stolen refresh token that keeps working after the real device refreshes.
- Breaking local-only use, or forcing Android users to have a server.

## 5. Current state (what exists)

- `server/app.ts`: `POST /api/auth/login` returns one HMAC-signed bearer token (`server/auth.ts`, `signToken`),
  lifetime `DAYMARK_TOKEN_TTL_DAYS` (90). Every other `/api` route checks it. Tokens carry `ver`
  (`store.auth.tokenVersion`), bumped on password change to revoke all tokens. Devices live in `data/devices.json`;
  revoking a device kills its token. Failed logins are rate-limited per IP (10 per 15 min, `LoginRateLimiter`).
- `server.ts`: serves `dist/` (production) or Vite middleware (dev) to anyone, SPA fallback to `index.html`.
- `public/sw.js`: service worker caches the app shell; `/api/*` is never cached.
- `src/hooks/useSync.ts` + `src/sync/syncClient.ts`: the client stores `{serverUrl, token, …}` and attaches
  `Authorization: Bearer`. Sync is set up from Settings › Sync (`src/components/sync/SyncPanel.tsx`).
- Android (Capacitor) serves the bundled web build from `https://localhost` and calls the server cross-origin.
- `Dockerfile` must also copy `src/utils` (the server imports `vaultValidation`, `defaultData`, `lifecycleEngine`);
  without it the container exits with `ERR_MODULE_NOT_FOUND`. Fix ships with this work.

## 6. Decided design

### 6.1 Tokens (decided with the owner)

| Token | Lifetime | Where it lives (web) | Where it lives (Android) |
|---|---|---|---|
| Access | 15 min | memory only | memory only |
| Refresh | 30 days, reset on every refresh (sliding) | `HttpOnly; Secure; SameSite=Strict` cookie, path `/` (so the site gate sees it) | app storage, sent in the request body |

- Each refresh returns a **new** refresh token and retires the old one (rotation).
- Presenting an already-retired refresh token revokes that whole session (that device's refresh family) and logs it
  in the sync log. The real device then has to sign in again; that is the intended trade-off.
- **Strict detection, no grace window** (decided with the owner, who preferred security over convenience). To avoid
  false alarms, tabs of the same browser take turns refreshing (Web Locks, falling back to BroadcastChannel) and share
  the resulting access token, so two tabs never present the same refresh token. A response lost on a bad network can
  still end the session; the owner accepted that.
- **No device limit** (decided with the owner). Each signed-in browser or phone is its own entry with its own token
  pair; ending one session never affects the others.
- Refresh tokens are random opaque values; the server stores only a hash, per device.
- (My call) The cookie is sent with every request, but only the `/api/auth/*` endpoints read it; every other `/api`
  route accepts only the `Authorization: Bearer` access token, so the cookie can't be used for cross-site requests
  against the data. Lifetimes and storage were decided with the owner; cookie path and scoping are my call.
- Access tokens keep the existing signed format and checks (`ver`, device not revoked), with `exp` = 15 min.
- Password change: bump `tokenVersion` and revoke every refresh token, **including the current device's**. The
  client then lands on the sign-in page.

### 6.2 Site gate (my call)

- Navigation requests (HTML pages) without a valid refresh cookie get a small standalone **sign-in page** instead of
  the app. With a valid cookie, the server serves the app shell as today.
- The JS/CSS bundles stay publicly fetchable. They contain no user data; the data is only ever served by `/api`
  behind an access token. This is stated in the docs so nobody mistakes the gate for hiding the code.
- The gate applies whenever the web app is served by the Daymark server (production and `npm run dev`).
- A static web build opened without a server (if anyone hosts one) has no gate and stays local-only.
- The service worker must not hand the cached app shell to a signed-out visitor: its offline fallback is used only
  when the network is unreachable, and sign-out deletes the service worker caches (see 6.3).

### 6.3 Sign-out on the web (decided with the owner)

1. Run one sync.
2. If it fails, or local changes are still unsent, show a warning listing how many changes would be lost, with
   **Cancel** and **Sign out anyway**.
3. Revoke the refresh token on the server and clear the cookie.
4. Wipe the browser: the vault in IndexedDB and the localStorage fallback, sync state, Daymark localStorage keys,
   service worker caches. Then load the sign-in page.

A sign-out triggered from another device (Settings › Devices) or by a password change does the same wipe the next
time this browser talks to the server and gets a "session ended" answer. It skips step 2 because the server will no
longer accept its changes; the copy is still wiped.

### 6.4 Android (decided with the owner)

- First-run screen offers **Use locally** and **Sign in to sync**.
  - **Use locally:** today's behaviour.
  - **Sign in to sync:** asks for the server address, then the username and password.
- A local user can switch to sync later from Settings › Sync, which asks for the same details. Existing local data is
  merged into the server on the first sync, as today.
- Signing out on Android stops syncing and keeps the local copy. The wipe rule is for the web (shared browsers).
- After this update, already-connected phones are asked to sign in once more. The old 90-day tokens are not accepted.

### 6.5 Web app after sign-in

- (My call) Only the web app served by the server itself can sign in. A web build on another origin can't (its
  `SameSite=Strict` cookie wouldn't be sent) and is local-only; the server-address field is shown only in the Android
  app. Release notes say so. CORS stays for the Android app's origin.
- (My call) Offline: a browser that is signed in opens its local copy and allows edits, as the PWA does today; it
  refreshes and syncs when back online. If the server then says the session ended, 6.3's wipe applies.

- The web app served by a server is always in sync mode against its own origin. There is no "use locally" choice
  and no server-address field there.
- First sign-in on a browser that already has local Daymark data from before this update merges it into the
  server, the same as connecting sync today.
- Settings shows **Sign out** and **Change password**. Settings › Devices lists every signed-in device with remote
  sign-out.

### 6.6 Unchanged

- Rate limiting of sign-in attempts (10 failures / 15 min per IP).
- Single account, created from `DAYMARK_PASSWORD` on first start.
- Sync protocol and merge.

## 7. Left to the builder

- Endpoint names and shapes (e.g. `POST /api/auth/login`, `/api/auth/refresh`, `/api/auth/logout`), and how the
  server tells a navigation it's signed out. Keep the existing `/api/health` public.
- How the browser client proves a refresh came from the page (`SameSite=Strict` plus a custom header is enough).
- `Secure` cookies on plain `http://` LAN addresses: browsers drop `Secure` cookies on non-localhost HTTP. Decide
  whether to set `Secure` only when the request arrived over HTTPS (directly or via a trusted proxy), and document
  that HTTP-only deployments are for LAN use.
- Storage format for refresh tokens in `data/devices.json` (or a new file) and the migration from the old format.
- Sign-in page look: match the existing Welcome dialog style (stone palette, amber primary button).
- Tests: server unit tests for issue/refresh/rotation/reuse/revoke/password change; the e2e suites (`test:e2e`,
  `test:sync`, `test:qa`) must sign in first; add a QA scenario covering the sign-out wipe and the gate.
- Docs: README self-hosting section, `.ai-configs/project/api-and-sync.md`, a release note.
