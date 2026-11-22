// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 HeyPointer
import { MAX_LABEL, MAX_STEP_TEXT, MAX_STEPS, clean, forQuotes, isConsequentialLabel, problemsOf, quotedLabel, renderFlow, slug } from './flow';

export type StepKind = 'click' | 'type' | 'select';
export type Status = { kind: 'unique' } | { kind: 'ambiguous'; count: number } | { kind: 'noname' } | { kind: 'notfound' } | { kind: 'unchecked' };

export interface StepEntry {
  t: 'step';
  id: number;
  kind: StepKind;
  /** The sentence as it will be written, without the consequential suffix (that is added when rendering). */
  text: string;
  /** The author asked for a confirmation gate. A label such as "Buy now" gets one regardless. */
  consequential: boolean;
  status: Status;
  pageData: boolean;
  sensitive: boolean;
  /** The nearest landmark's name at the time of recording, offered as "Add context". */
  context: string;
}
export interface NoteEntry { t: 'note'; id: number; text: string }
export type Entry = StepEntry | NoteEntry;

export interface Draft {
  title: string;
  entries: Entry[];
}

const grammar: Record<StepKind, (label: string) => string> = {
  click: (l) => `Click "${l}".`,
  type: (l) => `Enter your ${l.toLowerCase().slice(0, 30).trim()} in "${l}".`,
  select: (l) => `Choose an option in "${l}".`,
};

/** The step sentence for a recorded control. The label never carries a double quote and never exceeds MAX_LABEL. */
export function sentenceFor(kind: StepKind, label: string): string {
  const l = forQuotes(label).slice(0, MAX_LABEL).trim();
  return l ? grammar[kind](l) : kind === 'click' ? 'Click the control.' : kind === 'type' ? 'Enter a value.' : 'Choose an option.';
}

export const stepsOf = (d: Draft): StepEntry[] => d.entries.filter((e): e is StepEntry => e.t === 'step');
export const hasGate = (s: StepEntry): boolean => s.consequential || isConsequentialLabel(quotedLabel(s.text));

/** The Markdown file, exactly as `heypointer generate flow` would write it. Notes become one plain paragraph. */
export function toMarkdown(d: Draft): string {
  const steps = stepsOf(d);
  const pages = d.entries.filter((e): e is NoteEntry => e.t === 'note').map((n) => n.text);
  const note = ['Recorded with HeyPointer author mode. Review every step before publishing.', pages.length ? `Pages visited while recording: ${[...new Set(pages)].join(', ')}.` : ''].filter(Boolean).join(' ');
  const consequential = new Set<number>();
  steps.forEach((s, i) => s.consequential && consequential.add(i));
  return renderFlow({ title: clean(d.title), steps: steps.map((s) => s.text) }, { consequential, note });
}

export const problems = (d: Draft, titleMessage: string): string[] => problemsOf({ title: d.title, steps: stepsOf(d).map((s) => s.text) }, titleMessage);
export const fileName = (d: Draft): string => `${slug(d.title)}.md`;

type Listener = () => void;

/** The draft plus the small operations the panel and the capture code need. Holds no DOM and no values. */
export class DraftStore {
  draft: Draft;
  private nextId = 1;
  private listeners = new Set<Listener>();

  constructor(initial?: Draft) {
    this.draft = initial ?? { title: '', entries: [] };
    this.nextId = this.draft.entries.reduce((m, e) => Math.max(m, e.id), 0) + 1;
  }

  subscribe(fn: Listener): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  private emit(): void { for (const fn of this.listeners) fn(); }

  get stepCount(): number { return stepsOf(this.draft).length; }
  get full(): boolean { return this.stepCount >= MAX_STEPS; }

  setTitle(title: string): void { this.draft.title = clean(title).slice(0, 80); this.emit(); }

  addStep(s: Omit<StepEntry, 't' | 'id'>): StepEntry | null {
    if (this.full) return null;
    const step: StepEntry = { ...s, t: 'step', id: this.nextId++, text: s.text.slice(0, MAX_STEP_TEXT) };
    this.draft.entries.push(step);
    this.emit();
    return step;
  }

  addNote(text: string): void {
    const last = this.draft.entries[this.draft.entries.length - 1];
    if (last?.t === 'note' && last.text === text) return;
    this.draft.entries.push({ t: 'note', id: this.nextId++, text });
    this.emit();
  }

  find(id: number): Entry | undefined { return this.draft.entries.find((e) => e.id === id); }

  /** The author edited a step's sentence. The status goes stale and is set again by the caller. */
  editText(id: number, text: string, quiet = false): StepEntry | null {
    const e = this.find(id);
    if (e?.t !== 'step') return null;
    e.text = clean(text).slice(0, MAX_STEP_TEXT);
    if (!quiet) this.emit();
    return e;
  }

  setStatus(id: number, status: Status, pageData?: boolean): void {
    const e = this.find(id);
    if (e?.t !== 'step') return;
    e.status = status;
    if (pageData !== undefined) e.pageData = pageData;
    this.emit();
  }

  toggleConsequential(id: number): void {
    const e = this.find(id);
    if (e?.t !== 'step') return;
    e.consequential = !e.consequential;
    this.emit();
  }

  move(id: number, delta: -1 | 1): void {
    const list = this.draft.entries;
    const steps = list.filter((e) => e.t === 'step');
    const at = steps.findIndex((e) => e.id === id);
    const to = at + delta;
    if (at < 0 || to < 0 || to >= steps.length) return;
    // Swap with the neighbouring step; notes stay where they are.
    const a = list.indexOf(steps[at]!);
    const b = list.indexOf(steps[to]!);
    [list[a], list[b]] = [list[b]!, list[a]!];
    this.emit();
  }

  remove(id: number): void {
    this.draft.entries = this.draft.entries.filter((e) => e.id !== id);
    this.emit();
  }

  /** Remove the newest step and any notes after it. */
  undo(): boolean {
    const list = this.draft.entries;
    let i = list.length - 1;
    while (i >= 0 && list[i]!.t === 'note') i--;
    if (i < 0) return false;
    list.length = i;
    this.emit();
    return true;
  }

  clear(): void { this.draft = { title: '', entries: [] }; this.emit(); }
}

// ---- persistence ----------------------------------------------------------------------------------------------

const KEY = 'heypointer:author:draft:v1';
export const ACTIVE_KEY = 'heypointer:author:active:v1';

export interface Persisted { draft: Draft; recording: boolean }

const isStatus = (s: unknown): s is Status => !!s && typeof s === 'object' && ['unique', 'ambiguous', 'noname', 'notfound', 'unchecked'].includes((s as Status).kind);

/** A stored draft, or null. Anything that does not look exactly like a draft is dropped. */
export function loadPersisted(storage: Storage | null): Persisted | null {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as { draft?: { title?: unknown; entries?: unknown[] }; recording?: unknown };
    if (!p.draft || typeof p.draft.title !== 'string' || !Array.isArray(p.draft.entries)) return null;
    const entries: Entry[] = [];
    for (const e of p.draft.entries.slice(0, MAX_STEPS * 3) as Record<string, unknown>[]) {
      if (e?.t === 'note' && typeof e.text === 'string') entries.push({ t: 'note', id: Number(e.id) || entries.length + 1, text: clean(e.text).slice(0, 120) });
      else if (e?.t === 'step' && typeof e.text === 'string' && ['click', 'type', 'select'].includes(e.kind as string) && isStatus(e.status)) {
        entries.push({
          t: 'step', id: Number(e.id) || entries.length + 1, kind: e.kind as StepKind, text: clean(e.text).slice(0, MAX_STEP_TEXT),
          consequential: e.consequential === true, status: e.status, pageData: e.pageData === true, sensitive: e.sensitive === true,
          context: typeof e.context === 'string' ? clean(e.context).slice(0, 40) : '',
        });
      }
    }
    return { draft: { title: clean(p.draft.title).slice(0, 80), entries }, recording: p.recording === true };
  } catch {
    return null;
  }
}

export function savePersisted(storage: Storage | null, p: Persisted): void {
  try { storage?.setItem(KEY, JSON.stringify(p)); storage?.setItem(ACTIVE_KEY, '1'); } catch { /* storage may be blocked */ }
}

export function clearPersisted(storage: Storage | null): void {
  try { storage?.removeItem(KEY); storage?.removeItem(ACTIVE_KEY); } catch { /* storage may be blocked */ }
}

export function sessionStore(): Storage | null {
  try { return typeof sessionStorage === 'undefined' ? null : sessionStorage; } catch { return null; }
}
