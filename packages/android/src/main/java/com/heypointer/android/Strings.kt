// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 HeyPointer
package com.heypointer.android

import java.util.IllegalFormatException
import java.util.Locale

/**
 * Every user-visible string key. `res` is the string resource name a host app overrides, `default` the English text
 * (identical to `res/values/heypointer_strings.xml`; a unit test keeps the two in step), `argCount` how many
 * placeholders it takes. A key with `one` is a plural: the first argument is the count.
 */
internal enum class Str(val res: String, val default: String, val argCount: Int = 0, val one: String? = null) {
    LAUNCHER("heypointer_launcher", "Guide me"),
    GOAL_TITLE("heypointer_goal_title", "Guide me"),
    GOAL_HINT("heypointer_goal_hint", "What do you want to do?"),
    GOAL_DESCRIPTION("heypointer_goal_description", "Your goal"),
    SHOW_ME("heypointer_show_me", "Show me"),
    CANCEL("heypointer_cancel", "Cancel"),
    TYPE_GOAL_FIRST("heypointer_type_goal_first", "Type what you want to do first."),
    NEXT("heypointer_next", "Next"),
    BACK("heypointer_back", "Back"),
    SKIP("heypointer_skip", "Skip"),
    FINISH("heypointer_finish", "Finish"),
    TRY_AGAIN("heypointer_try_again", "Try again"),
    OK("heypointer_ok", "OK"),
    CLOSE("heypointer_close", "Close"),
    DONE_TITLE("heypointer_done_title", "Done"),
    DONE_BODY("heypointer_done_body", "You finished: %1\$s", argCount = 1),
    CLOSE_GUIDE_DESC("heypointer_close_guide_desc", "Close guide"),
    NEXT_DESC("heypointer_next_desc", "Next step"),
    FINISH_DESC("heypointer_finish_desc", "Finish the guide"),
    BACK_DESC("heypointer_back_desc", "Back to the previous step"),
    SKIP_DESC("heypointer_skip_desc", "Skip this step"),
    CARD_PANE_TITLE("heypointer_card_pane_title", "HeyPointer guide"),
    PROGRESS("heypointer_progress", "%1\$d / %2\$d", argCount = 2),
    PROGRESS_SPOKEN("heypointer_progress_spoken", "Step %1\$d of %2\$d", argCount = 2),
    TITLE_SPOKEN("heypointer_title_spoken", "%1\$s: %2\$s", argCount = 2),
    SOURCE("heypointer_source", "Source: %1\$s:%2\$d", argCount = 2),
    DID_YOU_MEAN("heypointer_did_you_mean", "Did you mean:"),
    DID_YOU_MEAN_DESC("heypointer_did_you_mean_desc", "Did you mean: %1\$s", argCount = 1),
    GATE("heypointer_gate", "I understand and want to do this myself."),
    LOADING("heypointer_loading", "Looking for the steps…"),
    COULD_NOT_GET_STEPS("heypointer_could_not_get_steps", "I could not get the steps"),
    SOMETHING_WENT_WRONG("heypointer_something_went_wrong", "Something went wrong."),
    CANT_GUIDE("heypointer_cant_guide", "I can't guide that yet"),
    NO_STEPS_FOUND("heypointer_no_steps_found", "No steps found."),
    AMBIGUOUS("heypointer_ambiguous", "I found %1\$d matches for “%2\$s” and won't guess.", argCount = 2, one = "I found %1\$d match for “%2\$s” and won't guess."),
    CANT_FIND("heypointer_cant_find", "I can't find “%1\$s” on this screen right now.", argCount = 1),
    THIS_CONTROL("heypointer_this_control", "this control"),
    ASSIST_TOGGLE("heypointer_assist_toggle", "Assist: do safe clicks for me when I press Next"),
    ASSIST_MANUAL_HINT("heypointer_assist_manual_hint", "You need to do this one yourself."),
    ASSIST_CLICKED("heypointer_assist_clicked", "Clicked \"%1\$s\" for you.", argCount = 1),
    ASSIST_COULDNT_TAP("heypointer_assist_couldnt_tap", "I couldn't tap “%1\$s” for you. Tap it yourself, then press Next.", argCount = 1),
    CLIENT_REQUIRED("heypointer_client_required", "HeyPointer needs a client ID. Run heypointer init and pass the id to HeyPointer.install."),
    CLIENT_MALFORMED("heypointer_client_malformed", "The HeyPointer client ID looks wrong (it should start with hpc_). Check it against what heypointer init printed."),
    CLIENT_INVALID("heypointer_client_invalid", "HeyPointer does not recognise this client ID. Check that it matches the one heypointer init gave you."),
    CLIENT_ORIGIN("heypointer_client_origin", "This app is not allowed to use this HeyPointer client ID. Ask the HeyPointer admin to check the client's allowed origins."),
    RATE_LIMITED("heypointer_rate_limited", "HeyPointer is getting too many requests right now. Wait a moment and try again."),
    SERVER_SAID("heypointer_server_said", "The HeyPointer server said: %1\$s", argCount = 1),
    CANNOT_REACH("heypointer_cannot_reach", "Cannot reach the HeyPointer server at %1\$s.", argCount = 1),
    REPLY_UNREADABLE("heypointer_reply_unreadable", "The server sent a reply the guide cannot read."),
    REPLY_NO_STEPS("heypointer_reply_no_steps", "The server said ok but sent no steps."),
    REPLY_STEPS_REFUSED("heypointer_reply_steps_refused", "The server sent steps with insufficient evidence; refusing to show them."),
    REPLY_NO_REASON("heypointer_reply_no_reason", "The server gave no reason for insufficient evidence."),
    REPLY_UNKNOWN_STATUS("heypointer_reply_unknown_status", "The server sent an unknown status."),
    STEP_MISSING_FIELD("heypointer_step_missing_field", "Step %1\$d has no %2\$s.", argCount = 2),
    STEP_UNKNOWN_ACTION("heypointer_step_unknown_action", "Step %1\$d has an unknown action.", argCount = 1),
    STEP_NO_EVIDENCE("heypointer_step_no_evidence", "Step %1\$d has no evidence, so it will not be shown.", argCount = 1);

    val plural: Boolean get() = one != null
}

internal object Fmt {
    /** Formats with the user's locale. Null when the template does not match the arguments (a bad remote or host string). */
    fun format(template: String, args: List<Any>): String? =
        try { String.format(Locale.getDefault(), template, *args.toTypedArray()) } catch (e: IllegalFormatException) { null }

    /** The built-in English text for a key. Used as the last fallback, by the parser's exception messages, and by tests. */
    fun english(key: Str, args: List<Any> = emptyList()): String {
        val template = if (key.one != null && (args.firstOrNull() as? Number)?.toLong() == 1L) key.one else key.default
        return if (key.argCount == 0) template else format(template, args) ?: template
    }
}

/**
 * Chooses the text for a key: an explicit override (from [HeyPointerLabels]) first, then the Android string resource
 * (the host app's own, or the library's default), then the built-in English. Each step is skipped when it is missing,
 * blank or does not fit the arguments, so a bad string never throws.
 */
internal class TextResolver(
    private val override: (Str) -> String?,
    private val resource: (Str, List<Any>) -> String?,
) {
    fun text(key: Str, vararg args: Any): String = text(key, args.toList())

    fun text(key: Str, args: List<Any>): String {
        override(key)?.takeIf { it.isNotBlank() }?.let { o ->
            // A string without placeholders is used as written, so a literal "%" in a label is safe.
            val shown = if (key.argCount == 0) o else Fmt.format(o, args)
            if (shown != null) return shown
        }
        resource(key, args)?.takeIf { it.isNotBlank() }?.let { return it }
        return Fmt.english(key, args)
    }
}
