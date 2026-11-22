import { beforeEach, describe, expect, it } from 'vitest';
import { resolveDetailed, resolveTarget, waitForTarget } from '../src/targeting/index';

// Regression suite carried over from the previous resolver (same behavior contract).
beforeEach(() => {
  document.body.innerHTML = `
    <button id="a" data-heypointer-id="x">Invite teammate</button>
    <label for="em">Email</label><input id="em" type="email" />
    <button id="hid" hidden>Hidden</button>
    <button class="dup">Dup</button><button class="dup">Dup</button>`;
});

describe('resolveTarget', () => {
  it('prefers selectors', () => {
    expect(resolveTarget({ selectors: ['[data-heypointer-id="x"]'] })?.strategy).toBe('selector');
  });
  it('falls back to role+text', () => {
    const r = resolveTarget({ selectors: ['#nope'], role: 'button', text: 'invite teammate' });
    expect(r?.element.id).toBe('a');
    expect(r?.strategy).toBe('role-text');
  });
  it('resolves by label', () => {
    expect(resolveTarget({ selectors: [], label: 'Email' })?.element.id).toBe('em');
  });
  it('resolves a quoted field name to the control, not to its label as a second match', () => {
    document.body.innerHTML = '<label for="cust">Customer</label><input id="cust" type="text" />';
    const r = resolveDetailed({ selectors: [], text: 'Customer' });
    expect(r.status).toBe('found');
    expect(r.status === 'found' && r.element.id).toBe('cust');
  });
  it('still refuses when two different controls share the text', () => {
    document.body.innerHTML = '<label for="a1">Name</label><input id="a1" /><label for="a2">Name</label><input id="a2" />';
    expect(resolveDetailed({ selectors: [], text: 'Name' }).status).toBe('ambiguous');
  });
  it('keeps a label that names nothing as a target', () => {
    document.body.innerHTML = '<label>Notes</label>';
    expect(resolveDetailed({ selectors: [], text: 'Notes' }).status).toBe('found');
  });
  it('treats nested elements with the same text as one target: the interactive one wins', () => {
    document.body.innerHTML = '<h2><a id="l" href="#p">Aurora Headphones</a></h2><button id="b"><span>Add</span></button>';
    expect(resolveTarget({ selectors: [], text: 'Aurora Headphones' })?.element.id).toBe('l');
    expect(resolveTarget({ selectors: [], text: 'Add' })?.element.id).toBe('b');
  });
  it('with no interactive element among nested duplicates the innermost is the target', () => {
    document.body.innerHTML = '<ul><li id="li"><span id="s">Shipping policy</span></li></ul>';
    expect(resolveTarget({ selectors: [], text: 'Shipping policy' })?.element.id).toBe('s');
  });
  it('separate controls with the same text stay ambiguous, nested or not', () => {
    document.body.innerHTML = '<h2><a href="#1">Same</a></h2><h2><a href="#2">Same</a></h2>';
    expect(resolveDetailed({ selectors: [], text: 'Same' })).toEqual({ status: 'ambiguous', count: 2 });
  });
  it('does not match hidden elements', () => {
    expect(resolveTarget({ selectors: ['#hid'] })).toBeNull();
  });
  it('refuses ambiguous matches', () => {
    expect(resolveTarget({ selectors: ['.dup'] })).toBeNull();
    expect(resolveTarget({ selectors: [], role: 'button', text: 'Dup' })).toBeNull();
  });
  it('survives invalid selectors', () => {
    expect(resolveTarget({ selectors: ['##(('] })).toBeNull();
  });
  it('returns null when nothing matches', () => {
    expect(resolveTarget({ selectors: [], text: 'Nonexistent' })).toBeNull();
  });
});

describe('waitForTarget', () => {
  it('finds a late-rendered element', async () => {
    const p = waitForTarget({ selectors: ['#late'] }, 500);
    setTimeout(() => document.body.insertAdjacentHTML('beforeend', '<button id="late">x</button>'), 20);
    expect((await p)?.element.id).toBe('late');
  });
  it('times out with null', async () => {
    expect(await waitForTarget({ selectors: ['#never'] }, 30)).toBeNull();
  });
});

describe('resolveDetailed', () => {
  it('reports found / ambiguous / missing', () => {
    expect(resolveDetailed({ selectors: [], role: 'button', text: 'Invite teammate' }).status).toBe('found');
    expect(resolveDetailed({ selectors: [], role: 'button', text: 'Dup' })).toEqual({ status: 'ambiguous', count: 2 });
    expect(resolveDetailed({ selectors: [], text: 'Nope' })).toEqual({ status: 'missing' });
  });
  it('falls through an ambiguous strategy to a unique later one', () => {
    expect(resolveDetailed({ selectors: ['.dup'], label: 'Email' }).status).toBe('found');
  });
  it('resolves in order selectors > role+text > label > text', () => {
    const r = resolveDetailed({ selectors: ['#a'], role: 'button', label: 'Email', text: 'Invite teammate' });
    expect(r.status === 'found' && r.strategy).toBe('selector');
  });
});
