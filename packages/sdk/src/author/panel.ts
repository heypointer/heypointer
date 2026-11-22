import CSS from './panel.css?inline';
import { authorText, type ResolvedAuthorLabels, type AuthorLabelKey } from './labels';
import { fileName, hasGate, problems, toMarkdown, type DraftStore, type Entry, type StepEntry } from './draft';
import { MAX_STEP_TEXT, MAX_STEPS } from './flow';

export type Mode = 'idle' | 'recording' | 'paused' | 'review';

/** What the panel needs from the controller. The panel holds no state of its own beyond what it draws. */
export interface PanelApi {
  store: DraftStore;
  mode(): Mode;
  recordRows(): boolean;
  setRecordRows(on: boolean): void;
  record(): void;
  pause(): void;
  stop(): void;
  keepRecording(): void;
  discard(): void;
  /** End author mode and remove the panel (asks first when a draft exists). */
  close(): void;
  /** The author changed a step's sentence: re-read the control name and check it again. */
  edited(id: number): void;
  recheckAll(): void;
  addContext(id: number): void;
}

type Child = Node | string | null | false;
function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string | boolean> = {}, ...kids: Child[]): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false) continue;
    n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids) if (c) n.append(c);
  return n;
}

/** A constructable stylesheet is allowed under a strict `style-src`; a <style> element is not. Older engines get the element. */
function adoptCss(root: ShadowRoot): void {
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(CSS);
    root.adoptedStyleSheets = [sheet];
  } catch {
    const style = document.createElement('style');
    style.textContent = CSS;
    root.prepend(style);
  }
}

export class Panel {
  readonly host: HTMLElement;
  private readonly root: ShadowRoot;
  private readonly panel: HTMLElement;
  private readonly live: HTMLElement;
  private minimized = false;
  private side: 'start' | 'end' = 'start';
  private stepsOpen = false;
  private copiedNote = '';
  private unsub: () => void;
  private pendingFocus = '';
  private readonly onKey = (e: KeyboardEvent) => {
    if (e.altKey && e.shiftKey && e.code === 'KeyG') {
      e.preventDefault();
      this.minimized = false;
      this.render();
      this.focus('rec');
    }
  };

  constructor(private readonly api: PanelApi, private labels: ResolvedAuthorLabels, opts: { mountTo?: HTMLElement; dir?: string; lang?: string; scheme?: string; themeVars?: Record<string, string> }) {
    this.host = document.createElement('div');
    this.host.setAttribute('data-heypointer-author', '');
    this.host.style.pointerEvents = 'none';
    if (opts.dir === 'ltr' || opts.dir === 'rtl') this.host.setAttribute('dir', opts.dir);
    if (opts.lang) this.host.setAttribute('lang', opts.lang);
    if (opts.scheme === 'light' || opts.scheme === 'dark') this.host.setAttribute('data-scheme', opts.scheme);
    for (const [k, v] of Object.entries(opts.themeVars ?? {})) this.host.style.setProperty(k, v);
    this.root = this.host.attachShadow({ mode: 'open' });
    this.panel = h('section', { class: 'panel', role: 'dialog', part: 'author-panel' });
    this.live = h('div', { class: 'sr', role: 'status', 'aria-live': 'polite' });
    this.root.append(this.panel, this.live);
    adoptCss(this.root);
    (opts.mountTo ?? document.body).appendChild(this.host);
    this.unsub = api.store.subscribe(() => this.render());
    document.addEventListener('keydown', this.onKey, true);
    this.render();
  }

  setLabels(labels: ResolvedAuthorLabels): void { this.labels = labels; this.render(); }
  destroy(): void { this.unsub(); document.removeEventListener('keydown', this.onKey, true); this.host.remove(); }
  /** Move focus into the panel (the Alt+Shift+G shortcut, and after a review step). */
  focus(key: string): void { this.pendingFocus = key; this.applyFocus(); }

  private t(key: AuthorLabelKey, vars?: Record<string, string | number>): string { return authorText(this.labels, key, vars); }

  private applyFocus(): void {
    if (!this.pendingFocus) return;
    const el = this.root.querySelector<HTMLElement>(`[data-k="${this.pendingFocus}"]`);
    if (el) { el.focus(); this.pendingFocus = ''; }
  }

  private announce(text: string): void { this.live.textContent = text; }

  render(): void {
    const mode = this.api.mode();
    const active = this.root.activeElement as HTMLElement | null;
    const keep = active?.getAttribute('data-k') ?? '';
    const caret = active instanceof HTMLInputElement && active.type === 'text' ? [active.selectionStart, active.selectionEnd] : null;
    const store = this.api.store;
    const count = store.stepCount;
    this.panel.setAttribute('aria-label', this.t('authorDialogName'));
    this.panel.setAttribute('data-mode', mode);
    if (this.minimized) this.panel.setAttribute('data-min', ''); else this.panel.removeAttribute('data-min');

    const status =
      mode === 'recording' ? this.t('authorStatusRecording', { count })
      : mode === 'paused' ? this.t('authorStatusPaused', { count })
      : mode === 'review' ? this.t('authorStatusReview')
      : this.t('authorStatusIdle');
    const fullNote = store.full ? ` ${this.t('authorLimit', { max: MAX_STEPS })}` : '';
    this.announce(status + fullNote);

    const header = h('div', { class: 'head' },
      h('h2', {}, h('span', { class: 'dot', 'aria-hidden': 'true' }), this.t('authorTitle')),
      h('div', { class: 'acts' },
        this.button(this.minimized ? '▢' : '–', 'min', () => { this.minimized = !this.minimized; this.render(); }, 'icon', { 'aria-label': this.minimized ? this.t('authorExpand') : this.t('authorMinimize'), 'aria-expanded': String(!this.minimized) }),
        this.button('⇄', 'side', () => { this.side = this.side === 'start' ? 'end' : 'start'; this.render(); }, 'icon', { 'aria-label': this.t('authorMove') }),
        this.button('✕', 'close', () => this.api.close(), 'icon', { 'aria-label': this.t('authorClose') }),
      ),
    );
    const body = h('div', { class: 'body' });
    body.append(h('p', { class: 'status' }, status + fullNote));
    // While recording the panel stays small so it does not cover the app being recorded.
    if (mode !== 'recording') body.append(this.titleField());
    body.append(mode === 'review' ? this.reviewView() : this.editView(mode));
    if (mode !== 'recording') {
      body.append(h('p', { class: 'small' }, this.t('authorPrivacy')));
      body.append(h('details', {}, h('summary', {}, this.t('authorAbout')), h('p', { class: 'small' }, this.t('authorShortcut'))));
    }
    if (this.side === 'end') this.host.setAttribute('data-side', 'end'); else this.host.removeAttribute('data-side');
    this.panel.replaceChildren(header, body);

    if (keep) this.pendingFocus = keep;
    this.applyFocus();
    const el = this.root.activeElement;
    if (caret && el instanceof HTMLInputElement && el.type === 'text') { try { el.setSelectionRange(caret[0] ?? 0, caret[1] ?? 0); } catch { /* not selectable */ } }
  }

  private button(text: string, key: string, onClick: () => void, cls = '', extra: Record<string, string | boolean> = {}): HTMLButtonElement {
    const b = h('button', { type: 'button', 'data-k': key, ...(cls ? { class: cls } : {}), ...extra }, text);
    b.addEventListener('click', onClick);
    return b;
  }

  private titleField(): HTMLElement {
    const input = h('input', { type: 'text', 'data-k': 'title', maxlength: '80', placeholder: this.t('authorFlowTitlePlaceholder'), autocomplete: 'off', part: 'author-title' });
    input.value = this.api.store.draft.title;
    input.addEventListener('input', () => this.api.store.draft.title = input.value);
    input.addEventListener('change', () => { this.api.store.setTitle(input.value); });
    return h('label', { class: 'field' }, h('span', {}, this.t('authorFlowTitle')), input);
  }

  private editView(mode: Mode): HTMLElement {
    const store = this.api.store;
    const wrap = h('div', { class: 'body flush' });
    const controls = h('div', { class: 'row' });
    if (mode === 'recording') controls.append(this.button(this.t('authorPause'), 'rec', () => this.api.pause()));
    else controls.append(this.button(mode === 'paused' ? this.t('authorResume') : this.t('authorRecord'), 'rec', () => this.api.record(), 'rec'));
    controls.append(
      this.button(this.t('authorStop'), 'stop', () => this.api.stop(), 'primary', store.stepCount === 0 ? { disabled: true } : {}),
      this.button(this.t('authorUndo'), 'undo', () => store.undo(), '', store.draft.entries.length === 0 ? { disabled: true } : {}),
    );
    wrap.append(controls);
    const rows = h('input', { type: 'checkbox', 'data-k': 'rows' });
    rows.checked = this.api.recordRows();
    rows.addEventListener('change', () => this.api.setRecordRows(rows.checked));
    wrap.append(h('label', { class: 'check' }, rows, h('span', {}, this.t('authorRows'))));
    if (store.draft.entries.length === 0) wrap.append(h('p', { class: 'hint' }, this.t('authorEmpty')));
    else {
      const open = mode !== 'recording' || this.stepsOpen;
      const details = h('details', { 'data-k': 'steps', ...(open ? { open: true } : {}) }, h('summary', {}, this.t('authorSteps', { count: store.stepCount })), this.list());
      details.addEventListener('toggle', () => { if (mode === 'recording') this.stepsOpen = details.open; });
      wrap.append(details);
    }
    if (store.stepCount > 0) wrap.append(h('div', { class: 'row' }, this.button(this.t('authorRecheck'), 'recheck', () => this.api.recheckAll())));
    return wrap;
  }

  private list(): HTMLElement {
    const ol = h('ol', { class: 'steps', 'aria-label': this.t('authorTitle') });
    let n = 0;
    for (const e of this.api.store.draft.entries) ol.append(e.t === 'note' ? this.noteItem(e) : this.stepItem(e, ++n));
    return ol;
  }

  private noteItem(e: Entry & { t: 'note' }): HTMLElement {
    const label = this.t('authorNote', { path: e.text });
    return h('li', { class: 'note' }, h('span', {}, label), this.button('✕', `note-${e.id}`, () => this.api.store.remove(e.id), 'icon', { 'aria-label': this.t('authorDeleteNote') }));
  }

  private chips(s: StepEntry): { chips: HTMLElement; hints: HTMLElement[] } {
    const chips = h('div', { class: 'chips' });
    const hints: HTMLElement[] = [];
    const chip = (cls: string, text: string, hint?: string) => {
      chips.append(h('span', { class: `chip ${cls}`, part: 'author-chip' }, text));
      if (hint) hints.push(h('p', { class: 'hint' }, hint));
    };
    const st = s.status;
    if (st.kind === 'unique') chip('ok', this.t('authorChipUnique'));
    else if (st.kind === 'ambiguous') chip('err', this.t('authorChipAmbiguous', { count: st.count }), this.t('authorHintAmbiguous', { count: st.count }));
    else if (st.kind === 'noname') chip('err', this.t('authorChipNoName'), this.t('authorHintNoName'));
    else if (st.kind === 'notfound') chip('warn', this.t('authorChipNotFound'), this.t('authorHintNotFound'));
    else chip('info', this.t('authorChipUnchecked'), this.t('authorHintUnchecked'));
    if (s.pageData) chip('warn', this.t('authorChipPageData'), this.t('authorHintPageData'));
    if (s.sensitive) chip('info', this.t('authorChipSensitive'), this.t('authorHintSensitive'));
    return { chips, hints };
  }

  private stepItem(s: StepEntry, n: number): HTMLElement {
    const { chips, hints } = this.chips(s);
    const text = h('input', { type: 'text', 'data-k': `s${s.id}-text`, maxlength: String(MAX_STEP_TEXT), 'aria-label': this.t('authorStepText', { n }), autocomplete: 'off', part: 'author-step' });
    text.value = s.text;
    text.addEventListener('input', () => this.api.store.editText(s.id, text.value, true));
    text.addEventListener('change', () => this.api.edited(s.id));
    const auto = hasGate(s) && !s.consequential;
    const gate = h('input', { type: 'checkbox', 'data-k': `s${s.id}-gate` });
    gate.checked = hasGate(s);
    gate.disabled = auto;
    gate.addEventListener('change', () => this.api.store.toggleConsequential(s.id));
    const acts = h('div', { class: 'acts' },
      h('label', { class: 'check' }, gate, h('span', {}, auto ? this.t('authorConsequentialAuto') : this.t('authorConsequential'))),
      this.button('▲', `s${s.id}-up`, () => { this.pendingFocus = `s${s.id}-up`; this.api.store.move(s.id, -1); }, 'icon', { 'aria-label': this.t('authorMoveUp', { n }) }),
      this.button('▼', `s${s.id}-down`, () => { this.pendingFocus = `s${s.id}-down`; this.api.store.move(s.id, 1); }, 'icon', { 'aria-label': this.t('authorMoveDown', { n }) }),
      this.button('✕', `s${s.id}-del`, () => this.api.store.remove(s.id), 'icon', { 'aria-label': this.t('authorDelete', { n }) }),
    );
    const extra: HTMLElement[] = [];
    if (s.status.kind === 'ambiguous' && s.context) extra.push(this.button(this.t('authorAddContext', { context: s.context }), `s${s.id}-ctx`, () => this.api.addContext(s.id)));
    return h('li', { class: 'step', part: 'author-item' }, chips, text, ...hints, acts, ...extra);
  }

  private reviewView(): HTMLElement {
    const store = this.api.store;
    const wrap = h('div', { class: 'body flush' });
    const found = problems(store.draft, this.t('authorTitleRequired'));
    const md = toMarkdown(store.draft);
    const file = fileName(store.draft);
    wrap.append(h('h3', { class: 'h3' }, this.t('authorPreview')));
    if (found.length) {
      const ul = h('ul', { class: 'problems', role: 'alert' });
      for (const p of found) ul.append(h('li', {}, p));
      wrap.append(h('p', { class: 'hint' }, this.t('authorProblems')), ul);
    }
    const pre = h('pre', { tabindex: '0', 'aria-label': this.t('authorPreview'), part: 'author-preview' });
    pre.append(h('code', {}, md));
    wrap.append(pre);
    const row = h('div', { class: 'row' },
      this.button(this.t('authorCopy'), 'copy', () => void this.copy(md), 'primary', found.length ? { disabled: true } : {}),
      this.button(this.t('authorDownload', { file }), 'download', () => this.download(file, md), '', found.length ? { disabled: true } : {}),
    );
    wrap.append(row);
    if (this.copiedNote) wrap.append(h('p', { class: 'hint', role: 'status' }, this.copiedNote));
    wrap.append(h('p', { class: 'hint' }, this.t('authorNextHeading')),
      h('div', { class: 'cmds' }, h('code', {}, `heypointer flows import ${file} --publish`), h('code', {}, 'heypointer scan .')));
    wrap.append(h('div', { class: 'row' },
      this.button(this.t('authorKeepRecording'), 'keep', () => { this.copiedNote = ''; this.api.keepRecording(); }),
      this.button(this.t('authorDiscard'), 'discard', () => { if (confirm(this.t('authorDiscardConfirm'))) this.api.discard(); }),
    ));
    return wrap;
  }

  private async copy(md: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(md);
      this.copiedNote = this.t('authorCopied');
    } catch {
      this.copiedNote = this.t('authorCopyFailed');
    }
    this.pendingFocus = 'copy';
    this.render();
  }

  private download(file: string, md: string): void {
    const url = URL.createObjectURL(new Blob([md], { type: 'text/markdown;charset=utf-8' }));
    const a = h('a', { href: url, download: file });
    this.root.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
