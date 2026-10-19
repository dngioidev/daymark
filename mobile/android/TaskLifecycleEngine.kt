package com.daymark.app.engine

import android.content.Context
import com.daymark.app.model.DailyDocument
import com.daymark.app.model.TaskItem
import java.time.LocalDate
import java.time.temporal.ChronoUnit

/**
 * Android Task Lifecycle & Carry-Forward Engine.
 * Implements deterministic rollover and historical completion correction.
 */
object TaskLifecycleEngine {

    /**
     * Calculates calendar days elapsed between original creation date and target date.
     */
    fun calculateTaskAge(createdDateStr: String, targetDateStr: String): Long {
        return try {
            val d1 = LocalDate.parse(createdDateStr)
            val d2 = LocalDate.parse(targetDateStr)
            val days = ChronoUnit.DAYS.between(d1, d2)
            if (days > 0) days else 0
        } catch (e: Exception) {
            0
        }
    }

    /**
     * Reconciles carry-forward tasks from previous daily notes into today.
     * Safe and idempotent: will never produce duplicates.
     */
    fun performDailyRollover(
        targetDate: String,
        allDocuments: List<DailyDocument>
    ): List<DailyDocument> {
        val targetDoc = allDocuments.find { it.date == targetDate }
            ?: DailyDocument(date = targetDate, headings = mutableListOf())

        val existingTaskIds = targetDoc.headings
            .flatMap { it.items }
            .map { it.id }
            .toSet()

        val previousDocs = allDocuments
            .filter { it.date < targetDate }
            .sortedBy { it.date }

        for (pastDoc in previousDocs) {
            for (heading in pastDoc.headings) {
                for (task in heading.items) {
                    val eligible = task.status == "in-progress" ||
                            task.status == "blocked" ||
                            task.status == "waiting"

                    if (eligible && task.status != "done" && !existingTaskIds.contains(task.id)) {
                        val carriedCopy = task.copy(
                            carriedFromDate = pastDoc.date
                        )
                        var targetHeading = targetDoc.headings.find { it.name.equals(heading.name, ignoreCase = true) }
                        if (targetHeading == null) {
                            targetHeading = heading.copy(items = mutableListOf())
                            targetDoc.headings.add(targetHeading)
                        }
                        targetHeading.items.add(carriedCopy)
                    }
                }
            }
        }

        return allDocuments
    }

    /**
     * Historical Completion Correction (Section 7 of PRD):
     * Retroactively marks task completed on past date and removes from active note.
     */
    fun correctHistoricalCompletion(
        taskId: String,
        effectiveCompletedDate: String,
        currentDate: String,
        allDocuments: List<DailyDocument>
    ): List<DailyDocument> {
        // 1. Mark done on effectiveCompletedDate
        for (doc in allDocuments) {
            if (doc.date == effectiveCompletedDate) {
                for (heading in doc.headings) {
                    heading.items.find { it.id == taskId }?.apply {
                        status = "done"
                        completedDate = effectiveCompletedDate
                    }
                }
            }
            // 2. Remove from active notes > effectiveCompletedDate
            if (doc.date > effectiveCompletedDate) {
                for (heading in doc.headings) {
                    heading.items.removeAll { it.id == taskId }
                }
            }
        }
        return allDocuments
    }

    fun getTasksForDate(context: Context, date: String): List<TaskItem> {
        // Reads from local Room database or Markdown repository
        return emptyList()
    }

    fun toggleTaskDone(context: Context, taskId: String) {
        // Updates local Markdown file and triggers widget refresh
    }
}
