# Record steps (author mode)

Author mode lets the person who owns an app click through it once and get a flow draft, instead of writing every step by hand. It runs in the page, shows a small panel, watches what you do, and writes the steps as the same Markdown that `heypointer generate flow` writes. Nothing is sent anywhere.

It is meant for development and staging builds. A visitor never sees it unless the page's own code switched it on.

## Turn it on

Author mode is opt-in. There is no way to switch it on from a page that did not ask for it.

| How | Use it for |
|---|---|
| `new HeyPointer({ ..., author: true })`, `<heypointer-assistant author>` or `data-author` on the script tag | A build that always has it (a staging site) |
| `allowAuthorParam: true` (`allow-author-param`, `data-allow-author-param`) and open the page with `?heypointer-author=1` | A build that has it available, switched on per visit |
| `import { startAuthoring } from '@heypointerhq/sdk/author'` and call `startAuthoring()` | Your own button, a debug menu, tests |
| `<script src="heypointer.author.js" data-author></script>` on its own | A page that does not load the guide at all |

With `allowAuthorParam` and no `?heypointer-author=1`, nothing is loaded and no request is made for the author file. Author mode is a separate file (`heypointer.author.js`, or the `author` chunk of the npm package). The guide's own bundle contains none of its code: it only holds a small loader that fetches the author file when one of the switches above is present.

## Record a flow

1. Open the page with author mode on. Give the flow a title.
2. Press **Record**, then use the app the way a person would: click, type into fields, choose from lists.
3. Press **Pause** to move around without recording, **Undo last step** to drop the newest one.
4. Press **Stop and review**. The draft is shown as Markdown, with anything that needs fixing listed above it. **Copy Markdown** and **Download** stay disabled until the draft has a title and every step names a control.
5. From your project folder, run what the panel prints:

```sh
heypointer flows import buy-headphones.md --publish     # put it on your HeyPointer server
heypointer scan .                                        # or keep the file in your repo and scan
```

The panel stays small while recording so it does not cover the app. The ⇄ button moves it to the other side, `–` minimizes it and ✕ closes author mode (it asks first if there is a draft). **Alt+Shift+G** moves keyboard focus into the panel from anywhere on the page, so a recording can be done without a mouse.

## What a step looks like

| What you did | The step | Notes |
|---|---|---|
| Clicked a button, link, tab, menu item, checkbox, radio or switch | `Click "Save".` | The quoted text is the control's accessible name, read the way the guide reads it when it looks for the control |
| Typed into a text field | `Enter your email address in "Email address".` | Once per field, however much you typed |
| Changed a list | `Choose an option in "Country".` | The option you picked is not recorded |
| Chose a file | `Choose an option in "Attach invoice".` | The file is not recorded |
| Pressed Enter in a form | `Click "Search".` | The form's submit button |
| Went to another page | A note: `Now on /orders/:id` | A note, not a step. Query strings, fragments and record ids are dropped |

A step whose quoted label is a risky word (`Buy now`, `Delete`, `Send invoice`, `Pay`…) is written with `This is a consequential action.`, so the guide asks the user to confirm before it highlights it. Tick **Needs confirmation** on any other step to do the same.

## Status chips

Each step shows what the guide would find on this page, using the same resolver the guide uses at run time.

| Chip | Meaning | What to do |
|---|---|---|
| Unique control | Exactly one visible control has that text | Nothing |
| Ambiguous: N matches | Several controls share the text, so the guide would refuse to guess | Give the control an `aria-label` or visible text that is unique. "Add context" adds the surrounding dialog or section to the sentence for readers, but does not make the match unique |
| No accessible name | The control has no text or `aria-label` | Add one |
| Not found by the guide | A match exists, but not this control (a plain clickable `div`, a label longer than 72 characters) | Give it a role and a label, or shorten the text |
| Not on this page | Checked later, when the control is on another page | Fine for a multi-page flow |
| Contains page data | The text looks like a name, an email, an amount or a number | Rename the step so it names the control, not the data (see below) |
| Sensitive field | A password, one-time code or card field | Nothing: only its label is recorded |

## What is never recorded

- **Typed text.** Not in the draft, the Markdown, the panel or the stored copy. A test types 200 random strings and checks that none reaches any of them.
- **Chosen options and files.** Only the field's label.
- **Password, code and card fields** (`type=password`, `autocomplete` of `cc-*`, `one-time-code` or `*-password`, a name or id matching `pass`, `token`, `secret`, `otp`, `card`, `cvv`, `iban`…). Recorded as the field label with a "Sensitive field" chip.
- **Table rows and cells.** They usually hold page data, so clicks on them are off. A switch turns them on, and those steps carry the "Contains page data" chip.
- **URLs beyond the route.** No query string, no fragment, and ids in the path become `:id`.
- **Events a script fired.** Only real user input counts, so the guide's own Assist clicks and automation that fires events (such as Playwright's `fill()`) are not recorded.
- **Anything from its own panel.**

**Control labels can still contain page data.** A product named after a customer, a button reading `Email maria@example.com`: the label is the page's own text. The chip points out the likely cases, but read every step before you publish or share a draft. Limits: 100 steps per flow, 120 characters per step.

## A flow across several pages

While a draft exists, author mode keeps it (labels only, never values) in the browser tab's `sessionStorage` so a full page load does not lose it. The next page must switch author mode on again: with `author: true`, or with `allowAuthorParam` (the stored draft resumes without repeating the URL parameter). Stop, Discard and Close clear the stored copy, and so does closing the tab.

## Words and look

Every string is a label. Pass the keys that start with `author` in the same `labels` object the guide takes (for example `authorRecord`, `authorStatusRecording`), with `{count}`-style placeholders where the default has them. The guide ignores those keys. The panel follows the same `--hp-*` theme variables, `colorScheme`, `dir` and `lang` as the guide, and works right-to-left. The labels are listed in `src/author/labels.ts`.

## Programmatic use

```ts
import { startAuthoring } from '@heypointerhq/sdk/author';

const session = startAuthoring({ title: 'Buy headphones', autoRecord: true });
// ...later
session.getDraft();      // { title, entries } (labels only)
session.toMarkdown();    // the PRD file
session.stop();          // end the session and forget the stored draft
```

Options: `labels`, `theme`, `colorScheme`, `dir`, `lang`, `mountTo`, `title`, `autoRecord`, `recordRows`, `persist`, `onChange`. Only one session runs at a time.

## Limits

- Web only, in same-origin frames. A cross-origin iframe cannot be recorded. Android and other platforms have no recorder.
- The draft stays in your hands: there is no button that sends it to a HeyPointer server. Use the CLI commands above.
- Verified in Chromium. Other browsers are not tested.
- The panel is built from a constructable stylesheet, which a strict `style-src` allows; browsers without it get a `<style>` element, which a strict policy would block.
- A recording is only as good as the page's accessible names. A control with no text and no `aria-label` is flagged, not guessed.
