# samples/html-team

Plain HTML and JavaScript, no framework and no build step for the app code. It adds HeyPointer with one script tag:

```html
<script src="/heypointer.global.js" data-base-url="http://localhost:8791" data-client-id="gfc_..." defer></script>
```

`src/main.js` injects that tag, taking the API address from `?api=` and the client id from `?client=` (or `VITE_HEYPOINTER_CLIENT_ID`). Add `?sdk=element` to use `<heypointer-assistant>` instead. The bundle is the SDK's own script-tag build (`npm run build -w packages/sdk`), served from its `dist` folder.

Scenario: **Acme Workspace**, Team page, Invite teammate dialog. Try the goal `invite a teammate`. "Send invite" is simulated and nothing leaves the browser.

## Run

```sh
# from the repo root, with the API on :8791 (see the root README)
npm run dev -w samples/html-team
```

Open the page with `?api=http://localhost:8791&client=gfc_...` (the server refuses guide requests without a valid client id; get one from `heypointer init`). The API address defaults to that and can be set with `?api=` or `VITE_HEYPOINTER_API`.

## Test

`npm test -w samples/html-team`.
