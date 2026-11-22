package com.heypointer.android

import android.graphics.Rect
import android.view.View
import android.view.ViewGroup
import android.widget.TextView

internal sealed class Resolution {
    class Found(val view: View) : Resolution()
    object Missing : Resolution()
    class Ambiguous(val count: Int) : Resolution()
}

/**
 * Finds the real on-screen view a step points at. Resolution order, like the web SDK: ids
 * (`#name` selectors against `R.id.name`), then visible text or content description.
 * Several matches are reported, never guessed. Views that are off screen (a closed drawer) do not count.
 */
internal object TargetResolver {
    fun resolve(root: View, target: Target, ignore: View?): Resolution {
        val ids = target.selectors.filter { it.startsWith("#") }.map { it.substring(1) }.toSet()
        val wanted = target.wanted?.trim()?.lowercase()
        val byId = LinkedHashSet<View>()
        val byText = LinkedHashSet<View>()

        fun visit(v: View) {
            if (v === ignore || v.visibility != View.VISIBLE) return
            if (isOnScreen(v)) {
                if (ids.isNotEmpty() && idName(v) in ids) byId += liftToClickable(v)
                if (wanted != null && labels(v).any { it.trim().lowercase() == wanted }) byText += liftToClickable(v)
            }
            if (v is ViewGroup) for (i in 0 until v.childCount) visit(v.getChildAt(i))
        }
        visit(root)

        val matches = if (byId.isNotEmpty()) byId else byText
        // The target is the control the user acts on: a label next to a switch is not a second match.
        val hits = matches.filter { it.isClickable }.ifEmpty { matches.toList() }
        return when (hits.size) {
            0 -> Resolution.Missing
            1 -> Resolution.Found(hits.first())
            else -> Resolution.Ambiguous(hits.size)
        }
    }

    private fun idName(v: View): String? =
        if (v.id == View.NO_ID) null else runCatching { v.resources.getResourceEntryName(v.id) }.getOrNull()

    private fun labels(v: View): List<String> =
        listOfNotNull((v as? TextView)?.text?.toString(), v.contentDescription?.toString()).filter { it.isNotBlank() }

    /** A text view inside a clickable row is not the control: the row is. Highlight what the user will actually tap. */
    private fun liftToClickable(v: View): View {
        var cur = v
        var depth = 0
        while (!cur.isClickable && depth < 3) {
            cur = cur.parent as? View ?: return v
            depth++
        }
        return if (cur.isClickable) cur else v
    }

    /** Mostly inside the window: a drawer parked off screen, or a row scrolled away, is not there. */
    private fun isOnScreen(v: View): Boolean {
        if (v.width <= 0 || v.height <= 0 || !v.isShown) return false
        val r = Rect()
        if (!v.getGlobalVisibleRect(r)) return false
        return r.width().toLong() * r.height() >= v.width.toLong() * v.height / 2
    }
}
