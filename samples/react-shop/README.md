# samples/react-shop

TypeScript and React 19. It adds HeyPointer with the component from `@heypointerhq/react`:

```tsx
<HeyPointerAssistant baseUrl={api} clientId={clientId} />
```

Scenario: **Northstar**, a fictional shop with search, product pages, a cart and a mock checkout. Only mock data is used: no payment or delivery happens. Try the goal `buy wireless headphones`. `Buy now` and `Place order` ask for confirmation before the guide goes on.

## Run

```sh
# from the repo root, with the API on :8791 (see the root README)
npm run dev -w samples/react-shop
```

Open the page with `?api=http://localhost:8791&client=hpc_...` (the server refuses guide requests without a valid client id; get one from `heypointer init`). The id can also come from `VITE_HEYPOINTER_CLIENT_ID`. The API address defaults to that and can be set with `?api=` or `VITE_HEYPOINTER_API`.

## Test

`npm test -w samples/react-shop`.
