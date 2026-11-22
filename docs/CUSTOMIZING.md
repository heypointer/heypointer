# Customizing the guide

Everything the user sees can be changed without forking the SDK: the **labels** (every string, so translation is a config change), the **theme** (colors, radius, font), the **structure** through stable `::part()` names, the **text direction**, and **who opens the guide** (your own button instead of ours). Web and Android use the same words, so a design written for one carries to the other.

What cannot be changed here: the step titles, instructions, "Did you mean" suggestions and "not covered" reasons. They come from your knowledge base, so write your flows in the language you want users to read.

| | Web (`@heypointerhq/sdk`) | Android (`packages/android`) |
|---|---|---|
| Strings | `labels` option, attribute, prop | `HeyPointerLabels`, or `heypointer_*` string resources |
| Colors, radius, font | `theme` option, or `--hp-*` CSS variables | `HeyPointerTheme`, or `heypointer_color_*` resources |
| Dark mode | `colorScheme`, `--hp-dark-*` | `values-night` resources |
| Structure | `::part()` | not available (style through the theme) |
| Direction | `dir`, `lang` | the app's layout direction (`supportsRtl`) |
| Own button | `launcher: 'none'`, `open()` | `showLauncher = false`, `open()` |
| Side | `launcherSide: 'start'` | `launcherSide = LauncherSide.START` |

## Web

Every option has three spellings. Use whichever fits how you integrate:

| Option | Script tag | `<heypointer-assistant>` | React / Vue prop | `new HeyPointer({...})` |
|---|---|---|---|---|
| labels | `data-labels='{"next":"Weiter"}'` | `labels='{"next":"Weiter"}'` or `el.labels = {...}` | `labels` | `labels` |
| theme | `data-theme='{"accent":"#7c3aed"}'` | `theme='...'` or `el.theme = {...}` | `theme` | `theme` |
| colorScheme | `data-color-scheme="dark"` | `color-scheme="dark"` | `colorScheme` | `colorScheme` |
| dir | `data-dir="rtl"` | `dir="rtl"` | `dir` | `dir` |
| lang | `data-lang="ar"` | `lang="ar"` | `lang` | `lang` |
| launcher | `data-launcher="none"` | `launcher="none"` | `launcher` | `launcher` |
| launcherSide | `data-launcher-side="start"` | `launcher-side="start"` | `launcherSide` | `launcherSide` |

Labels, theme, color scheme, direction, language, launcher and side change **in place**: the open guide updates and keeps its step. Changing `base-url`, `client-id`, `assist` or `target-timeout-ms` remounts it.

### Labels and translation

```html
<heypointer-assistant base-url="https://guide.example.com" client-id="gfc_..."
  labels='{"launcher":"Ayuda","submit":"Mostrar","next":"Siguiente","back":"Atrás","skip":"Omitir",
           "stepProgress":"Paso {current} de {total}","tourCount":"{current} de {total}"}'></heypointer-assistant>
```

```ts
import { DEFAULT_LABELS } from "@heypointerhq/sdk";   // every key, with its English text
el.labels = { next: "Weiter" };                     // change at runtime (a language switch); el.labels = undefined resets
```

Rules, so a bad value can never break or endanger the guide:

- A value is **plain text**. It is only ever written with `textContent` or `setAttribute`, so `<b>` or a script in a label appears as characters and runs nothing.
- `{placeholders}` are substituted in one pass: `{current}`, `{total}`, `{label}`, `{goal}`, `{count}`, `{title}`, `{instruction}`, `{value}`, `{list}`, `{host}`, `{status}`. A value that itself contains `{x}` is not expanded again.
- 1 to 300 characters. A value that is not a string, is empty, is too long, or **leaves out a placeholder that message needs** (`stepProgress` needs `{current}` and `{total}`, `assistClicked` needs `{label}`) is ignored and the English default is used for that key. Unknown keys are ignored. `done` may drop `{goal}` and `stepAnnounce` may drop `{instruction}`.
- In development builds (tests, source imports) each problem is logged once with `console.warn`. The shipped bundles stay silent.

The keys cover the launcher, the goal card, every button, progress, the Done message, "Did you mean", the confirmation gate, assist mode, the "I can't find it" messages, voice, the client-id and rate-limit errors, and the accessible names (`dialogName`, `closeLabel`, `goalAria`). Read `DEFAULT_LABELS` for the full list.

### Theme

The theme is a set of CSS custom properties. Set them in your own stylesheet, on the element or anywhere above it:

```css
heypointer-assistant {
  --hp-accent: #7c3aed;       /* launcher, Next, links, focus tint */
  --hp-accent-fg: #ffffff;    /* text on the accent */
  --hp-radius: 8px;
  --hp-font: "Inter", system-ui, sans-serif;
  --hp-font-size: 15px;
}
```

| Variable | What it colors |
|---|---|
| `--hp-accent`, `--hp-accent-fg` | launcher, primary buttons, Skip, the Assist checkbox; the text on them |
| `--hp-bg`, `--hp-fg`, `--hp-muted` | card background, text, secondary text |
| `--hp-border` | card and control borders |
| `--hp-warn-bg`, `--hp-warn-border` | the confirmation gate box |
| `--hp-err-bg`, `--hp-err-border` | alerts |
| `--hp-focus`, `--hp-halo` | the keyboard focus ring and its outer halo |
| `--hp-ring` | the ring around the control being pointed at |
| `--hp-dim` | the dimmed page behind the cutout |
| `--hp-radius`, `--hp-font`, `--hp-font-size` | corner radius, font family, base text size (some text is sized relative to it) |

The same names without the dashes, in camelCase, go in the `theme` option: `{ accent, accentFg, bg, fg, muted, border, warnBg, warnBorder, errBg, errBorder, focus, halo, ring, dim, radius, font, fontSize }`. The option writes the variables for you, **after checking them**: only CSS colors (`#hex`, `rgb()`, `hsl()`, `oklch()`, named colors, `var(--x)`), plain lengths (`8px`) and font-family lists are accepted. Anything with `;`, braces, `url(`, `@`, comments or newlines is dropped, so a theme from a CMS or a URL cannot inject CSS.

**Dark mode.** By default the guide follows `prefers-color-scheme`. Set `colorScheme: 'light'` or `'dark'` to force one. Dark-scheme values go in `--hp-dark-*` (for example `--hp-dark-bg`) or in `theme.dark`:

```ts
{ accent: "#6d28d9", accentFg: "#ffffff", dark: { accent: "#a78bfa", accentFg: "#1e1b4b", bg: "#0b1020", fg: "#f5f5f5" } }
```

In dark mode the **accent, its text color and the ring** fall back to your light value when you give no dark one, so a single brand color works in both. The **surfaces** (bg, fg, muted, border, notices) never fall back to a light value: a light `--hp-bg` with the dark text color would be unreadable, so set the bg and fg of a scheme together.

Keep text at **4.5:1** against its background (WCAG AA). A development build warns when your accent and its text, or your fg and bg, are below that; it never blocks or changes anything. Remember the accent is also used as text (Skip, links): check it on both backgrounds.

### Structure: `::part()`

Colors and sizes cover most re-skins. For anything else, the pieces have stable part names. The guide lives in a shadow root on a `<div data-heypointer-root>`, so select that div:

```css
[data-heypointer-root]::part(button-primary) { border-radius: 4px; text-transform: uppercase; }
[data-heypointer-root]::part(launcher)       { letter-spacing: .05em; }
[data-heypointer-root]::part(highlight)      { border-color: hotpink; border-width: 4px; }
[data-heypointer-root]::part(card)           { max-width: 360px; }
```

If you mount `<heypointer-assistant>`, the div is its child, so `heypointer-assistant [data-heypointer-root]::part(...)` works too. (`heypointer-assistant::part(...)` does not: a part is only visible on the element that owns the shadow root, which is the inner div.) Page styles win over the guide's own styles, so a `::part()` rule needs no `!important`.

| Part | Element |
|---|---|
| `launcher` | the built-in "Guide me" button |
| `panel` | the goal card; the coachmark has `panel card` |
| `card` | the coachmark (step) card |
| `title`, `text`, `progress` | headings, body text, "Step n of m" / "n / m" |
| `actions` | the Skip / Next row |
| `button`, `button-primary`, `button-secondary` | every button; Show me and Next are primary |
| `close`, `goal-input` | the × button, the goal text box |
| `alert`, `warning`, `hint` | error boxes, the confirmation gate, small notes (assist hint, "you did that") |
| `suggestions`, `suggestion` | the "Did you mean" group and its buttons |
| `toggle` | the Assist checkbox row |
| `evidence`, `tools` | the Source details, the "Change goal or use voice" details |
| `highlight`, `spotlight`, `arrow` | the ring around the control, the dimmer, the pointer |

Class names inside the shadow root are private and may change; parts and the `--hp-*` variables are the contract.

### Direction and language

`dir="rtl"` (or `dir: 'rtl'`) forces right-to-left for the guide only. Left alone (`auto`), it **inherits the page direction**, which is what you want on an Arabic or Hebrew site. Layout uses logical properties, so the launcher and goal card sit on the reading end (the left in RTL), text aligns to the start, and the coachmark prefers the reading-end side when it has to sit beside the control (the left in RTL; below and above are tried first, as in LTR). `lang` sets the language of the guide for screen readers.

`launcherSide: 'start'` moves the launcher and goal card to the other edge, in either direction.

### Your own button

```html
<heypointer-assistant base-url="..." client-id="gfc_..." launcher="none"></heypointer-assistant>
<button id="help">Help</button>
<script>
  const guide = document.querySelector("heypointer-assistant");
  document.getElementById("help").addEventListener("click", () => guide.open());
</script>
```

`open()`, `close()` and `ask(goal)` exist on the element, the player (`el.player`) and the React ref (`ref.current.open()`) and Vue exposed methods. `close()` and Escape give focus **back to your button**. The guide dispatches `heypointer:open` and `heypointer:close` (bubbling, composed) once per real change, and `heypointer:assist` for each assisted click, so you can track usage.

## Android

The same three ideas, in Android's own terms. Full detail and code are in the [Android README](../packages/android/README.md#customizing):

- **Labels:** every string is a `heypointer_*` string resource. Declare the same name in your app to change it, or in `values-xx/` to translate. `HeyPointerLabels` overrides at runtime. A blank or malformed value is ignored.
- **Theme:** colors and sizes are `heypointer_*` resources with a `values-night` dark set, so the guide follows system dark mode with no code. `HeyPointerTheme` (accent, onAccent, surface, onSurface, mutedText, scrim, ring, corner radii, text scale, typeface) overrides at runtime. A debuggable build logs a warning for pairs below 4.5:1.
- **Launcher:** `showLauncher = false` plus `guide.open()` from your own control; `launcherSide = LauncherSide.START`.

```kotlin
HeyPointer.install(
    this, url, clientId,
    labels = HeyPointerLabels(next = "Weiter"),
    theme = HeyPointerTheme(accent = Color.parseColor("#7c3aed"), onAccent = Color.WHITE),
    showLauncher = false,
)
```

## Checklist for a branded guide

1. Translate or reword `labels`; keep every `{placeholder}` the English message has.
2. Set `accent` and `accentFg`, then **check both schemes**: the accent is used as text on the page background too.
3. Set a `dark` accent if your brand color is dark.
4. Set `dir` only if the guide's direction differs from the page.
5. Decide whether the built-in button stays; if not, wire your own to `open()`.
6. Run your accessibility checker with the guide open on the goal card and on a step, in light and dark, and at 320 px.
