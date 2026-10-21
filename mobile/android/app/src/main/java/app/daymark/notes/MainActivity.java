package app.daymark.notes;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    /** Intent extra set by the home-screen widget's + button. */
    public static final String EXTRA_ACTION = "daymark_action";
    public static final String ACTION_CAPTURE = "capture";

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

    /** Queues "open the new-task sheet" for the web app, which reads it on start/resume. */
    private void handleWidgetIntent(Intent intent) {
        if (intent != null && ACTION_CAPTURE.equals(intent.getStringExtra(EXTRA_ACTION))) {
            WidgetStore.INSTANCE.requestCapture(this);
            intent.removeExtra(EXTRA_ACTION);
        }
    }
}
