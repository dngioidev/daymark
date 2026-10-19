# Daymark Mobile Architecture & Native Companion

This directory contains the native Android (Kotlin / Jetpack Compose & Glance) and iOS (Swift / SwiftUI WidgetKit) codebase for Daymark.

## Folder Structure

```text
mobile/
├── android/                    # Real Android project (Capacitor shell around the web app + Glance widget)
│   └── app/src/main/java/app/daymark/notes/
│       ├── MainActivity.java       # Registers the bridge plugin, hosts the WebView
│       ├── DaymarkBridgePlugin.kt  # JS <-> native: setSnapshot, consumeActions, pinWidget
│       ├── WidgetStore.kt          # SharedPreferences: snapshot + queued widget toggles
│       ├── WidgetModel.kt          # Pure logic (toggles, aging, stale-day handling), unit tested
│       └── DaymarkGlanceWidget.kt  # Jetpack Glance home-screen widget (small / medium / large)
├── android-reference/          # Earlier Compose/Kotlin sketches, superseded by the WebView UI (not built)
└── ios/
    ├── DaymarkWidget.swift        # iOS WidgetKit provider (Small, Medium, Lock Screen + widgetURL deep links)
    └── DaymarkNotesView.swift     # SwiftUI Notes vault view with folder filtering and distraction-free editor
```

## Building the Android app

Needs a standard **JDK 21** (not GraalVM: its `jlink` breaks the Android Gradle plugin) and the Android SDK.

```bash
npm run android:build -- --test   # web build -> cap sync -> Kotlin unit tests -> debug APK
adb install -r mobile/android/app/build/outputs/apk/debug/app-debug.apk
node scripts/e2e-android-native.mjs   # end-to-end on a booted emulator/device (widget included)
```

The APK is a **debug build**: sideload it for personal use. Play Store distribution needs a signing key and a release build (not set up yet).

### How the widget works
The web app (IndexedDB) remains the source of truth. It pushes a small snapshot of today's tasks to the native side (`setSnapshot`); the widget renders that snapshot. Ticking a widget checkbox queues a toggle and redraws immediately; the web app applies queued toggles (`consumeActions`) when it starts or returns to the foreground. See `src/hooks/useWidgetSync.ts` and ADR 8.

## Key Native Capabilities & FAQ

### 1. Does the widget open the PWA app?
- **Yes**:
  - **1-Tap Task Checkbox**: Background execution via Glance `ActionCallback` or iOS `AppIntent` updates the task state silently without opening the full application.
  - **Tapping Widget Header or Task Card**: Fires an Android `actionStartActivity(Intent(ACTION_VIEW))` or iOS `.widgetURL("https://daymark.app/?tab=today&date=...")`. If the user has installed Daymark as a PWA (WebAPK / Standalone) or native app shell, the OS routes the deep link directly to the app in full-screen standalone mode at that exact daily journal!
  - **PWA Long-Press Shortcuts**: When installed as a PWA, long-pressing the home screen icon exposes quick actions: *Today's Notebook*, *Quick Capture*, and *Notes Vault*.

### 2. Mobile Native App Notes Approach (Planned Native Roadmap)
- **Local-First Markdown Vault**: Both Android and iOS store notes as pure `.md` files in scoped app storage (Android) or shared App Group container (iOS: `group.com.daymark.vault`). Widgets and the main note editor share the exact same files with zero network latency.
- **Ergonomic Touch Formatting Toolbar**: The mobile editor provides one-tap Markdown syntax buttons (`#`, `##`, `- [ ]`, `**B**`, `*I*`, `` `Code` ``, `> Quote`) right above the virtual keyboard.
- **Biometric Security & Offline-First**: Optional biometric lock (FaceID / Fingerprint) and instant SQLite index over Markdown files for sub-millisecond search across thousands of notes.
- **Coexistence with PWA**: Currently, Daymark ships as a responsive PWA with full-width desktop mode and mobile app shell. The native Kotlin and Swift codebases in this directory are structured for direct compilation when packaging for Google Play and Apple App Store.
