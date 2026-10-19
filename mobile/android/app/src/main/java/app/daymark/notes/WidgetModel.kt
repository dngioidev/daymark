package app.daymark.notes

import java.time.LocalDate
import java.time.temporal.ChronoUnit

/** A task as shown on the home-screen widget. Mirrors `WidgetTask` in src/utils/widgetSnapshot.ts. */
data class WidgetTask(
    val id: String,
    val title: String,
    val status: String,
    val createdDate: String,
) {
    val isDone: Boolean get() = status == "done"
}

data class WidgetSnapshot(val date: String, val tasks: List<WidgetTask>)

/**
 * Pure widget logic (no Android dependencies), covered by JVM unit tests.
 * The web app stays the source of truth; the widget only displays a snapshot and queues toggles.
 */
object WidgetModel {
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

    /** Calendar days since the task was created, never negative; 0 when the date cannot be parsed. */
    fun ageDays(createdDate: String, today: LocalDate): Long =
        try {
            maxOf(0L, ChronoUnit.DAYS.between(LocalDate.parse(createdDate), today))
        } catch (e: Exception) {
            0L
        }

    /** Same thresholds as the web app defaults: attention from 3 days, critical from 7. */
    fun severity(ageDays: Long): Severity = when {
        ageDays >= 7 -> Severity.CRITICAL
        ageDays >= 3 -> Severity.ATTENTION
        else -> Severity.NORMAL
    }

    enum class Severity { NORMAL, ATTENTION, CRITICAL }
}
