// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 HeyPointer
package com.heypointer.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class WalkthroughParserTest {
    private fun step(extra: String = "", evidence: String = """[{"sourceType":"prd","path":"flows/x.md","lineStart":3,"lineEnd":3,"excerpt":"Click"}]""") =
        """{"id":"s1","title":"Click Save","instruction":"Click Save.","action":"click","target":{"selectors":["#save"],"text":"Save"},"requiresConfirmation":false,"evidence":$evidence $extra}"""

    private fun wt(status: String = "ok", steps: String = step(), message: String = ""): String {
        val msg = if (message.isEmpty()) "" else ",\"message\":\"$message\""
        return "{\"id\":\"w\",\"goal\":\"g\",\"status\":\"$status\",\"steps\":[$steps]$msg}"
    }

    @Test fun parsesAnOkWalkthrough() {
        val w = WalkthroughParser.parse(wt())
        assertTrue(w.isOk)
        assertEquals("Save", w.steps[0].target.wanted)
        assertEquals(listOf("#save"), w.steps[0].target.selectors)
        assertEquals("flows/x.md", w.steps[0].evidence[0].path)
    }

    @Test fun refusesAStepWithoutEvidence() {
        try { WalkthroughParser.parse(wt(steps = step(evidence = "[]"))); fail() } catch (e: HeyPointerException) { assertTrue(e.message!!.contains("no evidence")) }
    }

    @Test fun refusesInsufficientEvidenceThatCarriesSteps() {
        try { WalkthroughParser.parse(wt(status = "insufficient_evidence", message = "not covered")); fail() } catch (e: HeyPointerException) { assertTrue(e.message!!.contains("insufficient")) }
    }

    @Test fun acceptsInsufficientEvidenceWithAMessageAndNoSteps() {
        val w = WalkthroughParser.parse(wt(status = "insufficient_evidence", steps = "", message = "not covered"))
        assertFalse(w.isOk)
        assertEquals("not covered", w.message)
    }

    @Test fun refusesUnknownStatusActionAndGarbage() {
        listOf(wt(status = "maybe"), wt(steps = step().replace("\"click\"", "\"teleport\"")), "<html>").forEach {
            try { WalkthroughParser.parse(it); fail("should refuse: $it") } catch (_: HeyPointerException) { }
        }
    }

    @Test fun gatesConsequentialClicksEvenWhenTheServerDoesNot() {
        val risky = WalkthroughParser.parse(wt(steps = step().replace("Click Save", "Delete account").replace("\"text\":\"Save\"", "\"text\":\"Delete account\"")))
        assertTrue(risky.steps[0].needsConfirmation())
        assertFalse(WalkthroughParser.parse(wt()).steps[0].needsConfirmation())
        assertTrue(WalkthroughParser.parse(wt(steps = step().replace("\"requiresConfirmation\":false", "\"requiresConfirmation\":true"))).steps[0].needsConfirmation())
    }

    private fun miss(suggestions: String) =
        "{\"id\":\"w\",\"goal\":\"g\",\"status\":\"insufficient_evidence\",\"steps\":[],\"message\":\"not covered\",\"suggestions\":$suggestions}"

    @Test fun keepsWellFormedSuggestionsOnInsufficientEvidence() {
        val w = WalkthroughParser.parse(miss("""[{"workflowId":"a","title":"  Add a song to favourites "},{"workflowId":"b","title":"Shuffle"}]"""))
        assertEquals(listOf(Suggestion("a", "Add a song to favourites"), Suggestion("b", "Shuffle")), w.suggestions)
    }

    @Test fun dropsMalformedOverlongAndDuplicateSuggestionsAndCapsAtFive() {
        val many = (0 until 8).joinToString(",") { """{"workflowId":"w$it","title":"Guide $it"}""" }
        val long = "x".repeat(WalkthroughParser.MAX_SUGGESTION_TITLE + 1)
        val w = WalkthroughParser.parse(miss("""[null,"x",{"workflowId":"a"},{"workflowId":"","title":"No id"},{"workflowId":"b","title":"$long"},
            {"workflowId":"c","title":"   "},{"workflowId":"n","title":null},{"workflowId":"d","title":"Same"},{"workflowId":"e","title":"Same"},$many]"""))
        assertEquals(WalkthroughParser.MAX_SUGGESTIONS, w.suggestions.size)
        assertEquals(Suggestion("d", "Same"), w.suggestions[0])
        assertTrue(w.suggestions.none { it.title == long || it.title == "null" })
    }

    @Test fun nonArraySuggestionsMeanNoSuggestions() {
        assertTrue(WalkthroughParser.parse(miss("\"nope\"")).suggestions.isEmpty())
        assertTrue(WalkthroughParser.parse(miss("[]")).suggestions.isEmpty())
    }

    @Test fun ignoresSuggestionsOnAnOkWalkthrough() {
        val ok = wt().replace("\"steps\"", "\"suggestions\":[{\"workflowId\":\"a\",\"title\":\"T\"}],\"steps\"")
        assertTrue(WalkthroughParser.parse(ok).suggestions.isEmpty())
    }
}
