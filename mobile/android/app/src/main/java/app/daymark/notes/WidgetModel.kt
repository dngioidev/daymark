package app.daymark.notes

import java.time.LocalDate
import java.time.temporal.ChronoUnit
import org.json.JSONArray
import org.json.JSONObject

/** A task as shown on the home-screen widget. Mirrors `WidgetTask` in src/utils/widgetSnapshot.ts. */
data class WidgetTask(
    val id: String,
    val title: String,
    val status: String,
    val createdDate: String,
    val section: String = "",
    val countingDays: String = "all",
) {
    val isDone: Boolean get() = status == "done"
}

data class Aging(val attentionDays: Int = 3, val criticalDays: Int = 7, val enabled: Boolean = true)

data class WidgetSnapshot(val date: String, val tasks: List<WidgetTask>, val aging: Aging = Aging()) {
    companion object {
        fun parse(json: String): WidgetSnapshot {
            val obj = JSONObject(json)
            val arr = obj.optJSONArray("tasks") ?: JSONArray()
            val tasks = (0 until arr.length()).map { i ->
                val t = arr.getJSONObject(i)
                WidgetTask(
                    id = t.getString("id"),
                    title = t.optString("title"),
                    status = t.optString("status", "in-progress"),
                    createdDate = t.optString("createdDate"),
                    section = t.optString("section"),
                    countingDays = t.optString("countingDays", "all"),
                )
            }
            val aging = obj.optJSONObject("aging")
            val defaults = Aging()
            return WidgetSnapshot(obj.optString("date"), tasks, Aging(
                attentionDays = aging?.optInt("attentionDays", defaults.attentionDays) ?: defaults.attentionDays,
                criticalDays = aging?.optInt("criticalDays", defaults.criticalDays) ?: defaults.criticalDays,
                enabled = aging?.optBoolean("enabled", defaults.enabled) ?: defaults.enabled,
            ))
        }
    }
}
data class WidgetDisplayRow(val task: WidgetTask, val sectionHeader: String?)
data class WidgetLayout(val rows: List<WidgetDisplayRow>, val hidden: Int)

/**
 * Pure widget logic (no Android dependencies), covered by JVM unit tests.
 * The web app stays the source of truth; the widget only displays a snapshot and queues toggles.
 */
object WidgetModel {
    /** Account for optional section headers and reserve a full row for overflow, as before. */
    fun layout(tasks: List<WidgetTask>, style: WidgetStyle, heightDp: Float): WidgetLayout {
        val visible = tasks.filter { style.show.done || !it.isDone }
        val rows = visible.mapIndexed { index, task ->
            val header = task.section.takeIf {
                style.show.sections && it.isNotEmpty() && (index == 0 || visible[index - 1].section != it)
            }
            WidgetDisplayRow(task, header)
        }
        fun cost(row: WidgetDisplayRow) = style.rowHeightDp + if (row.sectionHeader != null) style.sectionHeightDp else 0
        // Keep the original header allowance and at-least-one-row capacity for existing widgets.
        val budget = (heightDp - 60).coerceAtLeast(style.rowHeightDp.toFloat())
        if (rows.sumOf { cost(it) } <= budget) return WidgetLayout(rows, 0)
        var remaining = budget - style.rowHeightDp
        val shown = rows.takeWhile { row ->
            val fits = cost(row) <= remaining
            if (fits) remaining -= cost(row)
            fits
        }
        return WidgetLayout(shown, rows.size - shown.size)
    }

    /** Flips done / in-progress for every task id queued by widget taps (an id queued twice flips back). */
    fun applyToggles(tasks: List<WidgetTask>, queuedToggleIds: List<String>): List<WidgetTask> {
        val flips = queuedToggleIds.groupingBy { it }.eachCount().filterValues { it % 2 == 1 }.keys
        return tasks.map { t ->
            if (t.id in flips) t.copy(status = if (t.isDone) "in-progress" else "done") else t
        }
    }

    /**
     * Tasks to display on [today]. If the snapshot is from an earlier day (the app has not been
     * opened since midnight), finished tasks are dropped because only unfinished ones carry forward.
     */
    fun tasksForDisplay(snapshot: WidgetSnapshot, today: LocalDate): List<WidgetTask> =
        if (snapshot.date == today.toString()) snapshot.tasks else snapshot.tasks.filter { !it.isDone }

    /** Counted days since the task was created, never negative; 0 when the date cannot be parsed. */
    fun ageDays(createdDate: String, today: LocalDate, mode: String = "all"): Long =
        try {
            countDays(LocalDate.parse(createdDate).plusDays(1), today.plusDays(1), mode)
        } catch (e: Exception) {
            0L
        }

    /** Count [from, to), using local calendar dates, just like the app. */
    fun countDays(from: LocalDate, to: LocalDate, mode: String = "all"): Long {
        if (mode != "weekdays" && mode != "weekend") return maxOf(0L, ChronoUnit.DAYS.between(from, to))
        var date = from
        var count = 0L
        while (date < to) {
            val weekend = date.dayOfWeek.value >= 6
            if (if (mode == "weekend") weekend else !weekend) count++
            date = date.plusDays(1)
        }
        return count
    }

    /** Owner's warning thresholds, with web app defaults for legacy snapshots. */
    fun severity(ageDays: Long, aging: Aging = Aging()): Severity = when {
        !aging.enabled -> Severity.NORMAL
        ageDays >= aging.criticalDays -> Severity.CRITICAL
        ageDays >= aging.attentionDays -> Severity.ATTENTION
        else -> Severity.NORMAL
    }

    enum class Severity { NORMAL, ATTENTION, CRITICAL }
}
