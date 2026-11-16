---
title: Sync
order: 17
group: features
summary: Keep your devices in step through your own Daymark server.
show: settings-sync
related: backups, getting-started
---
## Web
1. Open your Daymark server in the browser and sign in. The browser syncs with that server automatically.
2. Open **Settings → Sync** to see the status or choose **Sync now**.
3. Keep working offline; changes are exchanged when you reconnect.

Sync covers daily documents, notes and folders, tags, settings, habits, the backlog, events and your Not related choices. Events sync individually by ID when both the client and server support the `events` feature. If an older server does not support events, Daymark keeps them on that device and continues syncing supported data; update the server before expecting events to sync. Each browser profile keeps its own local copy. A web build hosted elsewhere is local-only; use backups to move its data. Sync exchanges deletions too, so it does not replace a backup.
## Phone
1. In the Android app, open **Settings → Sync**.
2. Enter your server address and account details, then choose **Connect and sync**.
3. Let sync finish before relying on another device's view.

In a phone browser, open the server itself and sign in instead. A browser install and the Android app keep separate copies and need separate sign-ins. Background photos stay on each device. Keep regular backups as well. Event times and dates retain their original zone and placement as they sync; each device shows its own current local-time secondary display.
