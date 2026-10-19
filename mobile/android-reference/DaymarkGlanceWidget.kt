import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.*
import androidx.glance.action.ActionParameters
import androidx.glance.action.actionParametersOf
import androidx.glance.action.actionStartActivity
import androidx.glance.action.clickable
import androidx.glance.appwidget.*
import androidx.glance.appwidget.action.ActionCallback
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.lazy.LazyColumn
import androidx.glance.appwidget.lazy.items
import androidx.glance.layout.*
import androidx.glance.text.*
import androidx.glance.unit.ColorProvider
import androidx.compose.ui.graphics.Color
import com.daymark.app.engine.TaskLifecycleEngine
import com.daymark.app.model.TaskItem
import java.time.LocalDate
import java.time.format.DateTimeFormatter

/**
 * Daymark Android Home-Screen Widget powered by Jetpack Glance.
 * 
 * Provides:
 * 1. 1-tap task completion without opening the app (via background ActionCallback).
 * 2. Carry-forward aging alert badges (+3d, +7d).
 * 3. Deep-link integration: Tapping the widget header or note item directly launches
 *    the Daymark PWA (in standalone WebAPK mode) or the native app via ACTION_VIEW intent.
 */
fun getLaunchDaymarkAppIntent(date: String = ""): Intent {
    return Intent(Intent.ACTION_VIEW).apply {
        // Deep link registered in PWA WebAPK manifest and AndroidManifest.xml
        data = Uri.parse(if (date.isNotBlank()) "https://daymark.app/?tab=today&date=$date" else "https://daymark.app/")
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
    }
}
class DaymarkGlanceWidget : GlanceAppWidget() {

    override val sizeMode = SizeMode.Responsive(
        setOf(
            DpSize(120.dp, 120.dp), // Small 2x2
            DpSize(260.dp, 120.dp), // Medium 4x2
            DpSize(260.dp, 260.dp)  // Large 4x4
        )
    )

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val todayStr = LocalDate.now().format(DateTimeFormatter.ISO_LOCAL_DATE)
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
        // Header - 1-tap launches the Daymark PWA (in standalone mode) or Native App
        Row(
            modifier = GlanceModifier
                .fillMaxWidth()
                .clickable(actionStartActivity(getLaunchDaymarkAppIntent(todayDate))),
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
                style = TextStyle(
                    color = ColorProvider(Color(0xFFF5F5F4)),
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold
                )
            )
            Spacer(modifier = GlanceModifier.defaultWeight())
            Text(
                text = "$doneCount/${tasks.size} Done",
                style = TextStyle(
                    color = ColorProvider(Color(0xFFA8A29E)),
                    fontSize = 11.sp
                )
            )
        }

        Spacer(modifier = GlanceModifier.height(8.dp))

        // Task Items (up to 3 in medium widget)
        if (activeTasks.isEmpty()) {
            Box(
                modifier = GlanceModifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = "All daily work completed",
                    style = TextStyle(color = ColorProvider(Color(0xFF78716C)), fontSize = 11.sp)
                )
            }
        } else {
            Column(modifier = GlanceModifier.fillMaxWidth()) {
                activeTasks.take(3).forEach { task ->
                    val age = TaskLifecycleEngine.calculateTaskAge(task.createdDate, todayDate)
                    Row(
                        modifier = GlanceModifier
                            .fillMaxWidth()
                            .padding(vertical = 3.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        // 1-tap checkbox
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
                            style = TextStyle(
                                color = ColorProvider(Color(0xFFE7E5E4)),
                                fontSize = 11.sp
                            ),
                            modifier = GlanceModifier.defaultWeight()
                        )

                        // Carry-forward aging alert
                        if (age > 0) {
                            Text(
                                text = "+${age}d",
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

@Composable
fun SmallWidgetContent(tasks: List<TaskItem>) {
    val pendingCount = tasks.count { it.status != "done" && it.status != "archived" }
    Column(
        modifier = GlanceModifier
            .fillMaxSize()
            .background(Color(0xFF1C1917))
            .padding(12.dp)
            .cornerRadius(16.dp)
            .clickable(actionStartActivity(getLaunchDaymarkAppIntent())),
        verticalAlignment = Alignment.CenterVertically,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = "$pendingCount",
            style = TextStyle(
                color = ColorProvider(Color(0xFFF59E0B)),
                fontSize = 28.sp,
                fontWeight = FontWeight.Bold
            )
        )
        Text(
            text = "Active Tasks",
            style = TextStyle(color = ColorProvider(Color(0xFFA8A29E)), fontSize = 11.sp)
        )
    }
}

@Composable
fun LargeWidgetContent(tasks: List<TaskItem>, todayDate: String) {
    Column(
        modifier = GlanceModifier
            .fillMaxSize()
            .background(Color(0xFF1C1917))
            .padding(12.dp)
            .cornerRadius(16.dp)
    ) {
        Row(
            modifier = GlanceModifier
                .fillMaxWidth()
                .clickable(actionStartActivity(getLaunchDaymarkAppIntent(todayDate))),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = "Daymark · Priority List",
                style = TextStyle(
                    color = ColorProvider(Color.White),
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold
                )
            )
        }
        Spacer(modifier = GlanceModifier.height(8.dp))
        LazyColumn(modifier = GlanceModifier.fillMaxSize()) {
            items(tasks) { task ->
                Row(
                    modifier = GlanceModifier
                        .fillMaxWidth()
                        .padding(vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    val isDone = task.status == "done"
                    Box(
                        modifier = GlanceModifier
                            .size(16.dp)
                            .background(if (isDone) Color(0xFF16A34A) else Color(0xFF292524))
                            .cornerRadius(4.dp)
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
                        style = TextStyle(
                            color = ColorProvider(if (isDone) Color(0xFF78716C) else Color(0xFFE7E5E4)),
                            fontSize = 12.sp
                        ),
                        modifier = GlanceModifier.defaultWeight()
                    )
                }
            }
        }
    }
}

class ToggleTaskActionCallback : ActionCallback {
    override suspend fun onAction(
        context: Context,
        glanceId: GlanceId,
        parameters: ActionParameters
    ) {
        val taskId = parameters[ActionParameters.Key<String>("taskId")] ?: return
        TaskLifecycleEngine.toggleTaskDone(context, taskId)
        DaymarkGlanceWidget().update(context, glanceId)
    }
}

class DaymarkWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = DaymarkGlanceWidget()
}
