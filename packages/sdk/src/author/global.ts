// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 HeyPointer
import { authorWasActive, startAuthoring } from './index';
import { parseJsonAttribute } from '../labels';

/**
 * Script-tag entry for author mode (heypointer.author.js). The guide's own script loads this on demand when `data-author` /
 * `data-allow-author-param` ask for it. Used on its own, the same attributes on THIS tag start it:
 *   <script src="heypointer.author.js" data-author></script>
 *   <script src="heypointer.author.js" data-allow-author-param></script>   (then add ?heypointer-author=1 to a page URL)
 * Without either attribute it only exposes window.HeyPointerAuthor.startAuthoring.
 */
(window as unknown as { HeyPointerAuthor: unknown }).HeyPointerAuthor = { startAuthoring, authorWasActive };

const script = document.currentScript as HTMLScriptElement | null;
const d = script?.dataset;
if (d) {
  const flag = (v: string | undefined) => v !== undefined && v !== 'false';
  const withParam = flag(d.allowAuthorParam) && (new URLSearchParams(location.search).has('heypointer-author') || authorWasActive());
  if (flag(d.author) || withParam) {
    const go = () =>
      startAuthoring({
        labels: parseJsonAttribute('data-labels', d.labels) as Record<string, unknown> | undefined,
        theme: parseJsonAttribute('data-theme', d.theme) as never,
        colorScheme: d.colorScheme as never,
        dir: d.dir as never,
        lang: d.lang,
      });
    if (document.body) go();
    else document.addEventListener('DOMContentLoaded', go, { once: true });
  }
}
