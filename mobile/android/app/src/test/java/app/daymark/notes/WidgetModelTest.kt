package app.daymark.notes

import java.time.LocalDate
import org.junit.Assert.assertEquals
import org.junit.Test

class WidgetModelTest {
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
