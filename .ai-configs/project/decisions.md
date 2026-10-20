# Architecture & Technical Decisions

This document summarizes key architectural decisions made in Daymark, preserving context for developers and AI agents.

## ADR 1: Local-First Sovereign Markdown Format
- **Decision**: Store notes as canonical Markdown files (`YYYY-MM-DD.md`) with YAML frontmatter rather than an opaque binary database.
- **Rationale**: Ensures zero proprietary lock-in. Users own their data and can open notes directly in Obsidian, VS Code, or Typora at any time. Vaults can be exported as standard `.zip` archives.

## ADR 2: Unobtrusive HTML Comment Metadata
- **Decision**: Embed task identifiers, status, and carry-forward provenance within standard HTML comments (`<!-- daymark: ... -->`) directly beside checklist items.
- **Rationale**: Markdown readers ignore HTML comments in preview mode, leaving notes visually clean and human-readable, while allowing Daymark's parser to reconstruct structured lifecycle metadata.

## ADR 3: Pure Algorithmic Rollover with Historical Ledger Preservation
- **Decision**: Carry-forward creates new task rows in today's note referencing the original note (`carried_from=...`), while keeping the past note intact. Retroactive completion updates the historical entry and cleans intermediate rollovers.
- **Rationale**: Daily journals represent historical records of what occurred on that day. Traditional task databases destroy past context when tasks move; Daymark preserves the daily ledger.

## ADR 4: Self-Hosted Unified Express + Vite Architecture
- **Decision**: Run a single full-stack Express server (`server.ts`) that serves both REST sync API endpoints and mounts Vite development middleware (or static `dist/` in production).
- **Rationale**: Eliminates CORS complexity, allows simple single-port deployment (Docker, Cloud Run, VPS), and provides self-contained sync without third-party cloud dependencies.

## ADR 5: IndexedDB Persistence with a Hydrated In-Memory Cache
- **Decision**: Store the vault in IndexedDB. Hydrate a cache before first render so `load*()` stay synchronous; queue writes and report failures to the UI. Migrate legacy `localStorage` data once and keep it as a backup.
- **Rationale**: localStorage has a ~5 MB limit and silent failure modes, which is unacceptable for a notebook that must never lose data. IndexedDB supports larger vaults and `navigator.storage.persist()`.

## ADR 6: Real Date by Default, Override for Testing
- **Decision**: "Today" is the user's real local date, refreshed at midnight and on focus. `settings.simulatedToday` is an optional developer override (empty by default).
- **Rationale**: The prototype pinned "today" to a demo date, so rollover could never occur naturally.

## ADR 7: Offline-First PWA via a Hand-Written Service Worker
- **Decision**: Ship `public/sw.js` (precache shell, network-first navigations, cache-first hashed assets, no `/api` caching) instead of a build-plugin generated worker; register only in production.
- **Rationale**: Few moving parts, no extra dependency, behaviour verified end to end by `scripts/e2e-android-pwa.mjs`.

## ADR 8: Capacitor App Shell with a Native Glance Widget
- **Decision**: Ship Android as a Capacitor app (WebView around the existing web build) in `mobile/android/`, plus a native Jetpack Glance widget. The web app stays the source of truth; it pushes a task snapshot to the widget through a small Capacitor plugin and applies widget checkbox taps (queued natively) when it resumes. A Trusted Web Activity was rejected because it cannot host a widget; rewriting the UI in Compose was rejected as a second implementation to maintain.
- **Rationale**: One UI codebase for PWA and Android, no duplicated rollover logic in Kotlin, and the widget still works when the app is closed. Trade-off: widget changes show in the app only after it next opens or resumes, and the widget shows the last snapshot (it drops finished tasks on a new day until the app runs the rollover).
- **Gotchas**: JDK 21 must not be GraalVM. Glance reuses one composition session across `update()` calls, so widget data is read inside the composition and keyed by a version in Glance state (`refreshAll`). WebView cannot do blob downloads, so exports go through Filesystem + Share in the native app.

## ADR 9: Three-Way Merge Sync over a Revisioned JSON-File Store
- **Decision**: Sync entities (daily note per date, note per id, settings) with a server revision counter and client-held bases; merge with a three-way merge (per task inside a day) on the server and again on the client for edits made during a request. Store everything as JSON files in `DATA_DIR` (atomic writes) instead of a database. One account, many devices, HMAC device tokens.
- **Rationale**: The prototype replaced whole arrays (last writer wins), so two devices silently erased each other's work. Per-task merging means the common case (different tasks edited on phone and laptop) never conflicts, and the rare true conflict keeps both versions or the newest edit and is reported. JSON files keep self-hosting dependency-free and human-inspectable; a single-user vault is small.
- **Consequences**: The client stores a copy of every synced entity (bases) next to the vault. Rollover runs on each device and converges because carried tasks keep their ids. If vaults grow very large, move the store to SQLite behind the same `FileStore` interface.
