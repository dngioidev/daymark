# S Pen side button: why it needed native code

Date: 2026-11-07 · Device: Galaxy Tab S9 FE (SM-X510), Android 16, Daymark Android app

## Finding
Holding the S Pen side button should switch the pen to the eraser. It did not, through three page-side fixes, because the Android WebView **sends no pointer events at all** for a stroke drawn with the side button held. The page receives one `contextmenu` event instead.

Evidence, recorded over USB on a temporary diagnostic build (never committed):

| Layer | Plain stroke | Stroke with the button held |
| :--- | :--- | :--- |
| `MainActivity` (native `MotionEvent`) | `ACTION_DOWN` / `MOVE` / `UP`, `buttonState=0` | `ACTION_DOWN` / `MOVE` / `UP`, `buttonState=32` (`BUTTON_STYLUS_PRIMARY`) |
| Page (pointer events) | `pointerdown` / `pointermove` / `pointerup`, `pointerType=pen` | no pointer events, only `contextmenu` |

So the button reaches the app, and the WebView drops the stroke.

## Fix
`MainActivity` rewrites pen events before the WebView sees them (`StylusButton.rewrite` / `StylusButton.rebuild`):
- A stroke that **starts** with the button held is passed on as an **eraser-end** stroke (`TOOL_TYPE_ERASER`, no buttons). The WebView reports it normally as `pointerType=pen`, `button=5`, `buttons=32`, and the canvas already erases with that (`pointerPolicy.isPenEraserButton`).
- A button pressed **part-way** through a stroke is removed from the event, so the stroke keeps arriving. The page switches to erasing from the forwarded button state (`daymark-stylus-button` event, `src/ink/stylusButton.ts`).
- `HOVER_EXIT`, which Android sends just before each touch-down, no longer counts as a release.

Verified on the tablet after the fix: button strokes arrive as `button=5 buttons=32` and erase; plain strokes and mid-stroke presses keep arriving.

## Not covered
- Other Samsung models and other stylus makers were not tried. A pen with a real eraser end goes through unchanged.
- Samsung Air Command still opens on a hover press if it is set to; that is a system setting, outside the app.
- The installed PWA (browser) path is unchanged: it relies on the browser reporting the button, which was not tested in Chrome on Android.
