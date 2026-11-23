# samples/vue-records

TypeScript and Vue 3 (single-file components). It adds HeyPointer with the component from `@heypointerhq/vue`:

```vue
<HeyPointerAssistant :base-url="api" :client-id="clientId" />
```

Scenario: **Ledger**, a dense records table with repeated Edit and Archive buttons (so the guide has to handle ambiguous targets) and a New record dialog. Try the goal `create a record`.

## Run

```sh
# from the repo root, with the API on :8791 (see the root README)
npm run dev -w samples/vue-records
```

Open the page with `?api=http://localhost:8791&client=hpc_...` (the server refuses guide requests without a valid client id; get one from `heypointer init`). The id can also come from `VITE_HEYPOINTER_CLIENT_ID`. The API address defaults to that and can be set with `?api=` or `VITE_HEYPOINTER_API`.

## Test

`npm test -w samples/vue-records`.
