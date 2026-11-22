// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 HeyPointer
package com.heypointer.android

import java.io.File
import java.util.Locale
import javax.xml.parsers.DocumentBuilderFactory
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.w3c.dom.Element

class StringsTest {
    private fun resolver(override: Map<Str, String> = emptyMap(), resource: Map<Str, String> = emptyMap()) =
        TextResolver({ override[it] }, { k, a -> resource[k]?.let { t -> if (k.argCount == 0) t else Fmt.format(t, a) } })

    // ---- precedence ----------------------------------------------------------------

    @Test fun libraryDefaultWhenNothingElseIsSet() {
        assertEquals("Next", resolver().text(Str.NEXT))
        assertEquals("Step 2 of 5", resolver().text(Str.PROGRESS_SPOKEN, 2, 5))
    }

    @Test fun hostResourceBeatsTheDefault() {
        assertEquals("Weiter", resolver(resource = mapOf(Str.NEXT to "Weiter")).text(Str.NEXT))
        assertEquals("Schritt 2 von 5", resolver(resource = mapOf(Str.PROGRESS_SPOKEN to "Schritt %1\$d von %2\$d")).text(Str.PROGRESS_SPOKEN, 2, 5))
    }

    @Test fun explicitLabelBeatsTheHostResource() {
        val r = resolver(override = mapOf(Str.NEXT to "Continue"), resource = mapOf(Str.NEXT to "Weiter"))
        assertEquals("Continue", r.text(Str.NEXT))
    }

    @Test fun precedenceIsPerKey() {
        val r = resolver(override = mapOf(Str.NEXT to "Continue"), resource = mapOf(Str.BACK to "Zurück"))
        assertEquals("Continue", r.text(Str.NEXT))
        assertEquals("Zurück", r.text(Str.BACK))
        assertEquals("Skip", r.text(Str.SKIP))
    }

    @Test fun blankOverridesAndResourcesAreIgnored() {
        assertEquals("Next", resolver(override = mapOf(Str.NEXT to "  ")).text(Str.NEXT))
        assertEquals("Next", resolver(resource = mapOf(Str.NEXT to "")).text(Str.NEXT))
    }

    // ---- formatting inputs ------------------------------------------------------------

    @Test fun placeholdersAreFilledInTheOverride() {
        val r = resolver(override = mapOf(Str.ASSIST_CLICKED to "Tapped %1\$s for you"))
        assertEquals("Tapped Search for you", r.text(Str.ASSIST_CLICKED, "Search"))
    }

    @Test fun argumentsMayBeUsedInAnyOrder() {
        val r = resolver(override = mapOf(Str.PROGRESS to "%2\$d von %1\$d"))
        assertEquals("5 von 2", r.text(Str.PROGRESS, 2, 5))
    }

    @Test fun anOverrideWithTheWrongPlaceholdersFallsBackInsteadOfThrowing() {
        val bad = mapOf(Str.ASSIST_CLICKED to "Tapped %1\$s and %2\$s", Str.PROGRESS to "%1\$d / %2\$s / %3\$d", Str.CANT_FIND to "100% sure %q")
        val r = resolver(override = bad, resource = mapOf(Str.ASSIST_CLICKED to "Resource %1\$s"))
        assertEquals("Resource Search", r.text(Str.ASSIST_CLICKED, "Search"))
        assertEquals("1 / 3", r.text(Str.PROGRESS, 1, 3))
        assertEquals("I can't find “x” on this screen right now.", r.text(Str.CANT_FIND, "x"))
    }

    @Test fun aStringWithoutPlaceholdersIsUsedAsWrittenEvenWithAPercentSign() {
        assertEquals("100% free", resolver(override = mapOf(Str.NEXT to "100% free")).text(Str.NEXT))
        assertEquals("50% of 100%", resolver(resource = mapOf(Str.SKIP to "50% of 100%")).text(Str.SKIP))
    }

    @Test fun untrustedServerTextIsInsertedAsTextNotAsATemplate() {
        // A control name that looks like a format spec must come out unchanged.
        assertEquals("I can't find “%1\$s %n” on this screen right now.", resolver().text(Str.CANT_FIND, "%1\$s %n"))
    }

    @Test fun wrongArgumentCountFallsBackToEnglishWithoutThrowing() {
        assertEquals("You finished: %1\$s", resolver().text(Str.DONE_BODY))
    }

    @Test fun pluralPicksOneOnlyForCountOne() {
        assertEquals("I found 1 match for “Save” and won't guess.", Fmt.english(Str.AMBIGUOUS, listOf(1, "Save")))
        assertEquals("I found 2 matches for “Save” and won't guess.", Fmt.english(Str.AMBIGUOUS, listOf(2, "Save")))
        assertEquals("I found 0 matches for “Save” and won't guess.", Fmt.english(Str.AMBIGUOUS, listOf(0, "Save")))
    }

    @Test fun numbersUseTheDeviceLocale() {
        val saved = Locale.getDefault()
        try {
            Locale.setDefault(Locale.forLanguageTag("ar-EG"))
            val shown = Fmt.format("%1\$d / %2\$d", listOf(2, 5))!!
            assertFalse("expected locale digits, got $shown", shown == "2 / 5")
        } finally { Locale.setDefault(saved) }
    }

    @Test fun exceptionMessagesStayEnglishForLogsAndCarryTheirKey() {
        val e = HeyPointerException(Str.STEP_MISSING_FIELD, 3, "title")
        assertEquals("Step 3 has no title.", e.message)
        assertEquals(Str.STEP_MISSING_FIELD, e.key)
        assertEquals(listOf<Any>(3, "title"), e.args)
        assertEquals(null, HeyPointerException("plain").key)
    }

    // ---- the string resource file matches the keys -------------------------------------

    private fun resFile(name: String) = File("src/main/res/$name")

    private fun unescape(s: String) = s.replace("\\'", "'").replace("\\\"", "\"").replace("\\\\", "\\")

    private fun parse(file: File): org.w3c.dom.Document {
        assertTrue("missing ${file.path} (tests run from the module directory)", file.exists())
        return DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(file)
    }

    private fun strings(): Pair<Map<String, String>, Map<String, Map<String, String>>> {
        val doc = parse(resFile("values/heypointer_strings.xml"))
        val plain = HashMap<String, String>()
        val plurals = HashMap<String, Map<String, String>>()
        val root = doc.documentElement.childNodes
        for (i in 0 until root.length) {
            val n = root.item(i) as? Element ?: continue
            when (n.tagName) {
                "string" -> plain[n.getAttribute("name")] = unescape(n.textContent)
                "plurals" -> {
                    val items = HashMap<String, String>()
                    val kids = n.getElementsByTagName("item")
                    for (j in 0 until kids.length) { val k = kids.item(j) as Element; items[k.getAttribute("quantity")] = unescape(k.textContent) }
                    plurals[n.getAttribute("name")] = items
                }
            }
        }
        return plain to plurals
    }

    @Test fun everyKeyHasAResourceWithTheSameEnglishText() {
        val (plain, plurals) = strings()
        for (k in Str.values()) {
            if (k.plural) {
                val items = plurals[k.res]
                assertNotNull("no <plurals name=\"${k.res}\">", items)
                assertEquals(k.res, k.default, items!!["other"])
                assertEquals(k.res, k.one, items["one"])
            } else {
                assertEquals(k.res, k.default, plain[k.res])
            }
        }
    }

    @Test fun theResourceFileHasNoStringsWithoutAKey() {
        val (plain, plurals) = strings()
        val known = Str.values().map { it.res }.toSet()
        assertEquals(emptySet<String>(), (plain.keys + plurals.keys) - known)
    }

    @Test fun placeholderCountsMatchWhatTheCodePasses() {
        val spec = Regex("%(\\d)\\$[sd]")
        for (k in Str.values()) {
            val used = spec.findAll(k.default).map { it.groupValues[1] }.toSet()
            assertEquals("${k.name} placeholders", k.argCount, used.size)
            assertEquals(k.name, (1..k.argCount).map { it.toString() }.toSet(), used)
            k.one?.let { one -> assertEquals("${k.name} (one)", used, spec.findAll(one).map { it.groupValues[1] }.toSet()) }
        }
    }

    @Test fun resourceNamesFollowTheConvention() {
        for (k in Str.values()) assertEquals(k.name, "heypointer_" + k.name.lowercase(), k.res)
        assertEquals(Str.values().size, Str.values().map { it.res }.toSet().size)
    }

    @Test fun everyKeyMapsToAnExistingRId() {
        val strings = runCatching { Class.forName("com.heypointer.android.R\$string") }.getOrNull()
        val plurals = runCatching { Class.forName("com.heypointer.android.R\$plurals") }.getOrNull()
        assumeTrue("the generated R class is not on the unit-test classpath", strings != null && plurals != null)
        for (k in Str.values()) {
            val holder = if (k.plural) plurals!! else strings!!
            assertNotNull("R.${holder.simpleName}.${k.res}", runCatching { holder.getField(k.res) }.getOrNull())
        }
    }

    // ---- HeyPointerLabels covers every key ------------------------------------------------

    @Test fun everyKeyHasItsOwnLabelField() {
        val n = Str.values().size
        val ctor = HeyPointerLabels::class.java.constructors.single { c -> c.parameterTypes.size == n && c.parameterTypes.all { it == String::class.java } }
        val labels = ctor.newInstance(*Array<Any?>(n) { "v$it" }) as HeyPointerLabels
        val seen = Str.values().map { labels.valueFor(it) }
        assertTrue(seen.all { it != null })
        assertEquals("two keys read the same field", n, seen.toSet().size)
    }

    @Test fun anEmptyLabelsObjectOverridesNothing() {
        assertTrue(Str.values().all { HeyPointerLabels().valueFor(it) == null })
    }

    @Test fun aSingleLabelOverridesOnlyItsKey() {
        val l = HeyPointerLabels(next = "Continue")
        assertEquals("Continue", l.valueFor(Str.NEXT))
        assertEquals(null, l.valueFor(Str.BACK))
        assertEquals("Continue", resolver(override = mapOf(Str.NEXT to l.valueFor(Str.NEXT)!!)).text(Str.NEXT))
    }
}
