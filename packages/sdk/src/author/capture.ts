import { CLICKABLE, contextOf, controlName, isDisabled, isRecordable, isSensitiveField, isTextEntry, looksLikePageData, tagOf, typeOf } from './policy';
import { MAX_LABEL, routeName } from './flow';
import type { StepKind } from './draft';

export interface Captured {
  kind: StepKind;
  label: string;
  sensitive: boolean;
  pageData: boolean;
  context: string;
  el: HTMLElement;
}

export interface CaptureOptions {
  isRecording(): boolean;
  /** True for events that came from the author panel itself. */
  isOwn(path: EventTarget[]): boolean;
  recordRows(): boolean;
  /** Programmatic events (a script clicking for the user, the guide's own Assist) are not recordings. Tests may opt in. */
  acceptUntrusted: boolean;
  onStep(c: Captured): void;
  onPage(path: string): void;
}

const ROWS = 'tr, td, th, li, [role="row"], [role="gridcell"], [role="cell"], [role="listitem"]';
const DEBOUNCE_MS = 400;

const parentOf = (n: Element): Element | null => {
  if (n.parentElement) return n.parentElement;
  const root = n.getRootNode() as ShadowRoot;
  return root.nodeType === 11 && root.host ? root.host : null; // a shadow root, from any realm
};

/**
 * Watches the page the way a person uses it and reports controls, never values. It reads the accessible name of what was
 * clicked, typed into or changed, and nothing else: no `value`, no field contents, no URL beyond the route.
 */
export class Capture {
  private docs = new Set<Document>();
  private lastKey = '';
  private lastAt = 0;
  private lastTyped: Element | null = null;
  private lastPath = '';
  private timer: ReturnType<typeof setInterval> | undefined;
  private observer: MutationObserver | undefined;
  private readonly frameLoads = new Map<HTMLIFrameElement, () => void>();

  constructor(private readonly o: CaptureOptions) {}

  start(): void {
    this.attach(document);
    this.scanFrames(document);
    this.lastPath = routeName(location.pathname);
    this.observer = new MutationObserver((records) => {
      for (const r of records) for (const n of Array.from(r.addedNodes)) if (n instanceof Element) this.scanFrames(n.tagName === 'IFRAME' ? n.ownerDocument : n);
    });
    this.observer.observe(document.documentElement, { childList: true, subtree: true });
    this.timer = setInterval(() => this.checkRoute(), 500);
  }

  stop(): void {
    this.observer?.disconnect();
    if (this.timer) clearInterval(this.timer);
    for (const [frame, fn] of this.frameLoads) frame.removeEventListener('load', fn);
    this.frameLoads.clear();
    for (const d of this.docs) this.detach(d);
    this.docs.clear();
  }

  /** A full page load or a route change while recording becomes one informational note. */
  checkRoute(): void {
    if (!this.o.isRecording()) return;
    const now = routeName(location.pathname);
    if (now !== this.lastPath) {
      this.lastPath = now;
      this.o.onPage(now);
    }
  }

  /** Called when recording starts or resumes, so a route change while paused is not reported as a step's consequence. */
  syncRoute(): void { this.lastPath = routeName(location.pathname); }

  private scanFrames(root: ParentNode): void {
    const frames = tagOf(root as Node) === 'iframe' ? [root as HTMLIFrameElement] : Array.from(root.querySelectorAll('iframe'));
    for (const f of frames) {
      if (!this.frameLoads.has(f)) {
        const fn = () => this.attachFrame(f);
        f.addEventListener('load', fn);
        this.frameLoads.set(f, fn);
      }
      this.attachFrame(f);
    }
  }

  private attachFrame(f: HTMLIFrameElement): void {
    try {
      const d = f.contentDocument;
      if (d && d.defaultView && !this.docs.has(d)) this.attach(d);
    } catch { /* cross-origin frame: not recordable */ }
  }

  private attach(d: Document): void {
    d.addEventListener('click', this.onClick, true);
    d.addEventListener('input', this.onInput, true);
    d.addEventListener('change', this.onChange, true);
    d.addEventListener('submit', this.onSubmit, true);
    this.docs.add(d);
  }

  private detach(d: Document): void {
    d.removeEventListener('click', this.onClick, true);
    d.removeEventListener('input', this.onInput, true);
    d.removeEventListener('change', this.onChange, true);
    d.removeEventListener('submit', this.onSubmit, true);
  }

  private accept(e: Event): { path: EventTarget[]; target: Element } | null {
    if (!this.o.isRecording()) return null;
    if (!e.isTrusted && !this.o.acceptUntrusted) return null;
    const path = e.composedPath();
    if (this.o.isOwn(path)) return null;
    const first = path[0] as Node | undefined;
    const target = first?.nodeType === 1 ? (first as Element) : first?.nodeType === 3 ? first.parentElement : null; // not instanceof: frames are other realms
    return target ? { path, target } : null;
  }

  private emit(c: Captured, key: string): void {
    const now = Date.now();
    if (key === this.lastKey && now - this.lastAt < DEBOUNCE_MS) return; // double fire, or a label click and its control's click
    this.lastKey = key;
    this.lastAt = now;
    if (c.kind !== 'type') this.lastTyped = null;
    this.o.onStep(c);
  }

  private control(target: Element): HTMLElement | null {
    for (let n: Element | null = target, i = 0; n && i < 10; n = parentOf(n), i++) {
      if (tagOf(n) === 'label') { if ((n as HTMLLabelElement).control) return null; continue; } // the control's own click follows
      if (n.matches(CLICKABLE)) return n as HTMLElement;
    }
    // A clickable <div>: the outermost element of a short chain that shows a pointer cursor and has a short text.
    let top: HTMLElement | null = null;
    let n: Element | null = target;
    for (let i = 0; n && i < 4; n = parentOf(n), i++) {
      if (n.nodeType === 1 && n.ownerDocument.defaultView?.getComputedStyle(n).cursor === 'pointer') top = n as HTMLElement;
      else if (top) break;
    }
    if (top && controlName(top).length <= MAX_LABEL) return top;
    return null;
  }

  private onClick = (e: Event): void => {
    const a = this.accept(e);
    if (!a) return;
    let el = this.control(a.target);
    let row = false;
    if (!el && this.o.recordRows()) {
      el = a.target.closest<HTMLElement>(ROWS);
      row = !!el;
    }
    if (!el || isDisabled(el) || !isRecordable(el)) return;
    const label = row ? controlName(el).slice(0, MAX_LABEL) : controlName(el);
    this.emit({ kind: 'click', label, sensitive: false, pageData: row || looksLikePageData(label, el), context: contextOf(el), el }, `click:${label}`);
  };

  private onInput = (e: Event): void => {
    const a = this.accept(e);
    if (!a || !isTextEntry(a.target)) return;
    const el = a.target as HTMLElement;
    if (this.lastTyped === el) return; // still typing in the same field
    if (!isRecordable(el)) return;
    const label = controlName(el);
    this.emit({ kind: 'type', label, sensitive: isSensitiveField(el), pageData: false, context: contextOf(el), el }, `type:${label}`);
    this.lastTyped = el;
  };

  private onChange = (e: Event): void => {
    const a = this.accept(e);
    if (!a) return;
    const el = a.target as HTMLElement;
    if (!(tagOf(el) === 'select' || (tagOf(el) === 'input' && typeOf(el) === 'file'))) return;
    if (!isRecordable(el)) return;
    const label = controlName(el);
    this.emit({ kind: 'select', label, sensitive: isSensitiveField(el), pageData: false, context: contextOf(el), el }, `select:${label}`);
  };

  /** Enter in a field submits the form without a click on the button: record the button the person would have pressed. */
  private onSubmit = (e: Event): void => {
    const a = this.accept(e);
    if (!a || (e as SubmitEvent).submitter) return;
    const form = a.target.closest('form');
    const btn = form?.querySelector<HTMLElement>('button[type="submit"], button:not([type]), input[type="submit"]');
    if (!btn || !isRecordable(btn)) return;
    const label = controlName(btn);
    this.emit({ kind: 'click', label, sensitive: false, pageData: looksLikePageData(label, btn), context: contextOf(btn), el: btn }, `click:${label}`);
  };
}
