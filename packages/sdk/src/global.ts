import { HeyPointer } from './player';
import { defineHeyPointerElement, HEYPOINTER_TAG } from './element';
import { rememberScript } from './author-loader';

/**
 * Script-tag entry:
 *   <script src="heypointer.global.js" data-base-url="https://api.example.com" data-client-id="gfc_..." defer></script>
 * mounts one assistant. Without `data-base-url` it only registers `<heypointer-assistant>`
 * and exposes `window.HeyPointerGlobal.HeyPointer` for manual setup.
 */
defineHeyPointerElement();

const script = document.currentScript as HTMLScriptElement | null;
if (script?.src) rememberScript(script.src);
const baseUrl = script?.dataset.baseUrl;
if (baseUrl && !document.querySelector(HEYPOINTER_TAG)) {
  const mount = () => {
    const el = document.createElement(HEYPOINTER_TAG);
    el.setAttribute('base-url', baseUrl);
    if (script?.dataset.clientId) el.setAttribute('client-id', script.dataset.clientId);
    if (script?.dataset.assist !== undefined && script.dataset.assist !== 'false') el.setAttribute('assist', '');
    // Author mode (record steps): opt-in, and only ever loaded when one of these is present.
    if (script?.dataset.author !== undefined && script.dataset.author !== 'false') el.setAttribute('author', '');
    if (script?.dataset.allowAuthorParam !== undefined && script.dataset.allowAuthorParam !== 'false') el.setAttribute('allow-author-param', '');
    if (script?.dataset.targetTimeoutMs) el.setAttribute('target-timeout-ms', script.dataset.targetTimeoutMs);
    // Customizing: data-labels / data-theme (JSON), data-color-scheme, data-dir, data-lang, data-launcher, data-launcher-side.
    const pass: [string, string | undefined][] = [
      ['labels', script?.dataset.labels], ['theme', script?.dataset.theme], ['color-scheme', script?.dataset.colorScheme],
      ['dir', script?.dataset.dir], ['lang', script?.dataset.lang], ['launcher', script?.dataset.launcher], ['launcher-side', script?.dataset.launcherSide],
    ];
    for (const [name, value] of pass) if (value) el.setAttribute(name, value);
    document.body.appendChild(el);
  };
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount, { once: true });
}

export { HeyPointer };
