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
import androidx.glance.text.Text
import androidx.glance.text.TextAlign
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import java.time.LocalDate

private val Surface = Color(0xFF1C1917)
private val Checkbox = Color(0xFF44403C)
private val TextPrimary = Color(0xFFF5F5F4)
private val TextMuted = Color(0xFFD6D3D1)
private val Amber = Color(0xFFF59E0B)
private val Red = Color(0xFFF87171)
private val Green = Color(0xFF16A34A)

private const val ROW_HEIGHT_DP = 30
private const val HEADER_HEIGHT_DP = 60

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
            val tasks = remember(version) { snapshot?.let { WidgetModel.tasksForDisplay(it, today) } ?: emptyList() }
            val size = LocalSize.current
            if (size.width < 180.dp) SmallContent(tasks, snapshot != null)
            else ListContent(tasks, today, snapshot != null, size)
        }
    }
}

@Composable
private fun SmallContent(tasks: List<WidgetTask>, hasData: Boolean) {
    val pending = tasks.count { !it.isDone }
    Column(
        modifier = GlanceModifier
            .fillMaxSize()
            .background(Surface)
            .padding(10.dp)
            .cornerRadius(16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Column(
            modifier = GlanceModifier.clickable(openAppAction()),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = if (hasData) "$pending" else "–",
                style = TextStyle(color = ColorProvider(Amber), fontSize = 28.sp, fontWeight = FontWeight.Bold),
            )
            Text(
                text = if (!hasData) "Open Daymark" else if (pending == 1) "task left" else "tasks left",
                style = TextStyle(color = ColorProvider(TextMuted), fontSize = 12.sp),
            )
        }
        Spacer(modifier = GlanceModifier.height(6.dp))
        AddButton()
    }
}

@Composable
private fun ListContent(tasks: List<WidgetTask>, today: LocalDate, hasData: Boolean, size: DpSize) {
    val active = tasks.filter { !it.isDone }
    val done = tasks.size - active.size
    // As many rows as the widget height allows; the last row becomes "+N more" when needed
    val capacity = ((size.height.value - HEADER_HEIGHT_DP) / ROW_HEIGHT_DP).toInt().coerceAtLeast(1)
    val shown = if (active.size > capacity) active.take(capacity - 1) else active
    val hidden = active.size - shown.size

    Column(modifier = GlanceModifier.fillMaxSize().background(Surface).padding(12.dp).cornerRadius(16.dp)) {
        Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Row(modifier = GlanceModifier.defaultWeight().clickable(openAppAction()), verticalAlignment = Alignment.CenterVertically) {
                Box(modifier = GlanceModifier.size(8.dp).background(Color(0xFFD97706)).cornerRadius(2.dp)) {}
                Spacer(modifier = GlanceModifier.width(6.dp))
                Text(
                    text = "Today",
                    style = TextStyle(color = ColorProvider(TextPrimary), fontSize = 14.sp, fontWeight = FontWeight.Bold),
                )
                Spacer(modifier = GlanceModifier.width(8.dp))
                if (hasData) {
                    Text(
                        text = if (active.isEmpty()) "all done" else "${active.size} left · $done done",
                        style = TextStyle(color = ColorProvider(TextMuted), fontSize = 12.sp),
                    )
                }
            }
            AddButton()
        }
        Spacer(modifier = GlanceModifier.height(6.dp))
        when {
            !hasData -> EmptyMessage("Open Daymark to load today")
            active.isEmpty() -> EmptyMessage(if (tasks.isEmpty()) "Nothing planned yet. Tap + to add a task." else "All done for today")
            else -> LazyColumn(modifier = GlanceModifier.fillMaxSize()) {
                items(shown) { TaskRow(it, today) }
                if (hidden > 0) {
                    item {
                        Text(
                            text = "+$hidden more",
                            modifier = GlanceModifier.fillMaxWidth().padding(start = 30.dp, top = 4.dp).clickable(openAppAction()),
                            style = TextStyle(color = ColorProvider(TextMuted), fontSize = 12.sp, fontWeight = FontWeight.Medium),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun AddButton() {
    Box(
        modifier = GlanceModifier
            .size(36.dp)
            .background(Amber)
            .cornerRadius(18.dp)
            .clickable(captureAction())
            .semantics { contentDescription = "New task" },
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = "+",
            style = TextStyle(color = ColorProvider(Color(0xFF1C1917)), fontSize = 22.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center),
        )
    }
}

@Composable
private fun EmptyMessage(text: String) {
    Box(modifier = GlanceModifier.fillMaxSize().clickable(openAppAction()), contentAlignment = Alignment.Center) {
        Text(text = text, style = TextStyle(color = ColorProvider(TextMuted), fontSize = 12.sp, textAlign = TextAlign.Center))
    }
}

@Composable
private fun TaskRow(task: WidgetTask, today: LocalDate) {
    val age = WidgetModel.ageDays(task.createdDate, today)
    Row(
        modifier = GlanceModifier.fillMaxWidth().height(ROW_HEIGHT_DP.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = GlanceModifier
                .size(22.dp)
                .background(if (task.isDone) Green else Checkbox)
                .cornerRadius(5.dp)
                .clickable(actionRunCallback<ToggleTaskActionCallback>(actionParametersOf(TaskIdKey to task.id)))
                .semantics { contentDescription = "Mark ${task.title} done" },
        ) {}
        Spacer(modifier = GlanceModifier.width(8.dp))
        Text(
            text = task.title,
            maxLines = 1,
            style = TextStyle(color = ColorProvider(if (task.isDone) TextMuted else TextPrimary), fontSize = 13.sp),
            modifier = GlanceModifier.defaultWeight().clickable(openAppAction()),
        )
        if (!task.isDone && age > 0) {
            val color = when (WidgetModel.severity(age)) {
                WidgetModel.Severity.CRITICAL -> Red
                WidgetModel.Severity.ATTENTION -> Amber
                WidgetModel.Severity.NORMAL -> TextMuted
            }
            Text(
                text = "${age}d",
                style = TextStyle(color = ColorProvider(color), fontSize = 12.sp, fontWeight = FontWeight.Bold),
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
}
