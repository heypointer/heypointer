// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 HeyPointer
import type { StepTarget } from '../types';

export type Strategy = 'selector' | 'role-text' | 'label' | 'text';
export interface Resolved {
  element: HTMLElement;
  strategy: Strategy;
}

export type Resolution =
  | ({ status: 'found' } & Resolved)
  | { status: 'ambiguous'; count: number }
  | { status: 'missing' };

const ROLE_SELECTORS: Record<string, string> = {
  button: 'button, [role="button"], input[type="button"], input[type="submit"]',
  link: 'a[href], [role="link"]',
  textbox: 'input:not([type]), input[type="text"], input[type="email"], input[type="search"], textarea, [role="textbox"]',
  combobox: 'select, [role="combobox"]',
  checkbox: 'input[type="checkbox"], [role="checkbox"]',
};

export function isVisible(el: HTMLElement): boolean {
  for (let n: HTMLElement | null = el; n; n = n.parentElement) {
    if (n.hidden || n.getAttribute('aria-hidden') === 'true' || n.hasAttribute('inert')) return false;
    const s = getComputedStyle(n);
    if (s.display === 'none' || s.visibility === 'hidden') return false;
  }
  return true;
}

/**
 * Can a person see and reach this element right now? The one definition shared by target resolution
 * and the highlight watcher. On top of `isVisible` it asks the layout engine (content-visibility,
 * no boxes, zero size) when the browser can answer; jsdom cannot, so there it stops at `isVisible`.
 */
export function isUsable(el: HTMLElement): boolean {
  if (!el.isConnected || !isVisible(el)) return false;
  if (typeof el.checkVisibility !== 'function') return true;
  if (!el.checkVisibility({ checkVisibilityCSS: true, contentVisibilityAuto: true }) || !el.getClientRects().length) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 || r.height > 0;
}

export function accessibleName(el: HTMLElement): string {
  const aria = el.getAttribute('aria-label');
  if (aria) return aria;
  const labels = (el as HTMLInputElement).labels;
  if (labels && labels.length) return Array.from(labels).map((l) => l.textContent ?? '').join(' ');
  return el.textContent ?? '';
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

const INTERACTIVE =
  'a[href], button, input, select, textarea, summary, [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="switch"], [role="tab"], [role="menuitem"], [role="option"], [role="combobox"], [role="textbox"]';

/**
 * Elements nested in each other with the same text are one target: a heading around a link is the link, a span inside a
 * button is the button. The interactive one wins; with none (or both) interactive the innermost does. Separate controls
 * with the same text are still ambiguous.
 */
function collapseNested(hits: HTMLElement[]): HTMLElement[] {
  if (hits.length < 2) return hits;
  const beats = (g: HTMLElement, h: HTMLElement): boolean => {
    const gi = g.matches(INTERACTIVE);
    const hi = h.matches(INTERACTIVE);
    return gi !== hi ? gi : h.contains(g);
  };
  return hits.filter((h) => !hits.some((g) => g !== h && (h.contains(g) || g.contains(h)) && beats(g, h)));
}

function safeQuery(root: ParentNode, selector: string): HTMLElement[] {
  try {
    return Array.from(root.querySelectorAll<HTMLElement>(selector));
  } catch {
    return [];
  }
}

function isSameOriginIframe(iframe: HTMLIFrameElement): boolean {
  try {
    const doc = iframe.contentDocument;
    return !!doc && !!doc.defaultView;
  } catch {
    return false;
  }
}

function getOpenShadowRoots(root: ParentNode): ShadowRoot[] {
  const shadows: ShadowRoot[] = [];
  const walk = (node: Node) => {
    if (node instanceof HTMLElement && node.shadowRoot && !node.hasAttribute('data-heypointer-author')) {
      shadows.push(node.shadowRoot);
      walk(node.shadowRoot);
    }
    for (const child of Array.from(node.childNodes)) {
      walk(child);
    }
  };
  walk(root);
  return shadows;
}

function getSameOriginIframeDocuments(root: ParentNode): Document[] {
  const docs: Document[] = [];
  const iframes = Array.from(root.querySelectorAll('iframe'));
  for (const iframe of iframes) {
    if (isSameOriginIframe(iframe) && iframe.contentDocument) {
      docs.push(iframe.contentDocument);
    }
  }
  return docs;
}

function collectSearchRoots(root: ParentNode): ParentNode[] {
  const roots: ParentNode[] = [root];
  roots.push(...getOpenShadowRoots(root));
  roots.push(...getSameOriginIframeDocuments(root));
  return roots;
}

/** Run one strategy across every search root (main document, open shadow roots,
 *  same-origin iframes) and decide on the combined visible hits. Several visible
 *  matches across roots are ambiguous; we never pick one.
 */
function runAcrossRoots(
  roots: ParentNode[],
  select: (searchRoot: ParentNode) => HTMLElement[],
): { hits: HTMLElement[] } {
  const hits: HTMLElement[] = [];
  for (const searchRoot of roots) {
    hits.push(...select(searchRoot));
  }
  return { hits };
}

export function resolveDetailed(target: StepTarget, root: ParentNode = document): Resolution {
  const roots = collectSearchRoots(root);
  let ambiguous = 0;
  const tryHits = (hits: HTMLElement[], strategy: Strategy): Resolution | null => {
    if (hits.length === 1) return { status: 'found', element: hits[0], strategy };
    if (hits.length > 1) ambiguous = Math.max(ambiguous, hits.length);
    return null;
  };

  for (const sel of target.selectors) {
    const { hits } = runAcrossRoots(roots, (r) => safeQuery(r, sel).filter(isUsable));
    const r = tryHits(hits, 'selector');
    if (r) return r;
  }

  const text = target.text ? norm(target.text) : '';
  if (target.role && text) {
    const sel = ROLE_SELECTORS[target.role] ?? `[role="${CSS.escape(target.role)}"]`;
    const { hits } = runAcrossRoots(roots, (r) =>
      safeQuery(r, sel).filter((e) => isUsable(e) && norm(accessibleName(e)) === text),
    );
    const r = tryHits(hits, 'role-text');
    if (r) return r;
  }

  const label = target.label ? norm(target.label) : '';
  if (label) {
    const { hits } = runAcrossRoots(roots, (r) =>
      safeQuery(r, 'input, select, textarea, [role="textbox"], [role="combobox"]').filter(
        (e) => isUsable(e) && norm(accessibleName(e)) === label,
      ),
    );
    const r = tryHits(hits, 'label');
    if (r) return r;
  }

  if (text) {
    const { hits: all } = runAcrossRoots(roots, (r) =>
      safeQuery(r, 'button, a, label, [role], input, select, textarea, h1, h2, h3, li, p, span').filter(
        (e) => isUsable(e) && norm(accessibleName(e)) === text,
      ),
    );
    // A visible <label> and the control it names carry the same text. They are one target, and the person acts on the control.
    const hits = collapseNested(all.filter((e) => !(e instanceof HTMLLabelElement && e.control instanceof HTMLElement && all.includes(e.control))));
    const r = tryHits(hits, 'text');
    if (r) return r;
  }

  return ambiguous ? { status: 'ambiguous', count: ambiguous } : { status: 'missing' };
}

export function resolveTarget(target: StepTarget, root: ParentNode = document): Resolved | null {
  const r = resolveDetailed(target, root);
  return r.status === 'found' ? { element: r.element, strategy: r.strategy } : null;
}

export function waitForResolution(
  target: StepTarget,
  timeoutMs = 1500,
  root: Document = document,
): Promise<Resolution> {
  const now = resolveDetailed(target, root);
  if (now.status === 'found' || timeoutMs <= 0) return Promise.resolve(now);
  return new Promise((resolve) => {
    const finish = (r: Resolution) => {
      obs.disconnect();
      clearTimeout(timer);
      resolve(r);
    };
    const obs = new MutationObserver(() => {
      const r = resolveDetailed(target, root);
      if (r.status === 'found') finish(r);
    });
    obs.observe(root, { childList: true, subtree: true, attributes: true });
    const timer = setTimeout(() => finish(resolveDetailed(target, root)), timeoutMs);
  });
}

export async function waitForTarget(
  target: StepTarget,
  timeoutMs = 1500,
  root: Document = document,
): Promise<Resolved | null> {
  const r = await waitForResolution(target, timeoutMs, root);
  return r.status === 'found' ? { element: r.element, strategy: r.strategy } : null;
}
