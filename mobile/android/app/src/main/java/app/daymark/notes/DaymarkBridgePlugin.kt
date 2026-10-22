package app.daymark.notes

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.graphics.Color
import android.os.Build
import android.view.View
import android.view.WindowInsetsController
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
 * Bridge between the web app (WebView), system bars and the home-screen widget.
 * JS side: src/native/daymarkBridge.ts.
 */
@CapacitorPlugin(name = "DaymarkBridge")
class DaymarkBridgePlugin : Plugin() {

    @PluginMethod
    fun setSystemBars(call: PluginCall) {
        val color = call.getString("color")
        val lightIcons = call.getBoolean("lightIcons")
        if (color == null || !color.matches(Regex("^#[0-9a-fA-F]{6}$")) || lightIcons == null) {
            call.reject("Expected an opaque hex colour and lightIcons")
            return
        }
        val statusBarColor = Color.parseColor(color)
        activity.runOnUiThread {
            try {
                val window = activity.window
                window.statusBarColor = statusBarColor
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    window.insetsController?.setSystemBarsAppearance(
                        if (lightIcons) 0 else WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS,
                        WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                    )
                } else {
                    val decor = window.decorView
                    decor.systemUiVisibility = if (lightIcons) {
                        decor.systemUiVisibility and View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR.inv()
                    } else {
                        decor.systemUiVisibility or View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
                    }
                }
                call.resolve()
            } catch (e: Exception) {
                call.reject("Could not update the system bars", e)
            }
        }
    }

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
