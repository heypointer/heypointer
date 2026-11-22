// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 HeyPointer
import { DEV, MAX_LABEL_LENGTH, fmt, warnOnce } from '../labels';

/**
 * Everything author mode shows. Same rules as the guide's labels: plain text with `{placeholder}`
 * substitution, applied with textContent only. Hosts pass them in the same `labels` object, with the
 * `author` prefix (`labels: { authorRecord: 'Aufnehmen' }`). The commands in the follow-up are code and stay as they are.
 */
export const AUTHOR_LABELS = {
  authorDialogName: 'HeyPointer author mode',
  authorTitle: 'Record steps',
  authorMinimize: 'Minimize',
  authorClose: 'Close author mode',
  authorMove: 'Move the panel to the other side',
  authorSteps: 'Steps ({count})',
  authorAbout: 'Privacy and shortcuts',
  authorExpand: 'Expand',
  authorFlowTitle: 'Flow title',
  authorFlowTitlePlaceholder: 'e.g. Add a product to the cart',
  authorRecord: 'Record',
  authorPause: 'Pause',
  authorResume: 'Resume',
  authorStop: 'Stop and review',
  authorUndo: 'Undo last step',
  authorRows: 'Record clicks on table rows and cells (they usually contain page data)',
  authorStatusIdle: 'Not recording. Press Record, then use your app the way a person would.',
  authorStatusRecording: 'Recording. {count} steps so far.',
  authorStatusPaused: 'Paused. {count} steps so far.',
  authorStatusReview: 'Review the draft. Nothing is sent anywhere.',
  authorEmpty: 'No steps yet. Click, type or choose something in your app.',
  authorStepText: 'Step {n} text',
  authorMoveUp: 'Move step {n} up',
  authorMoveDown: 'Move step {n} down',
  authorDelete: 'Delete step {n}',
  authorDeleteNote: 'Delete note',
  authorConsequential: 'Needs confirmation',
  authorConsequentialAuto: 'Needs confirmation (added automatically because of the label)',
  authorChipUnique: 'Unique control',
  authorChipAmbiguous: 'Ambiguous: {count} matches',
  authorChipNoName: 'No accessible name',
  authorChipPageData: 'Contains page data',
  authorChipNotFound: 'Not found by the guide',
  authorChipUnchecked: 'Not on this page',
  authorChipSensitive: 'Sensitive field',
  authorHintAmbiguous: 'The guide will not guess between {count} controls. Give this one an aria-label or visible text that is unique.',
  authorHintNoName: 'Add an aria-label or visible text so the guide can find this control.',
  authorHintPageData: 'This text looks like data from the page (a name, an email or a number). Change it so it names the control, not the data.',
  authorHintNotFound: 'The guide would not find a control with this exact text. Check the text, or give the control a role and a label.',
  authorHintUnchecked: 'This control is not on the current page, so it was not checked.',
  authorHintSensitive: 'Only the field label is recorded. What is typed here is never captured.',
  authorAddContext: 'Add context ({context})',
  authorRecheck: 'Re-check all',
  authorNote: 'Now on {path}',
  authorPreview: 'Preview',
  authorProblems: 'Fix these before copying:',
  authorTitleRequired: 'Give the flow a title.',
  authorCopy: 'Copy Markdown',
  authorCopied: 'Copied to the clipboard.',
  authorCopyFailed: 'Could not copy. Select the text and copy it yourself.',
  authorDownload: 'Download {file}',
  authorKeepRecording: 'Keep recording',
  authorDiscard: 'Discard draft',
  authorDiscardConfirm: 'Discard this draft? The recorded steps are lost.',
  authorNextHeading: 'Then, from your project folder:',
  authorPrivacy: 'Nothing leaves this page. Typed values are never recorded, but control labels can contain page data, so read every step before you share it.',
  authorLimit: 'You reached {max} steps, the most one flow can have. Stop and review.',
  authorShortcut: 'Alt+Shift+G moves focus to this panel.',
} as const;

export type AuthorLabelKey = keyof typeof AUTHOR_LABELS;
export type AuthorLabels = { [K in AuthorLabelKey]?: string };
export type ResolvedAuthorLabels = Record<AuthorLabelKey, string>;

const PLACEHOLDER = /\{(\w+)\}/g;
const holders = (s: string): string[] => [...new Set([...s.matchAll(PLACEHOLDER)].map((m) => m[1]!))];

/** Defaults with the host's `author*` overrides on top. Anything invalid is ignored (and reported in development builds). */
export function resolveAuthorLabels(input: unknown): ResolvedAuthorLabels {
  const labels: ResolvedAuthorLabels = { ...AUTHOR_LABELS };
  if (!input || typeof input !== 'object' || Array.isArray(input)) return labels;
  const problems: string[] = [];
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!key.startsWith('author')) continue;
    if (!Object.prototype.hasOwnProperty.call(AUTHOR_LABELS, key)) { DEV && problems.push(`unknown label "${key}" ignored`); continue; }
    const k = key as AuthorLabelKey;
    if (typeof value !== 'string' || !value.trim() || value.length > MAX_LABEL_LENGTH) { DEV && problems.push(`label "${key}" must be a string of 1 to ${MAX_LABEL_LENGTH} characters`); continue; }
    const have = holders(value);
    const missing = holders(AUTHOR_LABELS[k]).filter((p) => !have.includes(p));
    if (missing.length) { DEV && problems.push(`label "${key}" needs ${missing.map((p) => `{${p}}`).join(', ')}; the default is used`); continue; }
    labels[k] = value;
  }
  warnOnce('author labels', problems);
  return labels;
}

export const authorText = (labels: ResolvedAuthorLabels, key: AuthorLabelKey, vars?: Record<string, string | number>): string => fmt(labels[key], vars);
