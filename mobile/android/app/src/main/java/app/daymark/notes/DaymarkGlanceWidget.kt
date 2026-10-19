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
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import java.time.LocalDate

private val Surface = Color(0xFF1C1917)
private val Checkbox = Color(0xFF292524)
private val TextPrimary = Color(0xFFE7E5E4)
private val TextMuted = Color(0xFFA8A29E)
private val Amber = Color(0xFFF59E0B)
private val Red = Color(0xFFEF4444)
private val Green = Color(0xFF16A34A)

/** Tapping the widget header opens the app. */
@Composable
private fun openAppAction() = actionStartActivity(Intent(LocalContext.current, MainActivity::class.java))

private val TaskIdKey = ActionParameters.Key<String>("taskId")

/**
 * Daymark home-screen widget (Jetpack Glance). Shows today's tasks from the snapshot the app
 * wrote; ticking a checkbox queues a toggle that the app applies the next time it opens.
 * Tapping the header opens the app.
 */
class DaymarkGlanceWidget : GlanceAppWidget() {

    override val sizeMode = SizeMode.Responsive(
        setOf(
            DpSize(120.dp, 120.dp), // small
            DpSize(260.dp, 120.dp), // medium
            DpSize(260.dp, 260.dp), // large
        )
    )

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
            val hasData = snapshot != null
            val size = LocalSize.current
            when {
                size.width < 180.dp -> SmallContent(tasks, hasData)
                size.height < 180.dp -> MediumContent(tasks, today, hasData)
                else -> LargeContent(tasks, today, hasData)
            }
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
            .padding(12.dp)
            .cornerRadius(16.dp)
            .clickable(openAppAction()),
        verticalAlignment = Alignment.CenterVertically,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = if (hasData) "$pending" else "–",
            style = TextStyle(color = ColorProvider(Amber), fontSize = 28.sp, fontWeight = FontWeight.Bold),
        )
        Text(
            text = if (hasData) "Active tasks" else "Open Daymark",
            style = TextStyle(color = ColorProvider(TextMuted), fontSize = 11.sp),
        )
    }
}

@Composable
private fun MediumContent(tasks: List<WidgetTask>, today: LocalDate, hasData: Boolean) {
    val active = tasks.filter { !it.isDone }
    Column(
        modifier = GlanceModifier.fillMaxSize().background(Surface).padding(12.dp).cornerRadius(16.dp),
    ) {
        Header(done = tasks.count { it.isDone }, total = tasks.size, title = "Daymark Today")
        Spacer(modifier = GlanceModifier.height(8.dp))
        when {
            !hasData -> EmptyMessage("Open Daymark to load today")
            active.isEmpty() -> EmptyMessage("All daily work completed")
            else -> Column(modifier = GlanceModifier.fillMaxWidth()) {
                active.take(3).forEach { TaskRow(it, today) }
            }
        }
    }
}

@Composable
private fun LargeContent(tasks: List<WidgetTask>, today: LocalDate, hasData: Boolean) {
    Column(
        modifier = GlanceModifier.fillMaxSize().background(Surface).padding(12.dp).cornerRadius(16.dp),
    ) {
        Header(done = tasks.count { it.isDone }, total = tasks.size, title = "Daymark · Priority list")
        Spacer(modifier = GlanceModifier.height(8.dp))
        if (!hasData) {
            EmptyMessage("Open Daymark to load today")
        } else if (tasks.isEmpty()) {
            EmptyMessage("Nothing planned for today")
        } else {
            LazyColumn(modifier = GlanceModifier.fillMaxSize()) {
                items(tasks) { TaskRow(it, today) }
            }
        }
    }
}

@Composable
private fun Header(done: Int, total: Int, title: String) {
    Row(
        modifier = GlanceModifier.fillMaxWidth().clickable(openAppAction()),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(modifier = GlanceModifier.size(8.dp).background(Color(0xFFD97706)).cornerRadius(2.dp)) {}
        Spacer(modifier = GlanceModifier.width(6.dp))
        Text(
            text = title,
            style = TextStyle(color = ColorProvider(Color(0xFFF5F5F4)), fontSize = 13.sp, fontWeight = FontWeight.Bold),
        )
        Spacer(modifier = GlanceModifier.defaultWeight())
        Text(text = "$done/$total done", style = TextStyle(color = ColorProvider(TextMuted), fontSize = 11.sp))
    }
}

@Composable
private fun EmptyMessage(text: String) {
    Box(modifier = GlanceModifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Text(text = text, style = TextStyle(color = ColorProvider(Color(0xFF78716C)), fontSize = 11.sp))
    }
}

@Composable
private fun TaskRow(task: WidgetTask, today: LocalDate) {
    val age = WidgetModel.ageDays(task.createdDate, today)
    Row(
        modifier = GlanceModifier.fillMaxWidth().padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = GlanceModifier
                .size(18.dp)
                .background(if (task.isDone) Green else Checkbox)
                .cornerRadius(4.dp)
                .clickable(actionRunCallback<ToggleTaskActionCallback>(actionParametersOf(TaskIdKey to task.id))),
        ) {}
        Spacer(modifier = GlanceModifier.width(8.dp))
        Text(
            text = task.title,
            maxLines = 1,
            style = TextStyle(
                color = ColorProvider(if (task.isDone) Color(0xFF78716C) else TextPrimary),
                fontSize = 12.sp,
            ),
            modifier = GlanceModifier.defaultWeight(),
        )
        if (!task.isDone && age > 0) {
            val color = when (WidgetModel.severity(age)) {
                WidgetModel.Severity.CRITICAL -> Red
                WidgetModel.Severity.ATTENTION -> Amber
                WidgetModel.Severity.NORMAL -> TextMuted
            }
            Text(
                text = "+${age}d",
                style = TextStyle(color = ColorProvider(color), fontSize = 10.sp, fontWeight = FontWeight.Bold),
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
