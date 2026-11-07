package app.daymark.notes

import android.view.MotionEvent

/**
 * Handles the S Pen side button (or a pen's eraser end) for the ink canvas.
 *
 * The Android WebView sends no pointer events at all for a stroke drawn with the side button
 * held; it fires a context menu instead (seen on a Galaxy Tab S9 FE, Android 16). So
 * MainActivity rewrites those events before the WebView sees them:
 * - a stroke that starts with the button held is passed on as an eraser-end stroke, which the
 *   WebView reports normally (pointer button 5 / buttons 32) and the page erases with;
 * - a stroke where the button is pressed part-way keeps its pen tool with the button removed,
 *   and the page switches to erasing from the forwarded button state ([update] / [script]).
 */
class StylusButton {
    enum class Rewrite { NONE, STRIP, ERASER }

    var pressed = false
        private set
    private var eraserStroke = false

    /** Returns the new state when it changed, or null when it did not (or the pointer is not a pen). */
    fun update(toolType: Int, buttonState: Int, action: Int): Boolean? {
        val pen = toolType == MotionEvent.TOOL_TYPE_STYLUS || toolType == MotionEvent.TOOL_TYPE_ERASER
        // HOVER_EXIT comes right before each touch-down, often without the button state; the next
        // event (DOWN, or HOVER_ENTER when the pen comes back) carries the real state.
        if (!pen || action == MotionEvent.ACTION_HOVER_EXIT) return null
        val next = action != MotionEvent.ACTION_CANCEL && isEraser(toolType, buttonState)
        if (next == pressed) return null
        pressed = next
        return next
    }

    /** How MainActivity should pass this event to the WebView. */
    fun rewrite(toolType: Int, buttonState: Int, action: Int): Rewrite {
        if (toolType != MotionEvent.TOOL_TYPE_STYLUS) return Rewrite.NONE
        val held = buttonState and BUTTONS != 0
        if (action == MotionEvent.ACTION_DOWN) eraserStroke = held
        val result = when {
            eraserStroke -> Rewrite.ERASER
            held -> Rewrite.STRIP
            else -> Rewrite.NONE
        }
        if (action == MotionEvent.ACTION_UP || action == MotionEvent.ACTION_CANCEL) eraserStroke = false
        return result
    }

    companion object {
        private const val BUTTONS = MotionEvent.BUTTON_STYLUS_PRIMARY or MotionEvent.BUTTON_SECONDARY

        fun isEraser(toolType: Int, buttonState: Int): Boolean =
            toolType == MotionEvent.TOOL_TYPE_ERASER || buttonState and BUTTONS != 0

        fun script(pressed: Boolean): String =
            "window.dispatchEvent(new CustomEvent('daymark-stylus-button',{detail:{pressed:$pressed}}))"

        /** A copy of [event], every sample kept, with no buttons and (when [eraser]) the eraser tool. */
        fun rebuild(event: MotionEvent, eraser: Boolean): MotionEvent {
            val count = event.pointerCount
            val properties = Array(count) { i ->
                MotionEvent.PointerProperties().also {
                    event.getPointerProperties(i, it)
                    if (eraser && it.toolType == MotionEvent.TOOL_TYPE_STYLUS) it.toolType = MotionEvent.TOOL_TYPE_ERASER
                }
            }
            fun coords(sample: Int) = Array(count) { i ->
                MotionEvent.PointerCoords().also {
                    if (sample < 0) event.getPointerCoords(i, it) else event.getHistoricalPointerCoords(i, sample, it)
                }
            }
            val history = event.historySize
            val copy = MotionEvent.obtain(
                event.downTime, if (history > 0) event.getHistoricalEventTime(0) else event.eventTime,
                event.action, count, properties, coords(if (history > 0) 0 else -1), event.metaState, 0,
                event.xPrecision, event.yPrecision, event.deviceId, event.edgeFlags, event.source, event.flags,
            )
            for (sample in 1 until history) copy.addBatch(event.getHistoricalEventTime(sample), coords(sample), event.metaState)
            if (history > 0) copy.addBatch(event.eventTime, coords(-1), event.metaState)
            return copy
        }
    }
}
