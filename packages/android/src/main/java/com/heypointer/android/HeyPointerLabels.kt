// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 HeyPointer
package com.heypointer.android

/**
 * Every user-visible string the guide shows, for runtime overrides (a CMS, remote config, a per-tenant brand).
 * A field left `null` falls back to the string resource of the same name, so a host app can also override or
 * translate through its own `strings.xml` (`heypointer_next`, `heypointer_show_me`, ... see `heypointer_strings.xml`
 * in this library) and `values-xx` folders. Precedence: this class > the host app's resource > the library default.
 *
 * A blank value is ignored. Strings with placeholders keep them (`%1$s`, `%2$d`); a value with a wrong placeholder
 * is ignored and the resource or default is used, so a bad remote string never crashes the guide.
 *
 *     HeyPointer.install(this, url, clientId, labels = HeyPointerLabels(next = "Continue", showMe = "Guide me!"))
 */
data class HeyPointerLabels(
    /** Default: "Guide me" */
    val launcher: String? = null,
    /** Default: "Guide me" */
    val goalTitle: String? = null,
    /** Default: "What do you want to do?" */
    val goalHint: String? = null,
    /** Default: "Your goal" */
    val goalDescription: String? = null,
    /** Default: "Show me" */
    val showMe: String? = null,
    /** Default: "Cancel" */
    val cancel: String? = null,
    /** Default: "Type what you want to do first." */
    val typeGoalFirst: String? = null,
    /** Default: "Next" */
    val next: String? = null,
    /** Default: "Back" */
    val back: String? = null,
    /** Default: "Skip" */
    val skip: String? = null,
    /** Default: "Finish" */
    val finish: String? = null,
    /** Default: "Try again" */
    val tryAgain: String? = null,
    /** Default: "OK" */
    val ok: String? = null,
    /** Default: "Close" */
    val close: String? = null,
    /** Default: "Done" */
    val doneTitle: String? = null,
    /** Default: "You finished: %1$s" */
    val doneBody: String? = null,
    /** Default: "Close guide" */
    val closeGuideDescription: String? = null,
    /** Default: "Next step" */
    val nextDescription: String? = null,
    /** Default: "Finish the guide" */
    val finishDescription: String? = null,
    /** Default: "Back to the previous step" */
    val backDescription: String? = null,
    /** Default: "Skip this step" */
    val skipDescription: String? = null,
    /** Default: "HeyPointer guide" */
    val cardTitle: String? = null,
    /** Default: "%1$d / %2$d" */
    val progress: String? = null,
    /** Default: "Step %1$d of %2$d" */
    val progressSpoken: String? = null,
    /** Default: "%1$s: %2$s" */
    val titleSpoken: String? = null,
    /** Default: "Source: %1$s:%2$d" */
    val source: String? = null,
    /** Default: "Did you mean:" */
    val didYouMean: String? = null,
    /** Default: "Did you mean: %1$s" */
    val didYouMeanDescription: String? = null,
    /** Default: "I understand and want to do this myself." */
    val gate: String? = null,
    /** Default: "Looking for the steps…" */
    val loading: String? = null,
    /** Default: "I could not get the steps" */
    val couldNotGetSteps: String? = null,
    /** Default: "Something went wrong." */
    val somethingWentWrong: String? = null,
    /** Default: "I can't guide that yet" */
    val cantGuideYet: String? = null,
    /** Default: "No steps found." */
    val noStepsFound: String? = null,
    /** Default: "I found %1$d matches for “%2$s” and won't guess." */
    val ambiguous: String? = null,
    /** Default: "I can't find “%1$s” on this screen right now." */
    val cantFind: String? = null,
    /** Default: "this control" */
    val thisControl: String? = null,
    /** Default: "Assist: do safe clicks for me when I press Next" */
    val assistToggle: String? = null,
    /** Default: "You need to do this one yourself." */
    val assistManualHint: String? = null,
    /** Default: "Clicked "%1$s" for you." */
    val assistClicked: String? = null,
    /** Default: "I couldn't tap “%1$s” for you. Tap it yourself, then press Next." */
    val assistCouldntTap: String? = null,
    /** Default: "HeyPointer needs a client ID. Run heypointer init and pass the id to HeyPointer.install." */
    val clientRequired: String? = null,
    /** Default: "The HeyPointer client ID looks wrong (it should start with hpc_). Check it against what heypointer init printed." */
    val clientMalformed: String? = null,
    /** Default: "HeyPointer does not recognise this client ID. Check that it matches the one heypointer init gave you." */
    val clientInvalid: String? = null,
    /** Default: "This app is not allowed to use this HeyPointer client ID. Ask the HeyPointer admin to check the client's allowed origins." */
    val clientOrigin: String? = null,
    /** Default: "HeyPointer is getting too many requests right now. Wait a moment and try again." */
    val rateLimited: String? = null,
    /** Default: "The HeyPointer server said: %1$s" */
    val serverSaid: String? = null,
    /** Default: "Cannot reach the HeyPointer server at %1$s." */
    val cannotReach: String? = null,
    /** Default: "The server sent a reply the guide cannot read." */
    val replyUnreadable: String? = null,
    /** Default: "The server said ok but sent no steps." */
    val replyNoSteps: String? = null,
    /** Default: "The server sent steps with insufficient evidence; refusing to show them." */
    val replyStepsRefused: String? = null,
    /** Default: "The server gave no reason for insufficient evidence." */
    val replyNoReason: String? = null,
    /** Default: "The server sent an unknown status." */
    val replyUnknownStatus: String? = null,
    /** Default: "Step %1$d has no %2$s." */
    val stepMissingField: String? = null,
    /** Default: "Step %1$d has an unknown action." */
    val stepUnknownAction: String? = null,
    /** Default: "Step %1$d has no evidence, so it will not be shown." */
    val stepNoEvidence: String? = null,
)

/** The override for one string, or null when this instance does not set it. */
internal fun HeyPointerLabels.valueFor(key: Str): String? = when (key) {
    Str.LAUNCHER -> launcher
    Str.GOAL_TITLE -> goalTitle
    Str.GOAL_HINT -> goalHint
    Str.GOAL_DESCRIPTION -> goalDescription
    Str.SHOW_ME -> showMe
    Str.CANCEL -> cancel
    Str.TYPE_GOAL_FIRST -> typeGoalFirst
    Str.NEXT -> next
    Str.BACK -> back
    Str.SKIP -> skip
    Str.FINISH -> finish
    Str.TRY_AGAIN -> tryAgain
    Str.OK -> ok
    Str.CLOSE -> close
    Str.DONE_TITLE -> doneTitle
    Str.DONE_BODY -> doneBody
    Str.CLOSE_GUIDE_DESC -> closeGuideDescription
    Str.NEXT_DESC -> nextDescription
    Str.FINISH_DESC -> finishDescription
    Str.BACK_DESC -> backDescription
    Str.SKIP_DESC -> skipDescription
    Str.CARD_PANE_TITLE -> cardTitle
    Str.PROGRESS -> progress
    Str.PROGRESS_SPOKEN -> progressSpoken
    Str.TITLE_SPOKEN -> titleSpoken
    Str.SOURCE -> source
    Str.DID_YOU_MEAN -> didYouMean
    Str.DID_YOU_MEAN_DESC -> didYouMeanDescription
    Str.GATE -> gate
    Str.LOADING -> loading
    Str.COULD_NOT_GET_STEPS -> couldNotGetSteps
    Str.SOMETHING_WENT_WRONG -> somethingWentWrong
    Str.CANT_GUIDE -> cantGuideYet
    Str.NO_STEPS_FOUND -> noStepsFound
    Str.AMBIGUOUS -> ambiguous
    Str.CANT_FIND -> cantFind
    Str.THIS_CONTROL -> thisControl
    Str.ASSIST_TOGGLE -> assistToggle
    Str.ASSIST_MANUAL_HINT -> assistManualHint
    Str.ASSIST_CLICKED -> assistClicked
    Str.ASSIST_COULDNT_TAP -> assistCouldntTap
    Str.CLIENT_REQUIRED -> clientRequired
    Str.CLIENT_MALFORMED -> clientMalformed
    Str.CLIENT_INVALID -> clientInvalid
    Str.CLIENT_ORIGIN -> clientOrigin
    Str.RATE_LIMITED -> rateLimited
    Str.SERVER_SAID -> serverSaid
    Str.CANNOT_REACH -> cannotReach
    Str.REPLY_UNREADABLE -> replyUnreadable
    Str.REPLY_NO_STEPS -> replyNoSteps
    Str.REPLY_STEPS_REFUSED -> replyStepsRefused
    Str.REPLY_NO_REASON -> replyNoReason
    Str.REPLY_UNKNOWN_STATUS -> replyUnknownStatus
    Str.STEP_MISSING_FIELD -> stepMissingField
    Str.STEP_UNKNOWN_ACTION -> stepUnknownAction
    Str.STEP_NO_EVIDENCE -> stepNoEvidence
}
