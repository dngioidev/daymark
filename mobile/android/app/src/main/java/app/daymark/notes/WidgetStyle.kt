package app.daymark.notes

import org.json.JSONObject
import kotlin.math.pow

data class WidgetShow(val done: Boolean = false, val age: Boolean = true, val quickAdd: Boolean = true, val sections: Boolean = false)
data class AppColors(val headerBg: String, val headerText: String, val accent: String, val dark: Boolean)
data class ResolvedWidgetColors(val bg: String, val bgAlpha: Float, val text: String, val muted: String, val accent: String)

/** Shared JSON contract with widgetStyle.ts. No Android imports: also runs in JVM tests. */
data class WidgetStyle(
    val mode: String = "custom", val background: String = "#1c1917", val opacity: Double = 100.0,
    val text: String = "auto", val accent: String = "#f59e0b", val font: String = "sans",
    val size: String = "m", val corners: String = "round", val density: String = "comfy",
    val show: WidgetShow = WidgetShow(),
) {
    val textSp: Int get() = when (size) { "s" -> 11; "l" -> 15; "xl" -> 17; else -> 13 }
    val cornerDp: Int get() = when (corners) { "square" -> 4; "extra" -> 28; else -> 16 }
    // R12: Comfy is the original fixed 30dp row with no explicit vertical padding.
    val rowHeightDp: Int get() = if (density == "compact") 24 else 30
    val sectionHeightDp: Int get() = textSp + 5

    fun toJson(): String = JSONObject().put("mode", mode).put("background", background).put("opacity", opacity)
        .put("text", text).put("accent", accent).put("font", font).put("size", size).put("corners", corners)
        .put("density", density).put("show", JSONObject().put("done", show.done).put("age", show.age)
            .put("quickAdd", show.quickAdd).put("sections", show.sections)).toString()

    fun resolve(app: AppColors?): ResolvedWidgetColors {
        val match = if (mode == "match-app") app else null
        val bg = match?.headerBg ?: background
        val automatic = if (bg == "#1c1917") "#f5f5f4" else autoText(bg)
        val readable = if (contrast(automatic, bg) >= 4.5) automatic else "#000000"
        val fg = match?.headerText ?: if (text == "auto") readable else text
        val muted = if (autoText(bg) == "#ffffff") "#d6d3d1" else "#44403c"
        return ResolvedWidgetColors(bg, (opacity / 100).toFloat(), fg,
            if (contrast(muted, bg) >= 4.5) muted else readable, match?.accent ?: accent)
    }

    companion object {
        private val hex = Regex("^#[0-9a-fA-F]{6}$")
        fun parse(json: String?): WidgetStyle {
            val obj = try { JSONObject(json ?: "{}") } catch (_: Exception) { JSONObject() }
            fun choice(key: String, allowed: List<String>, fallback: String) = (obj.opt(key) as? String)?.takeIf { it in allowed } ?: fallback
            fun color(key: String, fallback: String) = (obj.opt(key) as? String)?.takeIf { hex.matches(it) }?.lowercase() ?: fallback
            val flags = obj.optJSONObject("show") ?: JSONObject()
            fun flag(key: String, fallback: Boolean) = flags.opt(key) as? Boolean ?: fallback
            val opacity = (obj.opt("opacity") as? Number)?.toDouble()?.takeIf { it.isFinite() }?.coerceIn(0.0, 100.0) ?: 100.0
            return WidgetStyle(choice("mode", listOf("match-app", "custom"), "custom"), color("background", "#1c1917"), opacity,
                if (obj.opt("text") == "auto") "auto" else color("text", "auto"), color("accent", "#f59e0b"),
                choice("font", listOf("sans", "serif", "mono"), "sans"), choice("size", listOf("s", "m", "l", "xl"), "m"),
                choice("corners", listOf("square", "round", "extra"), "round"), choice("density", listOf("compact", "comfy"), "comfy"),
                WidgetShow(flag("done", false), flag("age", true), flag("quickAdd", true), flag("sections", false)))
        }
        private fun luminance(hex: String): Double {
            val c = listOf(1, 3, 5).map { hex.substring(it, it + 2).toInt(16) / 255.0 }
                .map { if (it <= 0.04045) it / 12.92 else ((it + 0.055) / 1.055).pow(2.4) }
            return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
        }
        private fun contrast(a: String, b: String): Double {
            val x = luminance(a); val y = luminance(b)
            return (maxOf(x, y) + 0.05) / (minOf(x, y) + 0.05)
        }
        private fun autoText(bg: String) = if (contrast("#ffffff", bg) >= contrast("#1c1917", bg)) "#ffffff" else "#1c1917"
    }
}
