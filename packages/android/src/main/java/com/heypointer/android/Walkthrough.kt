package com.heypointer.android

import org.json.JSONArray
import org.json.JSONObject

/**
 * Raised for anything the guide cannot or will not show: bad server reply, no network, invalid evidence.
 * `message` is English for logs; the guide shows the same text through the labels and string resources (see `key`).
 */
class HeyPointerException internal constructor(message: String, internal val key: Str?, internal val args: List<Any>) : Exception(message) {
    constructor(message: String) : this(message, null, emptyList())
    internal constructor(key: Str, vararg args: Any) : this(Fmt.english(key, args.toList()), key, args.toList())
}

data class Evidence(val sourceType: String, val path: String, val lineStart: Int, val excerpt: String)

/**
 * How to find a view. `selectors` hold `#name` entries that match a view's resource id name
 * (`R.id.name`), so one flow works on the web (CSS id) and on Android. Otherwise `text` or
 * `label` is matched against a view's visible text or content description.
 */
data class Target(val selectors: List<String>, val role: String?, val text: String?, val label: String?) {
    val wanted: String? get() = text ?: label
}

data class Step(
    val id: String,
    val title: String,
    val instruction: String,
    val target: Target,
    val action: String,
    val value: String?,
    val requiresConfirmation: Boolean,
    val evidence: List<Evidence>,
) {
    /** Defense in depth, same as the web SDK: obviously consequential clicks stay gated even if the server omits the flag. */
    fun needsConfirmation(): Boolean =
        requiresConfirmation || (action == "click" && listOf(target.text, target.label, title, instruction).any { it != null && RISKY.containsMatchIn(it) })

    private companion object {
        val RISKY = Regex("\\b(send|submit|delete|remove|pay|purchase|buy|transfer|publish|revoke|deploy)\\b", RegexOption.IGNORE_CASE)
    }
}

/** A guide the server offers when it cannot cover the goal. Asking for `title` as the goal returns its steps. */
data class Suggestion(val workflowId: String, val title: String)

data class Walkthrough(
    val id: String,
    val goal: String,
    val status: String,
    val steps: List<Step>,
    val message: String?,
    val suggestions: List<Suggestion> = emptyList(),
) {
    val isOk: Boolean get() = status == "ok"
}

/** Parses and validates a server walkthrough. A step without evidence is never shown. */
object WalkthroughParser {
    private val ACTIONS = setOf("click", "type", "select", "navigate", "observe")

    /** Same limits as the contract and the web SDK: at most 5 suggestions, titles up to 200 characters. */
    const val MAX_SUGGESTIONS = 5
    const val MAX_SUGGESTION_TITLE = 200

    fun parse(json: String): Walkthrough {
        val o = try { JSONObject(json) } catch (e: Exception) { throw HeyPointerException(Str.REPLY_UNREADABLE) }
        val status = o.optString("status")
        val message = if (o.isNull("message")) null else o.optString("message").ifBlank { null }
        val stepsJson = o.optJSONArray("steps") ?: JSONArray()
        val steps = (0 until stepsJson.length()).map { parseStep(stepsJson.getJSONObject(it), it) }
        when (status) {
            "ok" -> if (steps.isEmpty()) throw HeyPointerException(Str.REPLY_NO_STEPS)
            "insufficient_evidence" -> {
                if (steps.isNotEmpty()) throw HeyPointerException(Str.REPLY_STEPS_REFUSED)
                if (message == null) throw HeyPointerException(Str.REPLY_NO_REASON)
            }
            else -> throw HeyPointerException(Str.REPLY_UNKNOWN_STATUS)
        }
        // Suggestions only make sense when the server could not cover the goal.
        val suggestions = if (status == "insufficient_evidence") parseSuggestions(o.optJSONArray("suggestions")) else emptyList()
        return Walkthrough(o.optString("id"), o.optString("goal"), status, steps, message, suggestions)
    }

    /** Titles are untrusted text: keep well-formed entries, trim, drop over-long titles and duplicates, cap the list. */
    private fun parseSuggestions(arr: JSONArray?): List<Suggestion> {
        if (arr == null) return emptyList()
        val out = ArrayList<Suggestion>()
        val seen = HashSet<String>()
        for (i in 0 until arr.length()) {
            val item = arr.optJSONObject(i) ?: continue
            val id = item.opt("workflowId") as? String ?: continue // optString would turn JSON null into "null"
            val title = (item.opt("title") as? String)?.trim() ?: continue
            if (id.isBlank() || title.isEmpty() || title.length > MAX_SUGGESTION_TITLE || !seen.add(title)) continue
            out += Suggestion(id, title)
            if (out.size == MAX_SUGGESTIONS) break
        }
        return out
    }

    private fun parseStep(s: JSONObject, index: Int): Step {
        fun req(k: String): String = s.optString(k).ifBlank { throw HeyPointerException(Str.STEP_MISSING_FIELD, index + 1, k) }
        val action = req("action")
        if (action !in ACTIONS) throw HeyPointerException(Str.STEP_UNKNOWN_ACTION, index + 1)
        val ev = s.optJSONArray("evidence") ?: JSONArray()
        if (ev.length() == 0) throw HeyPointerException(Str.STEP_NO_EVIDENCE, index + 1)
        val t = s.optJSONObject("target") ?: JSONObject()
        val sel = t.optJSONArray("selectors") ?: JSONArray()
        return Step(
            id = req("id"),
            title = req("title"),
            instruction = req("instruction"),
            target = Target(
                selectors = (0 until sel.length()).map { sel.getString(it) },
                role = t.optString("role").ifBlank { null },
                text = t.optString("text").ifBlank { null },
                label = t.optString("label").ifBlank { null },
            ),
            action = action,
            value = if (s.isNull("value")) null else s.optString("value").ifBlank { null },
            requiresConfirmation = s.optBoolean("requiresConfirmation", false),
            evidence = (0 until ev.length()).map {
                val e = ev.getJSONObject(it)
                Evidence(e.optString("sourceType"), e.optString("path"), e.optInt("lineStart"), e.optString("excerpt"))
            },
        )
    }
}
