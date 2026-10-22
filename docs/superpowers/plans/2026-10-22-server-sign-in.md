# Server Sign-in Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Daymark server shows only a sign-in page until you sign in. Sign-in uses a 15-minute access token and a
rotating 30-day refresh token. Web sign-out wipes the browser. Android can stay local or sign in to sync.

**Architecture:**
- **Server:** `server/app.ts` gains login/refresh/logout endpoints. They issue an HMAC access token (existing
  `signToken`, now typed `typ:'access'`) and an opaque refresh token stored as a hash on the device record.
- **Gate:** a middleware in `server/gate.ts`, mounted in `server.ts` before the static files, sends `signin.html`
  (status 401) to any page request without a valid refresh cookie.
- **Client:** `src/sync/authClient.ts` owns the tokens and the cross-tab refresh lock. `useSync` uses it, and the UI
  switches between server-hosted web, other-origin web (local only) and Android.

**Tech Stack:**
- Express 4, Node `crypto`, React 19 + TypeScript, Vite multi-page build, Tailwind v4 (stone palette)
- Web Locks + BroadcastChannel
- vitest; playwright-core e2e scripts

**Spec:** `docs/superpowers/specs/2026-10-22-server-sign-in-design.md`

## Global Constraints

- **Lifetimes:** access token 900 s (15 min). Refresh token 30 days, sliding: every refresh resets the 30 days.
  Config `DAYMARK_REFRESH_TTL_DAYS` (default 30) replaces `DAYMARK_TOKEN_TTL_DAYS`.
- **Rotation:** strict, no grace window. A retired refresh token presented again revokes that device and logs
  `refresh_reuse`.
- **Accounts and devices:** single account, no device limit.
- **Login rate limit unchanged:** 10 failures per 15 min per IP.
- **Cookies:**
  - Refresh cookie `daymark_refresh`: `HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000`. Add `Secure` only when
    `req.secure` (HTTPS directly, or `X-Forwarded-Proto: https` from a loopback proxy; `trust proxy` is already
    `loopback`).
  - Marker cookie `daymark_signed_in=1`: same attributes but **not** HttpOnly.
- **Request scoping:**
  - Only `/api/auth/*` reads the cookie. Every other `/api` route accepts only `Authorization: Bearer <access>`.
  - Web requests to `/api/auth/refresh` and `/api/auth/logout` must carry the header `X-Daymark-Client: web`. Requests
    without it use the body `refreshToken` (Android).
- **Android:** keeps its local copy on sign-out. Only the web wipes.
- **Commits:** author `dngioidev <172118255+dngioidev@users.noreply.github.com>`, ending with the session
  `Co-Authored-By` / `Claude-Session` trailers.
- **Repo invariants:** use Tailwind stone palette only, and types from `src/types/daymark.ts`. Keep the Markdown
  comment format and rollover idempotency untouched.

## Review Focus

1. **Two tabs opening at once:** both stay signed in. Only one refresh hits the server; the other tab reuses its
   access token. → Task 3 test `shares one refresh across concurrent callers`, Task 5 QA `A3`.
2. **Signed-out visitor whose service worker has the app cached, while online:** gets the sign-in page, never the
   app shell, and the 401 page is never written into the cache. → Task 2 test `sign-in page is 401 and uncacheable`,
   Task 5 QA `A2`.
3. **Plain `http://` LAN address:** sign-in still works because the cookie is not `Secure` there. → Task 1 test
   `omits Secure on plain HTTP, sets it behind an HTTPS proxy`, plus the existing QA `C6` (now signed in).
4. **Token issued by v1.1.x (90-day, no `typ`):** rejected with 401. → Task 1 test `rejects pre-upgrade tokens`.
5. **Web sign-out while offline with unsent edits:** shows the count. Cancel keeps everything; confirming wipes.
   → Task 5 QA `A5`.

---

### Task 1: Server tokens: login, refresh, logout, revoke

**Files:**
- Modify: `server/config.ts`, `server/auth.ts`, `server/store.ts` (`DeviceRecord`), `server/app.ts:45-130`,
  `src/sync/protocol.ts`
- Test: `server/app.test.ts` (rework the `auth` describe; update the `connect` helper)

**Interfaces:**
- Produces in `src/sync/protocol.ts`:
  - `LoginResponse = { accessToken: string; expiresIn: number; username: string; device: { id: string; name: string }; refreshToken?: string }`
    (`refreshToken` is present only for non-web clients).
  - `RefreshResponse` has the same shape as `LoginResponse`.
  - `export const WEB_CLIENT_HEADER = 'X-Daymark-Client'`.
  - `export const REFRESH_COOKIE = 'daymark_refresh'`, `export const SIGNED_IN_COOKIE = 'daymark_signed_in'`.
- Produces in `server/auth.ts`:
  - `newRefreshToken(deviceId: string): string`, format `<deviceId>.<43-char base64url random>`.
  - `hashRefreshToken(token: string): string` (sha256 hex).
  - `parseCookies(header: string | undefined): Record<string, string>`.
  - `TokenPayload` gains `typ: 'access'`.
  - `verifyToken` returns null unless `typ === 'access'`.
- Produces in `server/store.ts`: `DeviceRecord` gains `refreshHash: string | null`, `refreshExpiresAt: string | null`
  and `retiredRefreshHashes: string[]` (cap 50, newest last). Missing fields on load mean null / `[]`.
- Produces in `server/app.ts`: `export function checkRefreshToken(store: FileStore, token: string, now?: number): DeviceRecord | null`.
  It is read-only: it returns the device when the hash is current, unexpired and not revoked. It is reused by the gate.
- Endpoints:
  - `POST /api/auth/login`: body `LoginRequest`, response `LoginResponse`. A web client gets both cookies set.
  - `POST /api/auth/refresh`: web uses the cookie plus `X-Daymark-Client: web`; others send body `{ refreshToken }`.
    Response is `RefreshResponse` and rotates the token. A web response re-sets both cookies.
  - `POST /api/auth/logout`: same credential rules. Revokes the device, clears both cookies (`Max-Age=0`), returns
    `{ ok: true }`. Also returns 200 when already invalid.
  - `POST /api/auth/change-password`: bumps `tokenVersion` and sets `revoked = true` on **every** device, including
    the caller. Returns `{ ok: true }`. It no longer returns a token.

- [ ] **Step 1: Write failing tests in `server/app.test.ts`**
  - Rework the `connect` helper to read `accessToken` and `refreshToken` from the login response (a non-web
    client).
  - Tests:
    - `login returns a 15-minute access token and a refresh token`: `expiresIn === 900`, and `refreshToken` starts
      with `device.id + '.'`.
    - `refresh rotates: new pair works, old refresh token is retired`: after a refresh, `GET /api/devices` with the
      new access token returns 200.
    - `reusing a retired refresh token revokes the device`:
      - The second use of the old token returns 401.
      - The new token now returns 401 too.
      - The sync log has an entry with `action === 'refresh_reuse'`.
    - `refresh token expires after 30 days without use`: inject `now`, or set `refreshExpiresAt` in the past on
      `fileStore`; expect 401.
    - `web login sets HttpOnly refresh and readable marker cookies`:
      - Send header `X-Daymark-Client: web`.
      - `set-cookie` contains `daymark_refresh=` with `HttpOnly`, `SameSite=Strict` and `Path=/`.
      - It also contains `daymark_signed_in=1` without `HttpOnly`.
      - The body has no `refreshToken`.
    - `web refresh needs the client header`: cookie without the header returns 401; with the header, 200.
    - `omits Secure on plain HTTP, sets it behind an HTTPS proxy`: no `Secure` on a plain request. With
      `X-Forwarded-Proto: https` from 127.0.0.1, `Secure` is present.
    - `cookie alone does not authorise data routes`: `GET /api/devices` with only the cookie returns 401.
    - `logout revokes the device and clears cookies`.
    - `changing the password signs out every device including this one` (replaces the old test).
    - `rejects pre-upgrade tokens`: `signToken({sub,did,ver,exp}, secret)` without `typ` against `/api/devices`
      returns 401.
  - Keep the existing wrong-password and rate-limit, duplicate-install and weak-password tests passing.

- [ ] **Step 2: Run `npx vitest run server/app.test.ts`.** Expected: the new tests FAIL, old sync tests error on
  `token` / `accessToken`.

- [ ] **Step 3: Implement**
  - Add `accessTtlSeconds: 900` and `refreshTtlDays` to `ServerConfig` and `loadConfig`.
  - Add the auth helpers above.
  - `issueSession(req, res, device)` in `app.ts` creates and stores the refresh hash. When rotating, it moves the
    old hash into `retiredRefreshHashes`. It sets the cookies when `req.get(WEB_CLIENT_HEADER) === 'web'` and returns
    the response body.
  - Refresh lookup: split the token on the first `.` to get the device id.
    - The hash is in `retiredRefreshHashes`: revoke the device, add a `refresh_reuse` log entry, return 401.
    - The hash matches the current one: rotate.
    - Otherwise: return 401.
  - Persist `devices.json` (+ `sync-log.json`) on every change.
  - Update the old test fixtures and the other sync tests in this file to the new response shape, so the file goes
    green.

- [ ] **Step 4: Run `npx vitest run server` and `npm run lint`.** Expected: all pass.

- [ ] **Step 5: Commit** `feat(server): access + rotating refresh tokens`

### Task 2: Site gate and sign-in page

**Files:**
- Create: `server/gate.ts`, `server/gate.test.ts`, `signin.html`, `src/signin/main.ts`
- Modify: `server.ts` (mount the gate before `express.static` and the Vite middleware), `vite.config.ts` (multi-page
  `build.rollupOptions.input: { main: 'index.html', signin: 'signin.html' }`), `public/sw.js`,
  `Dockerfile` (nothing new is needed; `dist/` already holds `signin.html`)

**Interfaces:**
- Consumes: `checkRefreshToken`, `parseCookies`, `REFRESH_COOKIE`, `WEB_CLIENT_HEADER` (Task 1).
- Produces: `createSiteGate(store: FileStore, signInPage: () => string): express.RequestHandler`.
  - It gates `GET` and `HEAD` requests whose path is `/`, ends in `.html`, or has no file extension, except `/api/*`.
  - Without a valid refresh cookie it responds `401` with the sign-in HTML and the headers
    `Cache-Control: no-store` and `X-Daymark-Sign-In: 1`.
  - A request for `/signin.html` itself is always allowed through.
  - With a valid cookie it calls `next()`.
  - In production, `signInPage` reads `dist/signin.html` once. In dev it loads the file through
    `vite.transformIndexHtml('/signin.html', raw)`.

- [ ] **Step 1: Write failing tests in `server/gate.test.ts`**
  - Mount `createSiteGate` plus a stub `app.get('*', → 'APP')` on an in-process server with a real `FileStore`.
  - Tests:
    - `signed-out page request gets the sign-in page with 401`: covers `/`, `/notes` and `/index.html`.
    - `sign-in page is 401 and uncacheable`: `cache-control` is `no-store`.
    - `static assets are not gated`: `/assets/x.js`, `/sw.js`, `/manifest.json` and `/icons/icon-192.png` reach the
      stub.
    - `valid refresh cookie lets the app through`.
    - `revoked or expired cookie gets the sign-in page`.
    - `/api routes are not gated by the page gate`.

- [ ] **Step 2: Run `npx vitest run server/gate.test.ts`.** Expected: FAIL (module missing).

- [ ] **Step 3: Implement the gate and wire it into `server.ts`.**

- [ ] **Step 4: Sign-in page**
  - `signin.html` holds a form with:
    - `Username` (default `admin`) and `Password` labelled inputs;
    - a **Sign in** button styled like the Welcome dialog's primary button (amber-700 / dark amber-500, stone
      surfaces);
    - an error line under the form.
  - `src/signin/main.ts` imports `../index.css` and posts `/api/auth/login` with:
    - `X-Daymark-Client: web`;
    - `deviceName` = the same "<OS> browser" rule as `App.tsx:defaultDeviceName`, moved to
      `src/utils/deviceName.ts` and reused;
    - `platform: 'web'`;
    - `installId` from `localStorage['daymark_install_id']`, created the same way `useSync.getInstallId` does. Move
      it to `src/utils/deviceName.ts` as `getInstallId()` and import it in both places.
  - On 200 it runs `location.replace(location.pathname === '/signin.html' ? '/' : location.href)`. Otherwise it
    shows the server's `error` text (429 shows the rate-limit message).

- [ ] **Step 5: Service worker** (`public/sw.js`)
  - Install: cache `/` only when `shell.ok`.
  - Navigation: cache only `fresh.ok` responses that don't have `X-Daymark-Sign-In`. Return a 401 sign-in response
    as is, and use the cached shell only when `fetch` throws.
  - Bump `CACHE_VERSION` to `daymark-shell-v3`.

- [ ] **Step 6: Run `npx vitest run server`, `npm run lint` and `npm run build`.** Expected: pass, and
  `dist/signin.html` exists.

- [ ] **Step 7: Commit** `feat(server): gate the web app behind sign-in`

### Task 3: Client token manager

**Files:**
- Create: `src/sync/authClient.ts`, `src/sync/authClient.test.ts`
- Modify: `src/sync/syncClient.ts`. `SyncState` loses `token` and gains `refreshToken?: string` (native only).
  `login()` is moved to `authClient`. `syncOnce(fetchFn, local, state, accessToken: string)`.

**Interfaces:**
- Produces:
  - `type AuthMode = 'cookie' | 'body'`. Server-hosted web uses `cookie`; Android uses `body`.
  - `signIn(fetchFn, serverUrl, mode, credentials: LoginRequest): Promise<LoginResponse>`
  - `class TokenManager`:
    - `constructor(opts: { fetchFn: FetchLike; serverUrl: string; mode: AuthMode; getRefreshToken: () => string | undefined; setRefreshToken: (t: string) => void; onSessionEnded: () => void; locks?: LockManager | null; channel?: BroadcastChannel | null })`
    - `getAccessToken(): Promise<string>` returns the cached token while more than 60 s remain. Otherwise it
      refreshes under `locks.request('daymark-refresh', …)`.
    - `authFetch(path: string, init?: RequestInit): Promise<Response>` attaches `Bearer`. On a 401 it forces one
      refresh and retries once.
    - `signOut(): Promise<void>`
  - `class SessionEndedError extends Error` is thrown when refresh returns 401. `onSessionEnded` is called first.
  - A network failure during refresh throws `SyncHttpError(status 0)`, does **not** end the session, and keeps
    working offline.
- Cross-tab algorithm (it is not determined by the signatures):
  - Inside the lock, first post `{ type: 'need-token' }` on the channel `daymark-auth` and wait up to 300 ms for a
    `{ type: 'token', accessToken, expiresAt }` with more than 60 s left. Adopt it if one arrives.
  - Otherwise call refresh and post the result as `token` before releasing the lock.
  - Every instance answers `need-token` when it holds a valid token.
  - Fallback when `locks` is null: a single in-memory promise per instance.

- [ ] **Step 1: Write failing tests in `src/sync/authClient.test.ts`**
  - Run against the in-process server, set up like `server/app.test.ts`.
  - Tests:
    - `body mode: getAccessToken refreshes and rotates the stored refresh token`.
    - `shares one refresh across concurrent callers`:
      - Make 5 parallel `getAccessToken()` calls on one manager, and the same on two managers that share a fake
        lock and channel.
      - Exactly one `/api/auth/refresh` request is made, and no device is revoked.
    - `authFetch retries once after a 401`: shorten the cached token's expiry artificially and stub the first
      response as 401.
    - `refresh 401 calls onSessionEnded and throws SessionEndedError`.
    - `network failure keeps the session`: the fetch rejects, it throws a status-0 error, and `onSessionEnded` is not
      called.

- [ ] **Step 2: Run `npx vitest run src/sync/authClient.test.ts`.** Expected: FAIL.

- [ ] **Step 3: Implement**
  - Update `syncClient.ts` and its callers in `server/app.test.ts` to the new `syncOnce` signature, with the access
    token obtained through `TokenManager` in body mode.

- [ ] **Step 4: Run `npm test` and `npm run lint`.** Expected: pass (UI type errors are allowed only in files Task 4
  owns; list them in the commit body if any remain).

- [ ] **Step 5: Commit** `feat(sync): token manager with rotating refresh and cross-tab lock`

### Task 4: App modes, sign-out wipe, Android first run

**Files:**
- Modify:
  - `src/hooks/useSync.ts`
  - `src/utils/vaultStore.ts` (add `wipeLocalVault`)
  - `src/App.tsx`
  - `src/components/sync/SyncPanel.tsx`
  - `src/components/server/ServerDashboard.tsx`
  - `src/components/WelcomeModal.tsx`
- Create: `src/utils/hostMode.ts`, `src/utils/hostMode.test.ts`

**Interfaces:**
- Consumes: `TokenManager`, `signIn`, `SessionEndedError` (Task 3); `SIGNED_IN_COOKIE` (Task 1).
- Produces:
  - `getHostMode(): 'server' | 'native' | 'local-web'`:
    - `native` when `isNativeApp()`;
    - `server` when `document.cookie` has `daymark_signed_in=1`;
    - otherwise `local-web`.
  - `wipeLocalVault(): Promise<void>` closes the open DB, then:
    - `indexedDB.deleteDatabase('daymark')`;
    - removes every localStorage key starting with `daymark`;
    - deletes every Cache Storage entry;
    - clears the in-memory cache.
  - `UseSyncResult` changes:
    - Drop `token`. Add `authFetch(path, init?)`.
    - Add `mode: 'server' | 'native' | 'local-web'`.
    - Add `pendingChanges(): number`, which is `collectChanges(toEntities(vault), state).length`, or 0 when not
      connected.
    - Add `signOut(opts?: { force?: boolean }): Promise<'done' | 'needs-confirm'>`.
    - `connect(serverUrl, username, password, deviceName)` is kept for native only.

**Behaviour:**
- **Server mode, start:**
  - No `SyncState` yet: create `{ serverUrl: location.origin, username, deviceId, deviceName, lastRev: 0, bases: {}, lastSyncAt: null }`
    from the first refresh response, then sync. This merges any pre-existing local data, as the first sync does today.
  - Call `markOnboarded()`. The Welcome dialog never shows in server mode.
- **Server mode, session ended** (`onSessionEnded`, from a remote sign-out, a password change or reuse detection):
  `wipeLocalVault()`, then `location.replace('/')`. The server then shows the sign-in page.
- **Server mode, `signOut()`:**
  1. Run one sync.
  2. If it threw, or `pendingChanges() > 0`, return `'needs-confirm'` unless `force`.
  3. Otherwise `tokenManager.signOut()`, `wipeLocalVault()`, `location.replace('/')`.
  - The panel shows `confirmDialog` with *"N change(s) haven't reached the server and will be deleted from this
    browser."* and the buttons **Cancel** and **Sign out anyway**. **Sign out anyway** calls `signOut({ force: true })`.
- **Native:** `connect` and sign-out work as today's connect and disconnect. The refresh token lives in
  `SyncState.refreshToken`. Sign-out keeps the local data.
- **Local web:** `SyncPanel` shows no form, only *"Sign-in and sync work in the Daymark app served by your server, or
  in the Android app. On this page your notes stay in this browser; use Backup & restore to move them."*
- **SyncPanel by mode:**
  - **Server mode:** shows the account (username, device name, last sync). Its **Sign out** button replaces
    **Disconnect**, and there is no server-address field.
  - **Native:** the server-address form as today.
- **ServerDashboard:** uses `sync.authFetch` instead of building `Bearer ${sync.token}` itself.
- **Change password:**
  1. Sync first.
  2. Call the endpoint.
  3. On success:
     - **Server mode:** wipe, then reload.
     - **Native:** clear the sync state, keep the data, and show *"Password changed. Every device was signed out;
       sign in again with the new password."*
- **WelcomeModal on native:** add the button **Sign in to sync** (`onSignIn`). It marks onboarding done and opens
  Settings › Sync. The existing three options stay.

- [ ] **Step 1: Write failing tests in `src/utils/hostMode.test.ts`**
  - Stub `document.cookie` via `vi.stubGlobal('document', { cookie })` and mock `isNativeApp`.
  - Tests:
    - `native wins over cookies`
    - `marker cookie means server`
    - `no marker means local-web`

- [ ] **Step 2: Run it.** Expected: FAIL.

- [ ] **Step 3: Implement `hostMode.ts`, `wipeLocalVault`, `useSync` and the UI changes listed above.**

- [ ] **Step 4: Run `npm run lint`, `npm test` and `npm run build`.** Expected: pass.

- [ ] **Step 5: Commit** `feat(app): server-hosted sign-in, web sign-out wipe, Android sign-in choice`

### Task 5: End-to-end suites sign in, new QA scenarios

**Files:**
- Modify:
  - `scripts/e2e-qa-regressions.mjs`
  - `scripts/e2e-android-pwa.mjs`
  - `scripts/e2e-sync.mjs`
  - `scripts/ux-suite.mjs`
  - `scripts/ux-audit.mjs`
  - `scripts/capture-screenshots.mjs`
  - `scripts/e2e-android-native.mjs`

**Interfaces:**
- Consumes: the endpoints (Task 1), the gate (Task 2) and the UI (Task 4).
- Each script's context factory signs in before its first `goto`. Use `await context.request.post(origin + '/api/auth/login', { headers: { 'X-Daymark-Client': 'web' }, data: { username: 'admin', password, deviceName: 'e2e', platform: 'web' } })`;
  the context cookie jar then carries the session. `e2e-android-native.mjs` reads `accessToken` instead of `token`.
- `e2e-sync.mjs` no longer fills the server-address form. Each device context signs in and then waits for "Synced".
- Old UI tests of the web sync form (`ux-suite` SY-0x) move to the account / sign-out view or are deleted, with the
  reason recorded in the commit body.

- [ ] **Step 1: Add QA scenarios `A1`–`A5` to `e2e-qa-regressions.mjs`**

  | Scenario | Steps | Expected |
  |---|---|---|
  | `A1` | Fresh context, no sign-in, `goto('/')` | The sign-in form is visible and the response status is 401. A wrong password shows "Wrong username or password". The right password shows Today. |
  | `A2` | Sign in, load the app so the service worker installs, call `/api/auth/logout` via `context.request`, reload | The sign-in page shows, not the app. |
  | `A3` | Sign in, open two pages in the same context, make the access token expire with a `page.clock` jump of 16 min, trigger a sync in both | Both stay signed in, and the server device list shows the device not revoked. |
  | `A4` | Sign in, add a task, wait for "Synced", Settings › Sync › Sign out | The sign-in page shows. `indexedDB.databases()` has no `daymark`, and localStorage has no `daymark*` keys. |
  | `A5` | Sign in, `context.setOffline(true)`, add a task, Sign out | The dialog mentions "1 change". Cancel keeps the task visible. Sign out anyway wipes it, as in A4. |

  - Update the existing `fresh()` helper and `C6` (LAN IP, plain HTTP) to sign in through that origin.

- [ ] **Step 2: Run `npm run build`, then `npm run test:qa`.** Expected: `0 failed`, A1–A5 included.

- [ ] **Step 3: Run `npm run test:e2e`, `npm run test:sync` and `node scripts/ux-suite.mjs`.** Expected: all pass.

- [ ] **Step 4: Run `npm run android:build -- --test`.** Expected: build and Kotlin tests pass.

- [ ] **Step 5: Commit** `test: e2e suites sign in; QA scenarios for gate, rotation, sign-out wipe`

### Task 6: Docs

**Files:**
- Modify: `README.md` (self-hosting section), `.ai-configs/project/api-and-sync.md`, `docker-compose.yml` (comment
  only)
- Create: `docs/releases/server-sign-in/README.md`. Follow `.ai-configs/workflows/release-handoff.md` and capture
  screenshots with `node scripts/capture-screenshots.mjs server-sign-in` (sign-in page, Sync account view, sign-out
  warning, Android welcome).

**Content that must appear:**
- The site needs sign-in. App code files stay public but contain no data.
- Plain HTTP is for LAN only: the cookie isn't `Secure` there. Use HTTPS (e.g. Caddy) on a public address.
- Token lifetimes, and that a reused refresh token signs that device out.
- After upgrading, every device signs in once more. `DAYMARK_TOKEN_TTL_DAYS` is replaced by
  `DAYMARK_REFRESH_TTL_DAYS`.
- A web build hosted on another origin is local-only.

- [ ] **Step 1: Write the docs and screenshots.**

- [ ] **Step 2: Run `npm run validate:ai`.** Expected: all checks passed.

- [ ] **Step 3: Commit** `docs: server sign-in`
