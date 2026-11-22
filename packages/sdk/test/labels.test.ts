import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_LABELS, MAX_LABEL_LENGTH, fmt, parseJsonAttribute, resolveLabels } from '../src/labels';

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => { warn = vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => warn.mockRestore());

describe('fmt', () => {
  it('substitutes known placeholders and leaves unknown ones as written', () => {
    expect(fmt('Step {current} of {total}', { current: 2, total: 5 })).toBe('Step 2 of 5');
    expect(fmt('Hello {nobody}', { current: 1 })).toBe('Hello {nobody}');
  });
  it('is single-pass: a value that contains a placeholder is not expanded again', () => {
    expect(fmt('Clicked "{label}" for {goal}', { label: '{goal}', goal: 'x' })).toBe('Clicked "{goal}" for x');
  });
  it('does not read inherited object keys as placeholders', () => {
    expect(fmt('{toString} {constructor}', {})).toBe('{toString} {constructor}');
  });
});

describe('resolveLabels', () => {
  it('returns the English defaults for nothing', () => {
    expect(resolveLabels(undefined).labels).toEqual(DEFAULT_LABELS);
    expect(resolveLabels(null).problems).toEqual([]);
  });
  it('merges overrides over the defaults', () => {
    const { labels, problems } = resolveLabels({ next: 'Continuar', stepProgress: 'Paso {current} de {total}' });
    expect(labels.next).toBe('Continuar');
    expect(labels.stepProgress).toBe('Paso {current} de {total}');
    expect(labels.back).toBe(DEFAULT_LABELS.back);
    expect(problems).toEqual([]);
  });
  it('ignores unknown keys, non-strings, empty and over-long values, and says why', () => {
    const { labels, problems } = resolveLabels({ nope: 'x', next: 5, back: '   ', skip: 'a'.repeat(MAX_LABEL_LENGTH + 1), finish: 'Done!' });
    expect(labels.next).toBe(DEFAULT_LABELS.next);
    expect(labels.back).toBe(DEFAULT_LABELS.back);
    expect(labels.skip).toBe(DEFAULT_LABELS.skip);
    expect(labels.finish).toBe('Done!');
    expect(problems.join('|')).toMatch(/unknown label "nope"/);
    expect(problems).toHaveLength(4);
  });
  it('accepts exactly the maximum length', () => {
    expect(resolveLabels({ next: 'a'.repeat(MAX_LABEL_LENGTH) }).labels.next).toHaveLength(MAX_LABEL_LENGTH);
  });
  it('falls back to the default when a required placeholder is missing', () => {
    const { labels, problems } = resolveLabels({ stepProgress: 'Paso', assistClicked: 'Hecho', tourCount: '{current}' });
    expect(labels.stepProgress).toBe(DEFAULT_LABELS.stepProgress);
    expect(labels.assistClicked).toBe(DEFAULT_LABELS.assistClicked);
    expect(labels.tourCount).toBe(DEFAULT_LABELS.tourCount);
    expect(problems.join('|')).toMatch(/needs \{current\}, \{total\}/);
  });
  it('lets a label drop an optional placeholder (a shorter done message)', () => {
    expect(resolveLabels({ done: 'All done!' }).labels.done).toBe('All done!');
    expect(resolveLabels({ stepAnnounce: '{current}/{total} {title}' }).labels.stepAnnounce).toBe('{current}/{total} {title}');
  });
  it('rejects non-objects and prototype keys without throwing', () => {
    expect(resolveLabels('next').labels).toEqual(DEFAULT_LABELS);
    expect(resolveLabels(['next']).labels).toEqual(DEFAULT_LABELS);
    const polluted = JSON.parse('{"__proto__": {"next": "x"}, "constructor": "y"}');
    expect(resolveLabels(polluted).labels).toEqual(DEFAULT_LABELS);
    expect(({} as Record<string, unknown>).next).toBeUndefined();
  });
  it('keeps HTML as plain text: it is never parsed here', () => {
    expect(resolveLabels({ next: '<img src=x onerror=alert(1)>' }).labels.next).toBe('<img src=x onerror=alert(1)>');
  });
});

describe('parseJsonAttribute', () => {
  it('parses JSON, and reports and ignores bad JSON once', () => {
    expect(parseJsonAttribute('labels', '{"next":"Go"}')).toEqual({ next: 'Go' });
    expect(parseJsonAttribute('labels', null)).toBeUndefined();
    expect(parseJsonAttribute('labels', '  ')).toBeUndefined();
    expect(parseJsonAttribute('labels', '{oops')).toBeUndefined();
    expect(parseJsonAttribute('labels', '{oops')).toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
