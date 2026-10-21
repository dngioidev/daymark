package app.daymark.notes

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * Bridge between the web app (WebView) and the home-screen widget.
 * JS side: src/native/daymarkBridge.ts.
 */
@CapacitorPlugin(name = "DaymarkBridge")
class DaymarkBridgePlugin : Plugin() {

    @PluginMethod
    fun setSnapshot(call: PluginCall) {
        try {
            WidgetStore.saveSnapshot(context, call.data.toString())
        } catch (e: Exception) {
            call.reject("Invalid widget snapshot", e)
            return
        }
        CoroutineScope(Dispatchers.Default).launch { DaymarkGlanceWidget().refreshAll(context) }
        call.resolve()
    }

    /** Shows Android's "add widget to home screen" confirmation (API 26+, launcher permitting). */
    @PluginMethod
    fun pinWidget(call: PluginCall) {
        val manager = AppWidgetManager.getInstance(context)
        val supported = manager.isRequestPinAppWidgetSupported
        val requested = supported &&
            manager.requestPinAppWidget(ComponentName(context, DaymarkWidgetReceiver::class.java), null, null)
        call.resolve(JSObject().put("requested", requested))
    }

    @PluginMethod
    fun consumeActions(call: PluginCall) {
        val actions = JSArray()
        for (taskId in WidgetStore.consumeActions(context)) {
            actions.put(JSObject().put("type", "toggle").put("taskId", taskId))
        }
        if (WidgetStore.consumeCaptureRequest(context)) actions.put(JSObject().put("type", "capture"))
        call.resolve(JSObject().put("actions", actions))
    }
}
