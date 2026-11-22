// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 HeyPointer
package com.heypointer.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PlacementTest {
    private val view = 1000f to 800f
    private fun place(t: Box, narrow: Boolean = false, w: Float = 300f, h: Float = 150f) =
        CoachmarkPlacement.position(t, w, h, view.first, view.second, narrow, 12f, 16f)

    @Test fun prefersBelowTheTarget() {
        val p = place(Box(400f, 100f, 600f, 150f))
        assertEquals(Placement.BELOW, p.placement)
        assertTrue(p.top >= 150f + 16f)
    }

    @Test fun flipsAboveWhenThereIsNoRoomBelow() {
        val p = place(Box(400f, 700f, 600f, 760f))
        assertEquals(Placement.ABOVE, p.placement)
        assertTrue(p.top + 150f <= 700f)
    }

    @Test fun staysInsideTheScreenAndOffTheTarget() {
        val target = Box(0f, 300f, 1000f, 500f) // full width: only a clamped card fits
        val p = place(target)
        assertTrue(p.left >= 12f && p.left + 300f <= 988f && p.top >= 12f && p.top + 150f <= 788f)
    }

    @Test fun narrowScreensUseFullWidthBelowOrAbove() {
        val below = CoachmarkPlacement.position(Box(20f, 100f, 200f, 150f), 340f, 150f, 360f, 640f, true, 12f, 16f)
        assertEquals(12f, below.left, 0f)
        assertTrue(below.top > 150f)
        val above = CoachmarkPlacement.position(Box(20f, 520f, 200f, 600f), 340f, 150f, 360f, 640f, true, 12f, 16f)
        assertTrue(above.top + 150f < 520f)
    }

    // Measured from the Echo emulator: usable height 1389 px with the keyboard up, 2400 - bars without it. Card 712 px tall.
    private fun narrowPlace(t: Box, viewH: Float, cardH: Float = 712f) = CoachmarkPlacement.position(t, 1056f, cardH, 1080f, viewH, true, 31.5f, 42f)

    @Test fun aTallCardGoesBelowTheTargetWhenTheWindowIsTallEnough() {
        val p = narrowPlace(Box(0f, 651f, 1080f, 819f), viewH = 2150f)
        assertEquals(819f + 42f, p.top, 0f)
    }

    @Test fun aShortWindowNeverPinsATallCardOverTheMiddleOfTheTarget() {
        val target = Box(0f, 651f, 1080f, 819f)
        val p = narrowPlace(target, viewH = 1389f)
        val covered = maxOf(0f, minOf(target.bottom, p.top + 712f) - maxOf(target.top, p.top))
        // Bottom-pinned the card would cover the whole 168 px row; the top pin covers less.
        assertTrue("covered $covered", covered < target.height)
        assertTrue(p.top >= 31.5f && p.top + 712f <= 1389f - 31.5f + 0.01f)
    }

    @Test fun theCardMovesBackBelowTheTargetWhenTheWindowGrowsAgain() {
        val target = Box(0f, 651f, 1080f, 819f)
        val shrunk = narrowPlace(target, viewH = 1389f)
        val restored = narrowPlace(target, viewH = 2150f)
        assertTrue(shrunk.top < restored.top)
        assertEquals(819f + 42f, restored.top, 0f)
    }

    @Test fun aTallerCardStillFitsAboveWhenBelowIsFull() {
        val p = narrowPlace(Box(0f, 1600f, 1080f, 1700f), viewH = 2150f, cardH = 900f)
        assertTrue(p.top + 900f <= 1600f)
    }

    @Test fun placementIsRecomputedWhenSizeInsetsOrCardHeightChange() {
        val base = PlacementInputs(1080, 2400, 128, 150, 0, 0, 712)
        assertFalse(needsReplace(base, base.copy()))
        assertTrue(needsReplace(null, base))
        assertTrue(needsReplace(base, base.copy(insetBottom = 883))) // keyboard up
        assertTrue(needsReplace(base.copy(insetBottom = 883), base)) // keyboard gone again
        assertTrue(needsReplace(base, base.copy(height = 1100, width = 2400))) // rotation
        assertTrue(needsReplace(base, base.copy(cardHeight = 520))) // the card got taller or shorter
        assertTrue(needsReplace(base, base.copy(insetLeft = 80)))
    }

    // px = dp * density. 2.625 is a common phone density, 2.0 a common tablet one.
    @Test fun phoneGetsAFullWidthCardMinusMargins() {
        val l = cardLayout(usableW = 360f * 2.625f, density = 2.625f, margin = 12f * 2.625f)
        assertTrue(l.narrow)
        assertEquals((360f - 24f) * 2.625f, l.cardW, 0.01f)
    }

    @Test fun sixHundredDpIsStillNarrowAndAnythingWiderIsCapped() {
        assertTrue(cardLayout(600f * 2f, 2f, 24f).narrow)
        val tablet = cardLayout(601f * 2f, 2f, 24f)
        assertFalse(tablet.narrow)
        assertEquals(400f * 2f, tablet.cardW, 0.01f) // never wider than 400dp
    }

    @Test fun tabletAndLandscapePhoneCardIsCappedAt400dp() {
        listOf(800f to 2f, 1280f to 2f, 900f to 2.625f).forEach { (dp, density) ->
            val l = cardLayout(dp * density, density, 12f * density)
            assertFalse(l.narrow)
            assertEquals(400f * density, l.cardW, 0.01f)
        }
    }

    @Test fun neverWiderThanTheScreenAndNeverNegative() {
        val l = cardLayout(usableW = 20f, density = 1f, margin = 12f) // absurdly small window
        assertEquals(0f, l.cardW, 0f)
    }

    @Test fun tabletPlacementSitsBesideAFullHeightRightHandTargetInsteadOfCoveringIt() {
        // 1280 x 800 dp tablet in px at density 1: a tall control hugging the left edge. Card goes to its right.
        val target = Box(0f, 100f, 80f, 700f)
        val l = cardLayout(1280f, 1f, 12f)
        val p = CoachmarkPlacement.position(target, l.cardW, 220f, 1280f, 800f, l.narrow, 12f, 16f)
        assertEquals(Placement.RIGHT, p.placement)
        assertTrue(p.left >= target.right + 16f)
        assertTrue(p.left + l.cardW <= 1280f - 12f)
    }

    @Test fun tabletPlacementDoesNotFloatTheCardAcrossTheWholeWidth() {
        val l = cardLayout(1280f, 1f, 12f)
        val p = CoachmarkPlacement.position(Box(600f, 100f, 680f, 148f), l.cardW, 220f, 1280f, 800f, l.narrow, 12f, 16f)
        assertEquals(Placement.BELOW, p.placement)
        assertEquals(l.cardW, 400f, 0f)
        assertEquals(640f - 200f, p.left, 0.01f) // centred under the target
    }
}

class PlacementRtlTest {
    // A control in the middle of a wide screen with room on both sides but not above or below.
    private val target = Box(450f, 300f, 550f, 500f)
    private fun place(rtl: Boolean) = CoachmarkPlacement.position(target, 300f, 700f, 1000f, 800f, false, 12f, 16f, rtl)

    @Test fun leftToRightPrefersTheRightSide() = assertEquals(Placement.RIGHT, place(false).placement)

    @Test fun rightToLeftPrefersTheLeftSide() = assertEquals(Placement.LEFT, place(true).placement)

    @Test fun belowAndAboveStillComeFirstInBothDirections() {
        val high = Box(450f, 100f, 550f, 150f)
        for (rtl in listOf(false, true)) {
            assertEquals(Placement.BELOW, CoachmarkPlacement.position(high, 300f, 150f, 1000f, 800f, false, 12f, 16f, rtl).placement)
        }
    }

    @Test fun narrowScreensIgnoreDirection() {
        assertEquals(CoachmarkPlacement.position(target, 340f, 150f, 360f, 640f, true, 12f, 16f, false),
            CoachmarkPlacement.position(target, 340f, 150f, 360f, 640f, true, 12f, 16f, true))
    }
}
