package app.daymark.notes

import java.time.LocalDate
import org.junit.Assert.assertEquals
import org.junit.Test

class WidgetModelTest {
    @Test fun `task age counts selected local days`() {
        val monday = LocalDate.parse("2026-11-02")
        assertEquals(1L, WidgetModel.ageDays("2026-10-30", monday, "weekdays"))
        assertEquals(3L, WidgetModel.ageDays("2026-10-30", monday))
        assertEquals(2L, WidgetModel.ageDays("2026-10-30", monday, "weekend"))
        assertEquals(0L, WidgetModel.ageDays("2026-10-31", monday.minusDays(1), "weekdays"))
        assertEquals(1L, WidgetModel.ageDays("2026-10-31", monday, "weekdays"))
        assertEquals(0L, WidgetModel.ageDays("malformed", monday, "weekdays"))
    }

    @Test
    fun layoutHidesDoneRowsUnlessEnabledAndRetainsOrder() {
        val tasks = listOf(task("a", "in-progress"), task("b", "done"))
        assertEquals(listOf("a"), WidgetModel.layout(tasks, WidgetStyle(), 180f).rows.map { it.task.id })
        assertEquals(listOf("a", "b"), WidgetModel.layout(tasks, WidgetStyle(show = WidgetShow(done = true)), 180f).rows.map { it.task.id })
        assertEquals(listOf("b"), WidgetModel.layout(listOf(tasks[1]), WidgetStyle(show = WidgetShow(done = true)), 180f).rows.map { it.task.id })
    }

    @Test
    fun layoutPreservesLegacyCapacityAndReservesTheMoreRow() {
        val tasks = (1..5).map { task("$it", "in-progress") }
        val layout = WidgetModel.layout(tasks, WidgetStyle(), 150f)
        assertEquals(listOf("1", "2"), layout.rows.map { it.task.id })
        assertEquals(3, layout.hidden)
        assertEquals(3, WidgetModel.layout(tasks.take(3), WidgetStyle(), 150f).rows.size)
        assertEquals(0, WidgetModel.layout(tasks, WidgetStyle(), 80f).rows.size)
        assertEquals(5, WidgetModel.layout(tasks, WidgetStyle(), 80f).hidden)
    }

    @Test
    fun compactFitsMoreTasksInTheSameSpace() {
        val tasks = (1..5).map { task("$it", "in-progress") }
        val compact = WidgetModel.layout(tasks, WidgetStyle(density = "compact"), 156f)
        assertEquals(3, compact.rows.size)
        assertEquals(2, compact.hidden)
        assertEquals(2, WidgetModel.layout(tasks, WidgetStyle(), 156f).rows.size)
    }

    @Test
    fun sectionHeadersConsumeSpaceAndOnlyAppearAtSectionBoundaries() {
        val tasks = listOf(task("a", "in-progress").copy(section = "Work"), task("b", "in-progress").copy(section = "Work"), task("c", "in-progress").copy(section = "Home"))
        val style = WidgetStyle(show = WidgetShow(sections = true))
        val layout = WidgetModel.layout(tasks, style, 180f)
        assertEquals(listOf("a", "b"), layout.rows.map { it.task.id })
        assertEquals(listOf("Work", null), layout.rows.map { it.sectionHeader })
        assertEquals(1, layout.hidden)
        val all = WidgetModel.layout(tasks, style, 240f)
        assertEquals(listOf("Work", null, "Home"), all.rows.map { it.sectionHeader })
        assertEquals(0, all.hidden)
    }

    @Test
    fun emptySectionsDoNotCreateHeadersAndHiddenDoneTasksDoNotCountAsOverflow() {
        val tasks = listOf(task("a", "in-progress"), task("b", "done"))
        val layout = WidgetModel.layout(tasks, WidgetStyle(show = WidgetShow(sections = true)), 90f)
        assertEquals(1, layout.rows.size)
        assertEquals(null, layout.rows.single().sectionHeader)
        assertEquals(0, layout.hidden)
    }

    private fun task(id: String, status: String, created: String = "2026-10-18") =
        WidgetTask(id, "Task $id", status, created)

    private val today = LocalDate.of(2026, 10, 20)

    @Test
    fun toggleFlipsDoneAndOpen() {
        val result = WidgetModel.applyToggles(listOf(task("a", "in-progress"), task("b", "done")), listOf("a", "b"))
        assertEquals(listOf("done", "in-progress"), result.map { it.status })
    }

    @Test
    fun togglingTwiceRestoresOriginalState() {
        val result = WidgetModel.applyToggles(listOf(task("a", "in-progress")), listOf("a", "a"))
        assertEquals("in-progress", result.single().status)
    }

    @Test
    fun unknownToggleIdsAreIgnored() {
        val result = WidgetModel.applyToggles(listOf(task("a", "in-progress")), listOf("zzz"))
        assertEquals("in-progress", result.single().status)
    }

    @Test
    fun staleSnapshotDropsFinishedTasks() {
        val snapshot = WidgetSnapshot("2026-10-19", listOf(task("a", "in-progress"), task("b", "done")))
        assertEquals(listOf("a"), WidgetModel.tasksForDisplay(snapshot, today).map { it.id })
    }

    @Test
    fun todaysSnapshotKeepsDoneTasks() {
        val snapshot = WidgetSnapshot("2026-10-20", listOf(task("a", "in-progress"), task("b", "done")))
        assertEquals(listOf("a", "b"), WidgetModel.tasksForDisplay(snapshot, today).map { it.id })
    }

    @Test
    fun ageAndSeverity() {
        assertEquals(2L, WidgetModel.ageDays("2026-10-18", today))
        assertEquals(0L, WidgetModel.ageDays("2026-10-25", today))
        assertEquals(0L, WidgetModel.ageDays("not-a-date", today))
        assertEquals(WidgetModel.Severity.NORMAL, WidgetModel.severity(2))
        assertEquals(WidgetModel.Severity.ATTENTION, WidgetModel.severity(3))
        assertEquals(WidgetModel.Severity.CRITICAL, WidgetModel.severity(7))
    }
}
