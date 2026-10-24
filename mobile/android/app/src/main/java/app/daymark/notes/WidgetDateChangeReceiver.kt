package app.daymark.notes

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/** Refresh date-dependent compositions even when the app and widget sessions are closed. */
class WidgetDateChangeReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action !in setOf(Intent.ACTION_DATE_CHANGED, Intent.ACTION_TIME_CHANGED, Intent.ACTION_TIMEZONE_CHANGED)) return
        val pending = goAsync()
        val appContext = context.applicationContext
        CoroutineScope(Dispatchers.Default).launch {
            try {
                // Attempt both providers even if updating one fails.
                try {
                    DaymarkGlanceWidget().refreshAll(appContext)
                } catch (e: Exception) {
                    Log.e("DaymarkWidget", "Could not refresh task widgets after date/time change", e)
                }
                try {
                    DaymarkHabitsGlanceWidget().refreshAll(appContext)
                } catch (e: Exception) {
                    Log.e("DaymarkWidget", "Could not refresh habit widgets after date/time change", e)
                }
            } finally {
                pending.finish()
            }
        }
    }
}
