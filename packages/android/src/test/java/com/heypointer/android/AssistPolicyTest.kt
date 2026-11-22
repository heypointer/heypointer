package com.heypointer.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AssistPolicyTest {
    private val okTarget = TargetFacts(matches = 1, clickable = true, enabled = true, shown = true)
    private val ok = AssistInput(assistOn = true, action = "click", needsConfirmation = false, target = okTarget, userAlreadyActed = false)

    private fun reasonOf(i: AssistInput): ManualReason? = (AssistPolicy.decide(i) as? AssistDecision.Manual)?.reason

    @Test fun offByDefault() {
        assertFalse(AssistPolicy.DEFAULT_ON)
        assertEquals(ManualReason.ASSIST_OFF, reasonOf(ok.copy(assistOn = AssistPolicy.DEFAULT_ON)))
    }

    @Test fun allowsAPlainUnambiguousEnabledClick() {
        assertEquals(AssistDecision.Perform, AssistPolicy.decide(ok))
    }

    @Test fun neverActsWhenTheSwitchIsOff() {
        assertEquals(ManualReason.ASSIST_OFF, reasonOf(ok.copy(assistOn = false)))
    }

    @Test fun neverTypesOrChoosesOrNavigates() {
        for (a in listOf("type", "select", "navigate", "observe")) {
            assertEquals(a, ManualReason.NOT_A_CLICK, reasonOf(ok.copy(action = a)))
        }
    }

    @Test fun neverActsOnAConsequentialStep() {
        assertEquals(ManualReason.NEEDS_CONFIRMATION, reasonOf(ok.copy(needsConfirmation = true)))
    }

    @Test fun consequentialStepWinsOverEveryOtherAllowance() {
        // Even a perfect target and a user who has not acted: the user must press it themselves.
        assertEquals(ManualReason.NEEDS_CONFIRMATION, reasonOf(ok.copy(needsConfirmation = true, userAlreadyActed = false)))
    }

    @Test fun refusesWhenTheTargetIsMissing() {
        assertEquals(ManualReason.TARGET_MISSING, reasonOf(ok.copy(target = TargetFacts.NONE)))
    }

    @Test fun refusesWhenSeveralViewsMatch() {
        assertEquals(ManualReason.TARGET_AMBIGUOUS, reasonOf(ok.copy(target = okTarget.copy(matches = 2))))
        assertEquals(ManualReason.TARGET_AMBIGUOUS, reasonOf(ok.copy(target = okTarget.copy(matches = 7))))
    }

    @Test fun refusesTheGuidesOwnViews() {
        assertEquals(ManualReason.OWN_UI, reasonOf(ok.copy(target = okTarget.copy(ownUi = true))))
    }

    @Test fun refusesAViewThatIsNotShown() {
        assertEquals(ManualReason.NOT_SHOWN, reasonOf(ok.copy(target = okTarget.copy(shown = false))))
    }

    @Test fun refusesADisabledView() {
        assertEquals(ManualReason.NOT_ENABLED, reasonOf(ok.copy(target = okTarget.copy(enabled = false))))
    }

    @Test fun refusesAViewThatIsNotClickable() {
        assertEquals(ManualReason.NOT_CLICKABLE, reasonOf(ok.copy(target = okTarget.copy(clickable = false))))
    }

    @Test fun doesNotRepeatWhatTheUserAlreadyDid() {
        assertEquals(ManualReason.ALREADY_DONE, reasonOf(ok.copy(userAlreadyActed = true)))
    }

    @Test fun everyBlockingReasonIsReachable() {
        val seen = setOf(
            reasonOf(ok.copy(assistOn = false)), reasonOf(ok.copy(action = "type")), reasonOf(ok.copy(needsConfirmation = true)),
            reasonOf(ok.copy(target = TargetFacts.NONE)), reasonOf(ok.copy(target = okTarget.copy(matches = 2))),
            reasonOf(ok.copy(target = okTarget.copy(ownUi = true))), reasonOf(ok.copy(target = okTarget.copy(shown = false))),
            reasonOf(ok.copy(target = okTarget.copy(enabled = false))), reasonOf(ok.copy(target = okTarget.copy(clickable = false))),
            reasonOf(ok.copy(userAlreadyActed = true)),
        )
        assertEquals(ManualReason.values().toSet(), seen)
    }

    // ---- hint -----------------------------------------------------------------

    @Test fun hintOnlyForTypingAndChoosingWhileAssistIsOn() {
        assertTrue(AssistPolicy.needsManualHint(true, "type"))
        assertTrue(AssistPolicy.needsManualHint(true, "select"))
        assertFalse(AssistPolicy.needsManualHint(true, "click"))
        assertFalse(AssistPolicy.needsManualHint(false, "type"))
        assertEquals("You need to do this one yourself.", Str.ASSIST_MANUAL_HINT.default)
    }

    // ---- label escaping -------------------------------------------------------

    @Test fun announcementFollowsTheAgreedWording() {
        assertEquals("Clicked \"Search\" for you.", Fmt.english(Str.ASSIST_CLICKED, listOf(AssistPolicy.label("Search"))))
    }

    @Test fun quotesInALabelCannotBreakOutOfTheSentence() {
        assertEquals("Clicked \"say 'hi'\" for you.", Fmt.english(Str.ASSIST_CLICKED, listOf(AssistPolicy.label("say \"hi\""))))
        assertEquals("say 'hi'", AssistPolicy.label("say “hi”"))
    }

    @Test fun newlinesAndControlCharactersBecomeOneLine() {
        assertEquals("Save draft", AssistPolicy.label("  Save\n\tdraft\u0000  "))
    }

    @Test fun invisibleDirectionCharactersAreRemoved() {
        assertEquals("a b", AssistPolicy.label("a‮b"))
        assertEquals("a b", AssistPolicy.label("a​b"))
    }

    @Test fun longLabelsAreCut() {
        val l = AssistPolicy.label("x".repeat(500))
        assertEquals(60, l.length)
        assertTrue(l.endsWith("…"))
    }

    @Test fun emptyLabelFallsBack() {
        assertEquals("this control", AssistPolicy.label(null))
        assertEquals("this control", AssistPolicy.label("  \n "))
        assertEquals("Clicked \"this control\" for you.", Fmt.english(Str.ASSIST_CLICKED, listOf(AssistPolicy.label(""))))
        assertEquals("ce contrôle", AssistPolicy.label(null, "ce contrôle"))
    }

    @Test fun toggleLabelIsTheAgreedText() {
        assertEquals("Assist: do safe clicks for me when I press Next", Str.ASSIST_TOGGLE.default)
    }

    // ---- the real Step's own gate feeds the policy -------------------------------

    private fun step(action: String, text: String, flag: Boolean = false) = Step(
        id = "s", title = "Click \"$text\"", instruction = "Click \"$text\".", target = Target(emptyList(), null, text, null),
        action = action, value = null, requiresConfirmation = flag, evidence = emptyList(),
    )

    @Test fun aConsequentialLabelBlocksAssistEvenWithoutTheServerFlag() {
        val s = step("click", "Delete account")
        assertTrue(s.needsConfirmation())
        assertEquals(ManualReason.NEEDS_CONFIRMATION, reasonOf(ok.copy(needsConfirmation = s.needsConfirmation())))
    }

    @Test fun anOrdinaryStepIsNotConsequential() {
        val s = step("click", "Search")
        assertFalse(s.needsConfirmation())
        assertEquals(AssistDecision.Perform, AssistPolicy.decide(ok.copy(action = s.action, needsConfirmation = s.needsConfirmation())))
    }
}
