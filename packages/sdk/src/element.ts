// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 HeyPointer
import { HeyPointer, type HeyPointerOptions } from './player';
import { parseJsonAttribute, type HeyPointerLabels } from './labels';
import type { ColorScheme, HeyPointerTheme } from './theme';

export const HEYPOINTER_TAG = 'heypointer-assistant';

/**
 * `<heypointer-assistant base-url="https://api.example.com" client-id="hpc_...">`: the one integration surface
 * every web framework shares. React, Vue, Angular and Svelte render this element; none of
 * them re-implement the player.
 *
 * Customizing (all optional): `labels` and `theme` (JSON), `color-scheme`, `dir`, `lang`, `launcher="none"`,
 * `launcher-side="start"`. Labels, theme and layout change in place; the other attributes remount the guide.
 */
// Server renderers (Next.js, Angular SSR, SvelteKit) import this module in Node, which has no DOM.
const ElementBase = (typeof HTMLElement === 'undefined' ? class {} : HTMLElement) as typeof HTMLElement;

const REMOUNT = ['base-url', 'client-id', 'target-timeout-ms', 'assist', 'author', 'allow-author-param'];
const LIVE = ['labels', 'theme', 'color-scheme', 'dir', 'lang', 'launcher', 'launcher-side'];

export class HeyPointerElement extends ElementBase {
  static observedAttributes = [...REMOUNT, ...LIVE];
  private gf: HeyPointer | null = null;
  /** Set from code (`el.labels = {...}`): wins over the attribute and survives a remount. */
  private labelsProp: HeyPointerLabels | undefined;
  private themeProp: HeyPointerTheme | undefined;

  /** The live player, once connected. For host-app code that needs `open()` or `ask()`. */
  get player(): HeyPointer | null {
    return this.gf;
  }

  /** An object, or a JSON string (what a framework that assigns properties from attribute-style props passes). */
  get labels(): HeyPointerLabels | undefined { return this.labelsProp; }
  set labels(v: HeyPointerLabels | string | undefined) {
    this.labelsProp = typeof v === 'string' ? (parseJsonAttribute('labels', v) as HeyPointerLabels | undefined) : v;
    this.gf?.setLabels(this.currentLabels());
  }
  get theme(): HeyPointerTheme | undefined { return this.themeProp; }
  set theme(v: HeyPointerTheme | string | undefined) {
    this.themeProp = typeof v === 'string' ? (parseJsonAttribute('theme', v) as HeyPointerTheme | undefined) : v;
    this.gf?.setTheme(this.currentTheme());
  }

  /** Replace the labels at runtime (a language switch). Same as assigning `el.labels`. */
  setLabels(labels: HeyPointerLabels | undefined): void { this.labels = labels; }
  open(): void { this.gf?.open(); }
  close(): void { this.gf?.close(); }
  ask(goal: string): Promise<void> { return this.gf ? this.gf.ask(goal) : Promise.resolve(); }

  connectedCallback(): void {
    // `display: contents` keeps this element out of the host app's layout.
    this.style.display = 'contents';
    this.mount();
  }

  disconnectedCallback(): void {
    this.gf?.destroy();
    this.gf = null;
  }

  attributeChangedCallback(name: string, oldValue: string | null, value: string | null): void {
    if (!this.isConnected || oldValue === value) return;
    if (REMOUNT.includes(name) || !this.gf) return void this.mount();
    switch (name) {
      case 'labels': this.gf.setLabels(this.currentLabels()); break;
      case 'theme': this.gf.setTheme(this.currentTheme()); break;
      case 'color-scheme': this.gf.setColorScheme(this.scheme()); break;
      default: this.gf.setLayout(this.layout());
    }
  }

  private currentLabels(): HeyPointerLabels | undefined {
    return this.labelsProp ?? (parseJsonAttribute('labels', this.getAttribute('labels')) as HeyPointerLabels | undefined);
  }
  private currentTheme(): HeyPointerTheme | undefined {
    return this.themeProp ?? (parseJsonAttribute('theme', this.getAttribute('theme')) as HeyPointerTheme | undefined);
  }
  private scheme(): ColorScheme | undefined {
    return (this.getAttribute('color-scheme') ?? undefined) as ColorScheme | undefined;
  }
  private layout(): NonNullable<Parameters<HeyPointer['setLayout']>[0]> {
    return {
      dir: (this.getAttribute('dir') ?? 'auto') as 'auto' | 'ltr' | 'rtl',
      lang: this.getAttribute('lang') ?? '',
      launcher: this.getAttribute('launcher') === 'none' ? 'none' : 'default',
      launcherSide: this.getAttribute('launcher-side') === 'start' ? 'start' : 'end',
    };
  }

  private mount(): void {
    const baseUrl = this.getAttribute('base-url');
    this.gf?.destroy();
    this.gf = null;
    if (!baseUrl) return;
    const timeout = Number(this.getAttribute('target-timeout-ms'));
    const clientId = this.getAttribute('client-id')?.trim();
    const assist = this.hasAttribute('assist') && this.getAttribute('assist') !== 'false';
    const on = (name: string) => this.hasAttribute(name) && this.getAttribute(name) !== 'false';
    const l = this.layout();
    const labels = this.currentLabels();
    const theme = this.currentTheme();
    const opts: HeyPointerOptions = {
      baseUrl,
      ...(assist ? { assist } : {}),
      ...(on('author') ? { author: true } : {}),
      ...(on('allow-author-param') ? { allowAuthorParam: true } : {}),
      ...(clientId ? { clientId } : {}),
      mountTo: this,
      ...(Number.isFinite(timeout) && timeout > 0 ? { targetTimeoutMs: timeout } : {}),
      ...(labels !== undefined ? { labels } : {}),
      ...(theme !== undefined ? { theme } : {}),
      colorScheme: this.scheme(),
      dir: l.dir,
      lang: l.lang,
      launcher: l.launcher,
      launcherSide: l.launcherSide,
    };
    this.gf = new HeyPointer(opts);
  }
}

/** Register the element once. Safe to call repeatedly and from several bundles. */
export function defineHeyPointerElement(tag: string = HEYPOINTER_TAG): void {
  if (typeof customElements !== 'undefined' && !customElements.get(tag)) {
    customElements.define(tag, HeyPointerElement);
  }
}
