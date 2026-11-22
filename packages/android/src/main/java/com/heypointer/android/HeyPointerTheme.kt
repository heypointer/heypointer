package com.heypointer.android

import android.graphics.Typeface

/**
 * Runtime overrides for how the guide looks. Every field is optional; `null` keeps the value from the color and
 * dimen resources of the same name (`heypointer_color_accent`, `heypointer_ring_width`, ... in `heypointer_colors.xml`
 * and `heypointer_dimens.xml`). A host app overrides those resources, with `values-night` for dark, and `theme` wins
 * over both. Precedence: this class > the host app's resource > the library default (light or dark by the system).
 *
 * Colors are ARGB ints (`Color.parseColor("#087ea4")`). Surfaces and text colors are treated as opaque. Sizes are dp.
 * Out-of-range sizes are clamped. Keep text and its background at 4.5:1 or better; a debug build logs a warning when not.
 *
 *     HeyPointer.install(this, url, clientId, theme = HeyPointerTheme(accent = Color.parseColor("#7c3aed"), onAccent = Color.WHITE))
 */
data class HeyPointerTheme(
    /** Next button, the "Guide me" button, text buttons. */
    val accent: Int? = null,
    /** Text and icons on [accent]. */
    val onAccent: Int? = null,
    /** The card's background. */
    val surface: Int? = null,
    /** Text on [surface]. */
    val onSurface: Int? = null,
    /** Secondary text on [surface] (progress, hints, source). */
    val mutedText: Int? = null,
    /** The dim over the screen outside the highlighted control. May be translucent. */
    val scrim: Int? = null,
    /** The ring around the highlighted control. */
    val ring: Int? = null,
    val ringWidthDp: Float? = null,
    /** Corner radius of the card. */
    val cardCornerRadiusDp: Float? = null,
    /** Corner radius of the cutout and ring around the control. */
    val highlightCornerRadiusDp: Float? = null,
    val noticeBackground: Int? = null,
    val noticeText: Int? = null,
    /** Background of a disabled Next button. */
    val accentDisabled: Int? = null,
    /** Multiplies every text size (on top of the user's system font size). 1.0 = unchanged. */
    val textScale: Float? = null,
    /** Typeface for all guide text. Bold text stays bold. Runtime only (no resource). */
    val typeface: Typeface? = null,
)

/** The theme after every layer is applied. Plain numbers, so it is testable without Android. */
internal data class ThemeValues(
    val accent: Int, val onAccent: Int, val surface: Int, val onSurface: Int, val mutedText: Int, val scrim: Int, val ring: Int,
    val noticeBackground: Int, val noticeText: Int, val accentDisabled: Int,
    val ringWidthDp: Float, val cardCornerRadiusDp: Float, val highlightCornerRadiusDp: Float, val textScale: Float,
) {
    companion object {
        const val MIN_RING = 0f; const val MAX_RING = 12f
        const val MIN_CARD_RADIUS = 0f; const val MAX_CARD_RADIUS = 40f
        const val MIN_HIGHLIGHT_RADIUS = 0f; const val MAX_HIGHLIGHT_RADIUS = 32f
        const val MIN_TEXT_SCALE = 0.75f; const val MAX_TEXT_SCALE = 2f
        private const val OPAQUE = 0xFF000000.toInt()

        /** Library defaults for the light theme. The resource files carry the same numbers (a test checks). */
        val LIGHT = ThemeValues(
            accent = 0xFF087EA4.toInt(), onAccent = 0xFFFFFFFF.toInt(), surface = 0xFFFFFFFF.toInt(), onSurface = 0xFF172B3A.toInt(),
            mutedText = 0xFF334155.toInt(), scrim = 0x8C09141E.toInt(), ring = 0xFFF59E0B.toInt(),
            noticeBackground = 0xFFFEF3C7.toInt(), noticeText = 0xFF92400E.toInt(), accentDisabled = 0xFF9FB6C2.toInt(),
            ringWidthDp = 3f, cardCornerRadiusDp = 14f, highlightCornerRadiusDp = 8f, textScale = 1f,
        )

        /** Library defaults for the dark theme (`values-night`). */
        val DARK = ThemeValues(
            accent = 0xFF38BDF8.toInt(), onAccent = 0xFF082F49.toInt(), surface = 0xFF0F172A.toInt(), onSurface = 0xFFF1F5F9.toInt(),
            mutedText = 0xFFCBD5E1.toInt(), scrim = 0xB3000000.toInt(), ring = 0xFFF59E0B.toInt(),
            noticeBackground = 0xFF422006.toInt(), noticeText = 0xFFFBBF24.toInt(), accentDisabled = 0xFF475569.toInt(),
            ringWidthDp = 3f, cardCornerRadiusDp = 14f, highlightCornerRadiusDp = 8f, textScale = 1f,
        )

        /** `base` (resources) with the explicit `theme` on top, then sanitized. */
        fun merge(base: ThemeValues, theme: HeyPointerTheme?): ThemeValues {
            val t = theme ?: HeyPointerTheme()
            return ThemeValues(
                accent = opaque(t.accent ?: base.accent), onAccent = opaque(t.onAccent ?: base.onAccent),
                surface = opaque(t.surface ?: base.surface), onSurface = opaque(t.onSurface ?: base.onSurface),
                mutedText = opaque(t.mutedText ?: base.mutedText), scrim = t.scrim ?: base.scrim, ring = t.ring ?: base.ring,
                noticeBackground = opaque(t.noticeBackground ?: base.noticeBackground), noticeText = opaque(t.noticeText ?: base.noticeText),
                accentDisabled = opaque(t.accentDisabled ?: base.accentDisabled),
                ringWidthDp = clamp(pick(t.ringWidthDp, base.ringWidthDp), MIN_RING, MAX_RING),
                cardCornerRadiusDp = clamp(pick(t.cardCornerRadiusDp, base.cardCornerRadiusDp), MIN_CARD_RADIUS, MAX_CARD_RADIUS),
                highlightCornerRadiusDp = clamp(pick(t.highlightCornerRadiusDp, base.highlightCornerRadiusDp), MIN_HIGHLIGHT_RADIUS, MAX_HIGHLIGHT_RADIUS),
                textScale = clamp(pick(t.textScale, base.textScale), MIN_TEXT_SCALE, MAX_TEXT_SCALE),
            )
        }

        private fun opaque(c: Int) = c or OPAQUE
        private fun pick(explicit: Float?, base: Float) = if (explicit == null || explicit.isNaN()) base else explicit
        private fun clamp(v: Float, lo: Float, hi: Float) = v.coerceIn(lo, hi)
    }
}

/** WCAG 2.x contrast. Used by a unit test and a debug-build log warning only; it never blocks or changes a color. */
internal object Contrast {
    const val AA_TEXT = 4.5

    private fun channel(v: Int): Double { val c = v / 255.0; return if (c <= 0.03928) c / 12.92 else Math.pow((c + 0.055) / 1.055, 2.4) }

    fun luminance(argb: Int): Double =
        0.2126 * channel((argb shr 16) and 0xFF) + 0.7152 * channel((argb shr 8) and 0xFF) + 0.0722 * channel(argb and 0xFF)

    /** Contrast of `fg` on `bg`; a translucent `fg` is first blended over `bg`. */
    fun ratio(fg: Int, bg: Int): Double {
        val a = ((fg ushr 24) and 0xFF) / 255.0
        val blended = if (a >= 1.0) fg else {
            fun mix(s: Int) = Math.round(((fg shr s) and 0xFF) * a + ((bg shr s) and 0xFF) * (1 - a)).toInt()
            (0xFF shl 24) or (mix(16) shl 16) or (mix(8) shl 8) or mix(0)
        }
        val l1 = luminance(blended); val l2 = luminance(bg)
        return (maxOf(l1, l2) + 0.05) / (minOf(l1, l2) + 0.05)
    }

    /** One human sentence per text pair that is below 4.5:1. Empty when the theme reads well. */
    fun problems(t: ThemeValues): List<String> = listOf(
        Triple("onAccent on accent (Next and Guide me buttons)", t.onAccent, t.accent),
        Triple("onSurface on surface (card text)", t.onSurface, t.surface),
        Triple("mutedText on surface (progress, hints)", t.mutedText, t.surface),
        Triple("accent on surface (Skip, Try again, suggestions)", t.accent, t.surface),
        Triple("noticeText on noticeBackground (notices)", t.noticeText, t.noticeBackground),
    ).mapNotNull { (name, fg, bg) ->
        val r = ratio(fg, bg)
        if (r < AA_TEXT) "HeyPointer theme: $name has contrast ${"%.1f".format(r)}:1; WCAG AA needs 4.5:1." else null
    }
}
