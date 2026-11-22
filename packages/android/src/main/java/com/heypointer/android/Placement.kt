package com.heypointer.android

data class Box(val left: Float, val top: Float, val right: Float, val bottom: Float) {
    val width: Float get() = right - left
    val height: Float get() = bottom - top
}

enum class Placement { BELOW, ABOVE, LEFT, RIGHT, FLOATING }

data class Position(val left: Float, val top: Float, val placement: Placement)

/** The card's width and whether the screen counts as narrow (phone: full-width card below or above the target). */
data class CardLayout(val cardW: Float, val narrow: Boolean)

/**
 * Same breakpoints as the web SDK: up to 600dp wide is narrow and the card spans the screen minus margins;
 * wider screens (tablets, phones in landscape) get a card of at most 400dp. All sizes in pixels; `density` is px per dp.
 */
fun cardLayout(usableW: Float, density: Float, margin: Float): CardLayout {
    val narrow = usableW <= 600f * density
    val cardW = if (narrow) usableW - 2 * margin else minOf(400f * density, usableW - 2 * margin)
    return CardLayout(maxOf(0f, cardW), narrow)
}

/**
 * What the card's position was computed from. A keyboard shown by another window (the goal dialog) is not announced
 * to the overlay by an insets callback, so the overlay compares this snapshot on every frame and places the card again
 * when any part changes.
 */
data class PlacementInputs(val width: Int, val height: Int, val insetTop: Int, val insetBottom: Int, val insetLeft: Int, val insetRight: Int, val cardHeight: Int)

fun needsReplace(last: PlacementInputs?, now: PlacementInputs): Boolean = last != now

/** Where the coachmark card goes: next to the target, never covering it, always inside the screen. Same rules as the web SDK. */
object CoachmarkPlacement {
    fun position(target: Box, cardW: Float, cardH: Float, viewW: Float, viewH: Float, narrow: Boolean, margin: Float, gap: Float, rtl: Boolean = false): Position {
        if (narrow) {
            val below = target.bottom + gap
            val above = target.top - cardH - gap
            if (below + cardH <= viewH - margin) return Position(margin, below, Placement.FLOATING)
            if (above >= margin) return Position(margin, above, Placement.FLOATING)
            // Neither side has room (a short window, for example with the keyboard open): cover as little of the target as possible.
            val atBottom = Position(margin, maxOf(margin, viewH - cardH - margin), Placement.FLOATING)
            val atTop = Position(margin, margin, Placement.FLOATING)
            fun covered(p: Position) = maxOf(0f, minOf(target.bottom, p.top + cardH) - maxOf(target.top, p.top))
            return if (covered(atTop) < covered(atBottom)) atTop else atBottom
        }
        val centeredLeft = target.left + (target.width - cardW) / 2
        val centeredTop = target.top + (target.height - cardH) / 2
        // Beside the control, on the reading-end side first: right in left-to-right layouts, left in right-to-left ones.
        val right = Position(target.right + gap, centeredTop, Placement.RIGHT)
        val left = Position(target.left - cardW - gap, centeredTop, Placement.LEFT)
        val candidates = listOf(
            Position(centeredLeft, target.bottom + gap, Placement.BELOW),
            Position(centeredLeft, target.top - cardH - gap, Placement.ABOVE),
        ) + if (rtl) listOf(left, right) else listOf(right, left)
        fun fits(p: Position) = p.left >= margin && p.top >= margin && p.left + cardW <= viewW - margin && p.top + cardH <= viewH - margin
        candidates.firstOrNull(::fits)?.let { return it }
        fun clamp(p: Position) = p.copy(
            left = p.left.coerceIn(margin, maxOf(margin, viewW - cardW - margin)),
            top = p.top.coerceIn(margin, maxOf(margin, viewH - cardH - margin)),
        )
        fun overlap(p: Position): Float {
            val w = maxOf(0f, minOf(target.right, p.left + cardW) - maxOf(target.left, p.left))
            val h = maxOf(0f, minOf(target.bottom, p.top + cardH) - maxOf(target.top, p.top))
            return w * h
        }
        return candidates.map(::clamp).minByOrNull(::overlap)!!
    }
}
