# @heypointerhq/vue

Vue 3 component for HeyPointer. It renders the shared `<heypointer-assistant>` element and manages its lifecycle; the player itself lives in [`@heypointerhq/sdk`](../sdk/README.md).

```vue
<script setup lang="ts">
import { HeyPointerAssistant } from "@heypointerhq/vue";
</script>

<template>
  <!-- your app -->
  <HeyPointerAssistant base-url="https://your-heypointer-server" client-id="hpc_..." />
</template>
```

| Prop | Meaning |
|---|---|
| `baseUrl` | HeyPointer API origin (required). Changing it remounts the guide. |
| `clientId` | Client id from `heypointer init` (`hpc_` + 24 hex, public). The server refuses guide requests without a valid one. |
| `targetTimeoutMs` | How long to wait for a target that appears late (default 1500). |
| `assist` | Start with assist mode on. The user can switch it off in the card; it is not remembered. See the [SDK README](../sdk/README.md#assist-mode). |
| `labels` | Override any user-visible string (translations). Plain text with `{placeholders}`. See [Customizing](../../docs/CUSTOMIZING.md). |
| `theme` | Colors, radius and font (`accent`, `accentFg`, `bg`, `fg`, ..., `dark: {...}`). Validated; same names as the `--hp-*` CSS variables. |
| `colorScheme` | `auto` (default), `light` or `dark`. |
| `dir`, `lang` | Force `ltr` or `rtl` for the guide only; by default it inherits the page. |
| `launcher` | `none` hides the built-in button; open the guide yourself with `open()` on the component ref`. |
| `launcherSide` | `start` moves the button and goal card to the other edge. |

The component exposes `player()` for the live player: `guide.value?.player()?.open()`.

## Install

```bash
npm install @heypointerhq/vue vue
```

`@heypointerhq/sdk` comes with it. `vue` 3.3 or newer is a peer dependency. Version 0.2.1. Install it with `npm install @heypointerhq/vue`; `@heypointerhq/sdk` and `@heypointerhq/contracts` come with it.

## Nuxt and server rendering

The element is registered in `onMounted`, so a server render emits an inert `<heypointer-assistant>` tag and the browser upgrades it. Importing the SDK in Node is safe. This is tested with `renderToString`; it has not been run inside a real Nuxt app.

## Status

Verified: 5 tests that mount the real player in jsdom, cover `baseUrl` changes, unmount and server rendering. Peer dependency: `vue` 3.3 or newer.

`npm test -w packages/vue`

---

[Website](https://heypointer.com/) · [Docs](https://heypointer.com/docs/) · [X](https://x.com/heypointer) · [Instagram](https://www.instagram.com/heypointer/) · Support: [Buy Me a Coffee](https://buymeacoffee.com/heypointer) · [Ko-fi](https://ko-fi.com/heypointer)
