// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 HeyPointer
import { HeyPointerClient, NoSpeechError, SpeechUnavailableError } from './client';
import { Highlighter } from './highlight';
import { BrowserRecorder, speechSupported, type AudioRecorder } from './recorder';
import { accessibleName, resolveDetailed, waitForResolution } from './targeting/index';
import { watchUsable } from './targeting/watch';
import { Spotlight, coachmarkPosition } from './spotlight';
import { frameOffset } from './highlight';
import { DEV, fmt, resolveLabels, warnOnce, type HeyPointerLabels, type LabelKey, type ResolvedLabels } from './labels';
import { contrastProblems } from './contrast';
import { authorRequested, loadAuthor } from './author-loader';
import { COLOR_SCHEMES, sanitizeTheme, themeVars, type ColorScheme, type HeyPointerTheme } from './theme';
import CSS from './styles.css?inline';
import type { Walkthrough, WalkthroughStep } from './types';

export interface HeyPointerOptions {
  baseUrl: string;
  /** Publishable client id from `heypointer init` (`gfc_` + 24 hex). */
  clientId?: string;
  fetch?: typeof fetch;
  recorderFactory?: () => AudioRecorder;
  /** Override mic detection (tests). */
  speechSupported?: boolean;
  targetTimeoutMs?: number;
  mountTo?: HTMLElement;
  /** Start with assist mode on. The user can still toggle it in the card; it is never remembered between sessions. */
  assist?: boolean;
  /** Called once each time the guide clicks a control for the user (assist mode). Also fired as the `heypointer:assist` DOM event. */
  onAssist?: (e: AssistEvent) => void;
  /** Override any user-visible string (translations, tone). See HeyPointerLabels. Plain text with {placeholders}. */
  labels?: HeyPointerLabels;
  /** Colors, radius and font. Same names as the `--hp-*` CSS custom properties. Values are validated; invalid ones are ignored. */
  theme?: HeyPointerTheme;
  /** `auto` follows prefers-color-scheme (default); `light` or `dark` force one token set. */
  colorScheme?: ColorScheme;
  /** `auto` (default) inherits the page direction; `ltr`/`rtl` force it for the guide only. */
  dir?: 'auto' | 'ltr' | 'rtl';
  /** BCP 47 language tag set on the guide (screen readers, hyphenation). */
  lang?: string;
  /** `none` hides the built-in "Guide me" button; drive the guide with open(), close() and ask(). */
  launcher?: 'default' | 'none';
  /** Which edge the built-in button and the goal card sit on. Follows the text direction (`end` is the right in LTR). */
  launcherSide?: 'start' | 'end';
  /** Turn on author mode (record steps into a flow draft). Opt-in; loads its own bundle. For dev and staging builds. */
  author?: boolean;
  /** Also turn it on when the page URL has `?heypointer-author=1`. Off by default, so a production page can never be switched on from a URL. */
  allowAuthorParam?: boolean;
}

export interface AssistEvent {
  stepIndex: number;
  action: 'click';
  label: string;
}

type View =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'insufficient'; wt: Walkthrough }
  | { kind: 'step' }
  | { kind: 'done' };

/** Defense in depth: even if the server omits the flag, obviously consequential click/submit steps stay gated. */
const RISKY = /\b(send|submit|delete|remove|pay|purchase|buy|transfer|publish|revoke|deploy)\b/i;
export const needsGate = (s: WalkthroughStep): boolean =>
  s.requiresConfirmation || (s.action === 'click' && [s.target.text, s.target.label, s.title, s.instruction].some((t) => RISKY.test(t ?? '')));

/** Containers a click can land on that still mean "the user used this control". */
const INTERACTIVE = 'button, a, label, summary, [role="button"], [role="link"], [role="checkbox"], [role="menuitem"], [role="tab"]';
export const ASSIST_EVENT = 'heypointer:assist';
export const OPEN_EVENT = 'heypointer:open';
export const CLOSE_EVENT = 'heypointer:close';

/** Resolves once the page's DOM has stopped changing, so the next target is looked up after the host app re-rendered. */
function settleDom(quietMs = 80, maxMs = 600): Promise<void> {
  return new Promise((resolve) => {
    let quiet: ReturnType<typeof setTimeout>;
    const done = () => {
      obs.disconnect();
      clearTimeout(quiet);
      clearTimeout(cap);
      resolve();
    };
    const obs = new MutationObserver(() => {
      clearTimeout(quiet);
      quiet = setTimeout(done, quietMs);
    });
    obs.observe(document, { childList: true, subtree: true });
    quiet = setTimeout(done, quietMs);
    const cap = setTimeout(done, maxMs);
  });
}

/** Name a stylable part. Hosts reach it with [data-heypointer-root]::part(name). */
const pt = <T extends Element>(n: T, part: string): T => (n.setAttribute('part', part), n);

export class HeyPointer {
  readonly host: HTMLElement;
  readonly root: ShadowRoot;
  private readonly client: HeyPointerClient;
  private readonly hl: Highlighter;
  private readonly spotlight: Spotlight;
  private readonly arrow: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly launcher: HTMLButtonElement;
  private readonly live: HTMLElement;
  private view: View = { kind: 'idle' };
  private wt: Walkthrough | null = null;
  private index = 0;
  private confirmed = new Set<string>();
  private missing = false;
  private ambiguous = false;
  private recorder: AudioRecorder | null = null;
  private recording = false;
  private notice = '';
  private noticeAlert = false;
  private goalToolsOpen = false;
  private lastGoal = '';
  private focusTitle = false;
  private target: HTMLElement | null = null;
  private targetOffset = { x: 0, y: 0 };
  private renderToken = 0;
  private readonly micOk: boolean;
  private assist: boolean;
  /** A click by the user (or the host app) reached the highlighted control since this step was shown. */
  private userActed = false;
  private assisting = false;
  /** Steps the guide has already clicked once. It never clicks the same step twice, so it cannot undo a toggle. */
  private assisted = new Set<number>();
  private assistNote: { text: string; alert: boolean } | null = null;
  private hintEl: HTMLElement | null = null;
  /** The control left the screen (the user closed the modal, say), so the guide stopped pointing at it and waits for Next. */
  private released = false;
  private stopWatch?: () => void;
  private anchor: Element | null = null;
  private readonly onDocClick = (e: Event) => this.noteClick(e);
  private L: ResolvedLabels;
  private theme: HeyPointerTheme = {};
  private themeProps: string[] = [];
  private cfg: { dir: 'auto' | 'ltr' | 'rtl'; lang: string; scheme: ColorScheme; launcher: 'default' | 'none'; side: 'start' | 'end' };
  /** The host's own control that called open(), so Close can give focus back to it. */
  private opener: HTMLElement | null = null;

  constructor(private readonly opts: HeyPointerOptions) {
    const resolved = resolveLabels(opts.labels);
    warnOnce('labels', resolved.problems);
    this.L = resolved.labels;
    this.cfg = {
      dir: opts.dir === 'ltr' || opts.dir === 'rtl' ? opts.dir : 'auto',
      lang: typeof opts.lang === 'string' ? opts.lang.trim().slice(0, 35) : '',
      scheme: COLOR_SCHEMES.includes(opts.colorScheme as ColorScheme) ? (opts.colorScheme as ColorScheme) : 'auto',
      launcher: opts.launcher === 'none' ? 'none' : 'default',
      side: opts.launcherSide === 'start' ? 'start' : 'end',
    };
    this.client = new HeyPointerClient({ baseUrl: opts.baseUrl, clientId: opts.clientId, fetch: opts.fetch, text: (k, v) => this.t(k, v) });
    this.micOk = opts.speechSupported ?? speechSupported();
    this.assist = !!opts.assist;
    document.addEventListener('click', this.onDocClick, true);
    this.host = document.createElement('div');
    this.host.setAttribute('data-heypointer-root', '');
    // The host element has a default static box. Never let that transparent
    // box intercept host-app clicks; only the launcher and panel are interactive.
    this.host.style.pointerEvents = 'none';
    this.root = this.host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = CSS;
    this.root.appendChild(style);
    this.hl = new Highlighter(this.root);
    this.spotlight = new Spotlight(this.root);
    this.arrow = document.createElement('div');
    this.arrow.className = 'hp-tour-arrow';
    this.arrow.setAttribute('part', 'arrow');
    this.arrow.hidden = true;
    this.arrow.setAttribute('aria-hidden', 'true');

    this.launcher = document.createElement('button');
    this.launcher.className = 'hp-launcher';
    this.launcher.textContent = this.t('launcher');
    this.launcher.setAttribute('part', 'launcher');
    this.launcher.setAttribute('aria-expanded', 'false');
    this.launcher.addEventListener('click', () => (this.panel.hidden ? this.open() : this.close()));

    this.panel = document.createElement('section');
    this.panel.className = 'hp-panel';
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-label', this.t('dialogName'));
    this.panel.setAttribute('part', 'panel');
    this.panel.hidden = true;
    this.panel.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Escape') this.close();
    });

    this.live = document.createElement('div');
    this.live.setAttribute('aria-live', 'polite');
    this.live.setAttribute('role', 'status');
    Object.assign(this.live.style, { position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)' });

    this.root.append(this.launcher, this.panel, this.arrow, this.live);
    this.applyLayout();
    if (opts.theme !== undefined) this.setTheme(opts.theme);
    (opts.mountTo ?? document.body).appendChild(this.host);
    this.render();
    if (authorRequested(opts)) void this.startAuthor();
  }

  private async startAuthor(): Promise<void> {
    try {
      const api = await loadAuthor();
      api?.startAuthoring({ labels: this.opts.labels, theme: this.opts.theme, colorScheme: this.cfg.scheme, dir: this.cfg.dir, lang: this.cfg.lang });
    } catch (e) {
      DEV && console.warn('[heypointer] author mode did not start', e);
    }
  }

  private t(key: LabelKey, vars?: Record<string, string | number>): string {
    return fmt(this.L[key], vars);
  }

  /** Replace the label overrides at runtime (a language switch, say). Unset keys go back to the English defaults. */
  setLabels(labels: HeyPointerLabels | undefined): void {
    const r = resolveLabels(labels);
    warnOnce('labels', r.problems);
    this.L = r.labels;
    this.launcher.textContent = this.t('launcher');
    this.panel.setAttribute('aria-label', this.t('dialogName'));
    void this.render();
  }

  /** Replace the theme at runtime. Invalid values are ignored; contrast problems are only warned about. */
  setTheme(theme: HeyPointerTheme | undefined): void {
    const r = sanitizeTheme(theme);
    this.theme = r.theme;
    for (const prop of this.themeProps) this.host.style.removeProperty(prop);
    const vars = themeVars(r.theme);
    for (const [k, v] of Object.entries(vars)) this.host.style.setProperty(k, v);
    this.themeProps = Object.keys(vars);
    if (DEV) warnOnce('theme', [...r.problems, ...contrastProblems(r.theme, this.cfg.scheme)]);
  }

  setColorScheme(scheme: ColorScheme | undefined): void {
    this.cfg.scheme = COLOR_SCHEMES.includes(scheme as ColorScheme) ? (scheme as ColorScheme) : 'auto';
    this.applyLayout();
    this.setTheme(this.theme);
  }

  /** Change direction, language, launcher visibility or side at runtime. */
  setLayout(layout: { dir?: 'auto' | 'ltr' | 'rtl'; lang?: string; launcher?: 'default' | 'none'; launcherSide?: 'start' | 'end' }): void {
    if (layout.dir !== undefined) this.cfg.dir = layout.dir === 'ltr' || layout.dir === 'rtl' ? layout.dir : 'auto';
    if (layout.lang !== undefined) this.cfg.lang = layout.lang.trim().slice(0, 35);
    if (layout.launcher !== undefined) this.cfg.launcher = layout.launcher === 'none' ? 'none' : 'default';
    if (layout.launcherSide !== undefined) this.cfg.side = layout.launcherSide === 'start' ? 'start' : 'end';
    this.applyLayout();
    this.syncTour();
  }

  private applyLayout(): void {
    const set = (name: string, value: string | null) => (value === null ? this.host.removeAttribute(name) : this.host.setAttribute(name, value));
    set('dir', this.cfg.dir === 'auto' ? null : this.cfg.dir);
    set('lang', this.cfg.lang || null);
    set('data-scheme', this.cfg.scheme === 'auto' ? null : this.cfg.scheme);
    set('data-launcher', this.cfg.launcher === 'none' ? 'none' : null);
    set('data-launcher-side', this.cfg.side === 'start' ? 'start' : null);
    this.launcher.hidden = this.cfg.launcher === 'none';
  }

  private isRtl(): boolean {
    try { return getComputedStyle(this.host).direction === 'rtl'; } catch { return false; }
  }

  private emit(name: string): void {
    this.host.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true }));
  }

  private currentOpener(): HTMLElement | null {
    const a = document.activeElement;
    return a instanceof HTMLElement && a !== document.body && a !== this.host && !this.host.contains(a) ? a : null;
  }

  open(): void {
    const wasOpen = !this.panel.hidden;
    if (!wasOpen) this.opener = this.currentOpener();
    this.panel.hidden = false;
    this.launcher.setAttribute('aria-expanded', 'true');
    this.syncTour();
    this.focusFirst();
    if (!wasOpen) this.emit(OPEN_EVENT);
  }

  close(): void {
    const wasOpen = !this.panel.hidden;
    this.panel.hidden = true;
    this.launcher.setAttribute('aria-expanded', 'false');
    this.hl.hide();
    this.spotlight.hide();
    this.arrow.hidden = true;
    this.stopWatching();
    const back = this.opener?.isConnected ? this.opener : null;
    this.opener = null;
    // Give focus back to whatever opened the guide: the host's own button, else the built-in launcher.
    if (back) back.focus();
    else if (!this.launcher.hidden) this.launcher.focus();
    if (wasOpen) this.emit(CLOSE_EVENT);
  }

  destroy(): void {
    document.removeEventListener('click', this.onDocClick, true);
    this.stopWatching();
    this.hl.hide();
    this.spotlight.hide();
    this.host.remove();
  }

  /** Request a walkthrough for a typed (or transcribed) goal. */
  async ask(goal: string): Promise<void> {
    const text = goal.trim();
    if (!text) {
      this.notice = this.t('emptyGoal');
      return this.render();
    }
    this.notice = '';
    this.noticeAlert = false;
    this.lastGoal = text;
    this.focusTitle = true;
    this.hl.hide();
    this.view = { kind: 'loading' };
    this.render();
    try {
      const wt = await this.client.requestWalkthrough(text, { url: location.href });
      this.wt = wt;
      this.index = 0;
      this.confirmed.clear();
      this.assisted.clear();
      this.userActed = false;
      this.assistNote = null;
      this.view = wt.status === 'ok' ? { kind: 'step' } : { kind: 'insufficient', wt };
    } catch (e) {
      this.view = { kind: 'error', message: e instanceof Error ? e.message : this.t('genericError') };
    }
    await this.render();
  }

  async next(): Promise<void> {
    const step = this.step();
    if (!this.wt || !step) return;
    if (needsGate(step) && !this.confirmed.has(step.id)) return; // gate
    const assisted = this.attemptAssist(step);
    this.assistNote = null;
    if (assisted && 'failed' in assisted) {
      this.assistNote = { text: this.t('assistFailed', { label: assisted.failed }), alert: true };
      await this.render();
      return;
    }
    // The host app usually re-renders after a click and may replace the very node we would look up next.
    if (assisted) await settleDom();
    if (this.index >= this.wt.steps.length - 1) {
      this.hl.hide();
      this.view = { kind: 'done' };
    } else {
      this.index++;
    }
    this.userActed = false;
    if (assisted) this.assistNote = { text: this.t('assistClicked', { label: assisted.label }), alert: false };
    this.focusTitle = true;
    await this.render();
  }

  async prev(): Promise<void> {
    if (this.index > 0) {
      this.index--;
      this.userActed = false;
      this.assistNote = null;
      this.view = { kind: 'step' };
      this.focusTitle = true;
      await this.render();
    }
  }

  /** Skip a step without acting on it (e.g. target missing). Skipping performs no host action, so it needs no confirmation. */
  async skip(): Promise<void> {
    if (!this.wt || !this.step()) return;
    this.userActed = false;
    this.assistNote = null;
    if (this.index >= this.wt.steps.length - 1) {
      this.hl.hide();
      this.view = { kind: 'done' };
    } else {
      this.index++;
    }
    this.focusTitle = true;
    await this.render();
  }

  async confirm(): Promise<void> {
    const step = this.step();
    if (step) this.confirmed.add(step.id);
    await this.render();
  }

  async retry(): Promise<void> {
    await this.render();
  }

  state() {
    return { view: this.view.kind, index: this.index, missing: this.missing, ambiguous: this.ambiguous, wt: this.wt };
  }

  /** Why the guide must not click this control for the user, or null when it may. Never guesses: callers pass the single resolved element. */
  private assistBlock(el: HTMLElement): string | null {
    if (this.host.contains(el) || el.getRootNode() === this.root) return 'guide';
    if (el.closest('[inert]')) return 'inert';
    if (el.getAttribute('aria-disabled') === 'true' || el.closest('[aria-disabled="true"]')) return 'disabled';
    try {
      if (el.matches(':disabled')) return 'disabled';
    } catch { /* very old engines */ }
    if (el instanceof HTMLInputElement && el.type === 'file') return 'file';
    const a = el.closest('a');
    if (a) {
      if (a.hasAttribute('download') || (a.target && a.target !== '_self')) return 'link';
      const href = a.getAttribute('href');
      if (href !== null) {
        try {
          const u = new URL(href, location.href);
          if ((u.protocol !== 'http:' && u.protocol !== 'https:') || u.origin !== location.origin) return 'link';
        } catch {
          return 'link';
        }
      }
    }
    return null;
  }

  /** In assist mode, click the step's control once for the user when that is provably safe. Null means "do nothing, just advance". */
  private attemptAssist(step: WalkthroughStep): { label: string } | { failed: string } | null {
    if (!this.assist || this.released || this.userActed || this.assisted.has(this.index)) return null;
    if (step.action !== 'click' || needsGate(step)) return null;
    const t = step.target;
    if (!t.selectors.length && !t.text && !t.label) return null;
    const r = resolveDetailed(t, document);
    if (r.status !== 'found') return null;
    const el = r.element;
    if (this.target?.isConnected && el !== this.target) return null; // the page changed under the highlight
    if (this.assistBlock(el)) return null;
    const label = (accessibleName(el).replace(/\s+/g, ' ').trim() || t.text || t.label || step.title).slice(0, 80);
    this.assisted.add(this.index);
    this.assisting = true;
    try {
      el.click();
    } catch {
      return { failed: label };
    } finally {
      this.assisting = false;
    }
    const detail: AssistEvent = { stepIndex: this.index, action: 'click', label };
    try { this.opts.onAssist?.(detail); } catch { /* a host callback must not break the guide */ }
    this.host.dispatchEvent(new CustomEvent(ASSIST_EVENT, { detail, bubbles: true, composed: true }));
    return { label };
  }

  /** Capture-phase: remember that someone already used the highlighted control, so assist never repeats it. */
  private noteClick(e: Event): void {
    if (this.assisting || !this.target || this.view.kind !== 'step') return;
    const path = e.composedPath();
    if (path.includes(this.host)) return;
    if (path.includes(this.target)) {
      this.userActed = true;
      return;
    }
    const hit = path[0];
    if (hit instanceof Element && hit.contains(this.target) && hit.matches(INTERACTIVE)) this.userActed = true;
  }

  private step(): WalkthroughStep | undefined {
    return this.view.kind === 'step' ? this.wt?.steps[this.index] : undefined;
  }

  private async toggleRecording(): Promise<void> {
    if (!this.recording) {
      try {
        this.recorder ??= (this.opts.recorderFactory ?? (() => new BrowserRecorder()))();
        await this.recorder.start();
        this.recording = true;
        this.notice = this.t('recording');
      } catch {
        this.recorder = null;
        this.notice = this.t('voiceUnavailable');
      }
      return this.render();
    }
    this.recording = false;
    this.noticeAlert = false;
    try {
      const blob = await this.recorder!.stop();
      this.notice = this.t('transcribing');
      await this.render();
      const text = await this.client.transcribe(blob);
      this.notice = '';
      await this.ask(text);
    } catch (e) {
      if (e instanceof NoSpeechError) {
        this.notice = this.t('noSpeech');
        this.noticeAlert = true;
        await this.render();
        this.panel.querySelector<HTMLElement>('[data-autofocus]')?.focus();
        return;
      }
      this.notice =
        e instanceof SpeechUnavailableError ? this.t('voiceUnavailable') : this.t('audioFailed');
      await this.render();
    }
  }

  private focusFirst(): void {
    const el = this.panel.querySelector<HTMLElement>('[data-autofocus]') ?? this.panel.querySelector<HTMLElement>('button, input');
    el?.focus();
  }

  private el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, text?: string) {
    const n = document.createElement(tag);
    Object.assign(n, props);
    if (text !== undefined) n.textContent = text;
    return n;
  }

  private async render(): Promise<void> {
    const token = ++this.renderToken;
    this.stopWatching();
    this.released = false;
    const hadFocus = this.root.activeElement?.getAttribute('data-key');
    const p = this.panel;
    const touring = this.view.kind === 'step';
    this.spotlight.hide();
    p.className = touring ? 'hp-panel hp-tour' : 'hp-panel';
    p.setAttribute('part', touring ? 'panel card' : 'panel');
    p.removeAttribute('data-placement');
    p.style.left = '';
    p.style.top = '';
    p.replaceChildren();
    this.target = null;
    this.arrow.hidden = true;
    this.missing = false;
    this.ambiguous = false;

    const head = this.el('div', { className: touring ? 'hp-tour-head' : 'hp-head' });
    if (!touring) head.append(pt(this.el('h2', {}, this.t('heading')), 'title'));
    if (touring) head.append(pt(this.el('div', { className: 'hp-tour-count' }, this.t('tourCount', { current: this.index + 1, total: this.wt!.steps.length })), 'progress'));
    const closeBtn = pt(this.el('button', { type: 'button', className: 'hp-close' }, '×'), 'button close');
    closeBtn.setAttribute('aria-label', this.t('closeLabel'));
    closeBtn.setAttribute('data-key', 'close');
    closeBtn.addEventListener('click', () => this.close());
    head.append(closeBtn);
    p.append(head);
    p.append(this.goalForm(touring));
    if (touring) {
      const tools = this.el('details', { className: 'hp-tour-tools', open: this.goalToolsOpen || this.recording || !!this.notice });
      pt(tools, 'tools');
      tools.append(this.el('summary', {}, this.t('changeGoal')));
      tools.addEventListener('toggle', () => { this.goalToolsOpen = tools.open; });
      tools.append(p.querySelector('form')!);
      p.append(tools);
    }
    if (this.notice) p.append(pt(this.el('p', { role: this.noticeAlert ? 'alert' : 'status' } as Partial<HTMLParagraphElement>, this.notice), this.noticeAlert ? 'alert' : 'text'));
    if (this.assistNote) {
      p.append(this.assistNote.alert
        ? pt(this.el('p', { className: 'hp-assist-note hp-alert', role: 'alert' } as Partial<HTMLParagraphElement>, this.assistNote.text), 'alert')
        : pt(this.el('p', { className: 'hp-assist-note' }, this.assistNote.text), 'hint'));
    }

    const v = this.view;
    if (v.kind === 'loading') p.append(pt(this.el('p', {}, this.t('loading')), 'text'));
    if (v.kind === 'error') {
      const box = this.alert(v.message);
      const retry = pt(this.el('button', { type: 'button' }, this.t('tryAgain')), 'button button-secondary');
      retry.addEventListener('click', () => void this.ask(this.lastGoal));
      box.append(retry);
      p.append(box);
    }
    if (v.kind === 'insufficient') this.renderInsufficient(v.wt);
    if (v.kind === 'done') {
      const goal = this.wt?.goal ?? this.lastGoal;
      const msg = pt(this.el('p', {}, this.t('done', { goal })), 'text');
      msg.tabIndex = -1;
      const again = pt(this.el('button', { type: 'button' }, this.t('startAnother')), 'button button-secondary');
      again.addEventListener('click', () => {
        this.view = { kind: 'idle' };
        this.wt = null;
        void this.render().then(() => this.focusFirst());
      });
      p.append(msg, again);
      this.announce(this.t('done', { goal }));
      if (this.focusTitle) msg.focus();
      this.focusTitle = false;
    }
    if (v.kind === 'step') {
      const step = this.step()!;
      this.renderStep(step);
      await this.locate(step, token);
    }
    if (touring && !this.panel.hidden) this.spotlight.show(this.target, () => this.positionTour());
    else this.spotlight.hide();
    if (v.kind === 'step') this.watch();
    if (hadFocus) this.panel.querySelector<HTMLElement>(`[data-key="${hadFocus}"]`)?.focus({ preventScroll: true });
  }

  private syncTour(): void {
    if (this.view.kind !== 'step') return this.spotlight.hide();
    if (this.released) this.reengage();
    else this.spotlight.show(this.target, () => this.positionTour());
    this.watch();
  }

  private stopWatching(): void {
    this.stopWatch?.();
    this.stopWatch = undefined;
  }

  /** Keep an eye on the highlighted control: closed, hidden or removed means the user acted, and it may come back. */
  private watch(): void {
    this.stopWatching();
    const el = this.target;
    if (!el || this.view.kind !== 'step') return;
    this.stopWatch = watchUsable(el, (usable) => (usable ? this.reengage() : this.release()));
  }

  private release(): void {
    const step = this.step();
    const old = this.target;
    if (!step || !old || this.released) return;
    // A host app that re-renders swaps the node for an identical one in the same container: follow it.
    // Anything elsewhere on the page is not the control the step meant, so it is never picked up here.
    const r = resolveDetailed(step.target, document);
    if (r.status === 'found' && r.element !== old && this.anchor?.isConnected && this.anchor.contains(r.element)) return this.rebind(r.element);
    this.released = true;
    this.hl.hide();
    this.spotlight.hide();
    this.arrow.hidden = true;
    this.panel.classList.add('hp-released', 'hp-floating');
    this.panel.removeAttribute('data-placement');
    const note = pt(this.el('p', { className: 'hp-released-note' }, this.t('releasedNote')), 'hint');
    if (this.hintEl) this.hintEl.after(note);
    else this.panel.append(note);
    this.announce(this.t('releasedNote'));
  }

  private reengage(): void {
    if (!this.released || !this.target) return;
    this.released = false;
    this.panel.classList.remove('hp-released');
    this.panel.querySelector('.hp-released-note')?.remove();
    const step = this.step();
    if (step && (!needsGate(step) || this.confirmed.has(step.id))) this.hl.show(this.target);
    this.spotlight.show(this.target, () => this.positionTour());
  }

  private rebind(el: HTMLElement): void {
    this.target = el;
    this.targetOffset = frameOffset(el);
    this.anchor = el.parentElement;
    const step = this.step();
    if (step && (!needsGate(step) || this.confirmed.has(step.id))) this.hl.show(el);
    this.spotlight.show(el, () => this.positionTour());
    this.watch();
  }

  private positionTour(): void {
    if (this.panel.hidden || this.view.kind !== 'step') return;
    if (!this.target) {
      this.panel.classList.add('hp-floating');
      this.panel.removeAttribute('data-placement');
      this.arrow.hidden = true;
      return;
    }
    const rect = this.target.getBoundingClientRect();
    const target = {
      left: rect.left + this.targetOffset.x,
      top: rect.top + this.targetOffset.y,
      right: rect.right + this.targetOffset.x,
      bottom: rect.bottom + this.targetOffset.y,
    };
    this.panel.classList.remove('hp-floating');
    this.panel.style.left = '12px';
    this.panel.style.top = '12px';
    const card = this.panel.getBoundingClientRect();
    const pos = coachmarkPosition(target, card, { width: innerWidth, height: innerHeight }, undefined, this.isRtl());
    this.panel.style.left = `${pos.left}px`;
    this.panel.style.top = `${pos.top}px`;
    this.panel.dataset.placement = pos.placement;
    this.arrow.hidden = pos.placement === 'floating' || pos.placement === 'left' || pos.placement === 'right';
    if (!this.arrow.hidden) {
      this.arrow.style.left = `${pos.left + pos.arrowLeft - 8}px`;
      this.arrow.style.top = `${pos.placement === 'below' ? pos.top - 8 : pos.top + card.height - 8}px`;
    }
  }

  private goalForm(compact = false): HTMLElement {
    const form = this.el('form');
    if (compact) form.className = 'hp-goal-compact';
    const label = this.el('label', { className: compact ? 'hp-sr-only' : '' }, this.t('goalQuestion'));
    const input = this.el('input', { type: 'text', name: 'goal', autocomplete: 'off' });
    input.setAttribute('data-autofocus', '');
    input.setAttribute('data-key', 'goal');
    input.setAttribute('aria-label', this.t('goalAria'));
    input.setAttribute('part', 'goal-input');
    input.placeholder = this.t('goalPlaceholder');
    if (this.view.kind === 'step' || this.view.kind === 'done') input.value = this.wt?.goal ?? '';
    const ask = pt(this.el('button', { type: 'submit', className: 'hp-primary' }, this.t('submit')), 'button button-primary');
    const row = this.el('div', { className: 'hp-row' });
    row.append(input, ask);
    if (this.micOk) {
      const mic = pt(this.el('button', { type: 'button' }, this.recording ? this.t('stop') : this.t('speak')), 'button button-secondary');
      mic.setAttribute('aria-pressed', String(this.recording));
      mic.setAttribute('data-key', 'mic');
      mic.addEventListener('click', () => void this.toggleRecording());
      row.append(mic);
    }
    const assist = pt(this.el('label', { className: 'hp-assist' }), 'toggle');
    const box = this.el('input', { type: 'checkbox', checked: this.assist });
    box.setAttribute('data-key', 'assist');
    box.addEventListener('change', () => {
      this.assist = box.checked;
      void this.render();
    });
    assist.append(box, this.el('span', {}, this.t('assistToggle')));
    form.append(label, row, assist);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      void this.ask(input.value);
    });
    return form;
  }

  private alert(msg: string): HTMLElement {
    return pt(this.el('div', { className: 'hp-alert', role: 'alert' } as Partial<HTMLDivElement>, msg), 'alert');
  }

  private renderInsufficient(wt: Walkthrough): void {
    const box = this.alert(wt.message ?? this.t('insufficient'));
    if (wt.missingEvidence?.length) {
      const ul = this.el('ul');
      wt.missingEvidence.forEach((m) => ul.append(this.el('li', {}, m)));
      box.append(ul);
    }
    this.panel.append(box);
    const suggestions = wt.suggestions ?? [];
    if (!suggestions.length) return;
    // Titles come from the server: textContent only, and asking for one sends it back as the goal.
    const group = pt(this.el('div', { className: 'hp-suggest' }), 'suggestions');
    group.setAttribute('role', 'group');
    group.setAttribute('aria-labelledby', 'hp-suggest-label');
    group.append(this.el('p', { id: 'hp-suggest-label', className: 'hp-suggest-label' }, this.t('suggestLabel')));
    suggestions.forEach((s, i) => {
      const b = pt(this.el('button', { type: 'button', className: 'hp-suggestion' }, s.title), 'button button-secondary suggestion');
      b.setAttribute('data-key', `suggest-${i}`);
      b.addEventListener('click', () => void this.ask(s.title));
      group.append(b);
    });
    this.panel.append(group);
    // The alert above already announces the message; only add the choices.
    this.announce(this.t('suggestAnnounce', { list: suggestions.map((s) => s.title).join('; ') }));
  }

  private renderStep(step: WalkthroughStep): void {
    const total = this.wt!.steps.length;
    const p = this.panel;
    p.append(pt(this.el('span', { className: 'hp-progress hp-sr-only' }, this.t('stepProgress', { current: this.index + 1, total })), 'progress'));
    const title = pt(this.el('h2', {}, step.title), 'title');
    title.setAttribute('data-key', 'title');
    title.tabIndex = -1;
    if (this.focusTitle) queueMicrotask(() => title.focus({ preventScroll: true }));
    this.focusTitle = false;
    p.append(title, pt(this.el('p', {}, step.instruction), 'text'));
    if (step.value) p.append(pt(this.el('p', {}, this.t('suggestedValue', { value: step.value })), 'text'));
    // In assist mode, say plainly which steps the guide will not do. Gated steps already explain themselves below.
    this.hintEl = pt(this.el('p', { className: 'hp-assist-hint' }, this.t('assistHint')), 'hint');
    this.hintEl.hidden = !(this.assist && !needsGate(step) && (step.action === 'type' || step.action === 'select' || step.action === 'navigate'));
    p.append(this.hintEl);

    const gated = needsGate(step);
    const ok = this.confirmed.has(step.id);
    if (gated) {
      const warn = pt(this.el('div', { className: 'hp-warn' }), 'warning');
      warn.append(this.el('strong', {}, this.t('gateWarning')));
      const lab = this.el('label');
      const cb = this.el('input', { type: 'checkbox', checked: ok });
      cb.setAttribute('data-key', 'confirm');
      cb.addEventListener('change', () => void this.confirm());
      lab.append(cb, ` ${this.t('gateCheckbox')}`);
      warn.append(this.el('br'), lab);
      p.append(warn);
    }

    const nav = this.el('div', { className: 'hp-row' });
    const back = pt(this.el('button', { type: 'button', className: 'hp-back', disabled: this.index === 0 }, this.t('back')), 'button button-secondary');
    back.addEventListener('click', () => void this.prev());
    const skip = pt(this.el('button', { type: 'button', className: 'hp-skip' }, this.t('skip')), 'button button-secondary');
    skip.setAttribute('data-key', 'skip');
    skip.addEventListener('click', () => void this.skip());
    const last = this.index === total - 1;
    const blocked = gated && !ok;
    const nextBtn = pt(this.el('button', { type: 'button', className: 'hp-primary' }, last ? this.t('finish') : this.t('next')), 'button button-primary');
    nextBtn.setAttribute('data-key', 'next');
    if (blocked) {
      nextBtn.setAttribute('aria-disabled', 'true');
      nextBtn.setAttribute('aria-describedby', 'hp-why');
      nav.append(this.el('span', { id: 'hp-why', hidden: true }, this.t('gateWhy')));
    }
    nextBtn.addEventListener('click', () => void this.next());
    const actions = pt(this.el('div', { className: 'hp-row' }), 'actions');
    actions.append(skip, nextBtn);
    nav.append(back, actions);
    p.append(nav);

    if (step.evidence.length) {
      const d = pt(this.el('details', { className: 'hp-evidence' }), 'evidence');
      d.append(this.el('summary', {}, this.t('evidenceSummary', { count: step.evidence.length })));
      step.evidence.forEach((e) =>
        d.append(this.el('div', {}, `${e.sourceType} · ${e.path}:${e.lineStart}${e.lineEnd !== e.lineStart ? '-' + e.lineEnd : ''} — ${e.excerpt}`)),
      );
      p.append(d);
    }
    this.announce(this.t('stepAnnounce', { current: this.index + 1, total, title: step.title, instruction: step.instruction }));
  }

  /** Resolve the live DOM target; a gated step stays un-highlighted until confirmed. */
  private async locate(step: WalkthroughStep, token: number): Promise<void> {
    this.hl.hide();
    const t = step.target;
    const hasTarget = t.selectors.length > 0 || !!t.text || !!t.label;
    if (!hasTarget) return;
    const found = await waitForResolution(t, this.opts.targetTimeoutMs ?? 1500, document);
    if (token !== this.renderToken) return; // superseded by a newer render
    if (found.status === 'found') {
      this.target = found.element;
      this.anchor = found.element.parentElement;
      this.targetOffset = frameOffset(found.element);
      // Keep the host control clickable before confirmation without arming it.
      if (!needsGate(step) || this.confirmed.has(step.id)) this.hl.show(found.element);
      if (this.assist && step.action === 'click' && !needsGate(step) && this.hintEl && this.assistBlock(found.element)) this.hintEl.hidden = false;
      return;
    }
    this.missing = true;
    const name = t.text ?? t.label ?? t.selectors[0];
    const ambiguous = found.status === 'ambiguous';
    this.ambiguous = ambiguous;
    const box = this.alert(
      ambiguous
        ? this.t('ambiguous', { label: name })
        : this.t('notFound', { label: name }),
    );
    const row = this.el('div', { className: 'hp-row' });
    const retry = pt(this.el('button', { type: 'button' }, this.t('tryAgain')), 'button button-secondary');
    retry.setAttribute('data-key', 'retry');
    retry.addEventListener('click', () => void this.retry());
    const skip = pt(this.el('button', { type: 'button' }, this.t('skipStep')), 'button button-secondary');
    skip.setAttribute('data-key', 'skip');
    skip.addEventListener('click', () => void this.skip());
    row.append(retry, skip);
    box.append(row);
    this.panel.append(box);
    this.announce(this.t(ambiguous ? 'ambiguousAnnounce' : 'notFoundAnnounce', { title: step.title }));
  }

  private announce(msg: string): void {
    const text = this.assistNote && !this.assistNote.alert ? `${this.assistNote.text} ${msg}` : msg;
    this.live.textContent = '';
    queueMicrotask(() => (this.live.textContent = text));
  }
}
