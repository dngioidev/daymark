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
                    section = t.optString("section"),
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

    fun defaultStyle(context: Context): WidgetStyle = WidgetStyle.parse(prefs(context).getString("style_default", null))

    /** Copy the default once; future default edits must not restyle existing widgets. */
    fun style(context: Context, id: Int): WidgetStyle = synchronized(lock) {
        val raw = prefs(context).getString("style_$id", null)
        if (raw != null) WidgetStyle.parse(raw) else defaultStyle(context).also {
            prefs(context).edit().putString("style_$id", it.toJson()).apply()
        }
    }

    fun setStyle(context: Context, id: String, style: WidgetStyle) = synchronized(lock) {
        prefs(context).edit().putString("style_$id", style.toJson()).apply()
    }

    fun removeStyle(context: Context, id: Int) = synchronized(lock) {
        val editor = prefs(context).edit().remove("style_$id")
        if (prefs(context).getInt("configure_request", -1) == id) editor.remove("configure_request")
        editor.apply()
    }

    fun requestConfigure(context: Context, id: Int) = synchronized(lock) {
        style(context, id)
        prefs(context).edit().putInt("configure_request", id).apply()
    }

    fun consumeConfigureRequest(context: Context): Int? = synchronized(lock) {
        val id = prefs(context).getInt("configure_request", -1)
        prefs(context).edit().remove("configure_request").apply()
        id.takeIf { it > 0 }
    }

    fun setAppColors(context: Context, colors: AppColors) = synchronized(lock) {
        val json = JSONObject().put("headerBg", colors.headerBg).put("headerText", colors.headerText)
            .put("accent", colors.accent).put("dark", colors.dark)
        prefs(context).edit().putString("app_colors", json.toString()).apply()
    }

    fun appColors(context: Context): AppColors? = try {
        val raw = prefs(context).getString("app_colors", null)
        if (raw == null) null else JSONObject(raw).let {
            AppColors(it.getString("headerBg"), it.getString("headerText"), it.getString("accent"), it.getBoolean("dark"))
        }
    } catch (_: Exception) { null }

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
