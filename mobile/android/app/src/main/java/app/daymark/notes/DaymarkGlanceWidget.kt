package app.daymark.notes

import android.content.Context
import android.content.Intent
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.glance.GlanceId
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.state.updateAppWidgetState
import androidx.glance.currentState
import androidx.glance.state.PreferencesGlanceStateDefinition
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceModifier
import androidx.glance.action.ActionParameters
import androidx.glance.action.actionParametersOf
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.ActionCallback
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.lazy.LazyColumn
import androidx.glance.appwidget.lazy.items
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.LocalContext
import androidx.glance.LocalSize
import androidx.glance.semantics.contentDescription
import androidx.glance.semantics.semantics
import androidx.glance.text.FontWeight
import androidx.glance.text.FontFamily
import androidx.glance.text.Text
import androidx.glance.text.TextAlign
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import java.time.LocalDate

private val Checkbox = Color(0xFF44403C)
private val Red = Color(0xFFF87171)
private val Green = Color(0xFF16A34A)

private fun hexColor(value: String) = Color(android.graphics.Color.parseColor(value))

private class WidgetPaint(val style: WidgetStyle, val colors: ResolvedWidgetColors) {
    val background = hexColor(colors.bg).copy(alpha = colors.bgAlpha)
    val text = hexColor(colors.text)
    val muted = hexColor(colors.muted)
    val accent = hexColor(colors.accent)
    private val family = when (style.font) { "serif" -> FontFamily.Serif; "mono" -> FontFamily.Monospace; else -> FontFamily.SansSerif }
    fun type(color: Color = text, size: Int = 13, weight: FontWeight = FontWeight.Normal, align: TextAlign = TextAlign.Start) =
        TextStyle(color = ColorProvider(color), fontSize = (size + style.textSp - 13).sp, fontWeight = weight, fontFamily = family, textAlign = align)
}

/** Tapping the header or a task title opens the app. */
@Composable
private fun openAppAction() = actionStartActivity(Intent(LocalContext.current, MainActivity::class.java))

/** The + button opens the app straight into the new-task sheet (MainActivity hands it to the web app). */
@Composable
private fun captureAction() = actionStartActivity(
    Intent(LocalContext.current, MainActivity::class.java)
        .putExtra(MainActivity.EXTRA_ACTION, MainActivity.ACTION_CAPTURE)
        .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
)

private val TaskIdKey = ActionParameters.Key<String>("taskId")

/**
 * Daymark home-screen widget (Jetpack Glance). Shows today's open tasks from the snapshot the
 * app wrote, as many as fit, with "+N more" when some don't. Ticking a checkbox queues a toggle
 * the app applies when it next opens; + opens the new-task sheet.
 */
class DaymarkGlanceWidget : GlanceAppWidget() {

    override val sizeMode = SizeMode.Exact

    // Glance keeps one composition session alive across update() calls and does not call
    // provideGlance again, so data is read inside the composition, keyed by a version that
    // refresh() bumps in Glance state. Without this, a redraw would show stale tasks.
    override val stateDefinition = PreferencesGlanceStateDefinition

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        provideContent {
            val version = currentState<Preferences>()[VERSION_KEY]
            val today = remember(version) { LocalDate.now() }
            val snapshot = remember(version) { WidgetStore.loadSnapshot(context) }
            val paint = remember(version) {
                val widgetId = GlanceAppWidgetManager(context).getAppWidgetId(id)
                val style = WidgetStore.style(context, widgetId)
                WidgetPaint(style, style.resolve(WidgetStore.appColors(context)))
            }
            val tasks = remember(version) { snapshot?.let { WidgetModel.tasksForDisplay(it, today) } ?: emptyList() }
            val size = LocalSize.current
            if (size.width < 180.dp) SmallContent(tasks, snapshot != null, paint)
            else ListContent(tasks, today, snapshot != null, size, paint)
        }
    }

}

@Composable
private fun SmallContent(tasks: List<WidgetTask>, hasData: Boolean, paint: WidgetPaint) {
    val pending = tasks.count { !it.isDone }
    Column(
        modifier = GlanceModifier
            .fillMaxSize()
            .background(paint.background)
            .padding(10.dp)
            .cornerRadius(paint.style.cornerDp.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Column(
            modifier = GlanceModifier.clickable(openAppAction()),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = if (hasData) "$pending" else "–",
                style = paint.type(paint.accent, 28, FontWeight.Bold),
            )
            Text(
                text = if (!hasData) "Open Daymark" else if (pending == 1) "task left" else "tasks left",
                style = paint.type(paint.muted, 12),
            )
        }
        if (paint.style.show.quickAdd) {
            Spacer(modifier = GlanceModifier.height(6.dp))
            AddButton(paint)
        }
    }
}

@Composable
private fun ListContent(tasks: List<WidgetTask>, today: LocalDate, hasData: Boolean, size: DpSize, paint: WidgetPaint) {
    val active = tasks.filter { !it.isDone }
    val done = tasks.size - active.size
    val layout = WidgetModel.layout(tasks, paint.style, size.height.value)

    Column(modifier = GlanceModifier.fillMaxSize().background(paint.background).padding(12.dp).cornerRadius(paint.style.cornerDp.dp)) {
        Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Row(modifier = GlanceModifier.defaultWeight().clickable(openAppAction()), verticalAlignment = Alignment.CenterVertically) {
                Box(modifier = GlanceModifier.size(8.dp).background(if (paint.colors.accent == "#f59e0b") Color(0xFFD97706) else paint.accent).cornerRadius(2.dp)) {}
                Spacer(modifier = GlanceModifier.width(6.dp))
                Text(
                    text = "Today",
                    style = paint.type(size = 14, weight = FontWeight.Bold),
                )
                Spacer(modifier = GlanceModifier.width(8.dp))
                if (hasData) {
                    Text(
                        text = if (active.isEmpty()) "all done" else "${active.size} left · $done done",
                        style = paint.type(paint.muted, 12),
                    )
                }
            }
            if (paint.style.show.quickAdd) AddButton(paint)
        }
        Spacer(modifier = GlanceModifier.height(6.dp))
        when {
            !hasData -> EmptyMessage("Open Daymark to load today", paint)
            layout.rows.isEmpty() && layout.hidden == 0 -> EmptyMessage(if (tasks.isEmpty()) {
                if (paint.style.show.quickAdd) "Nothing planned yet. Tap + to add a task." else "Nothing planned yet."
            } else "All done for today", paint)
            else -> LazyColumn(modifier = GlanceModifier.fillMaxSize()) {
                items(layout.rows) { row ->
                    Column {
                        row.sectionHeader?.let { header ->
                            Box(modifier = GlanceModifier.fillMaxWidth().height(paint.style.sectionHeightDp.dp), contentAlignment = Alignment.CenterStart) {
                                Text(text = header, maxLines = 1, style = paint.type(paint.muted, 12))
                            }
                        }
                        TaskRow(row.task, today, paint)
                    }
                }
                if (layout.hidden > 0) {
                    item {
                        Text(
                            text = "+${layout.hidden} more",
                            modifier = GlanceModifier.fillMaxWidth().padding(start = 30.dp, top = 4.dp).clickable(openAppAction()),
                            style = paint.type(paint.muted, 12, FontWeight.Medium),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun AddButton(paint: WidgetPaint) {
    Box(
        modifier = GlanceModifier
            .size(36.dp)
            .background(paint.accent)
            .cornerRadius(18.dp)
            .clickable(captureAction())
            .semantics { contentDescription = "New task" },
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = "+",
            style = paint.type(hexColor(WidgetStyle(background = paint.colors.accent).resolve(null).text), 22, FontWeight.Bold, TextAlign.Center),
        )
    }
}

@Composable
private fun EmptyMessage(text: String, paint: WidgetPaint) {
    Box(modifier = GlanceModifier.fillMaxSize().clickable(openAppAction()), contentAlignment = Alignment.Center) {
        Text(text = text, style = paint.type(paint.muted, 12, align = TextAlign.Center))
    }
}

@Composable
private fun TaskRow(task: WidgetTask, today: LocalDate, paint: WidgetPaint) {
    val age = WidgetModel.ageDays(task.createdDate, today)
    Row(
        modifier = GlanceModifier.fillMaxWidth().height(paint.style.rowHeightDp.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = GlanceModifier
                .size(22.dp)
                .background(if (task.isDone) Green else Checkbox)
                .cornerRadius(5.dp)
                .clickable(actionRunCallback<ToggleTaskActionCallback>(actionParametersOf(TaskIdKey to task.id)))
                .semantics { contentDescription = if (task.isDone) "Reopen ${task.title}" else "Mark ${task.title} done" },
        ) {}
        Spacer(modifier = GlanceModifier.width(8.dp))
        Text(
            text = task.title,
            maxLines = 1,
            style = paint.type(if (task.isDone) paint.muted else paint.text),
            modifier = GlanceModifier.defaultWeight().clickable(openAppAction()),
        )
        if (paint.style.show.age && !task.isDone && age > 0) {
            val color = when (WidgetModel.severity(age)) {
                WidgetModel.Severity.CRITICAL -> Red
                WidgetModel.Severity.ATTENTION -> paint.accent
                WidgetModel.Severity.NORMAL -> paint.muted
            }
            Text(
                text = "${age}d",
                style = paint.type(color, 12, FontWeight.Bold),
            )
        }
    }
}

/** Checkbox tap: queue a toggle for the app to apply, and redraw immediately. */
class ToggleTaskActionCallback : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        val taskId = parameters[TaskIdKey] ?: return
        WidgetStore.queueToggle(context, taskId)
        DaymarkGlanceWidget().refreshAll(context)
    }
}

private val VERSION_KEY = longPreferencesKey("version")

/** Redraws every placed Daymark widget from the latest stored snapshot and queued toggles. */
suspend fun DaymarkGlanceWidget.refreshAll(context: Context) {
    val ids = GlanceAppWidgetManager(context).getGlanceIds(DaymarkGlanceWidget::class.java)
    for (id in ids) {
        updateAppWidgetState(context, id) { it[VERSION_KEY] = System.nanoTime() }
        update(context, id)
    }
}

class DaymarkWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = DaymarkGlanceWidget()

    override fun onDeleted(context: Context, appWidgetIds: IntArray) {
        super.onDeleted(context, appWidgetIds)
        for (id in appWidgetIds) WidgetStore.removeStyle(context, id)
    }
}
