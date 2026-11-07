package app.daymark.notes

import android.view.MotionEvent

/**
 * Tracks the S Pen side button (or a pen's eraser end). The Android WebView does not report
 * the button in pointer events, so MainActivity forwards each change to the page, where the
 * ink canvas erases while it is held.
 */
class StylusButton {
    var pressed = false
        private set

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

    companion object {
        fun isEraser(toolType: Int, buttonState: Int): Boolean =
            toolType == MotionEvent.TOOL_TYPE_ERASER ||
                buttonState and (MotionEvent.BUTTON_STYLUS_PRIMARY or MotionEvent.BUTTON_SECONDARY) != 0

        fun script(pressed: Boolean): String =
            "window.dispatchEvent(new CustomEvent('daymark-stylus-button',{detail:{pressed:$pressed}}))"
    }
}
