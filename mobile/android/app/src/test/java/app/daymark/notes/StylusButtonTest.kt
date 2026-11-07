package app.daymark.notes

import android.view.MotionEvent
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class StylusButtonTest {
    private val stylus = MotionEvent.TOOL_TYPE_STYLUS
    private val primary = MotionEvent.BUTTON_STYLUS_PRIMARY

    @Test fun `button press and release are reported once each`() {
        val button = StylusButton()
        assertEquals(true, button.update(stylus, primary, MotionEvent.ACTION_HOVER_MOVE))
        assertNull(button.update(stylus, primary, MotionEvent.ACTION_DOWN))
        assertNull(button.update(stylus, primary, MotionEvent.ACTION_MOVE))
        assertEquals(false, button.update(stylus, 0, MotionEvent.ACTION_MOVE))
        assertNull(button.update(stylus, 0, MotionEvent.ACTION_UP))
    }

    @Test fun `eraser end counts as held`() {
        val button = StylusButton()
        assertEquals(true, button.update(MotionEvent.TOOL_TYPE_ERASER, 0, MotionEvent.ACTION_DOWN))
    }

    @Test fun `fingers and mice are ignored`() {
        val button = StylusButton()
        assertNull(button.update(MotionEvent.TOOL_TYPE_FINGER, primary, MotionEvent.ACTION_DOWN))
        assertNull(button.update(MotionEvent.TOOL_TYPE_MOUSE, primary, MotionEvent.ACTION_DOWN))
    }

    @Test fun `hover exit as the pen touches down keeps a held button held`() {
        // Android sends HOVER_EXIT (often with no button state) right before ACTION_DOWN.
        val button = StylusButton()
        assertEquals(true, button.update(stylus, primary, MotionEvent.ACTION_HOVER_MOVE))
        assertNull(button.update(stylus, 0, MotionEvent.ACTION_HOVER_EXIT))
        assertNull(button.update(stylus, primary, MotionEvent.ACTION_DOWN))
    }

    @Test fun `cancel releases a held button`() {
        val button = StylusButton()
        button.update(stylus, primary, MotionEvent.ACTION_DOWN)
        assertEquals(false, button.update(stylus, primary, MotionEvent.ACTION_CANCEL))
    }

    @Test fun `script dispatches the page event`() {
        assertEquals(
            "window.dispatchEvent(new CustomEvent('daymark-stylus-button',{detail:{pressed:true}}))",
            StylusButton.script(true),
        )
    }

    @Test fun `a stroke started with the button held goes to the WebView as an eraser until it lifts`() {
        val button = StylusButton()
        assertEquals(StylusButton.Rewrite.ERASER, button.rewrite(stylus, primary, MotionEvent.ACTION_DOWN))
        // Letting go of the button part-way keeps erasing until the pen lifts.
        assertEquals(StylusButton.Rewrite.ERASER, button.rewrite(stylus, 0, MotionEvent.ACTION_MOVE))
        assertEquals(StylusButton.Rewrite.ERASER, button.rewrite(stylus, 0, MotionEvent.ACTION_UP))
        assertEquals(StylusButton.Rewrite.NONE, button.rewrite(stylus, 0, MotionEvent.ACTION_DOWN))
    }

    @Test fun `a button pressed part-way is stripped so the stroke keeps arriving`() {
        val button = StylusButton()
        assertEquals(StylusButton.Rewrite.NONE, button.rewrite(stylus, 0, MotionEvent.ACTION_DOWN))
        assertEquals(StylusButton.Rewrite.STRIP, button.rewrite(stylus, primary, MotionEvent.ACTION_MOVE))
        assertEquals(StylusButton.Rewrite.STRIP, button.rewrite(stylus, primary, MotionEvent.ACTION_UP))
        assertEquals(StylusButton.Rewrite.STRIP, button.rewrite(stylus, primary, MotionEvent.ACTION_HOVER_MOVE))
    }

    @Test fun `fingers, mice and eraser ends pass through unchanged`() {
        val button = StylusButton()
        assertEquals(StylusButton.Rewrite.NONE, button.rewrite(MotionEvent.TOOL_TYPE_FINGER, primary, MotionEvent.ACTION_DOWN))
        assertEquals(StylusButton.Rewrite.NONE, button.rewrite(MotionEvent.TOOL_TYPE_ERASER, 0, MotionEvent.ACTION_DOWN))
        assertEquals(StylusButton.Rewrite.NONE, button.rewrite(stylus, 0, MotionEvent.ACTION_HOVER_MOVE))
    }
}
