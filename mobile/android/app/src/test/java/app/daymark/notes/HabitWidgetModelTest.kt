package app.daymark.notes

import java.time.LocalDate
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test

class HabitWidgetModelTest {
    private val date = LocalDate.parse("2026-10-20")
    private fun habit(done: Boolean = false, streak: Int = 0, last: String? = null, added: String = "2026-10-17") =
        HabitSnapshotRow("water", "Water", done, streak, last, added, 3)
    private fun snapshot(row: HabitSnapshotRow = habit()) = HabitSnapshot(date.toString(), listOf(row))
    private fun action(day: String = date.toString(), done: Boolean = true) =
        HabitAction("water", day, done, "2026-10-20T12:00:00Z")

    @Test fun `ticking today suppresses warning`() {
        val row = HabitWidgetModel.view(snapshot(habit(added = "2026-10-17")), listOf(action()), date).rows.single()
        assertEquals(false, row.warning)
        assertEquals(1, row.streak)
    }
    @Test fun `malformed queue entries preserve valid actions in order`() {
        val first = action()
        val last = action(done = false)
        val queue = JSONArray().put(first.toJson()).put(JSONObject().put("habitId", "broken"))
            .put(JSONObject.NULL).put("broken").put(42).put(last.toJson())
        val parsed = HabitWidgetModel.parseActions(queue.toString())
        assertEquals(listOf(first, last), parsed)
        assertEquals(false, HabitWidgetModel.view(snapshot(), parsed, date).rows.single().done)
        // The same read/append/write operation used by WidgetStore must retain earlier valid ticks.
        val appended = parsed + action("2026-10-21")
        assertEquals(appended, HabitWidgetModel.parseActions(JSONArray(appended.map { it.toJson() }).toString()))
    }
    @Test fun `missing or invalid queue JSON is empty`() {
        assertEquals(emptyList<HabitAction>(), HabitWidgetModel.parseActions(null))
        assertEquals(emptyList<HabitAction>(), HabitWidgetModel.parseActions("broken"))
        assertEquals(emptyList<HabitAction>(), HabitWidgetModel.parseActions("{}"))
    }
    @Test fun `zero streak uses dash and positive streak uses fire`() {
        assertEquals("–", HabitWidgetModel.streakLabel(0))
        assertEquals("🔥1", HabitWidgetModel.streakLabel(1))
        assertEquals("🔥12", HabitWidgetModel.streakLabel(12))
    }

    @Test fun `same day snapshot applies queued tick`() {
        val view = HabitWidgetModel.view(snapshot(), listOf(action()), date)
        assertEquals(true, view.rows.single().done)
        assertEquals(1, view.done)
        assertEquals(1, view.total)
    }
    @Test fun `after midnight shows unticked with streak carried`() {
        val row = HabitWidgetModel.view(snapshot(habit(true, 2, "2026-10-19")), emptyList(), date.plusDays(1)).rows.single()
        assertEquals(false, row.done)
        assertEquals(3, row.streak)
        assertEquals(0L, row.missedDays)
    }
    @Test fun `after midnight not done yesterday resets streak`() {
        assertEquals(0, HabitWidgetModel.view(snapshot(habit(false, 2, "2026-10-19")), emptyList(), date.plusDays(1)).rows.single().streak)
    }
    @Test fun `queued tick from yesterday rolls into streak`() {
        assertEquals(1, HabitWidgetModel.view(snapshot(), listOf(action()), date.plusDays(1)).rows.single().streak)
    }
    @Test fun `missed days and warning at threshold 3`() {
        val row = HabitWidgetModel.view(snapshot(), emptyList(), date).rows.single()
        assertEquals(3L, row.missedDays)
        assertEquals(true, row.warning)
        assertEquals(false, HabitWidgetModel.view(snapshot(habit(added = "2026-10-18")), emptyList(), date).rows.single().warning)
    }
    @Test fun `last action per habit and date wins`() {
        val actions = listOf(action(), action(done = false), action("2026-10-21"))
        val row = HabitWidgetModel.view(snapshot(), actions, date.plusDays(1)).rows.single()
        assertEquals(true, row.done)
        assertEquals(1, row.streak)
    }
    @Test fun `multiple days replay ticks and reset after gaps`() {
        val actions = listOf(action(), action("2026-10-22"), action("2026-10-23"))
        val row = HabitWidgetModel.view(snapshot(), actions, date.plusDays(4)).rows.single()
        assertEquals(2, row.streak)
        assertEquals(0L, row.missedDays)
    }
    @Test fun `future snapshot keeps its ticks`() {
        val row = HabitWidgetModel.view(snapshot(habit(true, 2, "2026-10-19")), emptyList(), date.minusDays(1)).rows.single()
        assertEquals(true, row.done)
        assertEquals(3, row.streak)
    }
    @Test fun `layout hides overflow`() {
        val rows = (1..8).map { HabitRow("$it", "Habit $it", false, 0, 0, false) }
        val layout = HabitWidgetModel.layout(rows, WidgetStyle(), 180f)
        assertEquals(1, layout.rows.size)
        assertEquals(7, layout.hidden)
    }
    @Test fun `habit layout retains ticked rows`() {
        val rows = listOf(HabitRow("water", "Water", true, 1, 0, false))
        assertEquals(rows, HabitWidgetModel.layout(rows, WidgetStyle(), 180f).rows)
    }
    @Test fun `snapshot reads Task 6 payload including null last done`() {
        val parsed = HabitSnapshot.parse("""{"date":"2026-10-20","updatedAt":"2026-10-20T12:00:00Z","habits":[{"id":"water","name":"Water","doneToday":false,"streakBefore":0,"lastDoneBefore":null,"addedOn":"2026-10-17","warnAfterDays":3}]}""")
        assertEquals(snapshot(), parsed)
    }
    @Test fun `habit action JSON retains explicit value date and timestamp`() {
        val original = action(done = false)
        val json = original.toJson()
        assertEquals("water", json.getString("habitId"))
        assertEquals("2026-10-20", json.getString("date"))
        assertEquals(false, json.getBoolean("done"))
        assertEquals("2026-10-20T12:00:00Z", json.getString("at"))
        assertEquals(original, HabitAction.parse(JSONObject(json.toString())))
    }
    @Test fun `layout reserves header and overflow while retaining minimum touch height`() {
        val rows = (1..5).map { HabitRow("$it", "Habit $it", false, 0, 0, false) }
        assertEquals(1, HabitWidgetModel.layout(rows, WidgetStyle(density = "compact"), 156f).rows.size)
        assertEquals(1, HabitWidgetModel.layout(rows, WidgetStyle(), 156f).rows.size)
        assertEquals(3, HabitWidgetModel.layout(rows.take(3), WidgetStyle(), 192f).rows.size)
        assertEquals(0, HabitWidgetModel.layout(rows, WidgetStyle(), 80f).rows.size)
        assertEquals(0, HabitWidgetModel.layout(emptyList(), WidgetStyle(), 80f).hidden)
    }

    @Test fun `default two by two sizes show a compact checklist`() {
        assertEquals(HabitWidgetMode.COMPACT, HabitWidgetModel.mode(110f, 2))
        assertEquals(HabitWidgetMode.COMPACT, HabitWidgetModel.mode(179f, 2))
        assertEquals(HabitWidgetMode.CHECKLIST, HabitWidgetModel.mode(180f, 2))
        assertEquals(HabitWidgetMode.COUNTER, HabitWidgetModel.mode(109f, 2))
        val rows = listOf(
            HabitRow("a", "Water", false, 0, 0, false),
            HabitRow("b", "Read", true, 5, 0, false),
        )
        val layout = HabitWidgetModel.layout(rows, WidgetStyle(), 110f, compact = true)
        assertEquals(1, layout.rows.size)
        assertEquals(1, layout.hidden)
    }
    @Test fun `empty widgets always invite adding habits at every size`() {
        for (width in listOf(80f, 110f, 179f, 240f)) {
            assertEquals(HabitWidgetMode.EMPTY, HabitWidgetModel.mode(width, 0))
        }
    }
}
