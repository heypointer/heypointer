package com.heypointer.android

import org.json.JSONObject

/**
 * The client id from `heypointer init` (`gfc_` + 24 hex). It is publishable, not a secret: the server
 * limits it by allowed origins and rate. Sent as `X-HeyPointer-Client` on walkthrough requests only.
 */
internal object ClientId {
    const val HEADER = "X-HeyPointer-Client"
    private val PATTERN = Regex("^gfc_[0-9a-f]{24}$")

    /** Which message to show, and its arguments. The text itself comes from the labels and string resources. */
    class Failure(val key: Str, val args: List<Any> = emptyList())

    /** A message when the id can never be accepted, so no request is made; null when it may be sent (blank ids are sent without the header). */
    fun localProblem(id: String): Str? = if (id.isBlank() || PATTERN.matches(id.trim())) null else Str.CLIENT_MALFORMED

    /** Plain message for a failed walkthrough response. Never shows the server's raw body. */
    fun failure(status: Int, body: String): Failure {
        val code = runCatching { JSONObject(body).optString("error") }.getOrDefault("")
        return when {
            status == 401 && code == "client_required" -> Failure(Str.CLIENT_REQUIRED)
            status == 401 && code == "client_invalid" -> Failure(Str.CLIENT_INVALID)
            status == 403 && code == "client_origin_not_allowed" -> Failure(Str.CLIENT_ORIGIN)
            status == 429 -> Failure(Str.RATE_LIMITED)
            else -> Failure(Str.SERVER_SAID, listOf(code.ifBlank { "HTTP $status" }))
        }
    }

    /** The same message in built-in English (logs, tests). */
    fun failureMessage(status: Int, body: String): String = failure(status, body).let { Fmt.english(it.key, it.args) }
}
