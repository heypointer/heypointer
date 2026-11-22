import { mountHost } from './host.js';

mountHost(document.getElementById('app'));

// Adding HeyPointer to any web app is one script tag. The API address comes from ?api=, so a
// test or a teammate can point this page at any HeyPointer server.
const params = new URLSearchParams(location.search);
const api = params.get('api') ?? import.meta.env?.VITE_HEYPOINTER_API ?? 'http://localhost:8791';
// The client id from `heypointer init` (publishable, not a secret): ?client= or VITE_HEYPOINTER_CLIENT_ID.
const clientId = params.get('client') ?? import.meta.env?.VITE_HEYPOINTER_CLIENT_ID ?? '';
const script = document.createElement('script');
script.src = '/heypointer.global.js';
if (params.get('sdk') === 'element') {
  // The same guide as a custom element, for frameworks that render elements.
  script.onload = () => {
    const el = document.createElement('heypointer-assistant');
    el.setAttribute('base-url', api);
    if (clientId) el.setAttribute('client-id', clientId);
    document.body.appendChild(el);
  };
} else {
  script.dataset.baseUrl = api; // the script mounts the guide itself
  if (clientId) script.dataset.clientId = clientId;
}
document.head.appendChild(script);
