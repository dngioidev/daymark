package app.daymark.notes

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * Persists the widget snapshot (written by the web app through [DaymarkBridgePlugin]) and the
 * toggle actions queued from the widget (consumed by the web app on start/resume).
 * Uses SharedPreferences, which both the WebView plugin and the widget process can read.
 */
object WidgetStore {
    private const val PREFS = "daymark_widget"
    private const val KEY_SNAPSHOT = "snapshot"
    private const val KEY_ACTIONS = "actions"
    private const val KEY_CAPTURE = "capture_requested"
    private val lock = Any()

    private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    /** Stores the snapshot JSON as sent by the web app. Invalid JSON is rejected. */
    fun saveSnapshot(context: Context, json: String) {
        JSONObject(json) // throws on malformed input, keeping the previous snapshot
        synchronized(lock) { prefs(context).edit().putString(KEY_SNAPSHOT, json).apply() }
    }

    /** Latest snapshot with not-yet-consumed widget toggles applied, or null if the app never wrote one. */
    fun loadSnapshot(context: Context): WidgetSnapshot? {
        val raw: String
        val queued: List<String>
        synchronized(lock) {
            raw = prefs(context).getString(KEY_SNAPSHOT, null) ?: return null
            queued = readActions(context)
        }
        return try {
            val obj = JSONObject(raw)
            val arr = obj.optJSONArray("tasks") ?: JSONArray()
            val tasks = (0 until arr.length()).map { i ->
                val t = arr.getJSONObject(i)
                WidgetTask(
                    id = t.getString("id"),
                    title = t.optString("title"),
                    status = t.optString("status", "in-progress"),
                    createdDate = t.optString("createdDate"),
                )
            }
            WidgetSnapshot(obj.optString("date"), WidgetModel.applyToggles(tasks, queued))
        } catch (e: Exception) {
            null
        }
    }

    fun queueToggle(context: Context, taskId: String) {
        synchronized(lock) {
            val actions = readActions(context) + taskId
            prefs(context).edit().putString(KEY_ACTIONS, JSONArray(actions).toString()).apply()
        }
    }

    /** The widget's + button was tapped; the app opens its new-task sheet when it reads this. */
    fun requestCapture(context: Context) {
        synchronized(lock) { prefs(context).edit().putBoolean(KEY_CAPTURE, true).apply() }
    }

    /** True once after [requestCapture]. */
    fun consumeCaptureRequest(context: Context): Boolean = synchronized(lock) {
        val requested = prefs(context).getBoolean(KEY_CAPTURE, false)
        if (requested) prefs(context).edit().remove(KEY_CAPTURE).apply()
        requested
    }

    /** Returns queued toggle task ids in order and clears the queue. */
    fun consumeActions(context: Context): List<String> = synchronized(lock) {
        val actions = readActions(context)
        prefs(context).edit().remove(KEY_ACTIONS).apply()
        actions
    }

    private fun readActions(context: Context): List<String> {
        val raw = prefs(context).getString(KEY_ACTIONS, null) ?: return emptyList()
        return try {
            val arr = JSONArray(raw)
            (0 until arr.length()).map { arr.getString(it) }
        } catch (e: Exception) {
            emptyList()
        }
    }
}
