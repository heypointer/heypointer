package com.heypointer.android

import android.app.Activity
import android.app.AlertDialog
import android.app.Application
import android.content.Context
import android.content.pm.ApplicationInfo
import android.graphics.Color
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import android.util.TypedValue
import android.text.InputType
import android.view.Gravity
import android.view.InputEvent
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.ViewGroup
import android.view.inputmethod.EditorInfo
import android.widget.Checkable
import android.widget.CheckBox
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import android.content.res.ColorStateList
import kotlin.math.hypot

/**
 * HeyPointer for Android: asks a HeyPointer server how to do something and walks the user through
 * the real screen, one control at a time. It highlights; it never taps, types or submits for the user,
 * unless the user switches on "Assist" (off by default): then Next may tap a plain, safe control for them.
 *
 *     HeyPointer.install(this, "https://your-heypointer-server", "gfc_...")
 *
 * Add it once per activity that hosts the screens you want guided. It adds a "Guide me" button and the overlay.
 *
 * Rotation and other configuration changes recreate the activity. A guide in progress is kept (step, confirmed
 * gates, goal) and picked up again by the next `install` for the same activity class, then the target is found
 * again on the new layout. Back closes the guide card first; the next Back reaches the app.
 */
class HeyPointer private constructor(
    private val activity: Activity, baseUrl: String, clientId: String, private val bottomMarginDp: Int, headers: (() -> Map<String, String>)?,
    private val assistDefault: Boolean, private val onAssist: ((stepIndex: Int, label: String) -> Unit)?,
    labels: HeyPointerLabels?, customTheme: HeyPointerTheme?, private val showLauncher: Boolean, private val launcherSide: LauncherSide,
) : CardListener {
    private val client = HeyPointerClient(baseUrl, clientId, headers)
    private val texts = Texts(activity, labels)
    private val theme = ThemeValues.merge(ThemeResources.load(activity), customTheme)
    private val face: Typeface? = customTheme?.typeface
    private val main = Handler(Looper.getMainLooper())
    private val key = activity.javaClass.name
    private val decor: ViewGroup = activity.window.decorView as ViewGroup
    private val overlay = GuideOverlay(activity, this, texts, theme, face)
    private var launcher: TextView? = null
    private var dialog: AlertDialog? = null

    private var walkthrough: Walkthrough? = null
    private var index = 0
    private val confirmed = HashSet<String>()
    private var current: View? = null
    private var attempts = 0
    private var finished = false
    private var gen = 0 // bumps on every render so a late poll for an old step is ignored
    private var destroyed = false
    private var lastBox: RectF? = null
    private var loadingGoal: String? = null
    private var message: MessageState? = null

    // Assist mode. One switch per instance, session only; the initial value comes from `install(assist = ...)`.
    private var assistOn = assistDefault
    private var pendingNotice: String? = null // "Clicked “X” for you." stays on the card for the step that follows
    private var shownNotice: String? = null
    private var shownRetry = false
    // Has the user already acted on the highlighted control? Taps and keys are watched on their way to the app
    // (nothing is replaced or consumed), and a baseline of the control's visible state is compared at Next.
    private var acted = false
    private var baseline: String? = null
    private var downX = 0f
    private var downY = 0f
    private var downOnTarget = false
    private val touchSlop = ViewConfiguration.get(activity).scaledTouchSlop

    private val back = BackInterceptor(activity, { overlay.visibility == View.VISIBLE }, { close() }, ::observe)
    private val lifecycle = object : Application.ActivityLifecycleCallbacks {
        override fun onActivityDestroyed(a: Activity) { if (a === activity) destroy() }
        override fun onActivityCreated(a: Activity, s: Bundle?) {}
        override fun onActivityStarted(a: Activity) {}
        override fun onActivityResumed(a: Activity) {}
        override fun onActivityPaused(a: Activity) {}
        override fun onActivityStopped(a: Activity) {}
        override fun onActivitySaveInstanceState(a: Activity, s: Bundle) {}
    }

    private val ticker = object : Runnable {
        override fun run() {
            follow()
            main.postDelayed(this, 120)
        }
    }

    init {
        decor.addView(overlay, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        overlay.visibility = View.GONE
        if (showLauncher) {
            val button = TextView(activity).apply {
                text = texts.get(Str.LAUNCHER); setTextColor(theme.onAccent); setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f * theme.textScale); gravity = Gravity.CENTER
                typeface = Typeface.create(face ?: Typeface.DEFAULT, Typeface.NORMAL)
                contentDescription = texts.get(Str.LAUNCHER); isClickable = true; announceAsButton()
                val h = activity.dp(16f).toInt(); val v = activity.dp(10f).toInt(); setPadding(h, v, h, v)
                background = GradientDrawable().apply { setColor(theme.accent); cornerRadius = activity.dp(24f) }
                elevation = activity.dp(6f)
                setOnClickListener { askForGoal() }
            }
            launcher = button
            val side = if (launcherSide == LauncherSide.START) Gravity.START else Gravity.END
            decor.addView(button, FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM or side).apply {
                marginStart = activity.dp(16f).toInt(); marginEnd = activity.dp(16f).toInt(); bottomMargin = activity.dp(bottomMarginDp.toFloat()).toInt()
            })
        }
        if (activity.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0) Contrast.problems(theme).forEach { Log.w("HeyPointer", it) }
        activity.application.registerActivityLifecycleCallbacks(lifecycle)
        back.install()
        retained.remove(key)?.let { if (SystemClock.elapsedRealtime() - it.savedAt < RESTORE_WINDOW_MS) restore(it) }
    }

    /** What survives a configuration change: plain data only, never a view or the activity. */
    private class MessageState(val title: String, val body: String, val goal: String?, val suggestions: List<String>)
    private class Snapshot(
        val walkthrough: Walkthrough?, val index: Int, val confirmed: Set<String>, val finished: Boolean,
        val loadingGoal: String?, val message: MessageState?, val savedAt: Long = SystemClock.elapsedRealtime(),
        val assist: Boolean = false,
    )

    companion object {
        private const val RESTORE_WINDOW_MS = 15_000L // a recreated activity installs within a second or two
        private val retained = HashMap<String, Snapshot>() // main thread only; keyed by activity class

        /**
         * Returns null (and does nothing) when `baseUrl` is blank, so release builds can ship without a server.
         * `clientId` is the publishable id from `heypointer init` (`gfc_` + 24 hex); the server refuses guide requests without a valid one.
         * Behind your own backend proxy, point `baseUrl` at it, pass `""` as `clientId` (the proxy adds it) and return your
         * auth from `headers` (called on a background thread for every request, so it may refresh a token).
         *
         * `assist` sets only the starting value of the user's "Assist" switch (default off). With it on, Next taps the
         * step's control for the user, but only a plain, unambiguous, enabled click: never typing, never choosing a value,
         * never a consequential step. `onAssist` is called after each tap the guide made (for your audit log).
         *
         * Customizing: `labels` replaces any user-visible string, `theme` any color, size or the typeface (both optional; the
         * `heypointer_*` string, color and dimen resources are the other layer, including `values-xx` and `values-night`).
         * `showLauncher = false` hides the "Guide me" button so your own button can call [open]; `launcherSide` moves it to the start edge.
         */
        @JvmStatic @JvmOverloads
        fun install(
            activity: Activity, baseUrl: String, clientId: String, bottomMarginDp: Int = 24, headers: (() -> Map<String, String>)? = null,
            assist: Boolean = AssistPolicy.DEFAULT_ON, onAssist: ((stepIndex: Int, label: String) -> Unit)? = null,
            labels: HeyPointerLabels? = null, theme: HeyPointerTheme? = null, showLauncher: Boolean = true, launcherSide: LauncherSide = LauncherSide.END,
        ): HeyPointer? =
            if (baseUrl.isBlank()) null
            else HeyPointer(activity, baseUrl, clientId, bottomMarginDp, headers, assist, onAssist, labels, theme, showLauncher, launcherSide)
    }

    /** Opens the "what do you want to do?" dialog. Use it from your own button when you install with `showLauncher = false`. */
    fun open() { if (!destroyed) askForGoal() }

    fun ask(goal: String) {
        val text = goal.trim()
        if (text.isEmpty()) { toast(texts.get(Str.TYPE_GOAL_FIRST)); return }
        if (destroyed) return
        showMessage(texts.get(Str.LOADING), text, null)
        loadingGoal = text
        client.ask(text, activity.javaClass.simpleName) answer@{ result ->
            if (destroyed || loadingGoal != text) return@answer // the screen went away, or the user asked something else since
            loadingGoal = null
            result.onSuccess { start(it) }.onFailure { showMessage(texts.get(Str.COULD_NOT_GET_STEPS), texts.describe(it), text) }
        }
    }

    /** True while the guide card is on screen. */
    val isOpen: Boolean get() = !destroyed && overlay.visibility == View.VISIBLE

    /**
     * Closes the guide if it is open and returns true; returns false when there was nothing to close. Back is already
     * wired automatically; call this from your own back handling only if you replace the window callback yourself.
     */
    fun handleBack(): Boolean { if (!isOpen) return false; close(); return true }

    /** Dismisses the goal dialog and any guide in progress. Safe to call when nothing is open. */
    fun close() {
        dialog?.dismiss(); dialog = null
        gen++
        main.removeCallbacksAndMessages(null) // the ticker and any pending target lookup
        loadingGoal = null; message = null; pendingNotice = null
        overlay.visibility = View.GONE
        launcher?.visibility = View.VISIBLE
        overlay.setTarget(null, false, false)
        walkthrough = null
        current = null
        back.sync()
    }

    /** Removes every view, handler callback and listener this guide added. Safe to call twice. */
    fun destroy() {
        if (destroyed) return
        // A rotation destroys the activity but not the guide in progress: keep its state for the next install.
        if (activity.isChangingConfigurations) snapshot()?.let { retained[key] = it } else retained.remove(key)
        destroyed = true
        close()
        back.uninstall()
        dialog?.dismiss(); dialog = null
        client.shutdown()
        main.removeCallbacksAndMessages(null)
        activity.application.unregisterActivityLifecycleCallbacks(lifecycle)
        decor.removeView(overlay)
        launcher?.let { decor.removeView(it) }
        launcher = null
    }

    private fun snapshot(): Snapshot? = when {
        walkthrough != null -> Snapshot(walkthrough, index, HashSet(confirmed), finished, null, null, assist = assistOn)
        loadingGoal != null -> Snapshot(null, 0, emptySet(), false, loadingGoal, null, assist = assistOn)
        isOpen && message != null -> Snapshot(null, 0, emptySet(), false, null, message, assist = assistOn)
        assistOn != assistDefault -> Snapshot(null, 0, emptySet(), false, null, null, assist = assistOn)
        else -> null
    }

    private fun restore(s: Snapshot) {
        assistOn = s.assist
        val w = s.walkthrough
        when {
            w != null -> {
                walkthrough = w; index = s.index.coerceIn(0, w.steps.lastIndex); finished = s.finished
                confirmed.clear(); confirmed += s.confirmed
                overlay.visibility = View.VISIBLE; launcher?.visibility = View.GONE
                main.postDelayed(ticker, 120)
                if (finished) showDone(w) else render() // render looks for the target again on the new layout
            }
            s.loadingGoal != null -> ask(s.loadingGoal)
            s.message != null -> showMessage(s.message.title, s.message.body, s.message.goal, s.message.suggestions)
        }
        back.sync()
    }

    // ---- flow -------------------------------------------------------------

    private fun start(w: Walkthrough) {
        confirmed.clear(); index = 0; finished = false; pendingNotice = null
        if (!w.isOk) { showMessage(texts.get(Str.CANT_GUIDE), w.message ?: texts.get(Str.NO_STEPS_FOUND), w.goal, w.suggestions.map { it.title }); return }
        message = null
        walkthrough = w
        overlay.visibility = View.VISIBLE
        launcher?.visibility = View.GONE
        main.removeCallbacksAndMessages(null)
        main.postDelayed(ticker, 120)
        back.sync()
        render()
    }

    private fun step(): Step? = walkthrough?.steps?.getOrNull(index)

    private fun render() {
        val w = walkthrough ?: return
        val s = step() ?: return
        gen++
        attempts = 0
        current = null
        lastBox = null
        acted = false; baseline = null
        val gated = s.needsConfirmation() && s.id !in confirmed
        overlay.bind(model(w, s, gated, notice = pendingNotice))
        overlay.setTarget(null, false, false)
        overlay.placeCard(null)
        resolve(gen)
    }

    private fun model(w: Walkthrough, s: Step, gated: Boolean, notice: String?, showRetry: Boolean = false): CardModel {
        shownNotice = notice; shownRetry = showRetry
        return cardModel(w, s, gated, notice, showRetry)
    }

    private fun cardModel(w: Walkthrough, s: Step, gated: Boolean, notice: String?, showRetry: Boolean) = CardModel(
        progress = texts.get(Str.PROGRESS, index + 1, w.steps.size),
        progressSpoken = texts.get(Str.PROGRESS_SPOKEN, index + 1, w.steps.size),
        title = s.title,
        body = s.instruction,
        notice = notice,
        source = s.evidence.firstOrNull()?.let { texts.get(Str.SOURCE, it.path, it.lineStart) },
        gateText = if (s.needsConfirmation()) texts.get(Str.GATE) else null,
        gateChecked = s.id in confirmed,
        backEnabled = index > 0,
        nextKind = if (index == w.steps.size - 1) NextKind.FINISH else NextKind.NEXT,
        nextEnabled = !gated,
        showRetry = showRetry,
        showAssist = true,
        assistChecked = assistOn,
        hint = if (AssistPolicy.needsManualHint(assistOn, s.action)) texts.get(Str.ASSIST_MANUAL_HINT) else null,
    )

    /** Look for the step's view for a moment: after a tap the next screen may take a beat to appear. */
    private fun resolve(token: Int) {
        if (token != gen) return
        val w = walkthrough ?: return
        val s = step() ?: return
        val gated = s.needsConfirmation() && s.id !in confirmed
        when (val r = TargetResolver.resolve(decor, s.target, overlay)) {
            is Resolution.Found -> {
                current = r.view
                if (baseline == null) baseline = fingerprint(r.view)
                val box = boxOf(r.view)
                lastBox = box
                overlay.bind(model(w, s, gated, pendingNotice))
                overlay.setTarget(box, true, highlight = !gated) // a gated control is not armed until the user confirms
                overlay.placeCard(box)
            }
            is Resolution.Ambiguous -> {
                overlay.bind(model(w, s, gated, texts.get(Str.AMBIGUOUS, r.count, s.target.wanted ?: texts.get(Str.THIS_CONTROL)), showRetry = true))
                overlay.setTarget(null, false, false); overlay.placeCard(null)
            }
            Resolution.Missing -> {
                if (++attempts < 14) { main.postDelayed({ resolve(token) }, 150); return }
                overlay.bind(model(w, s, gated, texts.get(Str.CANT_FIND, s.target.wanted ?: texts.get(Str.THIS_CONTROL)), showRetry = true))
                overlay.setTarget(null, false, false); overlay.placeCard(null)
            }
        }
    }

    /** Keep the cutout on the control while it moves (drawer sliding in, list scrolling). */
    private fun follow() {
        val v = current ?: return
        val s = step() ?: return
        // The control is gone (the user acted and the screen changed). Drop the highlight; do not hop to a
        // different view that happens to match. The user moves on with Next.
        if (!v.isAttachedToWindow || !v.isShown) { current = null; overlay.setTarget(null, false, false); return }
        val gated = s.needsConfirmation() && s.id !in confirmed
        val box = boxOf(v)
        overlay.setTarget(box, true, highlight = !gated)
        if (box != lastBox) { lastBox = box; overlay.placeCard(box) } // the control moved (scroll, drawer, rotation): the card follows
    }

    private fun boxOf(v: View): RectF {
        val a = IntArray(2); val b = IntArray(2)
        v.getLocationInWindow(a); overlay.getLocationInWindow(b)
        val l = (a[0] - b[0]).toFloat(); val t = (a[1] - b[1]).toFloat()
        return RectF(l, t, l + v.width, t + v.height)
    }

    private fun showMessage(title: String, body: String, goal: String?, suggestions: List<String> = emptyList()) {
        gen++
        main.removeCallbacksAndMessages(null)
        walkthrough = null; current = null
        message = MessageState(title, body, goal, suggestions)
        overlay.visibility = View.VISIBLE
        launcher?.visibility = View.GONE
        overlay.bind(CardModel(progress = null, title = title, body = body, showSkip = false, nextKind = if (goal == null) NextKind.OK else NextKind.TRY_AGAIN, backEnabled = false, suggestions = suggestions))
        overlay.setTarget(null, false, false)
        overlay.placeCard(null)
        retryGoal = goal
        back.sync()
    }
    private var retryGoal: String? = null

    private fun showDone(w: Walkthrough) {
        gen++
        overlay.bind(CardModel(progress = null, title = texts.get(Str.DONE_TITLE), body = texts.get(Str.DONE_BODY, w.goal), showSkip = false, nextKind = NextKind.CLOSE, backEnabled = false))
        overlay.setTarget(null, false, false); overlay.placeCard(null)
    }

    // ---- card callbacks ---------------------------------------------------

    override fun onNext() {
        val w = walkthrough
        if (w == null) { val g = retryGoal; close(); if (g != null) ask(g); return }
        if (finished) { close(); return }
        pendingNotice = null
        if (assistOn && assistThisStep()) return
        moveOn(w)
    }

    private fun moveOn(w: Walkthrough) {
        if (index < w.steps.size - 1) { index++; render() } else {
            finished = true
            showDone(w)
        }
    }

    override fun onBack() { pendingNotice = null; if (index > 0) { index--; render() } }
    // Skip never assists: it is "I'll leave this one", not "do it for me".
    override fun onSkip() {
        val w = walkthrough
        if (w == null || finished) { onNext(); return }
        pendingNotice = null
        moveOn(w)
    }
    override fun onRetry() { render() }
    override fun onClose() = close()
    override fun onSuggest(title: String) = ask(title)
    override fun onAssist(checked: Boolean) {
        assistOn = checked
        refreshCard()
    }
    override fun onGate(checked: Boolean) {
        val s = step() ?: return
        if (checked) confirmed += s.id else confirmed -= s.id
        render()
    }

    // ---- assist mode ------------------------------------------------------

    /**
     * Next with assist on. Returns true when it handled the move itself (tapped the control and moved on, or stayed on the
     * step because the tap did nothing); false means "behave as without assist". The policy decides; this only gathers facts.
     */
    private fun assistThisStep(): Boolean {
        val w = walkthrough ?: return false
        val s = step() ?: return false
        val r = TargetResolver.resolve(decor, s.target, overlay)
        val view = (r as? Resolution.Found)?.view
        val decision = AssistPolicy.decide(AssistInput(assistOn, s.action, s.needsConfirmation(), facts(r), view != null && userActed(view)))
        if (decision !is AssistDecision.Perform || view == null) return false
        val raw = s.target.wanted ?: s.title
        val label = AssistPolicy.label(raw, texts.get(Str.THIS_CONTROL))
        if (!view.performClick()) { // a clickable view with no click listener (touch handled elsewhere): do not pretend it worked
            overlay.bind(model(w, s, false, texts.get(Str.ASSIST_COULDNT_TAP, label), showRetry = true))
            return true
        }
        runCatching { onAssist?.invoke(index, label) } // the host's logging must not break the guide
        pendingNotice = texts.get(Str.ASSIST_CLICKED, label) // shown on the next card; its live region makes TalkBack say it
        moveOn(w)
        return true
    }

    private fun facts(r: Resolution): TargetFacts = when (r) {
        is Resolution.Found -> r.view.let { TargetFacts(1, clickable = it.isClickable, enabled = it.isEnabled, shown = it.isShown, ownUi = isOwnUi(it)) }
        is Resolution.Ambiguous -> TargetFacts(r.count)
        Resolution.Missing -> TargetFacts.NONE
    }

    private fun isOwnUi(v: View): Boolean = generateSequence(v as View?) { it.parent as? View }.any { it === overlay || it === launcher }

    /**
     * The user already did this step if they tapped (or pressed Enter on) the highlighted control, or its visible state
     * differs from when the step appeared, or the view was replaced. Wrong in the safe direction: it can only make
     * assist skip a tap, never repeat one (a favourite heart tapped twice would undo itself).
     */
    private fun userActed(v: View): Boolean = acted || (baseline != null && (current !== v || fingerprint(v) != baseline))

    private fun observe(e: InputEvent) {
        val v = current ?: return
        if (walkthrough == null || finished || overlay.visibility != View.VISIBLE) return
        when (e) {
            is MotionEvent -> when (e.actionMasked) {
                MotionEvent.ACTION_DOWN -> { downX = e.rawX; downY = e.rawY; downOnTarget = onTarget(v, e.rawX, e.rawY) }
                MotionEvent.ACTION_UP -> {
                    // A tap, not a scroll that happened to start on the control.
                    if (downOnTarget && onTarget(v, e.rawX, e.rawY) && hypot(e.rawX - downX, e.rawY - downY) <= touchSlop) acted = true
                    downOnTarget = false
                }
                MotionEvent.ACTION_CANCEL -> downOnTarget = false
            }
            is KeyEvent -> if (e.action == KeyEvent.ACTION_UP && v.isFocused &&
                (e.keyCode == KeyEvent.KEYCODE_ENTER || e.keyCode == KeyEvent.KEYCODE_DPAD_CENTER || e.keyCode == KeyEvent.KEYCODE_NUMPAD_ENTER || e.keyCode == KeyEvent.KEYCODE_SPACE)) acted = true
        }
    }

    private fun onTarget(v: View, x: Float, y: Float): Boolean {
        if (overlay.cardContains(x, y)) return false
        val r = Rect()
        return v.getGlobalVisibleRect(r) && r.contains(x.toInt(), y.toInt())
    }

    /** A cheap picture of what the control looks like (state, text, icon) so a change since the step appeared is noticed. */
    private fun fingerprint(root: View): String {
        val sb = StringBuilder()
        var budget = 24
        fun visit(x: View) {
            if (budget-- <= 0) return
            sb.append(x.isSelected).append(x.isActivated).append(x.isEnabled).append((x.alpha * 100).toInt())
            (x as? Checkable)?.let { sb.append(it.isChecked) }
            (x as? TextView)?.let { sb.append(it.text) }
            (x as? ImageView)?.let { sb.append(System.identityHashCode(it.drawable?.constantState)) }
            x.contentDescription?.let { sb.append(it) }
            if (Build.VERSION.SDK_INT >= 30) x.stateDescription?.let { sb.append(it) }
            sb.append('|')
            if (x is ViewGroup) for (i in 0 until x.childCount) visit(x.getChildAt(i))
        }
        visit(root)
        return sb.toString()
    }

    /** The switch changed: redraw the card in place (hint, checkbox) without looking for the target again. */
    private fun refreshCard() {
        val w = walkthrough ?: return
        val s = step() ?: return
        if (finished) return
        overlay.bind(model(w, s, s.needsConfirmation() && s.id !in confirmed, shownNotice, shownRetry))
        overlay.placeCard(lastBox)
    }

    // ---- goal dialog ------------------------------------------------------

    private fun askForGoal() {
        dialog?.dismiss()
        val input = EditText(activity).apply {
            hint = texts.get(Str.GOAL_HINT); contentDescription = texts.get(Str.GOAL_DESCRIPTION); inputType = InputType.TYPE_CLASS_TEXT
            imeOptions = EditorInfo.IME_ACTION_GO; setSingleLine(true)
        }
        val pad = activity.dp(20f).toInt()
        val assistBox = CheckBox(activity).apply {
            text = texts.get(Str.ASSIST_TOGGLE); contentDescription = texts.get(Str.ASSIST_TOGGLE); minHeight = activity.dp(48f).toInt()
            buttonTintList = ColorStateList.valueOf(theme.accent)
            isChecked = assistOn
            setOnCheckedChangeListener { _, c -> assistOn = c; refreshCard() }
        }
        val box = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL; setPadding(pad, pad / 2, pad, 0)
            addView(input, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
            addView(assistBox, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = activity.dp(8f).toInt() })
        }
        dialog = AlertDialog.Builder(activity)
            .setTitle(texts.get(Str.GOAL_TITLE)).setView(box)
            .setPositiveButton(texts.get(Str.SHOW_ME)) { _, _ -> ask(input.text.toString()) }
            .setNegativeButton(texts.get(Str.CANCEL), null)
            .show()
        input.setOnEditorActionListener { _, id, _ -> if (id == EditorInfo.IME_ACTION_GO) { dialog?.dismiss(); ask(input.text.toString()); true } else false }
    }

    private fun toast(msg: String) = Toast.makeText(activity as Context, msg, Toast.LENGTH_SHORT).show()
}

/** Which edge the built-in "Guide me" button sits on. Start/end follow the layout direction, so END is the right edge in left-to-right languages. */
enum class LauncherSide { END, START }
