package app.daymark.notes

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import java.time.ZonedDateTime

object WidgetMidnightAlarm {
    const val ACTION = "app.daymark.notes.WIDGET_MIDNIGHT"

    fun schedule(context: Context) {
        val intent = Intent(context, WidgetDateChangeReceiver::class.java).setAction(ACTION)
        val pending = PendingIntent.getBroadcast(context, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val alarms = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        alarms.setAndAllowWhileIdle(AlarmManager.RTC, nextWidgetMidnight(ZonedDateTime.now()), pending)
    }
}
