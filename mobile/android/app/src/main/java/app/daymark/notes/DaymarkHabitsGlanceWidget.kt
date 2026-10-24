package app.daymark.notes

import android.content.Context
import android.content.Intent
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.LocalContext
import androidx.glance.LocalSize
import androidx.glance.action.ActionParameters
import androidx.glance.action.actionParametersOf
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.ActionCallback
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.lazy.LazyColumn
import androidx.glance.appwidget.lazy.items
import androidx.glance.appwidget.provideContent
import androidx.glance.appwidget.state.updateAppWidgetState
import androidx.glance.background
import androidx.glance.currentState
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
import androidx.glance.semantics.contentDescription
import androidx.glance.semantics.semantics
import androidx.glance.state.PreferencesGlanceStateDefinition
import androidx.glance.text.FontFamily
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import java.time.Instant
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

private val HABIT_VERSION = longPreferencesKey("version")
private val HabitIdKey = ActionParameters.Key<String>("habitId")

private class HabitPaint(val style: WidgetStyle, colors: ResolvedWidgetColors) {
    private fun color(hex: String) = Color(android.graphics.Color.parseColor(hex))
    val background = color(colors.bg).copy(alpha = colors.bgAlpha)
    val text = color(colors.text)
    val muted = color(colors.muted)
    val accent = color(colors.accent)
    // A warning must remain readable against both light and dark widget backgrounds.
    private val automaticText = WidgetStyle(background = colors.bg).resolve(null).text
    val warning = if (automaticText == "#ffffff" || automaticText == "#f5f5f4") Color(0xFFF87171) else Color(0xFFB91C1C)
    private val family = when (style.font) { "serif" -> FontFamily.Serif; "mono" -> FontFamily.Monospace; else -> FontFamily.SansSerif }
    fun type(color: Color = text, size: Int = 13, weight: FontWeight = FontWeight.Normal) =
        TextStyle(color = ColorProvider(color), fontSize = (size + style.textSp - 13).sp, fontFamily = family, fontWeight = weight)
}

@Composable
private fun openHabitsAction() = actionStartActivity(
    Intent(LocalContext.current, MainActivity::class.java)
        .putExtra(MainActivity.EXTRA_ACTION, MainActivity.ACTION_HABITS)
        .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
)

/** Independent habits receiver; the web app remains the source of truth for persisted ticks. */
class DaymarkHabitsGlanceWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Exact
    override val stateDefinition = PreferencesGlanceStateDefinition

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        provideContent {
            val version = currentState<Preferences>()[HABIT_VERSION]
            val today = remember(version) { LocalDate.now() }
            val view = remember(version) { WidgetStore.loadHabitView(context, today) }
            val paint = remember(version) {
                val widgetId = GlanceAppWidgetManager(context).getAppWidgetId(id)
                val style = WidgetStore.style(context, widgetId)
                HabitPaint(style, style.resolve(WidgetStore.appColors(context)))
            }
            val size = LocalSize.current
            if (size.width < 180.dp) {
                Column(
                    modifier = GlanceModifier.fillMaxSize().background(paint.background)
                        .cornerRadius(paint.style.cornerDp.dp).padding(10.dp).clickable(openHabitsAction()),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(text = "${view.done}/${view.total}", style = paint.type(paint.accent, 28, FontWeight.Bold))
                    Text(text = "habits", style = paint.type(paint.muted, 12))
                }
            } else {
                HabitsContent(view, today, size.height.value, paint)
            }
        }
    }
}

@Composable
private fun HabitsContent(view: HabitWidgetView, today: LocalDate, heightDp: Float, paint: HabitPaint) {
    val layout = HabitWidgetModel.layout(view.rows, paint.style, heightDp)
    Column(modifier = GlanceModifier.fillMaxSize().background(paint.background).padding(8.dp).cornerRadius(paint.style.cornerDp.dp)) {
        Row(modifier = GlanceModifier.fillMaxWidth().height(44.dp).clickable(openHabitsAction()), verticalAlignment = Alignment.CenterVertically) {
            Text(text = "Habits", style = paint.type(size = 14, weight = FontWeight.Bold))
            Spacer(modifier = GlanceModifier.width(8.dp))
            Text(text = today.format(DateTimeFormatter.ofPattern("MMM d", Locale.getDefault())), style = paint.type(paint.muted, 12))
            Spacer(modifier = GlanceModifier.defaultWeight())
            Text(text = "${view.done} of ${view.total}", style = paint.type(paint.muted, 12))
        }
        if (view.rows.isEmpty()) {
            Box(modifier = GlanceModifier.fillMaxSize().clickable(openHabitsAction()), contentAlignment = Alignment.Center) {
                Text(text = "Add habits in Daymark", style = paint.type(paint.muted, 12))
            }
        } else {
            LazyColumn(modifier = GlanceModifier.fillMaxSize()) {
                items(layout.rows) { row -> HabitContentRow(row, paint) }
                if (layout.hidden > 0) {
                    item {
                        Box(modifier = GlanceModifier.fillMaxWidth().height(HabitWidgetModel.rowHeightDp(paint.style).dp)
                            .clickable(openHabitsAction()), contentAlignment = Alignment.CenterStart) {
                            Text(text = "+${layout.hidden} more", style = paint.type(paint.muted, 12))
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun HabitContentRow(row: HabitRow, paint: HabitPaint) {
    Row(modifier = GlanceModifier.fillMaxWidth().height(HabitWidgetModel.rowHeightDp(paint.style).dp), verticalAlignment = Alignment.CenterVertically) {
        Box(
            modifier = GlanceModifier.size(44.dp)
                .clickable(actionRunCallback<ToggleHabitActionCallback>(actionParametersOf(HabitIdKey to row.id)))
                .semantics { contentDescription = if (row.done) "Untick ${row.name}" else "Mark ${row.name} done" },
            contentAlignment = Alignment.Center,
        ) {
            Box(modifier = GlanceModifier.size(22.dp).background(if (row.done) paint.accent else paint.muted).cornerRadius(5.dp),
                contentAlignment = Alignment.Center) {
                if (row.done) Text(text = "✓", style = paint.type(paint.background, 13, FontWeight.Bold))
            }
        }
        Spacer(modifier = GlanceModifier.width(8.dp))
        Box(modifier = GlanceModifier.defaultWeight().height(44.dp).clickable(openHabitsAction()), contentAlignment = Alignment.CenterStart) {
            Text(text = row.name, maxLines = 1, style = paint.type())
        }
        if (row.warning) {
            Text(text = "⚠ ${row.missedDays}d", style = paint.type(paint.warning, 12, FontWeight.Bold))
        } else if (paint.style.show.streaks) {
            Text(text = "🔥${row.streak}", style = paint.type(paint.muted, 12))
        }
    }
}

/** Re-read on tap so a stale RemoteViews or a midnight crossing cannot toggle yesterday. */
class ToggleHabitActionCallback : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        val habitId = parameters[HabitIdKey] ?: return
        val today = LocalDate.now()
        val row = WidgetStore.loadHabitView(context, today).rows.find { it.id == habitId } ?: return
        WidgetStore.queueHabitAction(context, HabitAction(habitId, today.toString(), !row.done, Instant.now().toString()))
        DaymarkHabitsGlanceWidget().refreshAll(context)
    }
}

suspend fun DaymarkHabitsGlanceWidget.refreshAll(context: Context) {
    for (id in GlanceAppWidgetManager(context).getGlanceIds(DaymarkHabitsGlanceWidget::class.java)) {
        updateAppWidgetState(context, id) { it[HABIT_VERSION] = System.nanoTime() }
        update(context, id)
    }
}

class DaymarkHabitsWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = DaymarkHabitsGlanceWidget()
    override fun onDeleted(context: Context, appWidgetIds: IntArray) {
        super.onDeleted(context, appWidgetIds)
        for (id in appWidgetIds) WidgetStore.removeStyle(context, id)
    }
}
