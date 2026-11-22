import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startAuthoring, classify, type AuthorSession } from '../src/author/index';
import { stepsOf } from '../src/author/draft';
import { resolveDetailed } from '../src/targeting/index';
import { resolveLabels } from '../src/labels';

function mem(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, String(v)), removeItem: (k) => void m.delete(k),
    clear: () => m.clear(), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; },
  } as Storage;
}

let session: AuthorSession | null = null;
let storage: Storage;
let clock = 1_000_000;
const advance = (ms = 1000) => { clock += ms; vi.setSystemTime(clock); };

function start(opts: Parameters<typeof startAuthoring>[0] = {}) {
  session = startAuthoring({ acceptUntrusted: true, storage, autoRecord: true, title: 'Test flow', ...opts });
  return session;
}
const fire = (el: Element) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
function click(el: Element) { advance(); fire(el); }
function type(el: HTMLInputElement | HTMLTextAreaElement, value: string) { advance(); el.value = value; el.dispatchEvent(new Event('input', { bubbles: true, composed: true })); }
function choose(el: HTMLSelectElement, value: string) { advance(); el.value = value; el.dispatchEvent(new Event('change', { bubbles: true, composed: true })); }
const steps = () => stepsOf(session!.getDraft()).map((s) => s.text);
const panelRoot = () => document.querySelector<HTMLElement>('[data-heypointer-author]')!.shadowRoot!;
const q = (sel: string) => panelRoot().querySelector<HTMLElement>(sel)!;
const btn = (key: string) => q(`[data-k="${key}"]`) as HTMLButtonElement;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  clock = 1_000_000;
  vi.setSystemTime(clock);
  storage = mem();
  document.body.innerHTML = '';
});
afterEach(() => {
  session?.stop();
  session = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('capture: what each control records', () => {
  it('records buttons, links and ARIA buttons as Click "label"', () => {
    document.body.innerHTML = '<button id="b">Save</button><a id="a" href="#/x">Pricing</a><div id="d" role="button" aria-label="Open menu">≡</div>';
    start();
    click(document.getElementById('b')!);
    click(document.getElementById('a')!);
    click(document.getElementById('d')!);
    expect(steps()).toEqual(['Click "Save".', 'Click "Pricing".', 'Click "Open menu".']);
  });

  it('a click on text inside a button records the button, not the text', () => {
    document.body.innerHTML = '<button id="b"><svg></svg><span id="s">Add to cart</span></button>';
    start();
    click(document.getElementById('s')!);
    expect(steps()).toEqual(['Click "Add to cart".']);
  });

  it('a checkbox and a radio record once, even when the label click and the control click both arrive', () => {
    document.body.innerHTML = '<label for="c">Gift wrap</label><input id="c" type="checkbox"><label><input id="r" type="radio" name="s"> Express</label>';
    start();
    const label = document.querySelector('label[for="c"]')!;
    click(label); // the browser then clicks the control itself; the label records nothing on its own
    fire(document.getElementById('c')!); // an immediate second click on the same control is one step
    click(document.getElementById('r')!);
    expect(steps()).toEqual(['Click "Gift wrap".', 'Click "Express".']);
  });

  it('a text field records "Enter your <label> in" once however long the person types, and never the value', () => {
    document.body.innerHTML = '<label for="q">Search products</label><input id="q" type="search"><button>Go</button>';
    start();
    const input = document.getElementById('q') as HTMLInputElement;
    for (const v of ['w', 'wi', 'wireless', 'wireless headphones']) type(input, v);
    expect(steps()).toEqual(['Enter your search products in "Search products".']);
    expect(JSON.stringify(session!.getDraft())).not.toMatch(/wireless/i);
    expect(session!.toMarkdown()).not.toMatch(/wireless/i);
    expect([...Array(storage.length).keys()].map((i) => storage.getItem(storage.key(i)!)).join('')).not.toMatch(/wireless/i);
  });

  it('typing in the same field again after another step records a new step', () => {
    document.body.innerHTML = '<label for="n">Name</label><input id="n" type="text"><button>Next</button>';
    start();
    type(document.getElementById('n') as HTMLInputElement, 'a');
    click(document.querySelector('button')!);
    type(document.getElementById('n') as HTMLInputElement, 'b');
    expect(steps()).toEqual(['Enter your name in "Name".', 'Click "Next".', 'Enter your name in "Name".']);
  });

  it('a select records the field label and never the chosen option', () => {
    document.body.innerHTML = '<label for="s">Country</label><select id="s"><option value="de">Germany</option><option value="in">India</option></select>';
    start();
    choose(document.getElementById('s') as HTMLSelectElement, 'in');
    expect(steps()).toEqual(['Choose an option in "Country".']);
    expect(session!.toMarkdown()).not.toMatch(/India|Germany/);
  });

  it('a select with no label records nothing sensitive: its option list is not used as a name', () => {
    document.body.innerHTML = '<select id="s"><option>Germany</option><option>India</option></select>';
    start();
    choose(document.getElementById('s') as HTMLSelectElement, 'India');
    const s = stepsOf(session!.getDraft())[0]!;
    expect(s.status.kind).toBe('noname');
    expect(s.text).not.toMatch(/Germany|India/);
  });

  it('a file input records a choose step by its label', () => {
    document.body.innerHTML = '<label for="f">Attach invoice</label><input id="f" type="file">';
    start();
    const f = document.getElementById('f')!;
    advance();
    f.dispatchEvent(new Event('change', { bubbles: true }));
    expect(steps()).toEqual(['Choose an option in "Attach invoice".']);
  });

  it('Enter in a field records the form\'s submit button when no click happened', () => {
    document.body.innerHTML = '<form id="f"><label for="q">Search</label><input id="q" type="search"><button type="submit">Find</button></form>';
    start();
    advance();
    document.getElementById('f')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(steps()).toEqual(['Click "Find".']);
  });

  it('clicks that mean nothing are not steps: plain text, containers, disabled and hidden controls', () => {
    document.body.innerHTML = '<p id="p">Hello</p><div id="box"><span>just a box</span></div><button id="d" disabled>Disabled</button><button id="h" hidden>Hidden</button><button id="ad" aria-disabled="true">Nope</button>';
    start();
    for (const id of ['p', 'box', 'd', 'h', 'ad']) click(document.getElementById(id)!);
    expect(steps()).toEqual([]);
  });

  it('table rows are not recorded by default; with the option they are, flagged as page data', () => {
    document.body.innerHTML = '<table><tr id="r"><td id="c">Alice Smith</td><td>alice@example.com</td></tr></table>';
    start();
    click(document.getElementById('c')!);
    expect(steps()).toEqual([]);
    session!.stop();
    storage = mem();
    start({ recordRows: true });
    click(document.getElementById('c')!);
    const s = stepsOf(session!.getDraft());
    expect(s).toHaveLength(1);
    expect(s[0]!.pageData).toBe(true);
  });

  it('a div that only looks clickable (pointer cursor) is recorded, but the guide cannot find it, and the status says so', () => {
    document.body.innerHTML = '<div id="d" style="cursor:pointer">Archive</div>';
    start();
    click(document.getElementById('d')!);
    const s = stepsOf(session!.getDraft())[0];
    expect(s?.text).toBe('Click "Archive".');
    expect(s?.status.kind).toBe('notfound');
  });

  it('events from inside an open shadow root are recorded by the control the person used', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = '<button id="b">Shadow save</button>';
    start();
    click(root.getElementById('b')!);
    expect(steps()).toEqual(['Click "Shadow save".']);
  });

  it('does not record while paused, and records again after Resume', () => {
    document.body.innerHTML = '<button id="a">One</button><button id="b">Two</button>';
    start();
    session!.pause();
    click(document.getElementById('a')!);
    session!.resume();
    click(document.getElementById('b')!);
    expect(steps()).toEqual(['Click "Two".']);
  });

  it('ignores events a script dispatched unless the test opts in (so the guide\'s own Assist clicks are never recorded)', () => {
    document.body.innerHTML = '<button id="a">One</button>';
    start({ acceptUntrusted: false });
    click(document.getElementById('a')!);
    expect(steps()).toEqual([]);
  });

  it('never records clicks on its own panel', () => {
    document.body.innerHTML = '<button id="a">One</button>';
    start();
    btn('undo').dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    btn('min').dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    expect(steps()).toEqual([]);
  });

  it('records the controls inside a same-origin iframe, including one that loads after recording started', async () => {
    const frame = document.createElement('iframe');
    document.body.append(frame);
    await new Promise((r) => (frame.contentDocument?.readyState === 'complete' ? r(null) : frame.addEventListener('load', () => r(null), { once: true })));
    frame.contentDocument!.body.innerHTML = '<button id="fb">Frame save</button>';
    // jsdom's getComputedStyle only takes elements of its own window; browsers take any.
    vi.spyOn(window, 'getComputedStyle').mockImplementation((el: Element) => (el.ownerDocument.defaultView as Window).getComputedStyle(el));
    start();
    frame.dispatchEvent(new Event('load')); // what the browser does when the frame's page finishes loading
    const el = frame.contentDocument!.getElementById('fb')!;
    advance();
    el.dispatchEvent(new (frame.contentWindow as unknown as typeof globalThis).MouseEvent('click', { bubbles: true }));
    expect(steps()).toEqual(['Click "Frame save".']);
  });

  it('a route change while recording becomes a note, not a step, with no query and no ids', () => {
    document.body.innerHTML = '<button>Go</button>';
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    start();
    history.pushState({}, '', '/orders/12345?token=abc#frag');
    vi.advanceTimersByTime(600);
    const notes = session!.getDraft().entries.filter((e) => e.t === 'note').map((e) => (e as { text: string }).text);
    expect(notes.at(-1)).toBe('/orders/:id');
    expect(JSON.stringify(session!.getDraft())).not.toMatch(/token|abc|frag|12345/);
    expect(steps()).toEqual([]);
    history.pushState({}, '', '/');
  });
});

describe('redaction: values never appear', () => {
  it('password, one-time code and card fields record the label with a sensitive flag', () => {
    document.body.innerHTML = `
      <label for="p">Password</label><input id="p" type="password">
      <label for="o">Code</label><input id="o" type="text" autocomplete="one-time-code">
      <label for="c">Number</label><input id="c" type="text" name="card_number">
      <label for="t">Access token</label><input id="t" type="text" id="t">`;
    start();
    for (const id of ['p', 'o', 'c']) type(document.getElementById(id) as HTMLInputElement, `S3cret-${id}-value`);
    const s = stepsOf(session!.getDraft());
    expect(s.map((x) => x.sensitive)).toEqual([true, true, true]);
    expect(s.map((x) => x.text)).toEqual(['Enter your password in "Password".', 'Enter your code in "Code".', 'Enter your number in "Number".']);
    expect(JSON.stringify(session!.getDraft()) + session!.toMarkdown()).not.toMatch(/S3cret/);
  });

  it('property: random typed text never reaches the draft, the Markdown or the stored copy', () => {
    document.body.innerHTML = '<label for="a">Alpha</label><input id="a" type="text"><label for="b">Beta</label><textarea id="b"></textarea><label for="c">Gamma</label><input id="c" type="email"><button>Go</button>';
    start();
    let seed = 99;
    const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32);
    const typed: string[] = [];
    for (let i = 0; i < 200; i++) {
      const v = `zq${Math.floor(rnd() * 1e12).toString(36)}${Math.floor(rnd() * 1e12).toString(36)}`;
      typed.push(v);
      const el = document.getElementById(['a', 'b', 'c'][i % 3]!) as HTMLInputElement;
      type(el, v);
      if (i % 7 === 0) click(document.querySelector('button')!);
    }
    const everything = JSON.stringify(session!.getDraft()) + session!.toMarkdown() + [...Array(storage.length).keys()].map((i) => storage.getItem(storage.key(i)!)).join('');
    for (const v of typed) expect(everything.includes(v)).toBe(false);
    // The panel (what the person sees) holds only labels as well.
    const shown = panelRoot().textContent! + Array.from(panelRoot().querySelectorAll('input')).map((i) => (i as HTMLInputElement).value).join(' ');
    for (const v of typed) expect(shown.includes(v)).toBe(false);
  });

  it('control characters and quotes in a label cannot break out of the sentence', () => {
    document.body.innerHTML = '<button id="b" aria-label="Say &quot;hi&quot;\u0007\nthere">x</button>';
    start();
    click(document.getElementById('b')!);
    const t = steps()[0]!;
    expect(t).toBe("Click \"Say 'hi' there\".");
    // eslint-disable-next-line no-control-regex
    expect(/[\u0000-\u001f]/.test(session!.toMarkdown().replace(/\n/g, ''))).toBe(false);
  });
});

describe('status chips use the same resolver the guide uses', () => {
  it('unique, ambiguous, no name, not found, and page data', () => {
    document.body.innerHTML = `
      <button id="u">Save draft</button>
      <button class="d">Delete</button><button class="d">Delete</button>
      <button id="n"><svg></svg></button>
      <ul><li><a id="pd" href="#x">Maria Gonzalez</a></li></ul>
      <button id="e">Email maria@example.com</button>`;
    start();
    for (const id of ['u', 'n', 'pd', 'e']) click(document.getElementById(id)!);
    click(document.querySelector('.d')!);
    const byText = Object.fromEntries(stepsOf(session!.getDraft()).map((s) => [s.text, s]));
    expect(byText['Click "Save draft".']!.status).toEqual({ kind: 'unique' });
    expect(byText['Click "Delete".']!.status).toEqual({ kind: 'ambiguous', count: 2 });
    expect(byText['Click the control.']!.status).toEqual({ kind: 'noname' });
    expect(byText['Click "Maria Gonzalez".']!.pageData).toBe(true);
    expect(byText['Click "Email maria@example.com".']!.pageData).toBe(true);
    expect(byText['Click "Save draft".']!.pageData).toBe(false);
  });

  it('classify() agrees with resolveDetailed for a label and its control', () => {
    document.body.innerHTML = '<label for="e">Email address</label><input id="e" type="email">';
    expect(classify('Email address', document.getElementById('e')!)).toEqual({ kind: 'unique' });
    expect(resolveDetailed({ selectors: [], text: 'Email address' }).status).toBe('found');
    expect(classify('Nothing here')).toEqual({ kind: 'unchecked' });
    expect(classify('Nothing here', document.body)).toEqual({ kind: 'notfound' });
  });

  it('the author panel is invisible to the resolver, so its own buttons never cause ambiguity', () => {
    document.body.innerHTML = '<button id="x">Pause</button>';
    start();
    expect(resolveDetailed({ selectors: [], text: 'Pause' })).toMatchObject({ status: 'found' });
    expect(resolveDetailed({ selectors: [], text: 'Stop and review' }).status).toBe('missing');
  });
});

describe('limits', () => {
  it('stops at 100 steps and says so', () => {
    document.body.innerHTML = Array.from({ length: 120 }, (_, i) => `<button id="b${i}">Control ${i}</button>`).join('');
    start();
    for (let i = 0; i < 120; i++) click(document.getElementById(`b${i}`)!);
    expect(steps()).toHaveLength(100);
    expect(session!.mode).toBe('paused');
    expect(q('.status').textContent).toMatch(/100 steps/);
  });

  it('keeps every step sentence within 120 characters, however long the label is', () => {
    document.body.innerHTML = `<button id="b">${'Long label words '.repeat(30)}</button><label for="i">${'Field label '.repeat(30)}</label><input id="i" type="text">`;
    start();
    click(document.getElementById('b')!);
    type(document.getElementById('i') as HTMLInputElement, 'x');
    for (const t of steps()) expect(t.length).toBeLessThanOrEqual(120);
    // A truncated label cannot be found by text, and the chip says so.
    expect(stepsOf(session!.getDraft()).map((s) => s.status.kind)).toEqual(['notfound', 'notfound']);
  });

  it('edited text is cut at 120 characters', () => {
    document.body.innerHTML = '<button>Go</button>';
    start();
    click(document.querySelector('button')!);
    const input = q('input[data-k$="-text"]') as HTMLInputElement;
    input.value = `Click "Go" ${'x'.repeat(300)}`;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('change'));
    expect(steps()[0]!.length).toBeLessThanOrEqual(120);
  });
});

describe('persistence across page loads', () => {
  it('keeps labels only, and a new page picks the draft up and goes on recording', () => {
    document.body.innerHTML = '<label for="q">Search</label><input id="q" type="text"><button>Go</button>';
    start();
    type(document.getElementById('q') as HTMLInputElement, 'private-text-1234');
    click(document.querySelector('button')!);
    const stored = new Map<string, string>();
    for (let i = 0; i < storage.length; i++) stored.set(storage.key(i)!, storage.getItem(storage.key(i)!)!);
    expect([...stored.values()].join('')).not.toMatch(/private-text/);
    session!.stop(); // ends the session and clears storage ...
    expect(storage.length).toBe(0);
    for (const [k, v] of stored) storage.setItem(k, v); // ... so put the page-unload state back: a reload never runs stop()
    document.body.innerHTML = '<button id="n">Next page</button>';
    start({ title: undefined, autoRecord: false });
    expect(session!.mode).toBe('recording');
    expect(steps()).toEqual(['Enter your search in "Search".', 'Click "Go".']);
    expect(session!.getDraft().title).toBe('Test flow');
    expect(panelRoot().querySelector('[data-k="title"]')).toBeNull(); // the panel stays small while recording
    click(document.getElementById('n')!);
    expect(steps()).toHaveLength(3);
  });

  it('Stop and review clears nothing until the session is ended; closing forgets the draft', () => {
    document.body.innerHTML = '<button>Go</button>';
    start();
    click(document.querySelector('button')!);
    expect(storage.length).toBeGreaterThan(0);
    session!.stop();
    expect(storage.length).toBe(0);
  });

  it('refuses a stored draft that is not shaped like one', () => {
    storage.setItem('heypointer:author:draft:v1', JSON.stringify({ draft: { title: 5, entries: 'x' } }));
    start({ autoRecord: false });
    expect(session!.getDraft().entries).toEqual([]);
  });

  it('works with storage blocked', () => {
    document.body.innerHTML = '<button>Go</button>';
    start({ storage: null });
    click(document.querySelector('button')!);
    expect(steps()).toEqual(['Click "Go".']);
  });
});

describe('the panel', () => {
  it('walks idle -> recording -> paused -> review with Markdown, and Keep recording goes back', () => {
    document.body.innerHTML = '<button id="a">Open</button>';
    start({ autoRecord: false, title: 'Open it' });
    expect(q('[data-mode]').getAttribute('data-mode')).toBe('idle');
    expect(btn('stop').disabled).toBe(true);
    btn('rec').click();
    expect(session!.mode).toBe('recording');
    click(document.getElementById('a')!);
    expect(btn('stop').disabled).toBe(false);
    btn('rec').click(); // Pause
    expect(session!.mode).toBe('paused');
    btn('stop').click();
    expect(q('pre').textContent).toContain('# PRD: Open it');
    expect(q('pre').textContent).toContain('1. Click "Open".');
    expect(q('[data-k="copy"]')).toBeTruthy();
    btn('keep').click();
    expect(session!.mode).toBe('recording');
  });

  it('review blocks Copy and Download while the draft has problems, and says what is wrong', () => {
    document.body.innerHTML = '<button>Go</button>';
    start({ title: '' });
    click(document.querySelector('button')!);
    btn('stop').click();
    expect(q('[role="alert"]').textContent).toContain('title');
    expect((btn('copy')).disabled).toBe(true);
    expect((btn('download')).disabled).toBe(true);
    const title = q('[data-k="title"]') as HTMLInputElement;
    title.value = 'Now it has one';
    title.dispatchEvent(new Event('change'));
    expect(btn('copy').disabled).toBe(false);
    expect(q('pre').textContent).toContain('# PRD: Now it has one');
    expect(panelRoot().textContent).toContain('heypointer flows import now-it-has-one.md --publish');
    expect(panelRoot().textContent).toContain('heypointer scan .');
  });

  it('copies the Markdown and downloads <slug>.md without any network call', async () => {
    document.body.innerHTML = '<button>Go</button>';
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const created: Blob[] = [];
    URL.createObjectURL = vi.fn((b: Blob) => (created.push(b), 'blob:x'));
    URL.revokeObjectURL = vi.fn();
    start({ title: 'Ship it' });
    click(document.querySelector('button')!);
    btn('stop').click();
    btn('copy').click();
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('# PRD: Ship it'));
    btn('download').click();
    expect(created).toHaveLength(1);
    const text = await new Promise<string>((resolve) => { const fr = new FileReader(); fr.onload = () => resolve(String(fr.result)); fr.readAsText(created[0]!); });
    expect(text).toContain('1. Click "Go".');
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('edits a step, re-checks it, and reorders, deletes and undoes', () => {
    document.body.innerHTML = '<button>One</button><button>Two</button><button>Three</button>';
    start();
    for (const b of Array.from(document.querySelectorAll('button'))) click(b);
    expect(steps()).toEqual(['Click "One".', 'Click "Two".', 'Click "Three".']);
    const id = (n: number) => stepsOf(session!.getDraft())[n]!.id;
    btn(`s${id(2)}-up`).click();
    expect(steps()).toEqual(['Click "One".', 'Click "Three".', 'Click "Two".']);
    btn(`s${id(0)}-down`).click();
    expect(steps()).toEqual(['Click "Three".', 'Click "One".', 'Click "Two".']);
    btn(`s${id(1)}-del`).click();
    expect(steps()).toEqual(['Click "Three".', 'Click "Two".']);
    btn('undo').click();
    expect(steps()).toEqual(['Click "Three".']);
    const t = q('input[data-k$="-text"]') as HTMLInputElement;
    t.value = 'Click "Nowhere".';
    t.dispatchEvent(new Event('input'));
    t.dispatchEvent(new Event('change'));
    expect(stepsOf(session!.getDraft())[0]!.status.kind).toBe('unchecked');
    expect(panelRoot().textContent).toContain('Not on this page');
  });

  it('"Needs confirmation" can be switched on by the author, and is on and locked for a risky label', () => {
    document.body.innerHTML = '<button>Choose plan</button><button>Buy now</button>';
    start();
    for (const b of Array.from(document.querySelectorAll('button'))) click(b);
    const [plan, buy] = stepsOf(session!.getDraft());
    const planGate = btn(`s${plan!.id}-gate`) as unknown as HTMLInputElement;
    const buyGate = btn(`s${buy!.id}-gate`) as unknown as HTMLInputElement;
    expect(planGate.checked).toBe(false);
    expect(buyGate.checked).toBe(true);
    expect(buyGate.disabled).toBe(true);
    planGate.click();
    expect(session!.toMarkdown()).toContain('1. Click "Choose plan". This is a consequential action.');
    expect(session!.toMarkdown()).toContain('2. Click "Buy now". This is a consequential action.');
  });

  it('shows ambiguity with the reason and offers context from the nearest dialog', () => {
    document.body.innerHTML = '<div role="dialog" aria-label="Billing"><button id="a">Save</button></div><button>Save</button>';
    start();
    click(document.getElementById('a')!);
    expect(panelRoot().textContent).toContain('Ambiguous: 2 matches');
    expect(panelRoot().textContent).toContain('will not guess');
    const ctx = Array.from(panelRoot().querySelectorAll('button')).find((b) => b.textContent?.includes('Add context'))!;
    expect(ctx.textContent).toContain('Billing');
    ctx.click();
    expect(steps()[0]).toBe('Click "Save" in the Billing area.');
  });

  it('writes every label with textContent: markup in a label is shown as text and runs nothing', () => {
    document.body.innerHTML = '<button id="b" aria-label="&lt;img src=x onerror=alert(1)&gt;">z</button>';
    start();
    click(document.getElementById('b')!);
    expect(panelRoot().querySelector('img')).toBeNull();
    expect((q('input[data-k$="-text"]') as HTMLInputElement).value).toContain('<img');
  });

  it('shows each chip and hint in the host\'s own words when it overrides the author labels, and the guide ignores those keys', () => {
    document.body.innerHTML = '<button>Save</button>';
    start({ labels: { authorRecord: 'Aufnehmen', authorStatusRecording: 'Aufnahme läuft: {count}', authorChipUnique: 'Eindeutig', authorPause: '' } });
    expect(btn('rec').textContent).toBe('Pause'); // the invalid empty override falls back to the default
    click(document.querySelector('button')!);
    expect(panelRoot().textContent).toContain('Aufnahme läuft: 1');
    expect(panelRoot().textContent).toContain('Eindeutig');
    const r = resolveLabels({ authorRecord: 'x', next: 'Weiter' });
    expect(r.labels.next).toBe('Weiter');
    expect(r.problems).toEqual([]); // author keys are not "unknown" to the guide
  });

  it('applies a validated theme to the panel and ignores values that could inject CSS', () => {
    start({ theme: { accent: '#7c3aed', bg: 'red;} body{display:none' as never, radius: '20px' } });
    const host = document.querySelector<HTMLElement>('[data-heypointer-author]')!;
    expect(host.style.getPropertyValue('--hp-accent')).toBe('#7c3aed');
    expect(host.style.getPropertyValue('--hp-radius')).toBe('20px');
    expect(host.style.getPropertyValue('--hp-bg')).toBe('');
  });

  it('sets dir, lang and color scheme on the panel host', () => {
    start({ dir: 'rtl', lang: 'ar', colorScheme: 'dark' });
    const host = document.querySelector<HTMLElement>('[data-heypointer-author]')!;
    expect([host.getAttribute('dir'), host.getAttribute('lang'), host.getAttribute('data-scheme')]).toEqual(['rtl', 'ar', 'dark']);
  });

  it('is operable from the keyboard: Record, Stop and review and Close are real buttons with names, and Alt+Shift+G moves focus in', () => {
    document.body.innerHTML = '<button id="x">Outside</button>';
    start({ autoRecord: false });
    document.getElementById('x')!.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'G', code: 'KeyG', altKey: true, shiftKey: true, bubbles: true }));
    expect(panelRoot().activeElement?.getAttribute('data-k')).toBe('rec');
    for (const key of ['rec', 'stop', 'undo', 'min', 'close']) expect(btn(key).tagName).toBe('BUTTON');
    expect(btn('close').getAttribute('aria-label')).toBe('Close author mode');
    expect(btn('min').getAttribute('aria-expanded')).toBe('true');
  });

  it('Close asks before throwing a draft away, and removes the panel', () => {
    document.body.innerHTML = '<button>Go</button>';
    start();
    click(document.querySelector('button')!);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    btn('close').click();
    expect(document.querySelector('[data-heypointer-author]')).not.toBeNull();
    btn('close').click();
    expect(document.querySelector('[data-heypointer-author]')).toBeNull();
    expect(confirmSpy).toHaveBeenCalledTimes(2);
    expect(storage.length).toBe(0);
  });

  it('only one session at a time', () => {
    const a = start();
    expect(startAuthoring({ storage })).toBe(a);
    expect(document.querySelectorAll('[data-heypointer-author]')).toHaveLength(1);
  });
});
