// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 HeyPointer
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HeyPointer } from '../src/player';
import type { AudioRecorder } from '../src/recorder';
import { jsonFetch, step, walkthrough } from './fixtures';

const HOST = `<button id="inv">Invite teammate</button><input id="em" aria-label="Email"/><button id="send">Send invite</button>`;
let gf: HeyPointer;
const q = <T extends HTMLElement>(s: string) => gf.root.querySelector<T>(s)!;
const flush = () => new Promise((r) => setTimeout(r, 0));

function make(wt: unknown, extra: Partial<ConstructorParameters<typeof HeyPointer>[0]> = {}) {
  gf = new HeyPointer({ baseUrl: 'http://x', fetch: jsonFetch(wt), targetTimeoutMs: 20, speechSupported: false, ...extra });
}

beforeEach(() => { document.body.innerHTML = HOST; });
afterEach(() => gf?.destroy());

describe('HeyPointer player', () => {
  it('renders steps, highlights the live target, and navigates', async () => {
    make(walkthrough([step(), step({ id: 's2', title: 'Email', instruction: 'Enter email.', target: { selectors: [], label: 'Email' }, action: 'type' })]));
    await gf.ask('invite');
    expect(q('.hp-progress').textContent).toBe('Step 1 of 2');
    expect(q('.hp-highlight').hidden).toBe(false);
    expect(gf.state().missing).toBe(false);
    await gf.next();
    expect(q('.hp-progress').textContent).toBe('Step 2 of 2');
    await gf.prev();
    expect(q('.hp-progress').textContent).toBe('Step 1 of 2');
    await gf.next(); await gf.next();
    expect(gf.state().view).toBe('done');
  });

  it('passes pointer events through the overlay root but keeps its controls interactive', () => {
    make(walkthrough([step()]));
    const style = gf.root.querySelector('style')!.textContent!;
    expect(gf.host.style.pointerEvents).toBe('none');
    expect(style).toMatch(/\.hp-launcher\s*\{[^}]*pointer-events:\s*auto/);
    expect(style).toMatch(/\.hp-panel\s*\{[^}]*pointer-events:\s*auto/);
  });

  it('never clicks host elements', async () => {
    let clicks = 0;
    document.getElementById('inv')!.addEventListener('click', () => clicks++);
    make(walkthrough([step()]));
    await gf.ask('invite');
    await gf.next();
    expect(clicks).toBe(0);
  });

  it('recovers from a missing target', async () => {
    make(walkthrough([step({ target: { selectors: ['#gone'], text: 'Gone button' } })]));
    await gf.ask('x');
    expect(gf.state().missing).toBe(true);
    expect(q('[role=alert]').textContent).toContain("can't find");
    expect(q('.hp-highlight').hidden).toBe(true);
    document.body.insertAdjacentHTML('beforeend', '<button>Gone button</button>');
    q('[data-key=retry]').click();
    await flush(); await flush();
    expect(gf.state().missing).toBe(false);
    expect(q('.hp-highlight').hidden).toBe(false);
  });

  it('gates consequential steps behind explicit confirmation', async () => {
    make(walkthrough([step({ id: 'c', title: 'Send', target: { selectors: ['#send'] }, requiresConfirmation: true })]));
    await gf.ask('x');
    expect(q('[data-key=next]').getAttribute('aria-disabled')).toBe('true');
    expect(q('.hp-highlight').hidden).toBe(true); // not armed
    await gf.next();
    expect(gf.state().view).toBe('step'); // blocked
    q<HTMLInputElement>('[data-key=confirm]').click();
    await flush(); await flush();
    expect(q('[data-key=next]').hasAttribute('aria-disabled')).toBe(false);
    expect(q('.hp-highlight').hidden).toBe(false);
    await gf.next();
    expect(gf.state().view).toBe('done');
  });

  it('anchors a coachmark near a gated target before confirmation without highlighting it', async () => {
    make(walkthrough([step({ id: 'buy', target: { selectors: ['#send'] }, requiresConfirmation: true })]));
    gf.open();
    await gf.ask('buy');
    expect(q('.hp-panel').classList.contains('hp-tour')).toBe(true);
    expect(q('.hp-spotlight').hidden).toBe(false);
    expect(q('.hp-highlight').hidden).toBe(true);
    expect(q('[data-key=skip]').textContent).toBe('Skip');
  });

  it('skips a step whose target is missing', async () => {
    make(walkthrough([step({ target: { selectors: ['#gone'] } }), step({ id: 's2', title: 'Second' })]));
    await gf.ask('x');
    q('[data-key=skip]').click();
    await flush(); await flush();
    expect(q('.hp-progress').textContent).toBe('Step 2 of 2');
    expect(gf.root.activeElement?.textContent).toBe('Second'); // focus moves to the step title
  });

  it('offers retry on error and Start another when done', async () => {
    make({ status: 'bad' });
    await gf.ask('x');
    expect(gf.root.textContent).toContain('Try again');
  });

  it('shows an ambiguous-target message and never highlights', async () => {
    document.body.insertAdjacentHTML('beforeend', '<button>Twin</button><button>Twin</button>');
    make(walkthrough([step({ target: { selectors: [], role: 'button', text: 'Twin' } })]));
    await gf.ask('x');
    expect(gf.state().ambiguous).toBe(true);
    expect(q('[role=alert]').textContent).toContain("more than one match for this step, so I won't guess. Look for: Twin.");
    expect(q('.hp-highlight').hidden).toBe(true);
    expect(gf.root.querySelector('[data-key=retry]')).not.toBeNull();
    expect(gf.root.querySelector('[data-key=skip]')).not.toBeNull();
  });

  it('gates risky clicks even when the server omits the flag', async () => {
    make(walkthrough([step({ target: { selectors: [], role: 'button', text: 'Delete account' }, requiresConfirmation: false })]));
    await gf.ask('x');
    expect(q('[data-key=next]').getAttribute('aria-disabled')).toBe('true');
  });

  it.each([
    ['label', { target: { selectors: [], label: 'Delete account' } }],
    ['title', { title: 'Delete account' }],
    ['instruction', { instruction: 'Press Delete to remove it.' }],
  ])('gates risky clicks identified only by %s', async (_n, over) => {
    make(walkthrough([step({ target: { selectors: [], text: 'Open' }, title: 'Open', instruction: 'Open it.', ...over })]));
    await gf.ask('x');
    expect(q('[data-key=next]').getAttribute('aria-disabled')).toBe('true');
  });

  it('reports insufficient evidence without steps', async () => {
    make(walkthrough([], { status: 'insufficient_evidence', message: 'No evidence for refunds.', missingEvidence: ['refund flow'] }));
    await gf.ask('refund');
    expect(gf.state().view).toBe('insufficient');
    expect(q('[role=alert]').textContent).toContain('No evidence for refunds.');
    expect(q('[role=alert]').textContent).toContain('refund flow');
    expect(gf.root.querySelector('.hp-progress')).toBeNull();
  });

  it('shows an error for malformed server output', async () => {
    make({ status: 'ok', id: 'x', goal: 'g', steps: [{ nope: 1 }] });
    await gf.ask('x');
    expect(gf.state().view).toBe('error');
  });

  it('is accessible: dialog role, live region, labelled controls, Escape closes', async () => {
    make(walkthrough([step()]));
    gf.open();
    const panel = q('[role=dialog]');
    expect(panel.getAttribute('aria-label')).toBeTruthy();
    expect(gf.root.querySelector('[aria-live=polite]')).not.toBeNull();
    await gf.ask('x'); await flush();
    expect(gf.root.querySelector('[aria-live=polite]')!.textContent).toContain('Step 1 of 1');
    expect(q('.hp-highlight').getAttribute('aria-hidden')).toBe('true');
    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(panel.hidden).toBe(true);
  });

  it('has an explicit Close button that dismisses the panel and returns focus', async () => {
    make(walkthrough([step()]));
    gf.open();
    await gf.ask('x');
    const close = gf.root.querySelector<HTMLElement>('[data-key=close]')!;
    expect(close.getAttribute('aria-label')).toBe('Close guide');
    close.click();
    expect(q('[role=dialog]').hidden).toBe(true);
    expect(gf.root.activeElement?.className).toBe('hp-launcher');
  });

  it('hides the mic when unsupported (typed flow still works)', async () => {
    make(walkthrough([step()]));
    expect(gf.root.querySelector('[data-key=mic]')).toBeNull();
    await gf.ask('x');
    expect(gf.state().view).toBe('step');
  });
});

describe('audio flow', () => {
  const rec = (): AudioRecorder => ({ start: async () => {}, stop: async () => new Blob(['a'], { type: 'audio/webm' }) });

  it('transcribes then asks', async () => {
    const calls: string[] = [];
    const f = (async (url: string) => {
      calls.push(url);
      return new Response(JSON.stringify(url.endsWith('/api/transcribe') ? { text: 'invite a teammate' } : walkthrough([step()])), { status: 200 });
    }) as unknown as typeof fetch;
    gf = new HeyPointer({ baseUrl: 'http://x', fetch: f, targetTimeoutMs: 20, speechSupported: true, recorderFactory: rec });
    q('[data-key=mic]').click(); await flush();
    q('[data-key=mic]').click(); await flush(); await flush(); await flush();
    expect(calls.map((c) => c.split('/api/')[1])).toEqual(['transcribe', 'walkthrough']);
    expect(gf.state().view).toBe('step');
  });

  it('falls back to typing when transcription is unavailable', async () => {
    gf = new HeyPointer({ baseUrl: 'http://x', fetch: jsonFetch({ error: 'no provider' }, 501), speechSupported: true, recorderFactory: rec });
    q('[data-key=mic]').click(); await flush();
    q('[data-key=mic]').click(); await flush(); await flush(); await flush();
    expect(gf.root.textContent).toContain('Type your goal instead');
    expect(q('input[name=goal]')).toBeTruthy();
  });

  it('silent audio (400) shows the retry alert, focuses the goal input, keeps the mic usable', async () => {
    gf = new HeyPointer({ baseUrl: 'http://x', fetch: jsonFetch({ error: 'bad_request' }, 400), speechSupported: true, recorderFactory: rec });
    gf.open();
    q('[data-key=mic]').click(); await flush();
    q('[data-key=mic]').click(); await flush(); await flush(); await flush();
    expect(q('[role=alert]').textContent).toBe("I didn't hear anything. Try again or type your goal.");
    expect(gf.root.activeElement?.getAttribute('data-key')).toBe('goal');
    expect(q('[data-key=mic]').textContent).toBe('Speak');
  });

  it('falls back to typing when the microphone is denied', async () => {
    const denied: AudioRecorder = { start: async () => { throw new Error('denied'); }, stop: async () => new Blob() };
    gf = new HeyPointer({ baseUrl: 'http://x', fetch: jsonFetch({}), speechSupported: true, recorderFactory: () => denied });
    q('[data-key=mic]').click(); await flush(); await flush();
    expect(gf.root.textContent).toContain("Voice isn't available");
  });

  describe('suggestions ("Did you mean")', () => {
    const miss = (suggestions: unknown) => ({ ...walkthrough([], { status: 'insufficient_evidence', message: 'No documented guide covers that.' }), suggestions });
    const goals: string[] = [];
    const routed = (first: unknown, second: unknown): typeof fetch => (async (_u: string, init: RequestInit) => {
      const goal = JSON.parse(String(init.body)).goal as string;
      goals.push(goal);
      return new Response(JSON.stringify(goals.length === 1 ? first : second), { status: 200 });
    }) as unknown as typeof fetch;
    beforeEach(() => { goals.length = 0; });

    it('shows each suggestion as a keyboard-reachable button under the message, rendered as text', async () => {
      make(miss([{ workflowId: 'a', title: 'Add a song to favourites' }, { workflowId: 'b', title: '<img src=x onerror=alert(1)>' }]));
      await gf.ask('favourite');
      expect(q('[role=alert]').textContent).toContain('No documented guide');
      const group = q('.hp-suggest');
      expect(group.getAttribute('role')).toBe('group');
      expect(group.getAttribute('aria-labelledby')).toBe('hp-suggest-label');
      expect(q('#hp-suggest-label').textContent).toBe('Did you mean:');
      const buttons = Array.from(gf.root.querySelectorAll<HTMLButtonElement>('.hp-suggestion'));
      expect(buttons.map((b) => b.textContent)).toEqual(['Add a song to favourites', '<img src=x onerror=alert(1)>']);
      expect(buttons.every((b) => b.tagName === 'BUTTON' && b.type === 'button' && b.tabIndex === 0)).toBe(true);
      expect(gf.root.querySelector('.hp-suggest img')).toBeNull();
      await new Promise((r) => queueMicrotask(() => r(null)));
      expect(gf.root.querySelector('[role=status]')!.textContent).toContain('Did you mean: Add a song to favourites');
    });

    it('asks the server for the tapped title as the goal and walks the returned guide', async () => {
      gf = new HeyPointer({ baseUrl: 'http://x', fetch: routed(miss([{ workflowId: 'a', title: 'Add a song to favourites' }]), walkthrough([step()])), targetTimeoutMs: 20, speechSupported: false });
      await gf.ask('favourite');
      q('[data-key=suggest-0]').click();
      await flush(); await flush();
      expect(goals).toEqual(['favourite', 'Add a song to favourites']);
      expect(gf.state().view).toBe('step');
    });

    it('shows no "Did you mean" block without suggestions', async () => {
      make(miss(undefined));
      await gf.ask('x');
      expect(gf.root.querySelector('.hp-suggest')).toBeNull();
      expect(q('[role=alert]')).toBeTruthy();
    });
  });
});
