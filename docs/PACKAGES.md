# Packages: install, use, version, release

Four workspace packages are built, typed and versioned so they can be installed like any npm package: `@heypointerhq/sdk`, `@heypointerhq/react`, `@heypointerhq/vue` and the shared `@heypointerhq/contracts`. The Android adapter is a Gradle library. All are at **0.2.0**, still `"private": true`, and have never been published. Publishing is a separate, explicit decision (see "Licence and publishing").

Until a package is published, install it from a tarball:

```bash
npm pack -w @heypointerhq/sdk --pack-destination /tmp/hp-packs     # also: contracts, react, vue
npm install /tmp/hp-packs/heypointer-sdk-0.2.0.tgz /tmp/hp-packs/heypointer-contracts-0.2.0.tgz
```

Install a package together with the `@heypointerhq/*` packages it depends on (listed below), because none of them is on a registry yet.

## What each package is

| Package | Use it for | Entry points | Depends on |
|---|---|---|---|
| `@heypointerhq/sdk` | The in-app guide (spotlight + tooltip). Framework neutral. | `.` (ESM), `./element` (ESM), `./global` (IIFE script-tag bundle) | `@heypointerhq/contracts` (types only) |
| `@heypointerhq/react` | `<HeyPointerAssistant>` for React 18+ and Next.js. | `.` | `@heypointerhq/sdk`; peers `react`, `react-dom` |
| `@heypointerhq/vue` | `<HeyPointerAssistant>` for Vue 3.3+ and Nuxt. | `.` | `@heypointerhq/sdk`; peer `vue` |
| `@heypointerhq/contracts` | Shared zod schemas and types for walkthroughs, flows and the knowledge base. | `.` | `zod` |

The Android adapter (`packages/android`) is a Gradle library, not an npm package.

Every package ships `dist/` (ESM `.js`, `.d.ts`, source maps) and `src/` (so source maps resolve), is ESM only, and needs Node `^20.19.0 || >=22.12.0` where Node is involved. The `exports` maps list `types` first, then `import`. Server-side rendering is safe: importing the SDK, React or Vue packages never touches the DOM.

## Web: install and import

The compiled Tailwind stylesheet is inside the SDK's JavaScript (the guide lives in a shadow root). A consumer needs **no Tailwind, no Tailwind plugin and no CSS import**.

### Script tag (any web app)

```bash
npm install @heypointerhq/sdk
cp node_modules/@heypointerhq/sdk/dist/heypointer.global.js public/    # or serve it from your CDN
```

```html
<script src="/heypointer.global.js" data-base-url="https://your-heypointer-server" data-client-id="hpc_..." defer></script>
```

Guide requests need a client id (`data-client-id`, from `heypointer init` or `heypointer clients create`); it is public, not a secret. The look and every string can be changed with `data-theme`, `data-labels` and friends ([CUSTOMIZING.md](CUSTOMIZING.md)); an app that needs real access control proxies through its own backend ([BACKEND_PROXY.md](BACKEND_PROXY.md)).

`import.meta.resolve("@heypointerhq/sdk/global")` points at the same file. Without `data-base-url` the bundle only registers `<heypointer-assistant>` and exposes `window.HeyPointerGlobal.HeyPointer`. The bundle is about 16.4 kB gzip (56.7 kB raw) with the stylesheet compiled in, so a host app needs no Tailwind setup. This is the only entry with an import-time side effect, and `package.json` declares it in `sideEffects`.

### React

```bash
npm install @heypointerhq/react react react-dom
```

```tsx
import { HeyPointerAssistant } from "@heypointerhq/react";

export function App() {
  return <HeyPointerAssistant baseUrl="https://your-heypointer-server" />;
}
```

### Vue

```bash
npm install @heypointerhq/vue vue
```

```vue
<script setup lang="ts">
import { HeyPointerAssistant } from "@heypointerhq/vue";
</script>
<template><HeyPointerAssistant base-url="https://your-heypointer-server" /></template>
```

### Plain ESM (any bundler, or the custom element)

```ts
import { HeyPointer } from "@heypointerhq/sdk";
const guide = new HeyPointer({ baseUrl: "https://your-heypointer-server" });

// or register <heypointer-assistant> and put it in any template:
import { defineHeyPointerElement } from "@heypointerhq/sdk/element";
defineHeyPointerElement();
```

Your server must allow your web origin (`HEYPOINTER_CORS_ORIGINS`).

## Licence and publishing

These packages are licensed under Apache-2.0 (see `LICENSE` and `NOTICE`). When they are published, it will be under the npm organization `@heypointerhq`. Until then every package stays `"private": true`, and nothing in this repository publishes anything.

## Versioning policy

- **One version for all packages** (lockstep). A release bumps all of them, even those with no code change, so "HeyPointer 0.2.0" always means one tested set.
- Inter-package dependencies are `^<version>` (for example `^0.2.0`), never `*` or an exact pin. Before 1.0, caret means "same minor": `^0.2.0` accepts 0.2.x only, so every minor bump needs its dependents' ranges updated in the same commit.
- Before 1.0, a minor bump (0.2 to 0.3) may break the API; a patch (0.2.0 to 0.2.1) must not. From 1.0, semver as usual.
- `@heypointerhq/contracts` changes are the most sensitive: they cross the wire between the SDK and the HeyPointer service. Follow the "Changing a contract" rules in its README and bump `CONTRACT_VERSION` where they say so.

## How it is built

| Package | Build | Output |
|---|---|---|
| contracts, react, vue | `tsc -p tsconfig.build.json` | `dist/*.js`, `*.d.ts`, `*.map` |
| sdk | `vite build -c vite.lib.config.ts` (ESM, CSS inlined), `vite build -c vite.global.config.ts` (IIFE), `tsc -p tsconfig.build.json` (declarations only) | `dist/index.js`, `element.js`, `chunk-element.js`, `heypointer.global.js`, `*.d.ts`, `*.map` |

`npm run build` only overwrites files; `npm run clean` (per package) removes `dist`.

Repo-only details (customers never see them):

- The `exports` maps also carry a `source` condition pointing at `src/*.ts`. `tsc` uses `customConditions: ["source"]` in the package tsconfigs, so workspace development never needs a build. Bundlers do not set `source`, so customers get `dist`.
- `typecheck` of contracts, sdk, react and vue first emits their declarations (`pretypecheck`). Packages that do not use the `source` condition (the samples) resolve the `types` condition to `dist/*.d.ts`, so a clean checkout can run `npm run typecheck` before `npm run build`. If `"customConditions": ["source"]` is added to `tsconfig.base.json`, the samples would not need this and the hooks can go.
- The sample apps import `@heypointerhq/react` and `@heypointerhq/vue` from `dist`, like a customer. Run `npm run build` once before starting them.
