package com.heypointer.android

import android.content.Context
import android.graphics.Canvas
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.accessibility.AccessibilityManager
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.Button
import android.widget.CheckBox
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView

internal fun Context.dp(v: Float): Float = v * resources.displayMetrics.density

/** A clickable TextView is announced as "button" by TalkBack, like the real thing. */
internal fun View.announceAsButton() {
    accessibilityDelegate = object : View.AccessibilityDelegate() {
        override fun onInitializeAccessibilityNodeInfo(host: View, info: AccessibilityNodeInfo) {
            super.onInitializeAccessibilityNodeInfo(host, info)
            info.className = Button::class.java.name
        }
    }
}

/** Which primary action the card offers; the overlay turns it into the (localized) label and description. */
internal enum class NextKind { NEXT, FINISH, OK, TRY_AGAIN, CLOSE }

/** What the card shows. The controller builds one per step and per state. */
internal data class CardModel(
    val progress: String?,
    /** What a screen reader says for the progress, e.g. "Step 2 of 5". */
    val progressSpoken: String? = null,
    val title: String,
    val body: String,
    val notice: String? = null,
    val source: String? = null,
    val gateText: String? = null,
    val gateChecked: Boolean = false,
    val backEnabled: Boolean = false,
    val nextKind: NextKind = NextKind.NEXT,
    val nextEnabled: Boolean = true,
    val showSkip: Boolean = true,
    val showRetry: Boolean = false,
    /** "Did you mean" guide titles, shown as buttons under the message. */
    val suggestions: List<String> = emptyList(),
    /** The assist toggle row is shown on step cards only. */
    val showAssist: Boolean = false,
    val assistChecked: Boolean = false,
    /** One line under the instruction, e.g. "You need to do this one yourself." */
    val hint: String? = null,
)

internal interface CardListener {
    fun onNext()
    fun onBack()
    fun onSkip()
    fun onRetry()
    fun onClose()
    fun onGate(checked: Boolean)
    fun onSuggest(title: String)
    fun onAssist(checked: Boolean)
}

/**
 * The visual layer: a dimmer with a real cutout around the target, a ring on the target, and the
 * tooltip card. The dimmer and ring are drawn only, never touch targets: taps go straight through to
 * the app, because the user performs the action themselves. Only the card's own buttons take touches.
 */
internal class GuideOverlay(
    context: Context, private val listener: CardListener, private val texts: Texts, private val theme: ThemeValues, private val face: Typeface?,
) : FrameLayout(context) {
    private val dimPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = theme.scrim }
    private val ringPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = context.dp(theme.ringWidthDp); color = theme.ring }
    private val path = Path()
    private var hole: RectF? = null
    private var dimmed = false
    private var ring = false
    private val radius = context.dp(theme.highlightCornerRadiusDp)
    private val accent = theme.accent
    private fun sp(v: Float) = v * theme.textScale
    private fun TextView.font(style: Int = Typeface.NORMAL) { typeface = Typeface.create(face ?: Typeface.DEFAULT, style) }

    private val card = LinearLayout(context).apply {
        orientation = LinearLayout.VERTICAL
        val pad = context.dp(18f).toInt()
        setPadding(pad, pad, pad, pad)
        background = GradientDrawable().apply { setColor(theme.surface); cornerRadius = context.dp(theme.cardCornerRadiusDp) }
        elevation = context.dp(10f)
        isClickable = true // a tap on the card must not fall through to the app below
        if (android.os.Build.VERSION.SDK_INT >= 28) accessibilityPaneTitle = texts.get(Str.CARD_PANE_TITLE) // TalkBack announces the card appearing
    }
    private val head = LinearLayout(context).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
    private val progress = text(13f, theme.mutedText)
    private val close = TextView(context).apply {
        text = "×"; setTextSize(TypedValue.COMPLEX_UNIT_SP, sp(26f)); setTextColor(theme.onSurface); contentDescription = texts.get(Str.CLOSE_GUIDE_DESC); font()
        gravity = Gravity.CENTER; isClickable = true; setOnClickListener { listener.onClose() }
        announceAsButton()
    }
    // Focus moves here when a step is shown; its description carries the progress so one swipe says where you are.
    private val title = text(16f, theme.onSurface).apply { font(Typeface.BOLD); isFocusable = true }
    // Live region: the instruction is read after the title when a step changes. Text is only set when it differs, so nothing is read twice.
    private val body = text(14f, theme.onSurface).apply { accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE }
    private val notice = text(13f, theme.noticeText).apply {
        background = GradientDrawable().apply { setColor(theme.noticeBackground); cornerRadius = context.dp(8f); setStroke(1, theme.noticeText) }
        val p = context.dp(8f).toInt(); setPadding(p, p, p, p)
        accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE
    }
    private val hint = text(12f, theme.mutedText).apply { accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE }
    private val suggestLabel = text(13f, theme.mutedText).apply { font(Typeface.BOLD); text = texts.get(Str.DID_YOU_MEAN) }
    private val suggestBox = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL }
    private var shownSuggestions: List<String> = emptyList()
    private var spoken: String? = null
    private var cardTarget: RectF? = null
    private var pendingPlace: Runnable? = null
    private var placedFor: PlacementInputs? = null
    private val replaceOnChange = android.view.ViewTreeObserver.OnPreDrawListener {
        if (visibility == View.VISIBLE && placedFor != null && needsReplace(placedFor, currentInputs())) placeCard(cardTarget)
        true
    }
    private val source = text(11f, theme.mutedText)
    private var binding = false
    private val gate = CheckBox(context).apply {
        setTextSize(TypedValue.COMPLEX_UNIT_SP, sp(13f)); minHeight = context.dp(48f).toInt(); setTextColor(theme.onSurface); font()
        buttonTintList = ColorStateList.valueOf(accent)
        setOnCheckedChangeListener { _, c -> if (!binding) listener.onGate(c) }
    }
    private val assist = CheckBox(context).apply {
        text = texts.get(Str.ASSIST_TOGGLE); setTextSize(TypedValue.COMPLEX_UNIT_SP, sp(13f)); minHeight = context.dp(48f).toInt(); setTextColor(theme.onSurface); font()
        buttonTintList = ColorStateList.valueOf(accent)
        contentDescription = texts.get(Str.ASSIST_TOGGLE)
        setOnCheckedChangeListener { _, c -> if (!binding) listener.onAssist(c) }
    }
    private val back = textButton(texts.get(Str.BACK), theme.mutedText) { listener.onBack() }.apply { contentDescription = texts.get(Str.BACK_DESC) }
    private val skip = textButton(texts.get(Str.SKIP), accent) { listener.onSkip() }.apply { contentDescription = texts.get(Str.SKIP_DESC) }
    private val retry = textButton(texts.get(Str.TRY_AGAIN), accent) { listener.onRetry() }
    private val next = Button(context).apply {
        isAllCaps = false; setTextColor(theme.onAccent); setTextSize(TypedValue.COMPLEX_UNIT_SP, sp(14f)); font(Typeface.BOLD)
        minHeight = 0; minimumHeight = context.dp(44f).toInt(); setOnClickListener { listener.onNext() }
        val h = context.dp(18f).toInt(); setPadding(h, context.dp(9f).toInt(), h, context.dp(9f).toInt())
    }

    init {
        setWillNotDraw(false)
        importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
        head.addView(progress, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        head.addView(close, LinearLayout.LayoutParams(context.dp(44f).toInt(), context.dp(44f).toInt())) // 44dp touch target
        val buttons = LinearLayout(context).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        buttons.addView(back)
        buttons.addView(View(context), LinearLayout.LayoutParams(0, 1, 1f))
        buttons.addView(retry)
        buttons.addView(skip)
        buttons.addView(next)
        val gap = context.dp(10f).toInt()
        card.addView(head)
        card.addView(title, margin(gap / 2))
        card.addView(body, margin(gap / 2))
        card.addView(notice, margin(gap))
        card.addView(hint, margin(gap / 2))
        card.addView(suggestLabel, margin(gap))
        card.addView(suggestBox, margin(0))
        card.addView(gate, margin(gap))
        card.addView(assist, margin(gap / 2))
        card.addView(buttons, margin(gap * 2))
        card.addView(source, margin(gap))
        addView(card, LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT))
    }

    private fun margin(top: Int) = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = top }
    private fun text(size: Float, color: Int) = TextView(context).apply { setTextSize(TypedValue.COMPLEX_UNIT_SP, sp(size)); setTextColor(color); font() }
    private fun textButton(label: String, color: Int, onClick: () -> Unit) = Button(context).apply {
        text = label; isAllCaps = false; setTextColor(color); setTextSize(TypedValue.COMPLEX_UNIT_SP, sp(14f)); font(Typeface.BOLD)
        background = null; minWidth = 0; minimumWidth = 0; minHeight = 0; minimumHeight = context.dp(44f).toInt() // 44dp touch target
        setPadding(context.dp(10f).toInt(), context.dp(9f).toInt(), context.dp(10f).toInt(), context.dp(9f).toInt())
        setOnClickListener { onClick() }
    }

    fun bind(m: CardModel) {
        binding = true
        progress.text = m.progress.orEmpty(); progress.visibility = if (m.progress == null) View.INVISIBLE else View.VISIBLE
        progress.contentDescription = m.progressSpoken
        setIfChanged(title, m.title)
        title.contentDescription = if (m.progressSpoken != null) texts.get(Str.TITLE_SPOKEN, m.progressSpoken, m.title) else m.title
        setIfChanged(body, m.body)
        setIfChanged(notice, m.notice.orEmpty()); notice.visibility = if (m.notice == null) View.GONE else View.VISIBLE
        source.text = m.source.orEmpty(); source.visibility = if (m.source == null) View.GONE else View.VISIBLE
        setIfChanged(hint, m.hint.orEmpty()); hint.visibility = if (m.hint == null) View.GONE else View.VISIBLE
        assist.visibility = if (m.showAssist) View.VISIBLE else View.GONE
        if (assist.isChecked != m.assistChecked) assist.isChecked = m.assistChecked
        gate.visibility = if (m.gateText == null) View.GONE else View.VISIBLE
        gate.text = m.gateText.orEmpty()
        if (gate.isChecked != m.gateChecked) gate.isChecked = m.gateChecked
        back.visibility = if (m.backEnabled) View.VISIBLE else View.INVISIBLE
        skip.visibility = if (m.showSkip) View.VISIBLE else View.GONE
        retry.visibility = if (m.showRetry) View.VISIBLE else View.GONE
        next.text = texts.get(when (m.nextKind) { NextKind.NEXT -> Str.NEXT; NextKind.FINISH -> Str.FINISH; NextKind.OK -> Str.OK; NextKind.TRY_AGAIN -> Str.TRY_AGAIN; NextKind.CLOSE -> Str.CLOSE })
        next.contentDescription = when (m.nextKind) { NextKind.NEXT -> texts.get(Str.NEXT_DESC); NextKind.FINISH -> texts.get(Str.FINISH_DESC); else -> null }
        next.isEnabled = m.nextEnabled
        next.background = GradientDrawable().apply { setColor(if (m.nextEnabled) accent else theme.accentDisabled); cornerRadius = context.dp(22f) }
        bindSuggestions(m.suggestions)
        binding = false
        // Move screen-reader focus to the title when the step (or message) changes, but not when only the
        // gate is ticked or the notice changes: that would pull focus off the control the user is using.
        val key = "${m.progressSpoken}|${m.title}|${m.body}"
        if (key != spoken) { spoken = key; focusTitleForScreenReader() }
    }

    /** Setting equal text still sends an accessibility event, so a live region would read the same words twice. */
    private fun setIfChanged(view: TextView, value: String) { if (view.text.toString() != value) view.text = value }

    private fun bindSuggestions(titles: List<String>) {
        suggestLabel.visibility = if (titles.isEmpty()) View.GONE else View.VISIBLE
        suggestBox.visibility = suggestLabel.visibility
        if (titles == shownSuggestions) return
        shownSuggestions = titles
        suggestBox.removeAllViews()
        // Titles are untrusted server text: shown as plain text, never parsed.
        titles.forEach { t ->
            val b = textButton(t, accent) { listener.onSuggest(t) }
            b.contentDescription = texts.get(Str.DID_YOU_MEAN_DESC, t)
            b.gravity = Gravity.START or Gravity.CENTER_VERTICAL
            b.isSingleLine = false
            b.setPaddingRelative(b.paddingStart, context.dp(4f).toInt(), b.paddingEnd, context.dp(4f).toInt())
            suggestBox.addView(b, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        }
    }

    private fun focusTitleForScreenReader() {
        val am = context.getSystemService(Context.ACCESSIBILITY_SERVICE) as? AccessibilityManager ?: return
        if (!am.isEnabled || !am.isTouchExplorationEnabled) return
        title.post { title.performAccessibilityAction(AccessibilityNodeInfo.ACTION_ACCESSIBILITY_FOCUS, null) }
    }

    /** Is a screen point (raw coordinates) on the card? Used to tell a tap on the guide from a tap on the app. */
    fun cardContains(rawX: Float, rawY: Float): Boolean {
        if (visibility != View.VISIBLE) return false
        val r = android.graphics.Rect()
        return card.getGlobalVisibleRect(r) && r.contains(rawX.toInt(), rawY.toInt())
    }

    /** `target` is in this view's coordinates. `dim` shades the screen; `highlight` cuts the hole and draws the ring. */
    fun setTarget(target: RectF?, dim: Boolean, highlight: Boolean) {
        dimmed = dim
        ring = highlight && target != null
        hole = if (highlight && target != null) RectF(target).apply { inset(-context.dp(5f), -context.dp(5f)) } else null
        invalidate()
    }

    /** Place the card beside the target, or at the bottom when there is no target. */
    fun placeCard(target: RectF?) {
        cardTarget = target
        val w = width.toFloat(); val h = height.toFloat()
        if (w == 0f || h == 0f) { // not laid out yet (first frame after the activity is created)
            pendingPlace?.let { removeCallbacks(it) }
            pendingPlace = Runnable { placeCard(cardTarget) }.also { if (isAttachedToWindow) postDelayed(it, 16) }
            return
        }
        // Keep the card clear of the status bar, the navigation bar (at the bottom, or at the side in landscape) and cutouts:
        // place inside the usable band, then shift back.
        val insets = if (android.os.Build.VERSION.SDK_INT >= 23) rootWindowInsets else null
        @Suppress("DEPRECATION") val top = (insets?.systemWindowInsetTop ?: 0).toFloat()
        @Suppress("DEPRECATION") val bottom = (insets?.systemWindowInsetBottom ?: 0).toFloat()
        @Suppress("DEPRECATION") val left = (insets?.systemWindowInsetLeft ?: 0).toFloat()
        @Suppress("DEPRECATION") val right = (insets?.systemWindowInsetRight ?: 0).toFloat()
        val usableW = w - left - right
        val usableH = h - top - bottom
        val margin = context.dp(12f)
        val layout = cardLayout(usableW, context.resources.displayMetrics.density, margin)
        val cardW = layout.cardW
        card.measure(MeasureSpec.makeMeasureSpec(cardW.toInt(), MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(0, MeasureSpec.UNSPECIFIED))
        val cardH = card.measuredHeight.toFloat()
        val lp = card.layoutParams
        if (lp.width != cardW.toInt()) { lp.width = cardW.toInt(); card.layoutParams = lp }
        val pos = if (target == null) Position((usableW - cardW) / 2, usableH - cardH - context.dp(24f), Placement.FLOATING)
        else CoachmarkPlacement.position(Box(target.left - left, target.top - top, target.right - left, target.bottom - top), cardW, cardH, usableW, usableH, layout.narrow, margin, context.dp(16f), rtl = layoutDirection == View.LAYOUT_DIRECTION_RTL)
        card.x = pos.left + left
        card.y = pos.top + top
        placedFor = currentInputs()
    }

    private fun currentInputs(): PlacementInputs {
        val insets = if (android.os.Build.VERSION.SDK_INT >= 23) rootWindowInsets else null
        @Suppress("DEPRECATION")
        return PlacementInputs(width, height, insets?.systemWindowInsetTop ?: 0, insets?.systemWindowInsetBottom ?: 0, insets?.systemWindowInsetLeft ?: 0, insets?.systemWindowInsetRight ?: 0, card.height)
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        viewTreeObserver.addOnPreDrawListener(replaceOnChange)
    }

    /** Rotation or a window resize without recreating the activity: put the card back beside its target. */
    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        if (w > 0 && h > 0 && visibility == View.VISIBLE) placeCard(cardTarget)
    }

    /** The keyboard or a system bar appeared or went away: the usable area changed, so the card must move. */
    override fun onApplyWindowInsets(insets: android.view.WindowInsets): android.view.WindowInsets {
        post { if (visibility == View.VISIBLE) placeCard(cardTarget) }
        return super.onApplyWindowInsets(insets)
    }

    override fun onDetachedFromWindow() {
        viewTreeObserver.removeOnPreDrawListener(replaceOnChange)
        pendingPlace?.let { removeCallbacks(it) }
        pendingPlace = null
        super.onDetachedFromWindow()
    }

    override fun onDraw(canvas: Canvas) {
        if (!dimmed) return
        val h = hole
        if (h == null) { canvas.drawRect(0f, 0f, width.toFloat(), height.toFloat(), dimPaint); return }
        path.reset()
        path.fillType = Path.FillType.EVEN_ODD
        path.addRect(0f, 0f, width.toFloat(), height.toFloat(), Path.Direction.CW)
        path.addRoundRect(h, radius, radius, Path.Direction.CW)
        canvas.drawPath(path, dimPaint)
        if (ring) canvas.drawRoundRect(h, radius, radius, ringPaint)
    }
}
