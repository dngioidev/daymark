package app.daymark.notes

import java.time.Instant
import java.time.ZoneId
import java.time.ZonedDateTime
import org.junit.Assert.assertEquals
import org.junit.Test

class WidgetMidnightTest {
    @Test fun `next local midnight has a one minute refresh margin`() {
        val now = ZonedDateTime.parse("2026-10-24T23:59:59+07:00[Asia/Ho_Chi_Minh]")
        assertEquals(Instant.parse("2026-10-24T17:01:00Z").toEpochMilli(), nextWidgetMidnight(now))
    }
    @Test fun `spring DST day advances by local date rather than 24 hours`() {
        val now = ZonedDateTime.of(2026, 3, 8, 0, 0, 0, 0, ZoneId.of("America/New_York"))
        assertEquals(Instant.parse("2026-03-09T04:01:00Z").toEpochMilli(), nextWidgetMidnight(now))
    }
    @Test fun `fall DST day advances by local date rather than 24 hours`() {
        val now = ZonedDateTime.of(2026, 11, 1, 0, 0, 0, 0, ZoneId.of("America/New_York"))
        assertEquals(Instant.parse("2026-11-02T05:01:00Z").toEpochMilli(), nextWidgetMidnight(now))
    }
}
