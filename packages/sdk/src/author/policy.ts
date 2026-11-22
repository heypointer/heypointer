import { accessibleName, isUsable } from '../targeting/index';
import { MAX_LABEL, clean, forQuotes } from './flow';

/** Fields whose values must never be near a draft. Only the label of these is recorded, and the step says so. */
const SENSITIVE_NAME = /pass|token|secret|otp|card|cvv|cvc|iban|ssn|pin\b/i;
const SENSITIVE_AUTOCOMPLETE = /^(cc-|one-time-code|current-password|new-password)/i;

/** Tag name, lower case. `instanceof HTMLInputElement` is false for an element from an iframe (another realm), so tags are compared instead. */
export const tagOf = (n: Node | null | undefined): string => (n && n.nodeType === 1 ? (n as Element).tagName.toLowerCase() : '');
export const typeOf = (el: Element): string => (el.getAttribute('type') ?? '').toLowerCase();

export function isSensitiveField(el: Element): boolean {
  const tag = tagOf(el);
  if (tag !== 'input' && tag !== 'textarea' && tag !== 'select') return false;
  if (tag === 'input' && typeOf(el) === 'password') return true;
  const ac = el.getAttribute('autocomplete') ?? '';
  if (ac.split(/\s+/).some((t) => SENSITIVE_AUTOCOMPLETE.test(t))) return true;
  return SENSITIVE_NAME.test(el.getAttribute('name') ?? '') || SENSITIVE_NAME.test(el.id);
}

const FORM_CONTROL = 'input, select, textarea';

/**
 * The text a recorded step quotes. Same source as the resolver (aria-label, then the labels, then the text),
 * except that a form control without a label gives nothing: its own text is option lists or typed content.
 */
export function controlName(el: HTMLElement): string {
  const raw = el.matches(FORM_CONTROL)
    ? (el.getAttribute('aria-label') || Array.from((el as HTMLInputElement).labels ?? []).map((l) => l.textContent ?? '').join(' '))
    : accessibleName(el);
  return forQuotes(raw ?? '').slice(0, MAX_LABEL * 2);
}

const EMAIL = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i;
const LONG_NUMBER = /\d[\d\s().-]{4,}\d/;
const MONEY = /[$€£¥]\s?\d|\d[.,]\d{2}\b/;
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
const TITLE_WORDS = /^(?:[A-Z][\p{L}'’-]+)(?:\s+[A-Z][\p{L}'’-]+){1,3}$/u;
const REPEATED = 'tr, td, th, li, [role="row"], [role="gridcell"], [role="cell"], [role="listitem"], [role="option"], article, [role="article"]';

/** Does this control text look like a person's data rather than the name of a control? */
export function looksLikePageData(text: string, el?: Element): boolean {
  if (EMAIL.test(text) || LONG_NUMBER.test(text) || MONEY.test(text) || UUID.test(text)) return true;
  const inRepeated = !!el?.closest(REPEATED);
  if (inRepeated && (TITLE_WORDS.test(text) || /\d/.test(text))) return true;
  return false;
}

/** Elements a click is "on a control" for. A plain container is not. */
export const CLICKABLE = [
  'button', 'a[href]', 'summary', 'input[type="button"]', 'input[type="submit"]', 'input[type="reset"]', 'input[type="image"]',
  'input[type="checkbox"]', 'input[type="radio"]',
  '[role="button"]', '[role="link"]', '[role="menuitem"]', '[role="menuitemcheckbox"]', '[role="menuitemradio"]', '[role="tab"]',
  '[role="switch"]', '[role="checkbox"]', '[role="radio"]', '[role="option"]',
].join(', ');

export const isDisabled = (el: Element): boolean =>
  (el as HTMLButtonElement).disabled === true || el.getAttribute('aria-disabled') === 'true' || !!el.closest('fieldset:disabled');

/** A control a person can see and reach, not the author panel's own. */
export const isRecordable = (el: HTMLElement): boolean => isUsable(el) && !isDisabled(el);

const TEXT_TYPES = new Set(['text', 'search', 'email', 'tel', 'url', 'number', 'password', 'date', 'datetime-local', 'month', 'week', 'time', '']);
export const isTextEntry = (el: Element): boolean => tagOf(el) === 'textarea' || (tagOf(el) === 'input' && TEXT_TYPES.has(typeOf(el)));

/** The nearest landmark's name, for "Save in the Billing dialog". Never text typed by the user. */
export function contextOf(el: Element): string {
  for (let n: Element | null = el.parentElement; n; n = n.parentElement) {
    const role = n.getAttribute('role');
    const landmark = n.matches('dialog, form, nav, section, aside, [role="dialog"], [role="alertdialog"], [role="region"], [role="form"], [role="navigation"], [role="menu"], [role="toolbar"]');
    if (!landmark && !n.hasAttribute('aria-label')) continue;
    let name = n.getAttribute('aria-label') ?? '';
    const by = n.getAttribute('aria-labelledby');
    if (!name && by) name = by.split(/\s+/).map((id) => n!.ownerDocument.getElementById(id)?.textContent ?? '').join(' ');
    if (!name && (role === 'dialog' || n.tagName === 'DIALOG')) name = n.querySelector('h1, h2, h3')?.textContent ?? '';
    name = forQuotes(name).slice(0, 40);
    if (name) return name;
  }
  return '';
}

export { clean };
