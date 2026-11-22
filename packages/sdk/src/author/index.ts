// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 HeyPointer
import { resolveDetailed } from '../targeting/index';
import { sanitizeTheme, themeVars, COLOR_SCHEMES, type ColorScheme, type HeyPointerTheme } from '../theme';
import { Capture, type Captured } from './capture';
import {
  ACTIVE_KEY, DraftStore, clearPersisted, loadPersisted, savePersisted, sessionStore, sentenceFor, toMarkdown,
  type Draft, type Status,
} from './draft';
import { MAX_LABEL, MAX_STEP_TEXT, clean, quotedLabel, routeName } from './flow';
import { resolveAuthorLabels, type AuthorLabels, type ResolvedAuthorLabels } from './labels';
import { Panel, type Mode, type PanelApi } from './panel';
import { looksLikePageData } from './policy';

export { AUTHOR_LABELS, type AuthorLabels, type AuthorLabelKey } from './labels';
export { MAX_STEPS, MAX_STEP_TEXT, MAX_LABEL, renderFlow, stepSentence, slug } from './flow';
export type { Draft, Entry, StepEntry, NoteEntry, Status } from './draft';

export interface AuthorOptions {
  /** The same `labels` object the guide takes; author mode reads the keys that start with `author`. */
  labels?: AuthorLabels | Record<string, unknown>;
  theme?: HeyPointerTheme;
  colorScheme?: ColorScheme;
  dir?: 'auto' | 'ltr' | 'rtl';
  lang?: string;
  mountTo?: HTMLElement;
  /** Start with this flow title. */
  title?: string;
  /** Start recording at once instead of waiting for Record. */
  autoRecord?: boolean;
  /** Also record clicks on table rows and cells. They usually contain page data, so this is off. */
  recordRows?: boolean;
  /** Keep the draft in sessionStorage so a flow that spans page loads survives them. On by default. */
  persist?: boolean;
  /** Tests: where to keep the draft. */
  storage?: Storage | null;
  /** Tests and automation: also record events a script dispatched. Off, so the guide's own Assist clicks are never recorded. */
  acceptUntrusted?: boolean;
  /** Called after every change to the draft. */
  onChange?: (draft: Draft) => void;
}

export interface AuthorSession {
  /** End the session: stop recording, remove the panel and forget the stored draft. */
  stop(): void;
  getDraft(): Draft;
  toMarkdown(): string;
  pause(): void;
  resume(): void;
  readonly mode: Mode;
}

let current: (AuthorSession & { destroyed: boolean }) | null = null;

/** Classify a control name with the SAME resolver the guide uses at run time. */
export function classify(label: string, el?: Element): Status {
  if (!label) return { kind: 'noname' };
  if (label.length > MAX_LABEL) return { kind: 'notfound' };
  const r = resolveDetailed({ selectors: [], text: label });
  if (r.status === 'ambiguous') return { kind: 'ambiguous', count: r.count };
  if (r.status === 'missing') return el ? { kind: 'notfound' } : { kind: 'unchecked' };
  if (el && !(r.element === el || el.contains(r.element) || r.element.contains(el))) return { kind: 'notfound' };
  return { kind: 'unique' };
}

/**
 * Turn on author mode: a panel records what a person does in the app (clicks, fields they fill, choices they make) and
 * writes it as a flow draft in the PRD Markdown `heypointer scan` reads. It records control labels, never typed values.
 * Calling this is the explicit opt-in; nothing here is sent over the network.
 */
export function startAuthoring(opts: AuthorOptions = {}): AuthorSession {
  if (current && !current.destroyed) return current;
  const labels: ResolvedAuthorLabels = resolveAuthorLabels(opts.labels);
  const storage = opts.persist === false ? null : opts.storage !== undefined ? opts.storage : sessionStore();
  const saved = loadPersisted(storage);
  const store = new DraftStore(saved?.draft);
  if (opts.title && !store.draft.title) store.draft.title = clean(opts.title).slice(0, 80);
  let mode: Mode = saved ? (saved.recording ? 'recording' : 'paused') : 'idle';
  let rows = !!opts.recordRows;

  const persist = () => {
    if (mode === 'review' || (mode === 'idle' && store.draft.entries.length === 0)) return;
    savePersisted(storage, { draft: store.draft, recording: mode === 'recording' });
  };

  const setMode = (m: Mode) => { mode = m; persist(); panel.render(); };

  const capture = new Capture({
    isRecording: () => mode === 'recording',
    isOwn: (path) => path.includes(panel.host),
    recordRows: () => rows,
    acceptUntrusted: !!opts.acceptUntrusted,
    onPage: (path) => store.addNote(path),
    onStep: (c: Captured) => {
      const status = classify(c.label, c.el);
      const entry = store.addStep({
        kind: c.kind, text: sentenceFor(c.kind, c.label), consequential: false, status,
        pageData: c.pageData, sensitive: c.sensitive, context: c.context,
      });
      if (!entry || store.full) setMode('paused');
    },
  });

  const recheck = (id: number) => {
    const e = store.find(id);
    if (e?.t !== 'step') return;
    const label = quotedLabel(e.text);
    store.setStatus(id, classify(label), looksLikePageData(label));
  };

  const api: PanelApi = {
    store,
    mode: () => mode,
    recordRows: () => rows,
    setRecordRows: (on) => { rows = on; },
    record: () => {
      if (store.full) return;
      if (store.draft.entries.length === 0) store.addNote(routeName(location.pathname));
      capture.syncRoute();
      setMode('recording');
    },
    pause: () => setMode('paused'),
    stop: () => setMode('review'),
    keepRecording: () => { capture.syncRoute(); setMode('recording'); },
    close: () => {
      if (store.draft.entries.length && !confirm(labels.authorDiscardConfirm)) return;
      current?.stop();
    },
    discard: () => { store.clear(); clearPersisted(storage); mode = 'idle'; panel.render(); },
    edited: (id) => recheck(id),
    recheckAll: () => { for (const e of store.draft.entries) if (e.t === 'step') recheck(e.id); },
    addContext: (id) => {
      const e = store.find(id);
      if (e?.t !== 'step' || !e.context) return;
      const next = `${e.text.replace(/[.!?]$/, '')} in the ${e.context} area.`;
      if (next.length > MAX_STEP_TEXT) return;
      store.editText(id, next);
      recheck(id);
    },
  };

  const scheme = COLOR_SCHEMES.includes(opts.colorScheme as ColorScheme) ? opts.colorScheme : 'auto';
  const panel = new Panel(api, labels, {
    mountTo: opts.mountTo, dir: opts.dir, lang: opts.lang, scheme,
    themeVars: themeVars(sanitizeTheme(opts.theme).theme),
  });
  store.subscribe(() => { persist(); opts.onChange?.(store.draft); });

  capture.start();
  if (saved?.recording) { const now = routeName(location.pathname); store.addNote(now); capture.syncRoute(); }
  if (opts.autoRecord && mode === 'idle') api.record();
  persist();
  panel.render();

  const session = {
    destroyed: false,
    get mode() { return mode; },
    stop() {
      if (session.destroyed) return;
      session.destroyed = true;
      capture.stop();
      panel.destroy();
      clearPersisted(storage);
      current = null;
    },
    getDraft: () => JSON.parse(JSON.stringify(store.draft)) as Draft,
    toMarkdown: () => toMarkdown(store.draft),
    pause: () => api.pause(),
    resume: () => api.record(),
  };
  current = session;
  return session;
}

/** Was author mode left running by an earlier page of this session? Used to resume it after a full page load. */
export function authorWasActive(storage: Storage | null = sessionStore()): boolean {
  try { return storage?.getItem(ACTIVE_KEY) === '1'; } catch { return false; }
}

