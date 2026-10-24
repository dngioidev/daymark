package app.daymark.notes

import java.time.ZonedDateTime

/** Local date arithmetic handles both 23-hour and 25-hour DST days. */
fun nextWidgetMidnight(now: ZonedDateTime): Long =
    now.toLocalDate().plusDays(1).atStartOfDay(now.zone).plusMinutes(1).toInstant().toEpochMilli()
