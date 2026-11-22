// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 HeyPointer
package com.heypointer.android

import java.io.File
import javax.xml.parsers.DocumentBuilderFactory
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.w3c.dom.Element

class HeyPointerThemeTest {
    private val light = ThemeValues.LIGHT
    private val dark = ThemeValues.DARK

    // ---- defaults ---------------------------------------------------------------------

    @Test fun libraryDefaultsReadWellInLightAndDark() {
        assertEquals(emptyList<String>(), Contrast.problems(light))
        assertEquals(emptyList<String>(), Contrast.problems(dark))
    }

    @Test fun noThemeKeepsTheResourceValues() {
        assertEquals(light, ThemeValues.merge(light, null))
        assertEquals(light, ThemeValues.merge(light, HeyPointerTheme()))
        assertEquals(dark, ThemeValues.merge(dark, HeyPointerTheme()))
    }

    // ---- precedence and sanitizing ------------------------------------------------------

    @Test fun explicitThemeBeatsResourcesFieldByField() {
        val t = ThemeValues.merge(light, HeyPointerTheme(accent = 0xFF7C3AED.toInt(), onAccent = 0xFFFFFFFF.toInt(), ringWidthDp = 5f, cardCornerRadiusDp = 4f, textScale = 1.25f))
        assertEquals(0xFF7C3AED.toInt(), t.accent)
        assertEquals(5f, t.ringWidthDp, 0f)
        assertEquals(4f, t.cardCornerRadiusDp, 0f)
        assertEquals(1.25f, t.textScale, 0f)
        assertEquals(light.surface, t.surface)
        assertEquals(light.highlightCornerRadiusDp, t.highlightCornerRadiusDp, 0f)
    }

    @Test fun textAndSurfaceColorsAreMadeOpaqueButTheScrimIsNot() {
        val t = ThemeValues.merge(light, HeyPointerTheme(surface = 0x00FFFFFF, accent = 0x80087EA4.toInt(), scrim = 0x40000000))
        assertEquals(0xFF, (t.surface ushr 24) and 0xFF)
        assertEquals(0xFF, (t.accent ushr 24) and 0xFF)
        assertEquals(0x40, (t.scrim ushr 24) and 0xFF)
    }

    @Test fun sizesAreClamped() {
        val t = ThemeValues.merge(light, HeyPointerTheme(ringWidthDp = 99f, cardCornerRadiusDp = -3f, highlightCornerRadiusDp = 500f, textScale = 9f))
        assertEquals(ThemeValues.MAX_RING, t.ringWidthDp, 0f)
        assertEquals(ThemeValues.MIN_CARD_RADIUS, t.cardCornerRadiusDp, 0f)
        assertEquals(ThemeValues.MAX_HIGHLIGHT_RADIUS, t.highlightCornerRadiusDp, 0f)
        assertEquals(ThemeValues.MAX_TEXT_SCALE, t.textScale, 0f)
        assertEquals(ThemeValues.MIN_TEXT_SCALE, ThemeValues.merge(light, HeyPointerTheme(textScale = 0.01f)).textScale, 0f)
    }

    @Test fun notANumberFallsBackToTheResourceValue() {
        val t = ThemeValues.merge(light, HeyPointerTheme(ringWidthDp = Float.NaN, textScale = Float.NaN))
        assertEquals(light.ringWidthDp, t.ringWidthDp, 0f)
        assertEquals(light.textScale, t.textScale, 0f)
    }

    // ---- contrast helper --------------------------------------------------------------------

    @Test fun contrastMatchesTheWcagReferenceValues() {
        assertEquals(21.0, Contrast.ratio(0xFF000000.toInt(), 0xFFFFFFFF.toInt()), 0.01)
        assertEquals(1.0, Contrast.ratio(0xFF336699.toInt(), 0xFF336699.toInt()), 0.0001)
        assertEquals(4.54, Contrast.ratio(0xFF767676.toInt(), 0xFFFFFFFF.toInt()), 0.02) // #767676 on white is the well-known 4.54:1
        assertEquals(Contrast.ratio(0xFF000000.toInt(), 0xFFFFFFFF.toInt()), Contrast.ratio(0xFFFFFFFF.toInt(), 0xFF000000.toInt()), 0.0001)
    }

    @Test fun aTranslucentForegroundIsBlendedOverTheBackground() {
        val half = Contrast.ratio(0x80000000.toInt(), 0xFFFFFFFF.toInt())
        assertTrue("blended gray on white is between 1 and 21: $half", half > 1.0 && half < 21.0)
    }

    @Test fun aLowContrastPairIsNamedInTheWarning() {
        val bad = ThemeValues.merge(light, HeyPointerTheme(accent = 0xFF9FB6C2.toInt(), onAccent = 0xFFFFFFFF.toInt()))
        val problems = Contrast.problems(bad)
        assertTrue(problems.toString(), problems.any { it.contains("onAccent on accent") && it.contains("4.5:1") })
        assertTrue(problems.none { it.contains("onSurface on surface") })
    }

    @Test fun everyTextPairIsChecked() {
        val allBad = ThemeValues.merge(light, HeyPointerTheme(
            accent = 0xFFCCCCCC.toInt(), onAccent = 0xFFDDDDDD.toInt(), surface = 0xFFEEEEEE.toInt(), onSurface = 0xFFE0E0E0.toInt(),
            mutedText = 0xFFE5E5E5.toInt(), noticeBackground = 0xFFEEEEEE.toInt(), noticeText = 0xFFE8E8E8.toInt()))
        assertEquals(5, Contrast.problems(allBad).size)
    }

    // ---- the resource files carry the same defaults ----------------------------------------------

    private fun doc(path: String): Element {
        val f = File("src/main/res/$path")
        assertTrue("missing ${f.path}", f.exists())
        return DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(f).documentElement
    }

    private fun colors(path: String): Map<String, Int> {
        val out = HashMap<String, Int>()
        val kids = doc(path).getElementsByTagName("color")
        for (i in 0 until kids.length) {
            val e = kids.item(i) as Element
            val hex = e.textContent.trim().removePrefix("#")
            val v = hex.toLong(16).toInt()
            out[e.getAttribute("name")] = if (hex.length == 6) v or 0xFF000000.toInt() else v
        }
        return out
    }

    private fun check(c: Map<String, Int>, v: ThemeValues) {
        assertEquals(v.accent, c["heypointer_color_accent"]); assertEquals(v.onAccent, c["heypointer_color_on_accent"])
        assertEquals(v.surface, c["heypointer_color_surface"]); assertEquals(v.onSurface, c["heypointer_color_on_surface"])
        assertEquals(v.mutedText, c["heypointer_color_muted"]); assertEquals(v.scrim, c["heypointer_color_scrim"])
        assertEquals(v.ring, c["heypointer_color_ring"]); assertEquals(v.noticeBackground, c["heypointer_color_notice_bg"])
        assertEquals(v.noticeText, c["heypointer_color_notice_text"]); assertEquals(v.accentDisabled, c["heypointer_color_accent_disabled"])
        assertEquals(10, c.size)
    }

    @Test fun lightColorResourcesMatchTheLightDefaults() = check(colors("values/heypointer_colors.xml"), light)

    @Test fun nightColorResourcesMatchTheDarkDefaults() = check(colors("values-night/heypointer_colors.xml"), dark)

    @Test fun dimenResourcesMatchTheDefaults() {
        val root = doc("values/heypointer_dimens.xml")
        val byName = HashMap<String, String>()
        for (tag in listOf("dimen", "item")) {
            val kids = root.getElementsByTagName(tag)
            for (i in 0 until kids.length) { val e = kids.item(i) as Element; byName[e.getAttribute("name")] = e.textContent.trim() }
        }
        assertEquals("${light.ringWidthDp.toInt()}dp", byName["heypointer_ring_width"])
        assertEquals("${light.cardCornerRadiusDp.toInt()}dp", byName["heypointer_card_radius"])
        assertEquals("${light.highlightCornerRadiusDp.toInt()}dp", byName["heypointer_highlight_radius"])
        assertEquals(light.textScale, byName["heypointer_text_scale"]!!.toFloat(), 0f)
    }
}
