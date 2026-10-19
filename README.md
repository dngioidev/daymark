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

### Production Build & Self-Hosting
```bash
# Build the client application
npm run build

# Start the self-hosted sync server
export DAYMARK_USER="admin"
export DAYMARK_PASSWORD="your-secure-password"
export PORT=3000
npm start
```

---

## 📱 Mobile & Native Widgets

- **Web / PWA**: Responsive mobile app shell accessible on iOS Safari and Android Chrome with home-screen installability.
- **Android Glance Widget**: Native Android home-screen widget in `mobile/android/DaymarkGlanceWidget.kt`.
- **iOS WidgetKit**: Native iOS small, medium, and lock-screen widget in `mobile/ios/DaymarkWidget.swift`.

---

## 📄 License & Sovereignty

Daymark is local-first. Your notes are stored as standard Markdown files (`.md`) on your device and can be exported as a complete Obsidian-compatible vault ZIP at any time. Zero telemetry, zero proprietary lock-in.
