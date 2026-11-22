// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 HeyPointer
/**
 * The PRD-format Markdown `heypointer scan` reads. These helpers mirror the scanner's authoring rules
 * (the scanner cannot ship in a browser bundle); an internal test renders the same drafts through
 * the real scanner and fails if the two ever disagree.
 */
export const MAX_STEPS = 100;
/** A whole step sentence. Longer text is cut when recording and refused when edited. */
export const MAX_STEP_TEXT = 120;
/** The longest control label a recorded step quotes. */
export const MAX_LABEL = 72;

const CONSEQUENTIAL_VERB = /^(send|submit|delete|remove|pay|purchase|buy|publish|transfer|confirm|deploy|cancel)\b/i;
export const isConsequentialLabel = (text: string | undefined): boolean => !!text && CONSEQUENTIAL_VERB.test(text.trim());

/** Control characters out, whitespace collapsed. */
export const clean = (s: string): string => s.replace(/[\u0000-\u001f\u007f-\u009f]+/g, ' ').replace(/\s+/g, ' ').trim();
/** A label goes between double quotes in a sentence, so it cannot contain them. */
export const forQuotes = (s: string): string => clean(s).replace(/["“”]/g, "'");

export const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'flow';
const quoted = (text: string): string[] => [...text.matchAll(/["“]([^"”]+)["”]/g)].map((m) => m[1]!);
/** What the scanner treats as the step's target: the first quoted phrase. */
export const quotedLabel = (text: string): string => [...text.matchAll(/"([^"]+)"|“([^”]+)”/g)].map((m) => (m[1] ?? m[2] ?? '').trim()).filter(Boolean)[0] ?? '';
const withPeriod = (s: string): string => (/[.!?]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);

export function stepSentence(text: string, consequential = false): string {
  const t = withPeriod(text);
  const labelRisk = quoted(t).some((q) => isConsequentialLabel(q));
  return (consequential || labelRisk) && !/\bconsequential\b/i.test(t) ? `${t} This is a consequential action.` : t;
}

export interface FlowText {
  title: string;
  steps: string[];
}

export function renderFlow(flow: FlowText, opts: { consequential?: Set<number>; note?: string } = {}): string {
  const out = [`# PRD: ${flow.title}`, ''];
  if (opts.note) out.push(opts.note, '');
  flow.steps.forEach((s, i) => out.push(`${i + 1}. ${stepSentence(s, opts.consequential?.has(i))}`));
  return `${out.join('\n')}\n`;
}

/** What the scanner would complain about, found without the scanner. Empty means usable. */
export function problemsOf(flow: FlowText, titleMessage: string): string[] {
  const problems: string[] = [];
  if (!clean(flow.title)) problems.push(titleMessage);
  if (flow.steps.length === 0) problems.push('a flow needs at least one step');
  flow.steps.forEach((s, i) => {
    if (!quotedLabel(s)) problems.push(`step ${i + 1} names no control: put the visible label in quotes, e.g. Click "Change plan"`);
  });
  return problems;
}

/** Route segments that look like record ids are not part of the page name. */
export function routeName(pathname: string): string {
  const parts = pathname.split('/').map((seg) => {
    let s = seg;
    try { s = decodeURIComponent(seg); } catch { /* keep raw */ }
    return /^\d{4,}$/.test(s) || /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(s) || /^[0-9a-f]{16,}$/i.test(s) || s.length > 40 ? ':id' : clean(s).replace(/[^\w.~:-]/g, '_');
  });
  const out = parts.join('/') || '/';
  return out.startsWith('/') ? out : `/${out}`;
}
