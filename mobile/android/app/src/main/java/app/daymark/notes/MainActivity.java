package app.daymark.notes;

import android.content.Intent;
import android.os.Bundle;
import android.view.MotionEvent;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    /** Intent extra set by the home-screen widget's + button. */
    public static final String EXTRA_ACTION = "daymark_action";
    public static final String ACTION_CAPTURE = "capture";
    public static final String ACTION_HABITS = "habits";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugins must be registered before super.onCreate so the WebView can reach them
        registerPlugin(DaymarkBridgePlugin.class);
        super.onCreate(savedInstanceState);
        handleWidgetIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleWidgetIntent(intent);
    }

    private final StylusButton stylusButton = new StylusButton();

    @Override
    public boolean dispatchTouchEvent(MotionEvent event) {
        forwardStylusButton(event);
        return super.dispatchTouchEvent(event);
    }

    @Override
    public boolean dispatchGenericMotionEvent(MotionEvent event) {
        forwardStylusButton(event);
        return super.dispatchGenericMotionEvent(event);
    }

    /** The WebView drops the S Pen button from pointer events; tell the page when it changes. */
    private void forwardStylusButton(MotionEvent event) {
        Boolean changed = stylusButton.update(event.getToolType(0), event.getButtonState(), event.getActionMasked());
        if (changed == null || getBridge() == null || getBridge().getWebView() == null) return;
        getBridge().getWebView().evaluateJavascript(StylusButton.Companion.script(changed), null);
    }

    /** Queues "open the new-task sheet" for the web app, which reads it on start/resume. */
    private void handleWidgetIntent(Intent intent) {
        if (intent != null && ACTION_CAPTURE.equals(intent.getStringExtra(EXTRA_ACTION))) {
            WidgetStore.INSTANCE.requestCapture(this);
            intent.removeExtra(EXTRA_ACTION);
        } else if (intent != null && ACTION_HABITS.equals(intent.getStringExtra(EXTRA_ACTION))) {
            WidgetStore.INSTANCE.requestHabits(this);
            intent.removeExtra(EXTRA_ACTION);
        }
    }
}
