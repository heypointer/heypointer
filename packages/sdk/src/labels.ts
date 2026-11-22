/**
 * Every string the guide shows or announces that does not come from the server.
 * Hosts override any subset: `labels: { next: 'Continue' }`. Values are plain text with `{placeholder}`
 * substitution and are only ever applied with textContent / setAttribute, never as HTML.
 * Step titles, instructions and suggestions come from the knowledge base and are not translated here.
 */
export const DEFAULT_LABELS = {
  launcher: 'Guide me',
  dialogName: 'HeyPointer assistant',
  heading: 'HeyPointer',
  closeLabel: 'Close guide',
  goalQuestion: 'What do you want to do?',
  goalAria: 'Your goal',
  goalPlaceholder: 'e.g. invite a teammate',
  submit: 'Show me',
  speak: 'Speak',
  stop: 'Stop',
  changeGoal: 'Change goal or use voice',
  assistToggle: 'Assist: do safe clicks for me when I press Next',
  assistHint: 'You need to do this one yourself.',
  assistClicked: 'Clicked "{label}" for you.',
  assistFailed: `I couldn't click "{label}" for you. Do this step yourself, then press Next.`,
  releasedNote: 'It looks like you did that. Press Next to continue.',
  next: 'Next',
  finish: 'Finish',
  back: 'Back',
  skip: 'Skip',
  stepProgress: 'Step {current} of {total}',
  tourCount: '{current} / {total}',
  stepAnnounce: 'Step {current} of {total}: {title}. {instruction}',
  suggestedValue: 'Suggested value: {value}',
  gateWarning: 'This changes data. Confirm before continuing.',
  gateCheckbox: 'I understand and want to do this myself.',
  gateWhy: 'Tick the confirmation box to continue.',
  evidenceSummary: 'Source ({count})',
  loading: 'Finding the steps…',
  tryAgain: 'Try again',
  skipStep: 'Skip step',
  done: 'Done. You finished: {goal}',
  startAnother: 'Start another',
  suggestLabel: 'Did you mean:',
  suggestAnnounce: 'Did you mean: {list}?',
  notFound: `I can't find "{label}" on this page. The screen may differ from the docs.`,
  ambiguous: `I found more than one match for this step, so I won't guess. Look for: {label}.`,
  notFoundAnnounce: 'Cannot find the target for: {title}. You can try again or skip this step.',
  ambiguousAnnounce: 'Several matches for: {title}. You can try again or skip this step.',
  emptyGoal: 'Type what you want to do first.',
  recording: 'Recording… press Stop when done.',
  transcribing: 'Transcribing…',
  voiceUnavailable: "Voice isn't available. Type your goal instead.",
  noSpeech: "I didn't hear anything. Try again or type your goal.",
  audioFailed: 'Could not process audio. Type your goal instead.',
  insufficient: "I don't have enough documented steps to guide this safely.",
  genericError: 'Something went wrong.',
  clientRequired: 'HeyPointer needs a client ID. Run heypointer init or pass data-client-id.',
  clientInvalid: 'HeyPointer does not recognise this client ID. Check that it matches the one heypointer init gave you.',
  clientOrigin: "This site's address is not allowed for this HeyPointer client ID. Ask the HeyPointer admin to add it to the client's allowed origins.",
  clientMalformed: 'The HeyPointer client ID looks wrong (it should start with gfc_). Check data-client-id against what heypointer init printed.',
  rateLimited: 'HeyPointer is getting too many requests right now. Wait a moment and try again.',
  serverUnreachable: 'Cannot reach the HeyPointer server at {host}. Check that it is running and the address is right.',
  requestFailed: 'Walkthrough request failed ({status})',
} as const;

export type LabelKey = keyof typeof DEFAULT_LABELS;
export type HeyPointerLabels = { [K in LabelKey]?: string };
export type ResolvedLabels = Record<LabelKey, string>;

export const MAX_LABEL_LENGTH = 300;

const PLACEHOLDER = /\{(\w+)\}/g;
/** Placeholders a default template has that a replacement may drop (a shorter message is still correct). */
const OPTIONAL: Partial<Record<LabelKey, string[]>> = { done: ['goal'], stepAnnounce: ['instruction'] };

const placeholders = (s: string): string[] => [...s.matchAll(PLACEHOLDER)].map((m) => m[1]!);
const required = (key: LabelKey): string[] =>
  [...new Set(placeholders(DEFAULT_LABELS[key]))].filter((p) => !OPTIONAL[key]?.includes(p));

/** Single-pass substitution: a value that itself contains `{x}` is never expanded again. */
export function fmt(template: string, vars: Record<string, string | number> = {}): string {
  return template.replace(PLACEHOLDER, (m, k: string) => (Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m));
}

declare const __GF_DEV__: boolean | undefined;
/** True in tests and source builds; the shipped bundles define it false, which removes everything behind it. */
export const DEV: boolean = typeof __GF_DEV__ !== 'undefined' && __GF_DEV__;

const warned = new Set<string>();
/** Development builds only: one console.warn per distinct set of problems. */
export function warnOnce(scope: string, problems: string[]): void {
  if (!DEV || !problems.length) return;
  const text = `[heypointer] ${scope}: ${problems.join('; ')}`;
  if (warned.has(text)) return;
  warned.add(text);
  console.warn(text);
}

/** Merge host overrides over the defaults. Anything invalid is ignored (and, in development builds, reported), never thrown. */
export function resolveLabels(input: unknown): { labels: ResolvedLabels; problems: string[] } {
  const labels: ResolvedLabels = { ...DEFAULT_LABELS };
  const problems: string[] = [];
  if (input === undefined || input === null) return { labels, problems };
  if (typeof input !== 'object' || Array.isArray(input)) {
    DEV && problems.push('labels must be an object of strings');
    return { labels, problems };
  }
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (key.startsWith('author')) continue; // author mode's own labels (author/labels.ts)
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_LABELS, key)) { DEV && problems.push(`unknown label "${key}" ignored`); continue; }
    const k = key as LabelKey;
    if (typeof value !== 'string' || !value.trim() || value.length > MAX_LABEL_LENGTH) {
      DEV && problems.push(`label "${key}" must be a string of 1 to ${MAX_LABEL_LENGTH} characters`);
      continue;
    }
    const have = placeholders(value);
    const missing = required(k).filter((p) => !have.includes(p));
    if (missing.length) { DEV && problems.push(`label "${key}" needs ${missing.map((p) => `{${p}}`).join(', ')}; the default is used`); continue; }
    labels[k] = value;
  }
  return { labels, problems };
}

/** Parse a JSON attribute value (`labels`, `data-labels`). Bad JSON is reported and ignored. */
export function parseJsonAttribute(name: string, raw: string | null | undefined): unknown {
  if (raw === null || raw === undefined || !raw.trim()) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    DEV && warnOnce(name, [`${name} is not valid JSON and was ignored`]);
    return undefined;
  }
}
