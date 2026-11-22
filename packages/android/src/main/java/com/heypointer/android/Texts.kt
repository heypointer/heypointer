package com.heypointer.android

import android.content.Context
import android.os.Build
import android.util.Log
import android.util.TypedValue

/**
 * The text the guide shows. An explicit [HeyPointerLabels] value wins, then the string resource (the host app's own,
 * which Android merges over the library's), then built-in English. Never throws: a bad string falls through.
 */
internal class Texts(private val context: Context, labels: HeyPointerLabels?) {
    private val resolver = TextResolver({ key -> labels?.valueFor(key) }, ::fromResources)

    fun get(key: Str, vararg args: Any): String = resolver.text(key, args.toList())

    /** What to show for a failure: our own errors carry a key; anything else gets the generic line (details go to the log). */
    fun describe(t: Throwable): String {
        if (t is HeyPointerException) {
            val key = t.key
            return if (key != null) resolver.text(key, t.args) else t.message ?: get(Str.SOMETHING_WENT_WRONG)
        }
        Log.w("HeyPointer", "request failed", t)
        return get(Str.SOMETHING_WENT_WRONG)
    }

    private fun fromResources(key: Str, args: List<Any>): String? = runCatching {
        val res = context.resources
        if (key.plural) res.getQuantityString(key.resId(), (args.firstOrNull() as? Number)?.toInt() ?: 0, *args.toTypedArray())
        else if (key.argCount == 0) context.getString(key.resId())
        else context.getString(key.resId(), *args.toTypedArray())
    }.getOrNull()
}

/** Reads the theme from the color and dimen resources: the library's own, or the host app's override (light or night). */
internal object ThemeResources {
    fun load(context: Context): ThemeValues {
        val r = context.resources
        val density = r.displayMetrics.density
        fun color(id: Int, fallback: Int): Int = runCatching {
            if (Build.VERSION.SDK_INT >= 23) r.getColor(id, context.theme) else @Suppress("DEPRECATION") r.getColor(id)
        }.getOrDefault(fallback)
        fun dp(id: Int, fallback: Float): Float = runCatching { r.getDimension(id) / density }.getOrDefault(fallback)
        fun scale(id: Int, fallback: Float): Float = runCatching { TypedValue().also { r.getValue(id, it, true) }.float }.getOrDefault(fallback)
        val d = if (nightMode(context)) ThemeValues.DARK else ThemeValues.LIGHT
        return ThemeValues(
            accent = color(R.color.heypointer_color_accent, d.accent), onAccent = color(R.color.heypointer_color_on_accent, d.onAccent),
            surface = color(R.color.heypointer_color_surface, d.surface), onSurface = color(R.color.heypointer_color_on_surface, d.onSurface),
            mutedText = color(R.color.heypointer_color_muted, d.mutedText), scrim = color(R.color.heypointer_color_scrim, d.scrim),
            ring = color(R.color.heypointer_color_ring, d.ring), noticeBackground = color(R.color.heypointer_color_notice_bg, d.noticeBackground),
            noticeText = color(R.color.heypointer_color_notice_text, d.noticeText), accentDisabled = color(R.color.heypointer_color_accent_disabled, d.accentDisabled),
            ringWidthDp = dp(R.dimen.heypointer_ring_width, d.ringWidthDp), cardCornerRadiusDp = dp(R.dimen.heypointer_card_radius, d.cardCornerRadiusDp),
            highlightCornerRadiusDp = dp(R.dimen.heypointer_highlight_radius, d.highlightCornerRadiusDp),
            textScale = scale(R.dimen.heypointer_text_scale, d.textScale),
        )
    }

    private fun nightMode(context: Context) =
        (context.resources.configuration.uiMode and android.content.res.Configuration.UI_MODE_NIGHT_MASK) == android.content.res.Configuration.UI_MODE_NIGHT_YES
}
