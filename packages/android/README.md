# @heypointerhq/android (prototype)

The first native adapter. It does for an Android app what [`@heypointerhq/sdk`](../sdk/README.md) does for a web page: asks a HeyPointer server how to do something, then walks the user through the real screen, one control at a time. The page dims, a spotlight cuts out the real control, and a tooltip beside it shows `2 / 5`, a short instruction, **Skip** and **Next**.

It only guides. It never taps, types into or submits anything for the user, unless the user turns on [Assist](#assist-mode-off-by-default) (off by default), and even then never typing, never choosing a value and never a consequential step. Consequential steps are not highlighted until the user ticks "I understand and want to do this myself."

```kotlin
// MainActivity.onCreate, after setContentView
HeyPointer.install(this, "https://your-heypointer-server", "gfc_...")
```

`install` adds a "Guide me" button and the overlay, and returns `null` when the URL is blank, so a release build can ship without a server. The third argument is the **client id** from `heypointer init` (`gfc_` plus 24 hex characters). It is public, like a Stripe publishable key: the server limits it by allowed origins and rate. Read it from a build config field rather than hard-coding it (see the Echo sample). `bottomMarginDp` stays an optional fourth argument.

The id goes in an `X-HeyPointer-Client` header on the walkthrough request only. A malformed id is refused on the device without a request. A missing or unknown id, a client that does not allow the app, and rate limiting each show a plain message on the card (never the raw server reply). **Behind your own backend.** An APK can be unpacked, so its client id is extractable. To keep the id private, call your own server, which adds the id and applies your login: `HeyPointer.install(this, "https://api.example.com/guide", "", headers = { mapOf("Authorization" to "Bearer ${session.token()}") })`. `headers` is called on a background thread for every request, so it may refresh a token; `Content-Type`, `Content-Length`, `Host` and the client header cannot be overridden. See [docs/BACKEND_PROXY.md](../../docs/BACKEND_PROXY.md).

`assist`, `onAssist`, `labels`, `theme`, `showLauncher` and `launcherSide` are the last parameters of `install` (all optional; see [Assist mode](#assist-mode-off-by-default) and [Customizing](#customizing)).

**Breaking change from 0.1:** `install(activity, url, bottomMarginDp)` is gone; pass the client id.

## Assist mode (off by default)

Without it, a step the user skips (never taps the Search button, say) leaves the next step unable to find its control. With the **Assist** switch on, pressing **Next** taps the step's control for the user so the guide stays on track.

The switch is a checkbox, "Assist: do safe clicks for me when I press Next", in the **Guide me** dialog and on every step card. It is per `HeyPointer` instance, lives only for the session, survives rotation, and starts off. `install(..., assist = true)` only changes the starting value; the user can still turn it off.

Next taps the control only when **all** of these hold, otherwise it moves on exactly as it does with assist off:

- the step's action is `click` (never `type`, `select` or `navigate`; for typing and choosing the card says "You need to do this one yourself.");
- the step is not consequential: not flagged `requiresConfirmation` and no consequential label (send, delete, pay, buy ...). Ticking the confirmation box does not lift this: the user presses those themselves;
- the target resolves to **exactly one** on-screen view (same resolver as the highlight; several matches are never guessed);
- that view is shown, enabled and clickable, and is not part of the guide itself;
- the user has **not already acted**: a tap or Enter on the control since the step appeared, or a change in its visible state (selected, checked, text, icon, content description), or the view being replaced. In that case Next only moves on, so a favourite heart is never tapped twice and undone.

After the tap the next card shows `Clicked "<label>" for you.` (a live region, so TalkBack reads it). If the control has no click listener (`performClick()` returns false) the guide stays on the step and says so instead of pretending. Skip never assists.

```kotlin
HeyPointer.install(this, url, clientId,
    assist = false,                                   // starting value of the user's switch
    onAssist = { step, label -> audit.log("guide tapped $label on step $step") })
```

How "already acted" is detected: the same window-callback wrapper that handles Back also watches touches and keys on their way to the app (it never consumes or alters them, and it replaces no listener on your views). A tap counts when it starts and ends on the control within the touch slop, so a scroll that begins there does not. A TalkBack double-tap is an accessibility action, not a touch, so it is caught by the state comparison instead; a toggle with no visible change could in theory be tapped twice, so keep an assist-driven step off controls that flip silently.

## Customizing

Three layers, from strongest to weakest: the objects you pass to `install` (`HeyPointerLabels`, `HeyPointerTheme`), then **resources of the same name in your app**, then the library's defaults. Every user-visible string, color and size is a resource, so a translation or a re-skin is an XML file and needs no code.

```kotlin
HeyPointer.install(
    this, url, clientId,
    labels = HeyPointerLabels(next = "Continue", showMe = "Guide me!"),
    theme = HeyPointerTheme(accent = Color.parseColor("#7c3aed"), onAccent = Color.WHITE, cardCornerRadiusDp = 20f),
    showLauncher = false,                      // you provide the button (below)
)
```

### Labels and translation

`res/values/heypointer_strings.xml` in this library lists every string by name (`heypointer_next`, `heypointer_show_me`, `heypointer_assist_toggle`, the error messages, the TalkBack descriptions ...). Declare the same name in your app to change it, or in `values-xx/` to translate. Keep the `%1$s` / `%2$d` placeholders:

```xml
<!-- app/src/main/res/values-de/strings.xml -->
<resources>
    <string name="heypointer_launcher">Hilf mir</string>
    <string name="heypointer_next">Weiter</string>
    <string name="heypointer_back">Zurück</string>
    <string name="heypointer_progress_spoken">Schritt %1$d von %2$d</string>
    <plurals name="heypointer_ambiguous">
        <item quantity="one">Ich habe %1$d Treffer für „%2$s“ gefunden und rate nicht.</item>
        <item quantity="other">Ich habe %1$d Treffer für „%2$s“ gefunden und rate nicht.</item>
    </plurals>
</resources>
```

`HeyPointerLabels` has one nullable field per string and overrides at runtime (a CMS, remote config, a per-tenant brand). A field you leave `null` falls back to the resource. A blank value, or one whose placeholders do not fit, is ignored, so a bad remote string cannot crash the guide. Precedence per string: `HeyPointerLabels` > your resource > the library default. Messages the server sends (why a goal is not covered, the "Did you mean" titles, step titles and instructions) come from the server and are not labels: write them in the language you want in your flows.

### Theme and dark mode

`res/values/heypointer_colors.xml` and `heypointer_dimens.xml` hold the colors (`heypointer_color_accent`, `_on_accent`, `_surface`, `_on_surface`, `_muted`, `_scrim`, `_ring`, `_notice_bg`, `_notice_text`, `_accent_disabled`), `heypointer_ring_width`, `heypointer_card_radius`, `heypointer_highlight_radius` and `heypointer_text_scale`. The library ships a light set and a `values-night` set, so the guide follows the system dark mode with no code. Override any of them in your app (and in your own `values-night/` for dark). `HeyPointerTheme` overrides them at runtime and also takes a `typeface`:

| `HeyPointerTheme` field | What it changes |
|---|---|
| `accent`, `onAccent` | Next, the Guide me button, text buttons, checkboxes; text on them |
| `surface`, `onSurface`, `mutedText` | the card and its text |
| `scrim`, `ring`, `ringWidthDp`, `highlightCornerRadiusDp` | the dim, and the ring and cutout around the control |
| `cardCornerRadiusDp` | the card |
| `noticeBackground`, `noticeText`, `accentDisabled` | notices and a disabled Next |
| `textScale` | multiplies every text size (0.75 to 2.0), on top of the user's system font size |
| `typeface` | all guide text |

Surfaces and text colors are made opaque, sizes are clamped, and a NaN is ignored. Keep text and its background at **4.5:1** or better: the defaults do, and a *debuggable* build logs a `HeyPointer` warning naming any pair of yours that does not. Nothing is blocked or changed. The "Guide me" goal dialog is a standard `AlertDialog`, so its look comes from your app's dialog theme; only its labels and the Assist checkbox follow HeyPointer.

### The Guide me button, `open()` and `close()`

`showLauncher = false` skips the built-in button. Call `open()` from your own control to show the goal dialog, and `close()` to dismiss it and any guide in progress (both are safe to call at any time, including after `destroy()`):

```kotlin
val guide = HeyPointer.install(this, url, clientId, showLauncher = false)
helpButton.setOnClickListener { guide?.open() }
```

`launcherSide = LauncherSide.START` puts the built-in button on the start edge (END is the default; both follow the layout direction), and `bottomMarginDp` still sets how far it sits above the bottom.

### Right-to-left

Layouts use start and end, the card goes on the reading-end side of the control first (left in right-to-left languages), and text follows the locale. Your app must declare `android:supportsRtl="true"` for Android to mirror layouts. Placement and the resource switching are unit-tested; the mirrored layout itself has not been checked on a device.

## How a step finds its view

Android has no DOM, so a step's target is matched against the live view tree:

1. `#name` in `selectors` matches the view whose resource id is `R.id.name` (so the same `#name` also works as a CSS id on the web).
2. Otherwise the step's `text` or `label` is matched against a view's visible text or its **content description**. Icon-only buttons need a content description: that is also what TalkBack reads.

If a matched text view sits inside a clickable row, the row is highlighted. When some matches are clickable, only those count. Several matches are reported, not guessed. A view that is off screen (a closed drawer) does not count. If the target is not there yet, the guide waits briefly, then offers "Try again".

## Did you mean

When the server cannot cover a goal it can offer up to 5 nearest guides (`suggestions` on an `insufficient_evidence` walkthrough, contract 1.5.0). The card shows them under the message as a column of buttons labelled "Did you mean:". Tapping one asks the server for that title as the goal. Titles are untrusted text: they are shown as plain text, trimmed, capped at 200 characters, de-duplicated and limited to 5 by the parser, and malformed entries are dropped without failing the reply. Each button has the content description `Did you mean: <title>`.

## Rotation, Back and cleanup

- **Rotation and other configuration changes** recreate the activity. A guide in progress (goal, step, confirmed gates, or the message card on screen, or a request still loading) is kept as plain data, never views, and picked up by the next `HeyPointer.install` for the same activity class within 15 seconds. The card then looks for the target again on the new layout. The "Guide me" dialog is not restored. If the process is killed, nothing is restored.
- **Back** closes the guide card first, so Back never exits the screen while the card is open; the next Back reaches the app (a drawer, the previous screen). It is wired automatically through the window callback, and through an `OnBackInvokedCallback` on Android 13+ while the card is open. `heypointer.handleBack()` is public if you replace the window callback yourself.
- **Cleanup**: when the activity is destroyed, `destroy()` removes the overlay and button, every posted callback, the lifecycle callback, the back hook and the goal dialog, and stops the network thread.
- **Large screens**: up to 600dp wide the card spans the screen minus margins; wider (tablets, phones in landscape) it is at most 400dp and sits beside, above or below the target. The card also stays clear of the status bar, the navigation bar (even at the side in landscape), cutouts and the keyboard.

## Accessibility (TalkBack)

- The dimmer and ring are drawn on the overlay, not views, and the overlay is excluded from accessibility, so only the card and the app are in the tree.
- When a step changes, screen-reader focus moves to the step title, whose description carries the progress ("Step 2 of 5: Click Save"); the instruction is a polite live region, read after the title. Text is only set when it changed, so nothing is read twice, and ticking the confirmation does not pull focus.
- Content descriptions: "Close guide", "Skip this step", "Back to the previous step", "Next step" / "Finish the guide", "Guide me". The confirmation checkbox is a real `CheckBox` with its text. Touch targets are 44dp.

## Install

Local development (default in the Echo sample): include the module from source.

```groovy
// settings.gradle
include ':heypointer-android'
project(':heypointer-android').projectDir = new File('../universal-walkthrough/packages/android')
// app/build.gradle
implementation project(':heypointer-android')
```

### From Maven Central

The release artifact is `com.heypointer:heypointer-android` (an AAR with sources and a javadoc jar, signed with the HeyPointer release key, licensed Apache-2.0). Maven Central is a default repository in current Android projects; if yours does not list it, add `mavenCentral()` to `repositories` in `settings.gradle` (or the root `build.gradle`).

```groovy
dependencies {
    implementation 'com.heypointer:heypointer-android:0.2.0'
}
```

```kotlin
// build.gradle.kts
dependencies {
    implementation("com.heypointer:heypointer-android:0.2.0")
}
```

The library has no AndroidX dependency; it needs `minSdk 21` and compiles against API 34. `consumer-rules.pro` ships inside the AAR and keeps the public entry point and the walkthrough types when the app uses R8 (checked with an R8-minified sample app).

### From a local Maven repository

`./gradlew :heypointer-android:publishToMavenLocal` (from a build that includes the module) writes the same coordinates to `~/.m2/repository`, unsigned and for local testing only. Consume it with `mavenLocal()`. A build that applies the module needs Android Gradle Plugin 7.1 or newer (`publishing.singleVariant`).

## Run the tests

`./gradlew :heypointer-android:testDebugUnitTest` runs the JVM tests (parser, suggestions and placement rules, including the 600dp and tablet cases, the client id checks and error messages, and the assist policy: every refusal reason, the allow case, label escaping and the off-by-default switch). The library has no AndroidX dependency. The customization tests cover label precedence and placeholder handling, that `heypointer_strings.xml` has exactly one entry per string key with the same English text, the theme defaults, merge, clamping and contrast helper, that the color and dimen resources equal the built-in defaults, and right-to-left placement.

## Status and limits

Verified: JVM tests, and a run inside a real app (the Echo music player sample) on an Android 14 emulator: rotation with a guide in progress (step and confirmed gate restored), Back, suggestions against a fake server, accessibility tree dump, and both source and artifact builds (also R8-minified). Not verified: a physical tablet or tablet emulator (placement is unit-tested only), TalkBack itself (only the accessibility tree was inspected, not speech or focus movement), the Android 13+ predictive-back path, process-death restore, Jetpack Compose (no `View` tree to search: it needs semantics), iOS (a separate adapter), or any app other than the one sample. A transparent overlay is added to the activity's window, so dialogs and popup menus (separate windows) cannot be highlighted.

Customization (labels, theme, launcher): verified by JVM tests only so far. Not yet checked on a device: dark theme (`values-night`), a translated or right-to-left layout, a custom typeface, `showLauncher = false` with `open()`, and TalkBack reading the localized descriptions.
