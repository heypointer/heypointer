// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 HeyPointer
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HeyPointer } from '../src/player';
import { isUsable, resolveDetailed } from '../src/targeting/index';
import { watchUsable } from '../src/targeting/watch';
import { jsonFetch, step, walkthrough } from './fixtures';

const NOTE = 'It looks like you did that. Press Next to continue.';
const frames = () => new Promise((r) => setTimeout(r, 40)); // MutationObserver + rAF settle in jsdom
let gf: HeyPointer | undefined;
const q = <T extends HTMLElement>(s: string) => gf!.root.querySelector<T>(s)!;

const click = (id: string, text: string) =>
  step({ id, title: `Click ${text}`, instruction: `Click ${text}.`, target: { selectors: [`#${id}`], text } });

function make(steps = [click('a', 'First'), click('b', 'Second')]) {
  gf = new HeyPointer({ baseUrl: 'http://x', fetch: jsonFetch(walkthrough(steps)), targetTimeoutMs: 20, speechSupported: false });
}

beforeEach(() => {
  document.body.innerHTML = '<div id="wrap"><button id="a">First</button></div><button id="b">Second</button>';
});
afterEach(() => {
  gf?.destroy();
  gf = undefined;
  vi.restoreAllMocks();
});

describe('isUsable', () => {
  it('is false for removed, hidden, aria-hidden, inert and display:none or visibility:hidden elements', () => {
    const a = document.getElementById('a')!;
    expect(isUsable(a)).toBe(true);
    a.hidden = true;
    expect(isUsable(a)).toBe(false);
    a.hidden = false;
    a.parentElement!.setAttribute('aria-hidden', 'true');
    expect(isUsable(a)).toBe(false);
    a.parentElement!.removeAttribute('aria-hidden');
    a.parentElement!.setAttribute('inert', '');
    expect(isUsable(a)).toBe(false);
    a.parentElement!.removeAttribute('inert');
    a.style.display = 'none';
    expect(isUsable(a)).toBe(false);
    a.style.display = '';
    a.style.visibility = 'hidden';
    expect(isUsable(a)).toBe(false);
    a.style.visibility = '';
    expect(isUsable(a)).toBe(true);
    a.remove();
    expect(isUsable(a)).toBe(false);
  });

  it('asks the layout engine when the browser has one, and does not otherwise', () => {
    const a = document.getElementById('a')!;
    (a as unknown as { checkVisibility: () => boolean }).checkVisibility = () => false;
    expect(isUsable(a)).toBe(false);
    (a as unknown as { checkVisibility: () => boolean }).checkVisibility = () => true;
    a.getClientRects = (() => []) as unknown as typeof a.getClientRects;
    expect(isUsable(a)).toBe(false); // no boxes
    a.getClientRects = (() => [{}]) as unknown as typeof a.getClientRects;
    a.getBoundingClientRect = () => ({ width: 0, height: 0 }) as DOMRect;
    expect(isUsable(a)).toBe(false); // zero size
    a.getBoundingClientRect = () => ({ width: 10, height: 4 }) as DOMRect;
    expect(isUsable(a)).toBe(true);
  });

  it('is the definition target resolution uses: a hidden match no longer counts or makes a match ambiguous', () => {
    document.body.insertAdjacentHTML('beforeend', '<button class="save" hidden>Save</button><button class="save">Save</button>');
    const r = resolveDetailed({ selectors: ['.save'], text: 'Save' });
    expect(r.status).toBe('found');
    document.querySelector<HTMLElement>('.save:not([hidden])')!.hidden = true;
    expect(resolveDetailed({ selectors: ['.save'], text: 'Save' }).status).toBe('missing');
  });
});

describe('watchUsable', () => {
  it('reports hiding and showing once each, coalesced', async () => {
    const a = document.getElementById('a')!;
    const seen: boolean[] = [];
    const stop = watchUsable(a, (u) => seen.push(u));
    await frames();
    a.hidden = true;
    a.style.display = 'none';
    await frames();
    expect(seen).toEqual([false]);
    a.hidden = false;
    a.style.display = '';
    await frames();
    expect(seen).toEqual([false, true]);
    stop();
  });

  it('reports a removed element', async () => {
    const a = document.getElementById('a')!;
    const seen: boolean[] = [];
    const stop = watchUsable(a, (u) => seen.push(u));
    a.remove();
    await frames();
    expect(seen).toEqual([false]);
    stop();
  });

  it('releases the observer, the listeners and the pending frame when stopped, and stays quiet afterwards', async () => {
    const a = document.getElementById('a')!;
    const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect');
    const removed = vi.spyOn(document, 'removeEventListener');
    const seen: boolean[] = [];
    const stop = watchUsable(a, (u) => seen.push(u));
    a.hidden = true;
    stop();
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(removed.mock.calls.map((c) => c[0]).sort()).toEqual(
      ['animationcancel', 'animationend', 'animationstart', 'transitioncancel', 'transitionend', 'transitionrun'],
    );
    await frames();
    expect(seen).toEqual([]);
  });

  it('does no work while the page is idle', async () => {
    const a = document.getElementById('a')!;
    const raf = vi.spyOn(globalThis, 'requestAnimationFrame');
    const stop = watchUsable(a, () => undefined);
    await frames();
    const after = raf.mock.calls.length;
    await frames();
    await frames();
    expect(raf.mock.calls.length).toBe(after);
    stop();
  });

  it('follows a transition that contains the element, for a bounded time', async () => {
    const a = document.getElementById('a')!;
    const raf = vi.spyOn(globalThis, 'requestAnimationFrame');
    const stop = watchUsable(a, () => undefined);
    await frames();
    const before = raf.mock.calls.length;
    a.parentElement!.dispatchEvent(new Event('transitionrun', { bubbles: true }));
    await frames();
    expect(raf.mock.calls.length).toBeGreaterThan(before + 1);
    const unrelated = document.getElementById('b')!;
    const mark = raf.mock.calls.length;
    stop();
    unrelated.dispatchEvent(new Event('transitionrun', { bubbles: true }));
    await frames();
    expect(raf.mock.calls.length).toBe(mark);
  });
});

describe('guide: target leaves the screen', () => {
  it('drops the highlight and the dimmer, shows the note, and keeps Next working', async () => {
    make();
    await gf!.ask('x');
    expect(q('.hp-highlight').hidden).toBe(false);
    document.getElementById('a')!.hidden = true;
    await frames();
    expect(q('.hp-highlight').hidden).toBe(true);
    expect(q('.hp-spotlight').hidden).toBe(true);
    expect(q('.hp-released-note').textContent).toBe(NOTE);
    expect(q('.hp-tour').classList.contains('hp-floating')).toBe(true);
    await gf!.next();
    expect(q('.hp-progress').textContent).toBe('Step 2 of 2');
    expect(gf!.root.querySelector('.hp-released-note')).toBeNull();
    expect(q('.hp-highlight').hidden).toBe(false);
  });

  it('brings the highlight back when the control returns', async () => {
    make();
    await gf!.ask('x');
    const a = document.getElementById('a')!;
    a.hidden = true;
    await frames();
    expect(gf!.root.querySelector('.hp-released-note')).not.toBeNull();
    a.hidden = false;
    await frames();
    expect(gf!.root.querySelector('.hp-released-note')).toBeNull();
    expect(q('.hp-highlight').hidden).toBe(false);
    expect(q('.hp-spotlight').hidden).toBe(false);
  });

  it('follows an identical node swapped in by the host in the same container', async () => {
    make();
    await gf!.ask('x');
    const old = document.getElementById('a')!;
    old.replaceWith(old.cloneNode(true));
    await frames();
    expect(gf!.root.querySelector('.hp-released-note')).toBeNull();
    expect(gf!.state().view).toBe('step');
    expect(q('.hp-highlight').hidden).toBe(false);
  });

  it('never moves onto a matching control elsewhere on the page', async () => {
    document.body.insertAdjacentHTML('beforeend', '<section hidden id="toolbar"><button id="a2" class="dup">First</button></section>');
    make([step({ id: 'a', title: 'Click First', instruction: 'Click First.', target: { selectors: ['#a, .dup'], text: 'First' } })]);
    await gf!.ask('x');
    document.getElementById('a')!.hidden = true;
    document.getElementById('toolbar')!.hidden = false;
    await frames();
    expect(gf!.root.querySelector('.hp-released-note')).not.toBeNull();
    expect(q('.hp-highlight').hidden).toBe(true);
  });

  it('does not click anything for the user once the control is gone (assist on)', async () => {
    const hits: string[] = [];
    document.body.addEventListener('click', (e) => hits.push((e.target as HTMLElement).id));
    gf = new HeyPointer({ baseUrl: 'http://x', fetch: jsonFetch(walkthrough([click('a', 'First'), click('b', 'Second')])), targetTimeoutMs: 20, speechSupported: false, assist: true });
    await gf.ask('x');
    document.getElementById('a')!.hidden = true;
    await frames();
    await gf.next();
    expect(hits).toEqual([]);
    expect(q('.hp-progress').textContent).toBe('Step 2 of 2');
  });

  it('stops watching when the guide closes or is destroyed, and starts again when reopened', async () => {
    const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect');
    make();
    await gf!.ask('x');
    gf!.close();
    const afterClose = disconnect.mock.calls.length;
    document.getElementById('a')!.hidden = true;
    await frames();
    expect(gf!.root.querySelector('.hp-released-note')).toBeNull(); // not watching while closed
    gf!.open();
    await frames();
    expect(gf!.root.querySelector('.hp-released-note')).not.toBeNull(); // noticed on reopen
    gf!.destroy();
    expect(disconnect.mock.calls.length).toBeGreaterThan(afterClose);
  });
});
