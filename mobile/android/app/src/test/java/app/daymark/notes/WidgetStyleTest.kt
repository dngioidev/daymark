package app.daymark.notes

import org.junit.Assert.assertEquals
import org.junit.Test

class WidgetStyleTest {
    @Test fun `streaks defaults true`() {
        assertEquals(true, WidgetStyle.parse("{}").show.streaks)
        assertEquals(true, WidgetStyle.parse("""{"show":{"streaks":"false"}}""").show.streaks)
        val style = WidgetStyle.parse("""{"show":{"streaks":false}}""")
        assertEquals(false, style.show.streaks)
        assertEquals(style, WidgetStyle.parse(style.toJson()))
    }
    @Test fun missingFieldsUseLegacyDefaults() {
        assertEquals(WidgetStyle(), WidgetStyle.parse("{}"))
        assertEquals(WidgetStyle(), WidgetStyle.parse(null))
        assertEquals(WidgetStyle(), WidgetStyle.parse("broken"))
        assertEquals(false, WidgetStyle.parse("{}").show.done)
        assertEquals(false, WidgetStyle.parse("""{"show":{"age":false}}""").show.done)
    }
    @Test fun doneRowsAreAnExplicitOptIn() {
        assertEquals(true, WidgetStyle.parse("""{"show":{"done":true}}""").show.done)
    }
    @Test fun comfyPreservesLegacyHeightAndCompactIsTighter() {
        assertEquals(30, WidgetStyle().rowHeightDp)
        assertEquals(24, WidgetStyle(density = "compact").rowHeightDp)
    }
    @Test fun unknownFontFallsBack() {
        assertEquals("sans", WidgetStyle.parse("""{"font":"comic"}""").font)
    }
    @Test fun matchAppUsesResolvedHeader() {
        val colors = WidgetStyle.parse("""{"mode":"match-app","opacity":40}""")
            .resolve(AppColors("#123456", "#ffffff", "#abcdef", true))
        assertEquals("#123456", colors.bg)
        assertEquals("#ffffff", colors.text)
        assertEquals("#abcdef", colors.accent)
        assertEquals(0.4f, colors.bgAlpha)
    }
    @Test fun lightBackgroundUsesDarkText() {
        assertEquals("#1c1917", WidgetStyle.parse("""{"background":"#fafaf9"}""").resolve(null).text)
    }
    @Test fun legacyPaletteIsUnchanged() {
        assertEquals(ResolvedWidgetColors("#1c1917", 1f, "#f5f5f4", "#d6d3d1", "#f59e0b"), WidgetStyle().resolve(null))
    }
    @Test fun jsonRoundTripRetainsEveryField() {
        val style = WidgetStyle.parse("""{"mode":"match-app","background":"#123456","opacity":37,"text":"#abcdef","accent":"#654321","font":"mono","size":"xl","corners":"extra","density":"compact","show":{"done":true,"age":false,"quickAdd":false,"sections":true}}""")
        assertEquals(style, WidgetStyle.parse(style.toJson()))
        assertEquals("mono", style.font)
        assertEquals(true, style.show.done)
        assertEquals(true, style.show.sections)
    }
    @Test fun invalidValuesAndPartialFlagsAreSafe() {
        val style = WidgetStyle.parse("""{"background":"red","opacity":-2,"size":"huge","show":{"age":false}}""")
        assertEquals("#1c1917", style.background)
        assertEquals(0.0, style.opacity, 0.0)
        assertEquals("m", style.size)
        assertEquals(WidgetShow(age = false), style.show)
        assertEquals(100.0, WidgetStyle.parse("""{"opacity":"50"}""").opacity, 0.0)
    }
}
