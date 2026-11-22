import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HeyPointer, type AssistEvent } from '../src/player';
import { defineHeyPointerElement } from '../src/element';
import { jsonFetch, step, walkthrough } from './fixtures';

let gf: HeyPointer;
const q = <T extends HTMLElement>(s: string) => gf.root.querySelector<T>(s)!;
const flush = () => new Promise((r) => setTimeout(r, 0));
const clicks: string[] = [];

const HOST = `
  <button id="a">First</button>
  <button id="b">Second</button>
  <button id="c">Third</button>`;

function make(steps: ReturnType<typeof step>[], extra: Partial<ConstructorParameters<typeof HeyPointer>[0]> = {}) {
  gf = new HeyPointer({ baseUrl: 'http://x', fetch: jsonFetch(walkthrough(steps)), targetTimeoutMs: 20, speechSupported: false, ...extra });
}
const click = (id: string, text: string, over: Partial<ReturnType<typeof step>> = {}) =>
  step({ id, title: `Click ${text}`, instruction: `Click ${text}.`, target: { selectors: [`#${id}`], text }, ...over });
const steps2 = () => [click('a', 'First'), click('b', 'Second')];

const record = (e: Event) => { if ((e.target as HTMLElement).hasAttribute('data-heypointer-root')) return; clicks.push((e.target as HTMLElement).id || (e.target as HTMLElement).tagName); };
beforeEach(() => {
  clicks.length = 0;
  document.body.innerHTML = HOST;
  document.body.addEventListener('click', record);
});
afterEach(() => document.body.removeEventListener('click', record));
afterEach(() => gf?.destroy());

describe('assist mode', () => {
  it('is off by default: Next only advances, the host is never clicked', async () => {
    make(steps2());
    await gf.ask('x');
    expect(q<HTMLInputElement>('[data-key=assist]').checked).toBe(false);
    await gf.next();
    expect(clicks).toEqual([]);
    expect(q('.hp-progress').textContent).toBe('Step 2 of 2');
  });

  it('clicks the control once on Next, tells the user, and advances', async () => {
    make(steps2(), { assist: true });
    await gf.ask('x');
    await gf.next();
    expect(clicks).toEqual(['a']);
    expect(q('.hp-progress').textContent).toBe('Step 2 of 2');
    expect(q('.hp-assist-note').textContent).toBe('Clicked "First" for you.');
  });

  it('calls onAssist and fires a bubbling composed heypointer:assist event, once each', async () => {
    const seen: AssistEvent[] = [];
    const events: CustomEvent[] = [];
    document.addEventListener('heypointer:assist', (e) => events.push(e as CustomEvent), { once: true });
    make(steps2(), { assist: true, onAssist: (e) => seen.push(e) });
    await gf.ask('x');
    await gf.next();
    expect(seen).toEqual([{ stepIndex: 0, action: 'click', label: 'First' }]);
    expect(events).toHaveLength(1);
    expect(events[0].detail).toEqual({ stepIndex: 0, action: 'click', label: 'First' });
    expect(events[0].composed && events[0].bubbles).toBe(true);
  });

  it('a throwing onAssist callback does not break the guide', async () => {
    make(steps2(), { assist: true, onAssist: () => { throw new Error('host bug'); } });
    await gf.ask('x');
    await gf.next();
    expect(q('.hp-progress').textContent).toBe('Step 2 of 2');
  });

  it('finishing on a click step clicks it and shows Done', async () => {
    make([click('a', 'First')], { assist: true });
    await gf.ask('x');
    await gf.next();
    expect(clicks).toEqual(['a']);
    expect(gf.state().view).toBe('done');
  });

  describe('each safety condition blocks the click on its own', () => {
    const cases: [string, () => ReturnType<typeof step>[], () => void][] = [
      ['type step', () => [click('a', 'First', { action: 'type' }), click('b', 'Second')], () => {}],
      ['select step', () => [click('a', 'First', { action: 'select' }), click('b', 'Second')], () => {}],
      ['navigate step', () => [click('a', 'First', { action: 'navigate' }), click('b', 'Second')], () => {}],
      ['observe step', () => [click('a', 'First', { action: 'observe' }), click('b', 'Second')], () => {}],
      ['disabled button', steps2, () => ((document.getElementById('a') as HTMLButtonElement).disabled = true)],
      ['aria-disabled', steps2, () => document.getElementById('a')!.setAttribute('aria-disabled', 'true')],
      ['inside inert subtree', () => [click('z', 'Zed'), click('b', 'Second')], () => {
        document.body.insertAdjacentHTML('beforeend', '<div inert><button id="z">Zed</button></div>');
      }],
      ['file input', () => [click('f', 'Upload', { target: { selectors: ['#f'] } }), click('b', 'Second')], () => {
        document.body.insertAdjacentHTML('beforeend', '<input id="f" type="file" aria-label="Upload"/>');
      }],
      ['link to another origin', () => [click('l', 'Out', { target: { selectors: ['#l'] } }), click('b', 'Second')], () => {
        document.body.insertAdjacentHTML('beforeend', '<a id="l" href="https://elsewhere.example/x">Out</a>');
      }],
      ['link with target=_blank', () => [click('l', 'Out', { target: { selectors: ['#l'] } }), click('b', 'Second')], () => {
        document.body.insertAdjacentHTML('beforeend', '<a id="l" href="#x" target="_blank">Out</a>');
      }],
      ['download link', () => [click('l', 'Out', { target: { selectors: ['#l'] } }), click('b', 'Second')], () => {
        document.body.insertAdjacentHTML('beforeend', '<a id="l" href="#x" download>Out</a>');
      }],
      ['mailto link', () => [click('l', 'Out', { target: { selectors: ['#l'] } }), click('b', 'Second')], () => {
        document.body.insertAdjacentHTML('beforeend', '<a id="l" href="mailto:a@b.c">Out</a>');
      }],
      ['javascript: link', () => [click('l', 'Out', { target: { selectors: ['#l'] } }), click('b', 'Second')], () => {
        document.body.insertAdjacentHTML('beforeend', '<a id="l" href="javascript:void(0)">Out</a>');
      }],
      ['span inside an external link', () => [click('s', 'Out', { target: { selectors: ['#s'] } }), click('b', 'Second')], () => {
        document.body.insertAdjacentHTML('beforeend', '<a href="https://elsewhere.example/"><span id="s">Out</span></a>');
      }],
      ['the guide\'s own controls', () => [click('x', 'Guide me', { target: { selectors: ['.hp-launcher'] } }), click('b', 'Second')], () => {}],
    ];
    it.each(cases)('%s', async (_name, build, setup) => {
      setup();
      make(build(), { assist: true });
      const launcherClicks = vi.fn();
      await gf.ask('x');
      gf.root.querySelector('.hp-launcher')?.addEventListener('click', launcherClicks);
      await gf.next();
      expect(clicks).toEqual([]);
      expect(launcherClicks).not.toHaveBeenCalled();
      expect(gf.state().index).toBe(1); // Next still advances, exactly as without assist
    });

    it('a gated step (server flag)', async () => {
      make([click('a', 'First', { requiresConfirmation: true }), click('b', 'Second')], { assist: true });
      await gf.ask('x');
      q<HTMLInputElement>('[data-key=confirm]').click();
      await flush(); await flush();
      await gf.next();
      expect(clicks).toEqual([]);
      expect(gf.state().index).toBe(1);
    });

    it('a gated step (risky label, flag omitted)', async () => {
      document.body.insertAdjacentHTML('beforeend', '<button id="d">Delete account</button>');
      make([click('d', 'Delete account'), click('b', 'Second')], { assist: true });
      await gf.ask('x');
      q<HTMLInputElement>('[data-key=confirm]').click();
      await flush(); await flush();
      await gf.next();
      expect(clicks).toEqual([]);
    });

    it('an ambiguous target (two matches, never guesses)', async () => {
      document.body.insertAdjacentHTML('beforeend', '<button class="t">Twin</button><button class="t">Twin</button>');
      make([step({ target: { selectors: [], role: 'button', text: 'Twin' } }), click('b', 'Second')], { assist: true });
      await gf.ask('x');
      await gf.skip(); // an ambiguous step offers Skip; Next is the path under test below
      expect(clicks).toEqual([]);
      await gf.prev();
      await gf.next();
      expect(clicks).toEqual([]);
    });

    it('a missing target', async () => {
      make([click('gone', 'Gone'), click('b', 'Second')], { assist: true });
      await gf.ask('x');
      await gf.next();
      expect(clicks).toEqual([]);
    });

    it('a step with no usable target', async () => {
      make([step({ target: { selectors: [] } }), click('b', 'Second')], { assist: true });
      await gf.ask('x');
      await gf.next();
      expect(clicks).toEqual([]);
    });

    it('the user already used the control', async () => {
      make(steps2(), { assist: true });
      await gf.ask('x');
      document.getElementById('a')!.click(); // the user clicks it themselves
      clicks.length = 0;
      await gf.next();
      expect(clicks).toEqual([]); // no second click
      expect(q('.hp-progress').textContent).toBe('Step 2 of 2');
      expect(gf.root.querySelector('.hp-assist-note')).toBeNull();
    });

    it('the user clicked a child of the control', async () => {
      document.body.insertAdjacentHTML('beforeend', '<button id="k"><span id="kk">Kid</span></button>');
      make([click('k', 'Kid', { target: { selectors: ['#k'] } }), click('b', 'Second')], { assist: true });
      await gf.ask('x');
      document.getElementById('kk')!.click();
      clicks.length = 0;
      await gf.next();
      expect(clicks).toEqual([]);
    });

    it('the user clicked an interactive ancestor of the control (e.g. its label)', async () => {
      document.body.insertAdjacentHTML('beforeend', '<label id="lab"><input id="chk" type="checkbox"/> Agree</label>');
      make([click('chk', 'Agree', { target: { selectors: ['#chk'] } }), click('b', 'Second')], { assist: true });
      await gf.ask('x');
      document.getElementById('lab')!.click();
      clicks.length = 0;
      await gf.next();
      expect(clicks).toEqual([]);
    });

    it('a click on unrelated page area does not count as the user acting', async () => {
      make(steps2(), { assist: true });
      await gf.ask('x');
      document.body.click();
      clicks.length = 0;
      await gf.next();
      expect(clicks).toEqual(['a']);
    });

    it('a step the guide already clicked once is never clicked again (Back then Next)', async () => {
      make(steps2(), { assist: true });
      await gf.ask('x');
      await gf.next();
      await gf.prev();
      clicks.length = 0;
      await gf.next();
      expect(clicks).toEqual([]);
    });

    it('turning assist off stops clicking', async () => {
      make(steps2(), { assist: true });
      await gf.ask('x');
      q<HTMLInputElement>('[data-key=assist]').click();
      await flush(); await flush();
      await gf.next();
      expect(clicks).toEqual([]);
    });
  });

  it('keeps knowing the user already acted after the assist toggle re-renders the card', async () => {
    make(steps2(), { assist: true });
    gf.open();
    await gf.ask('x');
    document.getElementById('a')!.click();
    clicks.length = 0;
    q<HTMLInputElement>('[data-key=assist]').click(); // off
    await flush(); await flush();
    q<HTMLInputElement>('[data-key=assist]').click(); // on again
    await flush(); await flush();
    await gf.next();
    expect(clicks).toEqual([]);
  });

  it('the same toggle state is shown in the goal card and in the coachmark tools', async () => {
    make(steps2());
    gf.open();
    // goal card (before any steps)
    const first = q<HTMLInputElement>('[data-key=assist]');
    expect(first.checked).toBe(false);
    first.click();
    await flush(); await flush();
    expect(q<HTMLInputElement>('[data-key=assist]').checked).toBe(true);
    await gf.ask('x');
    // coachmark tools
    expect(q('.hp-tour-tools [data-key=assist]')).not.toBeNull();
    expect(q<HTMLInputElement>('.hp-tour-tools [data-key=assist]').checked).toBe(true);
    q<HTMLInputElement>('.hp-tour-tools [data-key=assist]').click();
    await flush(); await flush();
    await gf.next();
    expect(clicks).toEqual([]);
  });

  it('the toggle has an accessible label and is a keyboard-operable checkbox', () => {
    make(steps2());
    const box = q<HTMLInputElement>('[data-key=assist]');
    expect(box.type).toBe('checkbox');
    expect(box.closest('label')!.textContent).toBe('Assist: do safe clicks for me when I press Next');
  });

  it('does not persist the toggle anywhere', async () => {
    const set = vi.spyOn(Storage.prototype, 'setItem');
    make(steps2());
    q<HTMLInputElement>('[data-key=assist]').click();
    await flush();
    expect(set).not.toHaveBeenCalled();
    set.mockRestore();
  });

  it('shows the label as text only (no markup injection)', async () => {
    document.body.insertAdjacentHTML('beforeend', '<button id="x1" aria-label="&lt;img src=x onerror=alert(1)&gt;">Hi</button>');
    make([click('x1', 'Hi', { target: { selectors: ['#x1'] } }), click('b', 'Second')], { assist: true });
    await gf.ask('x');
    await gf.next();
    expect(q('.hp-assist-note').textContent).toBe('Clicked "<img src=x onerror=alert(1)>" for you.');
    expect(gf.root.querySelector('.hp-assist-note img')).toBeNull();
  });

  it('shows a hint on steps the guide will not do, only while assist is on', async () => {
    make([click('a', 'First', { action: 'type' }), click('b', 'Second')], { assist: true });
    await gf.ask('x');
    expect(q('.hp-assist-hint').hidden).toBe(false);
    expect(q('.hp-assist-hint').textContent).toBe('You need to do this one yourself.');
    q<HTMLInputElement>('.hp-tour-tools [data-key=assist]').click();
    await flush(); await flush();
    expect(q('.hp-assist-hint').hidden).toBe(true);
  });

  it('shows the hint on a click step it cannot do (disabled control) and not on one it can', async () => {
    (document.getElementById('a') as HTMLButtonElement).disabled = true;
    make(steps2(), { assist: true });
    await gf.ask('x');
    expect(q('.hp-assist-hint').hidden).toBe(false);
    await gf.next();
    expect(q('.hp-assist-hint').hidden).toBe(true);
  });

  it('reports a failed click, does not advance, and never retries on its own', async () => {
    const seen: AssistEvent[] = [];
    make(steps2(), { assist: true, onAssist: (e) => seen.push(e) });
    await gf.ask('x');
    document.getElementById('a')!.click = () => { throw new Error('boom'); };
    await gf.next();
    expect(q('.hp-assist-note').getAttribute('role')).toBe('alert');
    expect(q('.hp-assist-note').textContent).toContain('couldn\'t click "First"');
    expect(q('.hp-progress').textContent).toBe('Step 1 of 2');
    expect(seen).toEqual([]);
    await gf.next(); // second Next: the step is marked tried, so it just advances
    expect(q('.hp-progress').textContent).toBe('Step 2 of 2');
    expect(seen).toEqual([]);
  });

  it('when the next control never appears it says what was clicked and offers recovery', async () => {
    make([click('a', 'First'), click('never', 'Never')], { assist: true });
    await gf.ask('x');
    await gf.next();
    expect(clicks).toEqual(['a']);
    expect(gf.state().missing).toBe(true);
    expect(q('.hp-assist-note').textContent).toBe('Clicked "First" for you.');
    expect(q('[role=alert]').textContent).toContain("can't find");
    expect(gf.root.querySelector('[data-key=retry]')).not.toBeNull();
    clicks.length = 0;
    q('[data-key=retry]').click();
    await flush(); await flush();
    expect(clicks).toEqual([]); // never retried automatically
  });

  it('waits for the next control that the click makes appear', async () => {
    document.getElementById('a')!.addEventListener('click', () => setTimeout(() => document.body.insertAdjacentHTML('beforeend', '<button id="late">Late</button>'), 5));
    make([click('a', 'First'), click('late', 'Late')], { assist: true });
    await gf.ask('x');
    await gf.next();
    await flush(); await flush();
    expect(gf.state().missing).toBe(false);
    expect(q('.hp-highlight').hidden).toBe(false);
  });

  it('clicks a same-page hash link', async () => {
    document.body.insertAdjacentHTML('beforeend', '<a id="h" href="#section">Jump</a>');
    make([click('h', 'Jump', { target: { selectors: ['#h'] } }), click('b', 'Second')], { assist: true });
    await gf.ask('x');
    await gf.next();
    expect(clicks).toEqual(['h']);
  });

  it('the guide\'s own click on the toggle or buttons never counts as the user acting on the target', async () => {
    make(steps2(), { assist: true });
    await gf.ask('x');
    q('[data-key=skip]').click();
    await flush(); await flush();
    await gf.prev();
    await gf.next();
    expect(clicks).toEqual(['a']);
  });
});

describe('assist configuration surfaces', () => {
  it('<heypointer-assistant assist> turns it on; assist="false" does not', async () => {
    defineHeyPointerElement();
    const mk = (attr: string) => {
      document.body.innerHTML = `<heypointer-assistant base-url="http://x" ${attr}></heypointer-assistant>`;
      return (document.querySelector('heypointer-assistant') as unknown as { player: HeyPointer }).player;
    };
    expect(mk('assist').root.querySelector<HTMLInputElement>('[data-key=assist]')!.checked).toBe(true);
    expect(mk('assist="false"').root.querySelector<HTMLInputElement>('[data-key=assist]')!.checked).toBe(false);
    expect(mk('').root.querySelector<HTMLInputElement>('[data-key=assist]')!.checked).toBe(false);
  });
});
