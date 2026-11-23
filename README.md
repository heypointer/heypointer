# HeyPointer: client libraries

The client side of HeyPointer, which gives people in-app guidance grounded in what a team already wrote. A guide highlights the real control on screen, step by step. It never invents a step, and it does not click for the user unless they turn Assist on.

**Status: early access.** The web, React and Vue packages are on npm (`@heypointerhq/sdk`, `@heypointerhq/react`, `@heypointerhq/vue`, `@heypointerhq/contracts`) and the Android library is on Maven Central (`com.heypointer:heypointer-android`). Accounts on the hosted service are by invitation, sent in small batches from the waitlist.

<p>
  <a href="https://heypointer.com/"><b>Website</b></a> &nbsp;·&nbsp;
  <a href="https://heypointer.com/docs/"><b>Docs</b></a> &nbsp;·&nbsp;
  <a href="https://heypointer.com/waitlist/"><b>Join the waitlist</b></a>
</p>

<p>
  <a href="https://x.com/heypointer"><img src="assets/social/x.svg" alt="HeyPointer on X" width="24" height="24"></a>
  &nbsp;
  <a href="https://www.instagram.com/heypointer/"><img src="assets/social/instagram.svg" alt="HeyPointer on Instagram" width="24" height="24"></a>
</p>

Support HeyPointer: [Buy Me a Coffee](https://buymeacoffee.com/heypointer) · [Ko-fi](https://ko-fi.com/heypointer)

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

## Contributing

Issues are welcome: bug reports, questions and ideas. We are not accepting pull requests yet.

## License

Apache-2.0. See `LICENSE` and `NOTICE`.
