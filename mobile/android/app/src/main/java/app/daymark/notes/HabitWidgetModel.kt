package app.daymark.notes

import java.time.LocalDate
import org.json.JSONArray
import org.json.JSONObject

/** Mirrors HabitWidgetSnapshot in src/types/daymark.ts. History ends before snapshot.date. */
data class HabitSnapshotRow(
    val id: String, val name: String, val doneToday: Boolean, val streakBefore: Int,
    val lastDoneBefore: String?, val addedOn: String, val warnAfterDays: Int,
)
data class HabitSnapshot(val date: String, val habits: List<HabitSnapshotRow>, val countingDays: String = "all") {
    companion object {
        fun parse(json: String): HabitSnapshot {
            val obj = JSONObject(json)
            val habits = obj.getJSONArray("habits")
            return HabitSnapshot(obj.getString("date"), (0 until habits.length()).map { index ->
                val row = habits.getJSONObject(index)
                HabitSnapshotRow(row.getString("id"), row.getString("name"), row.getBoolean("doneToday"),
                    row.getInt("streakBefore"), if (row.isNull("lastDoneBefore")) null else row.getString("lastDoneBefore"),
                    row.getString("addedOn"), row.getInt("warnAfterDays"))
            }, obj.optString("countingDays", "all"))
        }
    }
}
data class HabitAction(val habitId: String, val date: String, val done: Boolean, val at: String) {
    fun toJson(): JSONObject = JSONObject().put("habitId", habitId).put("date", date).put("done", done).put("at", at)
    companion object {
        fun parse(obj: JSONObject) = HabitAction(obj.getString("habitId"), obj.getString("date"), obj.getBoolean("done"), obj.getString("at"))
    }
}
data class HabitRow(val id: String, val name: String, val done: Boolean, val streak: Int, val missedDays: Long, val warning: Boolean)
data class HabitWidgetView(val rows: List<HabitRow>, val done: Int, val total: Int)
data class HabitWidgetLayout(val rows: List<HabitRow>, val hidden: Int)
enum class HabitWidgetMode { EMPTY, COUNTER, COMPACT, CHECKLIST }

/** Pure date replay: an absent day is unticked, and today's miss cannot break yesterday's streak. */
object HabitWidgetModel {
    fun mode(widthDp: Float, total: Int): HabitWidgetMode = when {
        total == 0 -> HabitWidgetMode.EMPTY
        widthDp < 110 -> HabitWidgetMode.COUNTER
        widthDp < 180 -> HabitWidgetMode.COMPACT
        else -> HabitWidgetMode.CHECKLIST
    }
    /** A damaged entry must not discard valid ticks elsewhere in the persisted queue. */
    fun parseActions(json: String?): List<HabitAction> {
        val arr = try { JSONArray(json ?: "[]") } catch (_: Exception) { return emptyList() }
        return (0 until arr.length()).mapNotNull { index ->
            try { HabitAction.parse(arr.getJSONObject(index)) } catch (_: Exception) { null }
        }
    }

    fun streakLabel(streak: Int): String = if (streak == 0) "–" else "🔥$streak"

    // Global cycle constraint: habit checkbox targets must remain at least 44dp even in compact mode.
    fun rowHeightDp(style: WidgetStyle): Int = maxOf(44, style.rowHeightDp)

    fun view(snapshot: HabitSnapshot, queued: List<HabitAction>, today: LocalDate): HabitWidgetView {
        val start = LocalDate.parse(snapshot.date)
        val effectiveToday = maxOf(today, start) // A backwards clock keeps the snapshot's ticks.
        val actions = queued.associateBy { it.habitId to it.date }
        val rows = snapshot.habits.map { habit ->
            var streakBefore = habit.streakBefore
            var lastDone = habit.lastDoneBefore?.let(LocalDate::parse)
            fun doneOn(day: LocalDate) = actions[habit.id to day.toString()]?.done
                ?: (day == start && habit.doneToday)
            var day = start
            while (day < effectiveToday) {
                val done = doneOn(day)
                streakBefore = if (done) streakBefore + 1 else 0
                if (done) lastDone = day
                day = day.plusDays(1)
            }
            val done = doneOn(effectiveToday)
            val addedOn = LocalDate.parse(habit.addedOn)
            val firstMiss = maxOf(lastDone?.plusDays(1) ?: addedOn, addedOn)
            val missed = WidgetModel.countDays(firstMiss, effectiveToday, snapshot.countingDays)
            HabitRow(habit.id, habit.name, done, streakBefore + if (done) 1 else 0,
                missed, !done && missed >= habit.warnAfterDays)
        }
        return HabitWidgetView(rows, rows.count { it.done }, rows.size)
    }

    /** Same header/overflow budget as WidgetModel; habits remain visible when ticked. */
    fun layout(rows: List<HabitRow>, style: WidgetStyle, heightDp: Float, compact: Boolean = false): HabitWidgetLayout {
        val rowHeight = rowHeightDp(style)
        val budget = (heightDp - if (compact) 52 else 60).coerceAtLeast(rowHeight.toFloat())
        if (rows.size * rowHeight <= budget) return HabitWidgetLayout(rows, 0)
        val count = ((budget - rowHeight) / rowHeight).toInt().coerceAtLeast(if (compact) 1 else 0)
        return HabitWidgetLayout(rows.take(count), rows.size - count)
    }
}
