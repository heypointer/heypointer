# HeyPointer: client libraries

The client side of HeyPointer, which gives people in-app guidance grounded in what a team already wrote. A guide highlights the real control on screen, step by step. It never invents a step, and it does not click for the user unless they turn Assist on.

**Status: early prototype.** It has been tried on a few sample apps only. The packages are not published to npm or Maven yet, so build them from source.

Docs: <https://heypointer.com/docs/>

## What is in this repository

| Path | What it is |
|---|---|
| `packages/sdk` | The web guide: `<heypointer-assistant>`, the script-tag bundle, targeting, the coachmark, theming and labels, and record-steps authoring |
| `packages/react`, `packages/vue` | Components around the web guide |
| `packages/android` | The Android adapter (a Gradle library) |
| `packages/contracts` | Shared types and schemas for the messages the guide sends and receives |
| `samples/*` | Small apps that use the guide (plain HTML, Vue, React) |
| `docs/` | Guides for customizing the guide, recording steps, running it behind your own backend, and CI |

The HeyPointer CLI and the HeyPointer service are developed in a private repository.

## Build and test

Requires Node 20.19+ or 22.12+ and npm 11.

```bash
npm ci
npm run build
npm run typecheck
npm test
```

The Android library builds with Gradle 7.6 and JDK 17: `gradle :heypointer-android:testDebugUnitTest`.

## How this repository is produced

This repository is generated from a private source repository by an export script that copies the public packages and docs and checks them for leaks. Please open an issue rather than a pull request for now; changes are made in the source and appear here with the next sync.

## License

Apache-2.0. See `LICENSE` and `NOTICE`.
