# Daymark

> **A Local-First Daily Markdown Notebook with Intelligent Task Carry-Forward, Historical Completion Correction, and Aging Alerts.**

Daymark bridges the gap between plain-text Markdown notes (Obsidian, VS Code) and intelligent task management. It treats daily notes as human-readable Markdown files while providing automated task rollover, retroactive completion correction, aging stagnation alerts, and self-hosted multi-device synchronization.

---

## 📖 Documentation

Complete technical, architectural, and operational documentation is unified under [`.ai-configs/project/`](./.ai-configs/project/) as the single, high-density source of truth for both developers and AI coding agents:

- **[`architecture.md`](./.ai-configs/project/architecture.md)** — System topology, Tri-Mode paradigm (Desktop Workspace, Mobile App, Self-Hosted Server), data flow, and native mobile widgets.
- **[`specification.md`](./.ai-configs/project/specification.md)** — Functional PRD, schemas, lifecycle rollover algorithms, historical correction, and canonical Markdown specification.
- **[`api-and-sync.md`](./.ai-configs/project/api-and-sync.md)** — Self-hosted Express sync gateway, REST API endpoints, authentication, and deployment guide.
- **[`codebase-map.md`](./.ai-configs/project/codebase-map.md)** — File-by-file codebase guide, utility functions, and component hierarchy.
- **[`conventions.md`](./.ai-configs/project/conventions.md)** — Development commands and critical Daymark engineering invariants.
- **[`decisions.md`](./.ai-configs/project/decisions.md)** — Architectural decision records (ADRs) explaining core design rationale.

---

## 🚀 Quick Start

### Development
```bash
# Install dependencies
npm install

# Run the development server (runs full-stack Express + Vite on port 3000)
npm run dev
```

Visit `http://localhost:3000` to access Daymark.

### Self-hosting the sync server
The server stores your vault in plain JSON files under `./data` and also serves the web app (installable as a PWA).

**Docker (recommended)**
```bash
DAYMARK_PASSWORD='choose-a-strong-one' docker compose up -d
```

**Node 20+**
```bash
npm ci && npm run build
DAYMARK_PASSWORD='choose-a-strong-one' npm start
```

Then on each device open **Sync** (phone) or **Self-Hosted Server** (desktop), enter `http://<server-ip>:3000`, the user `admin` and your password. Devices merge edits task by task; nothing is overwritten. The password is only read on the first start (8+ characters); change it later from the app. Put the server behind HTTPS (e.g. Caddy or nginx) if it is reachable from the internet. Full reference: [`.ai-configs/project/api-and-sync.md`](./.ai-configs/project/api-and-sync.md).

---

## 📱 Mobile & Native Widgets

- **Web / PWA**: Responsive mobile app shell accessible on iOS Safari and Android Chrome with home-screen installability.
- **Android Glance Widget**: Native Android home-screen widget in `mobile/android/DaymarkGlanceWidget.kt`.
- **iOS WidgetKit**: Native iOS small, medium, and lock-screen widget in `mobile/ios/DaymarkWidget.swift`.

---

## 📄 License & Sovereignty

Daymark is local-first. Your notes are stored as standard Markdown files (`.md`) on your device and can be exported as a complete Obsidian-compatible vault ZIP at any time. Zero telemetry, zero proprietary lock-in.
