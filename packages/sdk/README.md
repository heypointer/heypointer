# @heypointerhq/sdk

The in-app guide. It turns a typed or spoken goal into a coachmark walkthrough of the host page: the page dims, a spotlight cuts out the real control, and a tooltip anchored to it shows `2 / 5`, a short instruction, **Skip** and **Next**. It only guides. It never clicks, types into or submits host elements.

One engine (this package) serves every web framework. The framework packages only manage lifecycle.

## Install

```bash
npm install @heypointerhq/sdk
```

```ts
import { HeyPointer } from "@heypointerhq/sdk";          // ESM, types included, CSS compiled in: no Tailwind plugin needed
import { defineHeyPointerElement } from "@heypointerhq/sdk/element";   // registers <heypointer-assistant> when you call it
```

For a plain `<script>` tag, copy `node_modules/@heypointerhq/sdk/dist/heypointer.global.js` (export `@heypointerhq/sdk/global`) to your static files. Version 0.2.0. The packages are still `private` (not on a registry); until publishing is approved, install the tarball: `npm pack -w @heypointerhq/sdk`, then `npm install ./heypointer-sdk-0.2.0.tgz`. See [docs/PACKAGES.md](../../docs/PACKAGES.md).

## Add it to an app

**Script tag** (any web app, no build step):

```html
<script src="https://your-cdn/heypointer.global.js" data-base-url="https://your-heypointer-server" data-client-id="gfc_..." defer></script>
```

**Global component** (any framework that can render a custom element):

```html
<heypointer-assistant base-url="https://your-heypointer-server" client-id="gfc_..."></heypointer-assistant>
```

Attributes: `base-url` (required), `client-id` (required in practice), `target-timeout-ms`, `assist`, and the customization attributes `labels`, `theme`, `color-scheme`, `dir`, `lang`, `launcher`, `launcher-side` (see [Customizing](#customizing)). Changing `base-url`, `client-id`, `assist` or `target-timeout-ms` remounts; the customization attributes update in place; removing the element destroys the guide. `element.open()`, `element.close()` and `element.ask(goal)` drive it; `element.player` is the live `HeyPointer`.

**From code:**

```ts
import { HeyPointer } from "@heypointerhq/sdk";
const gf = new HeyPointer({ baseUrl: "http://localhost:8791", clientId: "gfc_..." });
```

Options: `baseUrl`, `clientId`, `fetch`, `recorderFactory`, `speechSupported`, `targetTimeoutMs` (default 1500), `mountTo`, `assist`, `onAssist`, `labels`, `theme`, `colorScheme`, `dir`, `lang`, `launcher`, `launcherSide`. Methods: `open()`, `close()`, `ask(goal)`, `next()`, `prev()`, `setLabels()`, `setTheme()`, `setColorScheme()`, `setLayout()`, `destroy()`. Events (bubbling, composed, on the guide's root): `heypointer:open`, `heypointer:close`, `heypointer:assist`.

### Client ID

The server only answers guide requests that carry a client id, sent as the `X-HeyPointer-Client` header on `POST /api/walkthrough`. You get one from `heypointer init`. It looks like `gfc_` plus 24 hex characters and is **public**, like a Stripe publishable key: it is fine in page source, and the server limits it with allowed origins and rate limits. Never put the server API key in an app.

An id that is clearly malformed is rejected in the browser without a request. A missing or unknown id, a page origin the client does not allow, and rate limiting each show a plain message in the guide (never the raw server response). Transcription requests do not carry the id.

Build the script-tag bundle with `npm run build -w packages/sdk`: `dist/heypointer.global.js`, about 57 kB (16.4 kB gzip) with the compiled CSS included. Without `data-base-url` it only registers the element and exposes the `HeyPointer` class as `window.HeyPointerGlobal.HeyPointer`.

## Frameworks and platforms

| Platform | Package | Status |
|---|---|---|
| Plain HTML, any web app | `heypointer.global.js`, `<heypointer-assistant>` | Verified in a real browser: Chromium, Firefox, WebKit |
| React, Next.js | [`@heypointerhq/react`](../react/README.md) | Verified in jsdom with the real player, incl. server render. Not tested in a real Next.js app. |
| Vue, Nuxt | [`@heypointerhq/vue`](../vue/README.md) | Verified in jsdom with the real player, incl. server render. Not tested in a real Nuxt app. |
| Angular | none | Not built. The element should work with `CUSTOM_ELEMENTS_SCHEMA`; untested. |
| Svelte, SvelteKit | none | Not built. Untested. |
| Android (native views) | [`packages/android`](../android/README.md) | Prototype. Verified in one app on an Android 14 emulator, including rotation, Back and the accessibility tree. Not Jetpack Compose, tablets or TalkBack speech. |
| iOS, React Native, Flutter | none | Not built. Native apps have no DOM, so the CSS-selector targets cannot be reused: each platform needs its own renderer and a resolver over accessibility identifiers or semantics labels. Do not describe these as supported. |

Importing the SDK in Node (server rendering) is safe and tested: nothing touches the DOM at import time.

## Behavior

- **Server calls:** `POST /api/walkthrough {goal, context:{url}}` and `POST /api/transcribe` (raw audio body).
- **Validation:** responses are checked client-side. A step with no evidence, an unknown action, or `insufficient_evidence` carrying steps is rejected and shown as an error.
- **Target resolution:** selectors, then role+text, then label, then text. Hidden elements are skipped. Several matches are reported as ambiguous ("I won't guess", no highlight, Try again / Skip). If a target appears late (route change, dialog), it waits up to `targetTimeoutMs`. A missing target shows an alert with "Try again"; the user can still go Back or Next.
- **Did you mean:** when the server answers `insufficient_evidence` with `suggestions` (up to 5 `{workflowId, title}`, contract 1.5.0), the message is followed by a "Did you mean:" group of buttons. Choosing one asks the server for that title as the goal. Titles are untrusted: rendered with `textContent`, trimmed, dropped if longer than 200 characters or duplicated, and the list is capped at 5; malformed entries are dropped without failing the reply, and suggestions on an `ok` walkthrough are ignored. The buttons are native buttons (Tab and Enter or Space work), grouped under the "Did you mean:" label, and the choices are announced in the live region. Unit-tested in jsdom against fake responses; the server does not produce suggestions yet.
- **Confirmation gate:** steps the server marks `requiresConfirmation`, and any click that looks like send, submit, delete, remove, pay, purchase, buy, transfer, publish, revoke or deploy, are not highlighted and cannot be advanced until the user ticks the confirmation box.
- **When the control goes away:** the guide watches the highlighted control. If it is removed, hidden (`display: none`, `hidden`, `visibility: hidden`, a closed `<dialog>`, `content-visibility`), made inert or collapsed to nothing, because the user acted, the highlight, the dimmer and the arrow are dropped and the card says "It looks like you did that. Press Next to continue." It then waits for Next; nothing advances on its own and assist mode clicks nothing. If the control comes back (the modal is reopened) the highlight returns. If the host app only swaps the node for an identical one in the same container, the guide follows it. It never moves onto a matching control elsewhere on the page. Cost: one `MutationObserver` on the document (visibility-related attributes and child lists), at most one check per frame after a relevant change, and a one-second follow-up only while a transition or animation that contains the control is running; it stops when the guide closes or is destroyed.
- **Coachmark:** the tooltip is placed below, above, right or left of the target, clamped to the viewport, and on narrow screens (600px or less) below or above full width. A `ResizeObserver` and scroll listeners keep the cutout and ring on the target after resize and scroll.
- **Audio:** the Speak button appears only when `getUserMedia` and `MediaRecorder` exist. Denied mic, or a server without transcription (501), shows a message and keeps the typed input.
- **Accessibility:** the UI is a Shadow DOM `role="dialog"`. Step changes go to an `aria-live` region and move focus to the step title. Escape closes. The highlight and dimmer are `aria-hidden` and ignore pointer events, so the user performs the action on the real control. Motion respects `prefers-reduced-motion`.
- **Host apps:** a modal dialog in the host makes the guide panel inert. Use non-modal dialogs for flows you want guided.

## Assist mode

By default the guide never acts: it highlights and the user clicks. The goal card (and the goal tools inside the coachmark) has a checkbox, **Assist: do safe clicks for me when I press Next**, off by default. With it on, pressing Next performs the step's click for the user, and says so (`Clicked "Search" for you.`). It is opt-in per session (kept in memory only); host apps can start it on with `assist: true`, the `assist` attribute, `data-assist` on the script tag, or the React/Vue `assist` prop.

The guide clicks only when **all** of these hold, and otherwise Next just advances as before:

- the step is a `click` and is not gated (`requiresConfirmation` or a consequential label such as buy, delete, pay, send, place order);
- the target resolves to exactly one visible element, the one that is highlighted (never a guess);
- it is not disabled, `aria-disabled`, `inert`, a file input, or part of the guide itself;
- it is not a link that leaves the page (another origin, `target=_blank`, `download`, `mailto:`, `javascript:`);
- nobody has already clicked it since the step was shown (so a toggle such as "Add to favourites" is never undone), and the guide has not already clicked that step once.

It never types text, never chooses an option, and steps it will not do show "You need to do this one yourself." After a click the guide waits for the page to stop changing, then looks for the next control; if it does not appear the usual "I can't find it" recovery shows and the card still says what was clicked. If the click itself throws, the card says so and the step stays put; the guide never retries on its own.

Audit trail: the `onAssist({ stepIndex, action: 'click', label })` option and a `heypointer:assist` `CustomEvent` (bubbles, composed, same `detail`) fire once per assisted click, so a host app can log it.

## Record steps (author mode)

Click through your app once and get a flow draft: `author: true` (or `data-author`, or `?heypointer-author=1` when the host sets `allowAuthorParam`) shows a small panel that records the controls you use, never what you type, and writes the Markdown `heypointer flows import` and `heypointer scan` read. It loads as its own file (`heypointer.author.js`, or `@heypointerhq/sdk/author`), so pages that do not ask for it never download it. See [docs/AUTHORING.md](../../docs/AUTHORING.md).

## Customizing

Labels (every string, so translation is configuration), theme (colors, radius, font as `--hp-*` CSS variables or a validated `theme` option, with dark-scheme counterparts and a forced `colorScheme`), stable `::part()` names, right-to-left, and a hideable launcher with `open()`/`close()` for your own button. Full reference, with the rules for what a value may contain and the Android equivalents: [docs/CUSTOMIZING.md](../../docs/CUSTOMIZING.md).

```html
<heypointer-assistant base-url="..." client-id="gfc_..."
  labels='{"next":"Weiter","stepProgress":"Schritt {current} von {total}"}'
  theme='{"accent":"#6d28d9","accentFg":"#ffffff","dark":{"accent":"#a78bfa","accentFg":"#1e1b4b"}}'></heypointer-assistant>
```

```css
[data-heypointer-root]::part(button-primary) { border-radius: 4px; }
```

Label and theme values are validated: plain text only, CSS colors, lengths and font lists only, so neither can inject HTML or CSS. In development builds (tests, source imports) a rejected value logs one `console.warn`; the shipped bundles are silent.

## Styling

`src/styles.css` is Tailwind CSS v4 (theme and utilities, no preflight) compiled into the shadow root, so nothing leaks into or out of the host page except the documented hooks: the `--hp-*` custom properties and the `::part()` names. The internal `--color-hp-*` tokens are private and read the public variables with a default. The build pins a modern CSS target (Chrome 100, Safari 15.4, Firefox 100) so logical properties stay as written; an older target rewrites them into `:lang()` fallbacks that follow the language instead of the text direction. Tailwind seeds some utility variables with `@property`, which browsers ignore inside a shadow root, so `:host` sets those defaults itself; an E2E test checks the highlight ring really computes to a solid border.

The built package (`dist/`, the script-tag bundle, and the React and Vue wrappers) has the CSS compiled in, so consuming apps need no Tailwind setup. Only building this repo's SDK from source needs `@tailwindcss/vite`, because the stylesheet is imported with `?inline`.

## Test

`npm test -w packages/sdk` (vitest + jsdom, includes a Node-only import test). Browser behavior is covered by an end-to-end suite that is not part of this repository.

## Limits

Only the web DOM is supported. Real microphone capture is untested. Targets inside iframes or other shadow roots are not resolved. Browser coverage is Chromium, Firefox and WebKit on the shop and global-bundle specs, Chromium elsewhere.
