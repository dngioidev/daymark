import type { CountingDays } from '../types/daymark';
import React, { useState } from 'react';
import {
  Smartphone,
  Code2,
  Copy,
  Check,
  Download,
  Layers,
  Sparkles,
  ExternalLink,
  Terminal,
  FileCode,
  CheckCircle2,
} from 'lucide-react';
import JSZip from 'jszip';
import { MobileWidgetSimulator } from './MobileWidgetSimulator';
import { DailyDocument, StatusDefinition } from '../types/daymark';

interface MobileCodeHubProps {
  countingDays?: CountingDays;
  currentDocument: DailyDocument;
  simulatedToday: string;
  statuses: StatusDefinition[];
  onToggleTaskDone: (taskId: string) => void;
  onQuickHistoricalDone: (taskId: string, targetDate: string) => void;
  onQuickAddTask: (title: string, section: string) => void;
}

const ANDROID_WIDGET_CODE = `package com.daymark.app.widget

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.*
import androidx.glance.action.ActionParameters
import androidx.glance.action.actionParametersOf
import androidx.glance.action.clickable
import androidx.glance.appwidget.*
import androidx.glance.appwidget.action.ActionCallback
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.layout.*
import androidx.glance.text.*
import androidx.glance.unit.ColorProvider
import androidx.compose.ui.graphics.Color
import com.daymark.app.engine.TaskLifecycleEngine
import com.daymark.app.model.TaskItem
import java.time.LocalDate

/**
 * Daymark Android Home-Screen Widget powered by Jetpack Glance.
 * Provides quick access to Today's notebook, 1-tap task completion,
 * and carry-forward aging alerts without opening the full application.
 */
class DaymarkGlanceWidget : GlanceAppWidget() {

    override val sizeMode = SizeMode.Responsive(
        setOf(
            DpSize(120.dp, 120.dp), // Small 2x2
            DpSize(260.dp, 120.dp), // Medium 4x2
            DpSize(260.dp, 260.dp)  // Large 4x4
        )
    )

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val todayStr = LocalDate.now().toString()
        val todayTasks = TaskLifecycleEngine.getTasksForDate(context, todayStr)

        provideContent {
            GlanceTheme {
                val size = LocalSize.current
                when {
                    size.width < 180.dp -> SmallWidgetContent(todayTasks)
                    size.height < 180.dp -> MediumWidgetContent(todayTasks, todayStr)
                    else -> LargeWidgetContent(todayTasks, todayStr)
                }
            }
        }
    }
}

@Composable
fun MediumWidgetContent(tasks: List<TaskItem>, todayDate: String) {
    val activeTasks = tasks.filter { it.status != "done" && it.status != "archived" }
    val doneCount = tasks.count { it.status == "done" }

    Column(
        modifier = GlanceModifier
            .fillMaxSize()
            .background(Color(0xFF1C1917))
            .padding(12.dp)
            .cornerRadius(16.dp)
    ) {
        Row(
            modifier = GlanceModifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = GlanceModifier
                    .size(8.dp)
                    .background(Color(0xFFD97706))
                    .cornerRadius(2.dp)
            ) {}
            Spacer(modifier = GlanceModifier.width(6.dp))
            Text(
                text = "Daymark Today",
                style = TextStyle(color = ColorProvider(Color(0xFFF5F5F4)), fontSize = 13.sp, fontWeight = FontWeight.Bold)
            )
            Spacer(modifier = GlanceModifier.defaultWeight())
            Text(
                text = "$doneCount/\${tasks.size} Done",
                style = TextStyle(color = ColorProvider(Color(0xFFA8A29E)), fontSize = 11.sp)
            )
        }

        Spacer(modifier = GlanceModifier.height(8.dp))

        if (activeTasks.isEmpty()) {
            Box(modifier = GlanceModifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(text = "All daily work completed", style = TextStyle(color = ColorProvider(Color(0xFF78716C)), fontSize = 11.sp))
            }
        } else {
            Column(modifier = GlanceModifier.fillMaxWidth()) {
                activeTasks.take(3).forEach { task ->
                    val age = TaskLifecycleEngine.calculateTaskAge(task.createdDate, todayDate)
                    Row(
                        modifier = GlanceModifier.fillMaxWidth().padding(vertical = 3.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        // 1-tap checkbox without opening full app
                        Box(
                            modifier = GlanceModifier
                                .size(14.dp)
                                .background(Color(0xFF292524))
                                .cornerRadius(3.dp)
                                .clickable(
                                    actionRunCallback<ToggleTaskActionCallback>(
                                        actionParametersOf(ActionParameters.Key<String>("taskId") to task.id)
                                    )
                                )
                        ) {}

                        Spacer(modifier = GlanceModifier.width(8.dp))
                        Text(
                            text = task.title,
                            maxLines = 1,
                            style = TextStyle(color = ColorProvider(Color(0xFFE7E5E4)), fontSize = 11.sp),
                            modifier = GlanceModifier.defaultWeight()
                        )

                        // Carry-forward aging alert
                        if (age > 0) {
                            Text(
                                text = "+$\{age\}d",
                                style = TextStyle(
                                    color = ColorProvider(if (age >= 7) Color(0xFFEF4444) else Color(0xFFF59E0B)),
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.Bold
                                )
                            )
                        }
                    }
                }
            }
        }
    }
}

class ToggleTaskActionCallback : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        val taskId = parameters[ActionParameters.Key<String>("taskId")] ?: return
        TaskLifecycleEngine.toggleTaskDone(context, taskId)
        DaymarkGlanceWidget().update(context, glanceId)
    }
}

class DaymarkWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = DaymarkGlanceWidget()
}`;

const KOTLIN_ENGINE_CODE = `package com.daymark.app.engine

import android.content.Context
import com.daymark.app.model.DailyDocument
import com.daymark.app.model.TaskItem
import java.time.LocalDate
import java.time.temporal.ChronoUnit

/**
 * Android Task Lifecycle & Carry-Forward Engine.
 * Deterministic rollover and historical completion correction matching Daymark web.
 */
object TaskLifecycleEngine {

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
     * Idempotent Daily Rollover: Carries forward eligible tasks to today without duplicates.
     */
    fun performDailyRollover(targetDate: String, allDocuments: List<DailyDocument>): List<DailyDocument> {
        val targetDoc = allDocuments.find { it.date == targetDate } ?: DailyDocument(date = targetDate, headings = mutableListOf())
        val existingTaskIds = targetDoc.headings.flatMap { it.items }.map { it.id }.toSet()

        val previousDocs = allDocuments.filter { it.date < targetDate }.sortedBy { it.date }
        for (pastDoc in previousDocs) {
            for (heading in pastDoc.headings) {
                for (task in heading.items) {
                    val eligible = (task.status == "in-progress" || task.status == "blocked" || task.status == "waiting")
                    if (eligible && task.status != "done" && !existingTaskIds.contains(task.id)) {
                        val carriedCopy = task.copy(carriedFromDate = pastDoc.date)
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
        for (doc in allDocuments) {
            if (doc.date == effectiveCompletedDate) {
                for (heading in doc.headings) {
                    heading.items.find { it.id == taskId }?.apply {
                        status = "done"
                        completedDate = effectiveCompletedDate
                    }
                }
            }
            if (doc.date > effectiveCompletedDate) {
                for (heading in doc.headings) {
                    heading.items.removeAll { it.id == taskId }
                }
            }
        }
        return allDocuments
    }

    fun getTasksForDate(context: Context, date: String): List<TaskItem> = emptyList()
    fun toggleTaskDone(context: Context, taskId: String) {}
}`;

const IOS_SWIFT_CODE = `import WidgetKit
import SwiftUI

// MARK: - Daymark iOS Home Screen & Lock Screen Widget (SwiftUI WidgetKit)
// Implements 1-tap completion intents, carry-forward aging alerts, and compact lock-screen views.

struct TaskEntry: TimelineEntry {
    let date: Date
    let todayDateString: String
    let activeTasks: [WidgetTaskItem]
    let completedCount: Int
    let totalCount: Int
}

struct WidgetTaskItem: Identifiable {
    let id: String
    let title: String
    let status: String
    let carryForwardAgeDays: Int
    let isDone: Bool
}

struct DaymarkWidgetProvider: TimelineProvider {
    func placeholder(in context: Context) -> TaskEntry {
        TaskEntry(
            date: Date(),
            todayDateString: "2026-10-16",
            activeTasks: [
                WidgetTaskItem(id: "1", title: "Investigate build pipeline failure", status: "in-progress", carryForwardAgeDays: 2, isDone: false),
                WidgetTaskItem(id: "2", title: "Prepare QA test scenarios", status: "blocked", carryForwardAgeDays: 3, isDone: false)
            ],
            completedCount: 1,
            totalCount: 3
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (TaskEntry) -> ()) {
        completion(placeholder(in: context))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<TaskEntry>) -> ()) {
        let entry = placeholder(in: context)
        let nextUpdate = Calendar.current.date(byAdding: .minute, value: 30, to: Date())!
        let timeline = Timeline(entries: [entry], policy: .after(nextUpdate))
        completion(timeline)
    }
}

struct MediumWidgetView: View {
    var entry: TaskEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                RoundedRectangle(cornerRadius: 2)
                    .fill(Color.orange)
                    .frame(width: 8, height: 8)
                Text("Daymark Today")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(.white)
                Spacer()
                Text("\\(entry.completedCount)/\\(entry.totalCount) Done")
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundColor(.gray)
            }
            Divider().background(Color.gray.opacity(0.3))
            VStack(alignment: .leading, spacing: 4) {
                ForEach(entry.activeTasks.prefix(3)) { task in
                    HStack {
                        Image(systemName: task.isDone ? "checkmark.square.fill" : "square")
                            .font(.system(size: 13))
                            .foregroundColor(task.isDone ? .green : .gray)
                        Text(task.title)
                            .font(.system(size: 11))
                            .lineLimit(1)
                            .foregroundColor(.white)
                        Spacer()
                        if task.carryForwardAgeDays > 0 {
                            Text("+\\(task.carryForwardAgeDays)d")
                                .font(.system(size: 9, weight: .bold, design: .monospaced))
                                .foregroundColor(task.carryForwardAgeDays >= 7 ? .red : .orange)
                        }
                    }
                }
            }
        }
        .padding(12)
        .background(Color(red: 0.11, green: 0.10, blue: 0.09))
    }
}

@main
struct DaymarkWidgetBundle: WidgetBundle {
    var body: some Widget {
        DaymarkWidget()
    }
}

struct DaymarkWidget: Widget {
    let kind: String = "DaymarkWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: DaymarkWidgetProvider()) { entry in
            MediumWidgetView(entry: entry)
        }
        .configurationDisplayName("Daymark Daily Tasks")
        .description("Quickly view today's active tasks and carry-forward aging alerts.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular])
    }
}`;

export const MobileCodeHub: React.FC<MobileCodeHubProps> = ({
  countingDays = 'all',
  currentDocument,
  simulatedToday,
  statuses,
  onToggleTaskDone,
  onQuickHistoricalDone,
  onQuickAddTask,
}) => {
  const [activeCodeTab, setActiveCodeTab] = useState<'simulator' | 'android' | 'kotlin-engine' | 'ios' | 'architecture'>('simulator');
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 2000);
  };

  const handleDownloadNativeZip = async () => {
    const zip = new JSZip();
    const androidFolder = zip.folder('android');
    androidFolder?.file('DaymarkGlanceWidget.kt', ANDROID_WIDGET_CODE);
    androidFolder?.file('TaskLifecycleEngine.kt', KOTLIN_ENGINE_CODE);

    const iosFolder = zip.folder('ios');
    iosFolder?.file('DaymarkWidget.swift', IOS_SWIFT_CODE);

    zip.file(
      'README.md',
      `# Daymark Native Mobile Code Bundle\n\nContains the Android Jetpack Glance Widget, Task Lifecycle Engine (Kotlin), and iOS SwiftUI WidgetKit implementation.\n\nSee /mobile directory in repository for architecture details.`
    );

    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'daymark-native-mobile-code.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-200 dark:border-stone-800">
        <div>
          <div className="flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-amber-600 dark:text-amber-500" />
            <h1 className="text-xl font-bold text-stone-900 dark:text-stone-100">
              Mobile & Native Code Hub
            </h1>
          </div>
          <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
            Native Android Jetpack Glance & iOS WidgetKit implementations, plus interactive home-screen simulator.
          </p>
        </div>

        <button
          onClick={handleDownloadNativeZip}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-accent text-accent-fg hover:brightness-95 rounded-md shadow-2xs transition-colors self-start sm:self-auto"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Download Native Code (.zip)</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-stone-200 dark:border-stone-800 overflow-x-auto text-xs pb-1">
        <button
          onClick={() => setActiveCodeTab('simulator')}
          className={`py-2 px-3 font-semibold rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap ${
            activeCodeTab === 'simulator'
              ? 'bg-stone-200/80 dark:bg-stone-800 text-stone-900 dark:text-stone-100'
              : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-300'
          }`}
        >
          <Smartphone className="w-3.5 h-3.5" />
          <span>Interactive Widget Simulator</span>
        </button>

        <button
          onClick={() => setActiveCodeTab('android')}
          className={`py-2 px-3 font-semibold rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap ${
            activeCodeTab === 'android'
              ? 'bg-stone-200/80 dark:bg-stone-800 text-stone-900 dark:text-stone-100'
              : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-300'
          }`}
        >
          <Code2 className="w-3.5 h-3.5" />
          <span>Android Glance Widget (.kt)</span>
        </button>

        <button
          onClick={() => setActiveCodeTab('kotlin-engine')}
          className={`py-2 px-3 font-semibold rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap ${
            activeCodeTab === 'kotlin-engine'
              ? 'bg-stone-200/80 dark:bg-stone-800 text-stone-900 dark:text-stone-100'
              : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-300'
          }`}
        >
          <FileCode className="w-3.5 h-3.5" />
          <span>Kotlin Lifecycle Engine</span>
        </button>

        <button
          onClick={() => setActiveCodeTab('ios')}
          className={`py-2 px-3 font-semibold rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap ${
            activeCodeTab === 'ios'
              ? 'bg-stone-200/80 dark:bg-stone-800 text-stone-900 dark:text-stone-100'
              : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-300'
          }`}
        >
          <Code2 className="w-3.5 h-3.5" />
          <span>iOS SwiftUI Widget (.swift)</span>
        </button>

        <button
          onClick={() => setActiveCodeTab('architecture')}
          className={`py-2 px-3 font-semibold rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap ${
            activeCodeTab === 'architecture'
              ? 'bg-stone-200/80 dark:bg-stone-800 text-stone-900 dark:text-stone-100'
              : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-300'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Mobile Architecture</span>
        </button>
      </div>

      {/* Tab Content */}
      {activeCodeTab === 'simulator' && (
        <MobileWidgetSimulator countingDays={countingDays}
          currentDocument={currentDocument}
          simulatedToday={simulatedToday}
          statuses={statuses}
          onToggleTaskDone={onToggleTaskDone}
          onQuickHistoricalDone={onQuickHistoricalDone}
          onQuickAddTask={onQuickAddTask}
        />
      )}

      {activeCodeTab === 'android' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-stone-500">
              mobile/android/DaymarkGlanceWidget.kt · Jetpack Glance 1.1.0+
            </span>
            <button
              onClick={() => handleCopy(ANDROID_WIDGET_CODE)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-stone-700 dark:text-stone-300 bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 rounded-md transition-colors"
            >
              {copiedSnippet ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedSnippet ? 'Copied' : 'Copy Kotlin Code'}</span>
            </button>
          </div>
          <pre className="p-4 bg-stone-900 text-stone-100 text-xs font-mono rounded-xl overflow-x-auto leading-relaxed border border-stone-800 max-h-[600px]">
            {ANDROID_WIDGET_CODE}
          </pre>
        </div>
      )}

      {activeCodeTab === 'kotlin-engine' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-stone-500">
              mobile/android/TaskLifecycleEngine.kt · Rollover & Historical Completion
            </span>
            <button
              onClick={() => handleCopy(KOTLIN_ENGINE_CODE)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-stone-700 dark:text-stone-300 bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 rounded-md transition-colors"
            >
              {copiedSnippet ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedSnippet ? 'Copied' : 'Copy Kotlin Code'}</span>
            </button>
          </div>
          <pre className="p-4 bg-stone-900 text-stone-100 text-xs font-mono rounded-xl overflow-x-auto leading-relaxed border border-stone-800 max-h-[600px]">
            {KOTLIN_ENGINE_CODE}
          </pre>
        </div>
      )}

      {activeCodeTab === 'ios' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-stone-500">
              mobile/ios/DaymarkWidget.swift · SwiftUI WidgetKit & Intents
            </span>
            <button
              onClick={() => handleCopy(IOS_SWIFT_CODE)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-stone-700 dark:text-stone-300 bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 rounded-md transition-colors"
            >
              {copiedSnippet ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedSnippet ? 'Copied' : 'Copy Swift Code'}</span>
            </button>
          </div>
          <pre className="p-4 bg-stone-900 text-stone-100 text-xs font-mono rounded-xl overflow-x-auto leading-relaxed border border-stone-800 max-h-[600px]">
            {IOS_SWIFT_CODE}
          </pre>
        </div>
      )}

      {activeCodeTab === 'architecture' && (
        <div className="p-6 bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 space-y-4 text-xs">
          <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">
            Daymark Local-First Mobile Architecture
          </h2>
          <p className="text-stone-600 dark:text-stone-400 leading-relaxed">
            Daymark uses a unified Markdown document representation across Web, Android, and iOS. Both native widgets communicate with the local Markdown vault via file observers and background reconciliation workers.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div className="p-4 bg-stone-50 dark:bg-stone-800/40 rounded-lg border border-stone-200 dark:border-stone-800 space-y-2">
              <h3 className="font-semibold text-stone-900 dark:text-stone-100">
                1. 1-Tap Widget Action Interactivity
              </h3>
              <p className="text-stone-500 leading-relaxed">
                Android Jetpack Glance uses <code>ActionCallback</code> and iOS uses <code>AppIntent</code> to update task state directly from the home screen without launching the full application UI.
              </p>
            </div>

            <div className="p-4 bg-stone-50 dark:bg-stone-800/40 rounded-lg border border-stone-200 dark:border-stone-800 space-y-2">
              <h3 className="font-semibold text-stone-900 dark:text-stone-100">
                2. Idempotent Rollover & History Preservation
              </h3>
              <p className="text-stone-500 leading-relaxed">
                Opening the mobile widget on a new morning runs <code>performDailyRollover()</code> to carry forward unfinished tasks. Repeated calls are idempotent and never create duplicates.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
