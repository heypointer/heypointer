# @heypointerhq/react

React component for HeyPointer. It renders the shared `<heypointer-assistant>` element and manages its lifecycle; the player itself lives in [`@heypointerhq/sdk`](../sdk/README.md).

```tsx
import { HeyPointerAssistant } from "@heypointerhq/react";

export function App() {
  return (
    <>
      {/* your app */}
      <HeyPointerAssistant baseUrl="https://your-heypointer-server" clientId="gfc_..." />
    </>
  );
}
```

| Prop | Meaning |
|---|---|
| `baseUrl` | HeyPointer API origin (required). Changing it remounts the guide. |
| `clientId` | Client id from `heypointer init` (`gfc_` + 24 hex, public). The server refuses guide requests without a valid one. |
| `targetTimeoutMs` | How long to wait for a target that appears late (default 1500). |
| `assist` | Start with assist mode on. The user can switch it off in the card; it is not remembered. See the [SDK README](../sdk/README.md#assist-mode). |
| `labels` | Override any user-visible string (translations). Plain text with `{placeholders}`. See [Customizing](../../docs/CUSTOMIZING.md). |
| `theme` | Colors, radius and font (`accent`, `accentFg`, `bg`, `fg`, ..., `dark: {...}`). Validated; same names as the `--hp-*` CSS variables. |
| `colorScheme` | `auto` (default), `light` or `dark`. |
| `dir`, `lang` | Force `ltr` or `rtl` for the guide only; by default it inherits the page. |
| `launcher` | `none` hides the built-in button; open the guide yourself with `ref.current.open()`. |
| `launcherSide` | `start` moves the button and goal card to the other edge. |

A `ref` gives access to the live player: `ref.current?.player()?.open()`.

## Install

```bash
npm install @heypointerhq/react react react-dom
```

`@heypointerhq/sdk` comes with it. `react` and `react-dom` 18 or newer are peer dependencies. Version 0.2.0. The packages are still `private` (not on a registry); until publishing is approved, install the tarball: `npm pack -w @heypointerhq/react`, then `npm install ./heypointer-react-0.2.0.tgz`. See [docs/PACKAGES.md](../../docs/PACKAGES.md). Install `@heypointerhq/sdk` and `@heypointerhq/contracts` tarballs the same way.

## Next.js and server rendering

The package is marked `'use client'` and registers the element in an effect, so a server render emits an inert `<heypointer-assistant>` tag and the browser upgrades it. Importing the SDK in Node is safe: nothing touches the DOM at import time. This is tested with `renderToString`; it has not been run inside a real Next.js app.

## Status

Verified: 6 tests that mount the real player in jsdom, cover `baseUrl` changes, unmount and server rendering. Peer dependencies: `react` and `react-dom` 18 or newer.

`npm test -w packages/react`
