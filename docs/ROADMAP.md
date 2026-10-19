# Daymark Roadmap: Agent-Run Cycles to a Usable v1

Goal: Android user first, then self-hosted app, then everything else. Each cycle is sized for one to two focused AI-agent sessions, not for human days. Every cycle ends with `npm run lint`, `npm run build`, `npm test` (from Cycle 1), `npm run validate:ai`, and a **release doc with captured screenshots**.

## Baseline (reviewed 2026-10-20)

Lint and build pass; `validate:ai` passes 42/42. Blockers:

| # | Finding | Where |
|---|---------|-------|
| B1 | `npm install` fails (ERESOLVE): `esbuild ^0.25` vs vite 8 peer `^0.27 \|\| ^0.28`. Both `bun.lock` and (untracked) `package-lock.json` flows exist. | package.json |
| B2 | "Today" is `settings.simulatedToday` (default `2026-10-16`), never the real date. | App.tsx:76, defaultData.ts:80 |
| B3 | Data only in `localStorage`, falls back to demo seed data. No import. | vaultStore.ts |
| B4 | Server state is in-memory with fake seeded devices and logs. | server.ts:24-79 |
| B5 | Server auth is weak: default password, any Bearer token over 5 chars passes, most routes unauthenticated. | server.ts:88-246 |
| B6 | Sync is last-writer-wins (whole arrays replaced). | server.ts:202-207 |
| B7 | Client sync only in `MobileSyncConnect`; desktop has none. | src/components |
| B8 | No tests, including for the rollover idempotency invariant. | repo |
| B9 | Android Glance and iOS WidgetKit files are snippets with no project; Mobile Code Hub and simulator are demo UI. | mobile/, src/components |
| B10 | Cosmetic: package name `react-example`, unused `@google/genai`, AI Studio `.env.example`. | package.json |

## Estimating model (read this first)

Assumptions: Claude Pro, Opus 5.5, 5-hour usage windows. Opus consumes a Pro allowance quickly, so a window is limited by tokens, not clock time; a heavy agent session typically exhausts it in roughly 1.5 to 3 hours, then you wait for reset.

- **Tokens** = rough total processed per cycle (most of it cached context re-reads), with output being about 3-5% of it. Treat as order-of-magnitude.
- **Sessions** = Claude Code sessions (fresh context each). Keep one session per sub-goal; commit between them.
- **Windows** = 5-hour Pro windows consumed. Wall time is windows plus any reset waits.
- Tip: use Sonnet 5.5 for mechanical steps (docs, screenshots, renames) and keep Opus 5.5 for design-heavy steps (sync merge, auth). This stretches windows by about 30-40%.
- These are estimates made before any cycle ran. **Recalibrate after Cycle 0** using real usage.

| Cycle | Theme | Sessions | Tokens (approx.) | Pro windows | Wall time |
|-------|-------|----------|------------------|-------------|-----------|
| 0 | Repo structure and ai-configs evaluation | 1 | 0.8-1.5M | 0.3-0.5 | under 1 window |
| 1 | Android-ready local app (PWA) | 2-3 | 4-7M | 1.5-2 | 1-2 windows |
| 2 | Android native shell and widget | 2 | 3-5M | 1-1.5 | 1-2 windows |
| 3 | Self-hosted server and sync | 3 | 6-10M | 2-3 | 2-3 windows |
| 4 | Remaining: desktop, iOS, polish, v1.0 | 2-3 | 4-7M | 1.5-2 | 2 windows |
| Total | | 10-12 | 18-30M | 6-9 | about 7-10 windows (about 1.5-2.5 weeks if one window per day) |

---

## Cycle 0: Repo structure and ai-configs validation/evaluation
**Status: done on branch `cycle-0-repo-and-ai-configs`, uncommitted.** See [docs/releases/cycle-0](./releases/cycle-0/README.md). Actual token/window usage still to be filled in from `/usage`.
Outcome: a clean, installable repo and an agent configuration that has been checked against real work, so later cycles run smoothly.

Repo structure
- Fix B1 (bump or drop `esbuild`), pick one lockfile (keep `bun.lock` or switch to npm and delete the other), fix B10 (name, unused dependency, `.env.example`).
- Resolve doc duplication: `docs/*.md` are stub pointers to `.ai-configs/project/`; keep only `docs/README.md`, `docs/ROADMAP.md`, and the new `docs/releases/`.
- Add vitest scaffolding, `npm test`, and a GitHub Actions workflow (install, lint, test, build, validate:ai).

ai-configs evaluation (the validator only checks structure, so also evaluate fitness)
- Run `validate:ai` (already 42/42) and extend it to check: referenced npm scripts exist, root adapters (`CLAUDE.md`, `AGENTS.md`, `GEMINI.md`) stay in sync on the invariants, and relative links resolve.
- Dry-run each workflow (`feature-development`, `bug-fix`, `release-handoff`) on a trivial change and record where the instructions were unclear or wrong; fix them.
- Update `testing-and-verification.md` to include `npm test` and screenshots.
- Add **release-docs convention**: `docs/releases/cycle-N/README.md` (what shipped, how verified, known gaps, next) plus `images/*.png`. Capture screenshots with the Playwright MCP (desktop 1440 and Android 412x915 viewports) via a script `scripts/capture-screenshots.mjs` so every cycle reuses it. Add this step to `workflows/release-handoff.md` and a template in `.ai-configs/templates/`.
- Write the Cycle 0 release doc itself as the first example.

Done when: clean clone runs `npm install && npm run lint && npm test && npm run build && npm run validate:ai`; CI is green; `docs/releases/cycle-0/` exists; recalibrated token estimates are written back into this file.

## Cycle 1: Android-ready local app (PWA, single device)
**Status: done on branch `cycle-1-android-ready-local-app`.** See [docs/releases/cycle-1](./releases/cycle-1/README.md). Beyond the plan, tests and e2e uncovered 7 bugs (including tasks not rendering in the default view); all fixed. Physical-device install not yet verified.
Outcome: an Android user can install Daymark from Chrome and use it daily and offline, with correct dates and durable data. This is usable on its own, no server needed.

1. Core correctness (Opus): fix B2 (real local date, `simulatedToday` becomes an optional dev override, default off; rollover on midnight and on visibility change). Tests for `lifecycleEngine` (rollover idempotency, dedupe, historical completion cleanup, aging) and `markdownEngine` (round-trip, `<!-- daymark: ... -->` preservation, malformed input). Fixes any bugs found.
2. Durable storage (Opus): fix B3. First-run empty vault with a short onboarding (demo data behind "Load sample vault"); IndexedDB persistence with visible save errors; import from ZIP/JSON backup so export/import round-trips exactly.
3. Android PWA (Sonnet or Opus): service worker with offline cache, manifest icons, install prompt, safe-area and touch-target pass on `MobileAppShell`, quick capture reachable in one tap. Hide Mobile Code Hub and widget simulator behind a developer toggle (B9).
4. Release docs: screenshots at 412x915 (Today, carry-forward, quick capture, notes, offline banner, install prompt) and one desktop shot.

Done when: Lighthouse PWA installable check passes, airplane-mode capture works in an Android Chrome emulation, export then wipe then import restores identical data, tests pass.

## Cycle 2: Android native shell and home-screen widget
**Status: done on branch `cycle-2-android-native-shell`** (verified on an Android 16 emulator). See [docs/releases/cycle-2](./releases/cycle-2/README.md).
Outcome: an installable APK (side-loaded) with the Glance task widget showing real data. Optional for Milestone A, but it is the "Android user" headline feature.

- Decide wrapper first (recommended: Capacitor around the existing web build, since it reuses all UI; alternative is a Trusted Web Activity, which is lighter but cannot host the widget). Record the decision as an ADR in `.ai-configs/project/decisions.md`.
- Create the real Android project under `mobile/android/` from the existing Kotlin files (`DaymarkGlanceWidget.kt`, `TaskLifecycleEngine.kt`, screens); bridge the vault snapshot from web storage to a file the widget reads; widget check-off writes back and the web app picks it up.
- Build debug APK in CI (Gradle), attach as artifact. Verify on an emulator if one is available; otherwise document manual steps and flag as unverified.
- Release docs: emulator screenshots of app and widget.

Done when: the APK builds in CI and installs; widget shows today's tasks. Risk: needs the Android SDK locally; if unavailable, this cycle is partly verifiable only through CI.

## Cycle 3: Self-hosted server and sync
Outcome: safe self-hosting plus multi-device sync (desktop browser and Android app) with no lost data.

1. Secure persistent server (Opus): fix B4 and B5. Refuse to start without `DAYMARK_PASSWORD`; hashed password; signed expiring tokens; auth middleware on all `/api/*` except `health` and `login`; login rate limiting; persistence to `DATA_DIR` (JSON files, or SQLite if you prefer); remove fake devices and logs; Dockerfile and compose example.
2. Sync protocol (Opus, the hardest part): fix B6. Per-document versioning (`updatedAt`/revision), merge by daily-doc date, note id, and `task_id`; tombstones for deletes; conflicts reported rather than silently overwritten. Server tests for two-client merge scenarios (same task completed on both devices, no duplicate rollovers).
3. Sync client (Opus or Sonnet): fix B7. One shared module for desktop and mobile: pull on start and focus, debounced push, offline queue with retry, status indicator in the navbar; admin dashboard shows real data.
4. Release docs: screenshots of login, sync status, admin dashboard, plus a documented deploy walkthrough (Docker and HTTPS via reverse proxy).

Done when: server restart keeps data, unauthenticated calls return 401, two clients converge, Docker image runs from a clean machine.

## Cycle 4: The rest (desktop polish, iOS, v1.0)
- Desktop: code-split the 586 kB bundle (lazy-load Settings, admin dashboard, jszip), split the largest components (`TodayView` 835 lines, `SettingsModal` 753, `MobileAppShell` 698), accessibility and keyboard pass, empty and error states, optional File System Access API folder-of-`.md` storage.
- iOS: PWA parity verified on Safari viewport; WidgetKit wrapper only if wanted for v1 (otherwise marked experimental).
- Release: refresh README and `.ai-configs/project` docs, tag `v1.0.0`, final screenshot set.

---

## Per-cycle ritual (how an agent runs it)
1. Read `CLAUDE.md` rules; branch `cycle-N-<name>`.
2. Work through the numbered steps, committing after each (verification commands run before each commit).
3. Run `scripts/capture-screenshots.mjs`, write `docs/releases/cycle-N/README.md`, update this file's estimate table with actual usage.
4. Open a PR; tag at milestone ends.

## Milestones
- **A (after Cycle 1):** installable offline Android PWA for personal use.
- **B (after Cycle 2):** native Android app with widget.
- **C (after Cycle 3):** self-hosted multi-device sync.
- **v1.0 (after Cycle 4).**

## Decisions still open
- Android wrapper: Capacitor (recommended) or TWA.
- Server storage: JSON files (simplest) or SQLite.
- iOS WidgetKit in v1 or deferred.
