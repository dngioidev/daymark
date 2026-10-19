package app.daymark.notes;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugins must be registered before super.onCreate so the WebView can reach them
        registerPlugin(DaymarkBridgePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
