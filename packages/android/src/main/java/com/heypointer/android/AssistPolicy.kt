// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 HeyPointer
package com.heypointer.android

/** What the policy knows about the view a step resolved to. No Android types, so it is unit-testable on the JVM. */
internal data class TargetFacts(
    val matches: Int,
    val clickable: Boolean = false,
    val enabled: Boolean = false,
    val shown: Boolean = false,
    /** The view is part of the guide itself (card, overlay, "Guide me" button). */
    val ownUi: Boolean = false,
) {
    companion object {
        val NONE = TargetFacts(matches = 0)
    }
}

internal data class AssistInput(
    val assistOn: Boolean,
    val action: String,
    /** `Step.needsConfirmation()`: the server flag or a consequential label. Ticking the gate does not lift it. */
    val needsConfirmation: Boolean,
    val target: TargetFacts,
    /** The user already tapped the control (or its state changed) since the step was shown. */
    val userAlreadyActed: Boolean,
)

internal enum class ManualReason {
    ASSIST_OFF, NOT_A_CLICK, NEEDS_CONFIRMATION, TARGET_MISSING, TARGET_AMBIGUOUS, OWN_UI, NOT_SHOWN, NOT_ENABLED, NOT_CLICKABLE, ALREADY_DONE,
}

internal sealed class AssistDecision {
    object Perform : AssistDecision()
    /** Do nothing for the user: Next moves on exactly as it does with assist off. */
    data class Manual(val reason: ManualReason) : AssistDecision()
}

/**
 * Assist mode: with the toggle on, pressing Next may tap the step's control for the user. Off by default,
 * and even when on it taps only a plain, unambiguous, enabled click. It never types, never picks a value,
 * and never touches a consequential step. Every other case behaves as without assist.
 */
internal object AssistPolicy {
    const val DEFAULT_ON = false
    private const val MAX_LABEL = 60

    fun decide(i: AssistInput): AssistDecision {
        val t = i.target
        val reason = when {
            !i.assistOn -> ManualReason.ASSIST_OFF
            i.action != "click" -> ManualReason.NOT_A_CLICK
            i.needsConfirmation -> ManualReason.NEEDS_CONFIRMATION
            t.matches == 0 -> ManualReason.TARGET_MISSING
            t.matches > 1 -> ManualReason.TARGET_AMBIGUOUS
            t.ownUi -> ManualReason.OWN_UI
            !t.shown -> ManualReason.NOT_SHOWN
            !t.enabled -> ManualReason.NOT_ENABLED
            !t.clickable -> ManualReason.NOT_CLICKABLE
            i.userAlreadyActed -> ManualReason.ALREADY_DONE
            else -> return AssistDecision.Perform
        }
        return AssistDecision.Manual(reason)
    }

    /** Show the "you need to do this one yourself" line: assist is on and the step is one the guide will never do (typing, choosing). */
    fun needsManualHint(assistOn: Boolean, action: String): Boolean = assistOn && (action == "type" || action == "select")

    /** The control's name for "Clicked ... for you.". Untrusted server text: one line, no quotes or invisible controls, capped. `fallback` is the localized "this control". */
    fun label(raw: String?, fallback: String = Str.THIS_CONTROL.default): String {
        val cleaned = buildString {
            for (ch in raw.orEmpty()) {
                val c = ch.code
                when {
                    ch.isISOControl() || c in 0x200B..0x200F || c in 0x202A..0x202E || c in 0x2066..0x2069 || c == 0x061C || c == 0xFEFF -> append(' ')
                    ch == '"' || ch == '“' || ch == '”' -> append('\'')
                    else -> append(ch)
                }
            }
        }.replace(Regex("\\s+"), " ").trim()
        return when {
            cleaned.isEmpty() -> fallback
            cleaned.length > MAX_LABEL -> cleaned.take(MAX_LABEL - 1).trimEnd() + "…"
            else -> cleaned
        }
    }
}
