// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 HeyPointer
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HEYPOINTER_TAG, defineHeyPointerElement, type HeyPointerElement } from '../src/index';
import { CLOSE_EVENT, HeyPointer, OPEN_EVENT } from '../src/player';
import { coachmarkPosition } from '../src/spotlight';
import { jsonFetch, step, walkthrough } from './fixtures';

const HOST = `<button id="inv">Invite teammate</button><input id="em" aria-label="Email"/><button id="send">Send invite</button><button id="mine">Help</button>`;
let gf: HeyPointer;
const q = <T extends HTMLElement>(s: string) => gf.root.querySelector<T>(s)!;
const text = (s: string) => q(s).textContent;
const partsIn = (root: ParentNode) => new Set(Array.from(root.querySelectorAll('[part]')).flatMap((e) => e.getAttribute('part')!.split(/\s+/)));

function make(wt: unknown, extra: Partial<ConstructorParameters<typeof HeyPointer>[0]> = {}) {
  gf = new HeyPointer({ baseUrl: 'http://x', fetch: jsonFetch(wt), targetTimeoutMs: 20, speechSupported: false, ...extra });
}
const two = () => walkthrough([step(), step({ id: 's2', title: 'Email', instruction: 'Enter email.', target: { selectors: [], label: 'Email' }, action: 'type' })]);

beforeEach(() => { document.body.innerHTML = HOST; vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => { gf?.destroy(); vi.restoreAllMocks(); });

describe('parts', () => {
  it('names every documented part somewhere in the rendered guide', async () => {
    // Step view, with a confirmation gate and evidence.
    make(walkthrough([step({ requiresConfirmation: true })]), { assist: true });
    await gf.ask('invite');
    const seen = partsIn(gf.root);
    for (const p of ['launcher', 'panel', 'card', 'title', 'text', 'progress', 'actions', 'button', 'button-primary', 'button-secondary', 'close', 'goal-input', 'hint', 'toggle', 'highlight', 'spotlight', 'arrow', 'evidence', 'warning']) {
      expect(seen, p).toContain(p);
    }
    gf.destroy();
    // Missing target: the alert.
    make(walkthrough([step({ target: { selectors: [], text: 'Nowhere' } })]));
    await gf.ask('invite');
    expect(partsIn(gf.root)).toContain('alert');
    gf.destroy();
    // Refusal with suggestions.
    make(walkthrough([], { status: 'insufficient_evidence', message: 'No.', suggestions: [{ workflowId: 'w9', title: 'Invite a teammate' }] }));
    await gf.ask('x');
    expect(partsIn(gf.root)).toContain('suggestion');
    expect(partsIn(gf.root)).toContain('suggestions');
  });

  it('marks the goal card as `panel` and the coachmark as `panel card`', async () => {
    make(two());
    expect(q('.hp-panel').getAttribute('part')).toBe('panel');
    await gf.ask('invite');
    expect(q('.hp-panel').getAttribute('part')).toBe('panel card');
  });

  it('keeps the guide root findable by hosts', () => {
    make(two());
    expect(gf.host.hasAttribute('data-heypointer-root')).toBe(true);
  });
});

describe('labels', () => {
  it('uses the English defaults when nothing is set', async () => {
    make(two());
    expect(text('.hp-launcher')).toBe('Guide me');
    expect(q('.hp-panel').getAttribute('aria-label')).toBe('HeyPointer assistant');
    await gf.ask('invite');
    expect(text('.hp-progress')).toBe('Step 1 of 2');
    expect(text('.hp-tour-count')).toBe('1 / 2');
  });

  it('applies overrides everywhere a label is shown', async () => {
    make(two(), {
      labels: {
        launcher: 'Ayuda', dialogName: 'Asistente', closeLabel: 'Cerrar guia', goalAria: 'Tu objetivo', goalPlaceholder: 'p. ej. invitar',
        submit: 'Mostrar', next: 'Siguiente', finish: 'Terminar', back: 'Atras', skip: 'Omitir', stepProgress: 'Paso {current} de {total}',
        tourCount: '{current} de {total}', evidenceSummary: 'Fuente ({count})', changeGoal: 'Cambiar objetivo', assistToggle: 'Asistir',
      },
    });
    expect(text('.hp-launcher')).toBe('Ayuda');
    expect(q('.hp-panel').getAttribute('aria-label')).toBe('Asistente');
    expect(q('.hp-close').getAttribute('aria-label')).toBe('Cerrar guia');
    expect(q('input[name=goal]').getAttribute('aria-label')).toBe('Tu objetivo');
    expect(q<HTMLInputElement>('input[name=goal]').placeholder).toBe('p. ej. invitar');
    expect(q('button[type=submit]').textContent).toBe('Mostrar');
    await gf.ask('invite');
    expect(text('.hp-progress')).toBe('Paso 1 de 2');
    expect(text('.hp-tour-count')).toBe('1 de 2');
    expect(q('[data-key=next]').textContent).toBe('Siguiente');
    expect(q('.hp-back').textContent).toBe('Atras');
    expect(q('.hp-skip').textContent).toBe('Omitir');
    expect(text('.hp-evidence summary')).toBe('Fuente (1)');
    expect(text('.hp-tour-tools summary')).toBe('Cambiar objetivo');
    expect(text('.hp-assist span')).toBe('Asistir');
    await gf.next();
    expect(q('[data-key=next]').textContent).toBe('Terminar');
  });

  it('translates the done message, the gate and the missing-target alert', async () => {
    make(walkthrough([step({ requiresConfirmation: true }), step({ id: 's2', target: { selectors: [], text: 'Nowhere' } })]), {
      labels: { gateWarning: 'Cambia datos.', gateCheckbox: 'Entiendo.', done: 'Listo: {goal}', notFound: 'No encuentro "{label}".', startAnother: 'Otra' },
    });
    await gf.ask('invite');
    expect(q('.hp-warn strong').textContent).toBe('Cambia datos.');
    expect(q('.hp-warn label').textContent).toContain('Entiendo.');
    q<HTMLInputElement>('[data-key=confirm]').click();
    await new Promise((r) => setTimeout(r, 0));
    await gf.next();
    expect(q('.hp-alert').textContent).toContain('No encuentro "Nowhere".');
    await gf.skip();
    expect(q('p').textContent).toBe('Listo: invite a teammate');
    expect(gf.root.querySelector('button.hp-skip')).toBeNull();
    expect(Array.from(gf.root.querySelectorAll('button')).some((b) => b.textContent === 'Otra')).toBe(true);
  });

  it('translates client error messages', async () => {
    make({ error: 'rate' }, { labels: { rateLimited: 'Demasiadas solicitudes.' }, fetch: (async () => new Response('{}', { status: 429 })) as typeof fetch });
    await gf.ask('invite');
    expect(q('.hp-alert').textContent).toContain('Demasiadas solicitudes.');
    gf.destroy();
    make({}, { labels: { serverUnreachable: 'Sin conexion con {host}.' }, fetch: (async () => { throw new TypeError('x'); }) as typeof fetch });
    await gf.ask('invite');
    expect(q('.hp-alert').textContent).toContain('Sin conexion con x.');
  });

  it('changes at runtime with setLabels and resets to the defaults', async () => {
    make(two());
    await gf.ask('invite');
    gf.setLabels({ next: 'Continue', launcher: 'Help' });
    await new Promise((r) => setTimeout(r, 0));
    expect(q('[data-key=next]').textContent).toBe('Continue');
    expect(text('.hp-launcher')).toBe('Help');
    expect(gf.state().view).toBe('step');
    gf.setLabels(undefined);
    await new Promise((r) => setTimeout(r, 0));
    expect(q('[data-key=next]').textContent).toBe('Next');
    expect(text('.hp-launcher')).toBe('Guide me');
  });

  it('only ever sets text: HTML in a label creates no elements', async () => {
    make(two(), { labels: { launcher: '<img src=x onerror=alert(1)>', next: '<b>Go</b>', goalPlaceholder: '"><script>x</script>' } });
    await gf.ask('invite');
    expect(gf.root.querySelector('img, b, script')).toBeNull();
    expect(text('.hp-launcher')).toBe('<img src=x onerror=alert(1)>');
    expect(q('[data-key=next]').textContent).toBe('<b>Go</b>');
  });

  it('never re-expands a placeholder that arrives inside a value (server titles, labels)', async () => {
    make(walkthrough([step({ title: 'Open {total}', instruction: 'Do {current}.' })]), { labels: { stepAnnounce: '{current} of {total}: {title} / {instruction}' } });
    await gf.ask('invite');
    await new Promise((r) => setTimeout(r, 5));
    expect(gf.root.querySelector('[role=status]')!.textContent).toBe('1 of 1: Open {total} / Do {current}.');
  });
});

describe('theme and layout', () => {
  it('sets only validated values as --hp-* on the host and clears them on change', () => {
    make(two(), { theme: { accent: '#7c3aed', radius: '4px', fg: 'red; background:url(//e)', dark: { bg: '#101010' } } });
    expect(gf.host.style.getPropertyValue('--hp-accent')).toBe('#7c3aed');
    expect(gf.host.style.getPropertyValue('--hp-radius')).toBe('4px');
    expect(gf.host.style.getPropertyValue('--hp-dark-bg')).toBe('#101010');
    expect(gf.host.style.getPropertyValue('--hp-fg')).toBe('');
    expect(gf.host.getAttribute('style')).not.toMatch(/url|background/);
    gf.setTheme({ ring: '#ff0000' });
    expect(gf.host.style.getPropertyValue('--hp-accent')).toBe('');
    expect(gf.host.style.getPropertyValue('--hp-ring')).toBe('#ff0000');
    expect(gf.host.style.pointerEvents).toBe('none');
    gf.setTheme(undefined);
    expect(gf.host.style.getPropertyValue('--hp-ring')).toBe('');
  });

  it('warns once about a low-contrast pair and still applies it', () => {
    make(two(), { theme: { accent: '#ffff00' } });
    expect(gf.host.style.getPropertyValue('--hp-accent')).toBe('#ffff00');
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(String((console.warn as ReturnType<typeof vi.fn>).mock.calls[0]![0])).toMatch(/contrast/);
  });

  it('forces a color scheme, falls back to auto for nonsense, and can change', () => {
    make(two(), { colorScheme: 'dark' });
    expect(gf.host.getAttribute('data-scheme')).toBe('dark');
    gf.setColorScheme('light');
    expect(gf.host.getAttribute('data-scheme')).toBe('light');
    gf.setColorScheme('auto');
    expect(gf.host.hasAttribute('data-scheme')).toBe(false);
    gf.setColorScheme('neon' as never);
    expect(gf.host.hasAttribute('data-scheme')).toBe(false);
  });

  it('sets dir, lang and launcher side on the guide only', () => {
    make(two(), { dir: 'rtl', lang: 'ar', launcherSide: 'start' });
    expect(gf.host.getAttribute('dir')).toBe('rtl');
    expect(gf.host.getAttribute('lang')).toBe('ar');
    expect(gf.host.getAttribute('data-launcher-side')).toBe('start');
    expect(document.documentElement.getAttribute('dir')).toBeNull();
    gf.setLayout({ dir: 'auto', lang: '', launcherSide: 'end' });
    expect(gf.host.hasAttribute('dir')).toBe(false);
    expect(gf.host.hasAttribute('lang')).toBe(false);
    expect(gf.host.hasAttribute('data-launcher-side')).toBe(false);
  });

  it('mirrors the side preference beside the target in a right-to-left page', () => {
    const viewport = { width: 1280, height: 300 };
    const target = { left: 500, top: 100, right: 700, bottom: 150 };
    const card = { width: 400, height: 200 };
    expect(coachmarkPosition(target, card, viewport, false, false).placement).toBe('right');
    expect(coachmarkPosition(target, card, viewport, false, true).placement).toBe('left');
  });
});

describe('launcher, open and close', () => {
  it('hides the built-in button with launcher: none and is still driven by open() and close()', () => {
    make(two(), { launcher: 'none' });
    expect(q<HTMLButtonElement>('.hp-launcher').hidden).toBe(true);
    expect(gf.host.getAttribute('data-launcher')).toBe('none');
    gf.open();
    expect(q('.hp-panel').hidden).toBe(false);
    gf.close();
    expect(q('.hp-panel').hidden).toBe(true);
    gf.setLayout({ launcher: 'default' });
    expect(q<HTMLButtonElement>('.hp-launcher').hidden).toBe(false);
  });

  it('gives focus back to the host button that opened it', () => {
    make(two(), { launcher: 'none' });
    const mine = document.getElementById('mine')!;
    mine.focus();
    gf.open();
    expect(document.activeElement).not.toBe(mine);
    gf.close();
    expect(document.activeElement).toBe(mine);
  });

  it('falls back to the built-in launcher, and to nothing when it is hidden and nothing opened it', () => {
    make(two());
    q('.hp-launcher').click();
    gf.close();
    expect(gf.root.activeElement).toBe(q('.hp-launcher'));
    gf.destroy();
    make(two(), { launcher: 'none' });
    gf.open();
    expect(() => gf.close()).not.toThrow();
  });

  it('does not steal focus to a host button that has since been removed', () => {
    make(two(), { launcher: 'none' });
    const tmp = document.createElement('button');
    document.body.append(tmp);
    tmp.focus();
    gf.open();
    tmp.remove();
    expect(() => gf.close()).not.toThrow();
  });

  it('fires heypointer:open and heypointer:close once per real change, composed and bubbling', () => {
    make(two());
    const seen: string[] = [];
    document.addEventListener(OPEN_EVENT, () => seen.push('open'));
    document.addEventListener(CLOSE_EVENT, () => seen.push('close'));
    gf.close();
    gf.open();
    gf.open();
    gf.close();
    gf.close();
    expect(seen).toEqual(['open', 'close']);
  });

  it('exposes ask() so a host button can start a guide without the panel', async () => {
    make(two());
    await gf.ask('invite');
    expect(gf.state().view).toBe('step');
  });
});

describe('<heypointer-assistant> customization', () => {
  defineHeyPointerElement();
  const el = (attrs: Record<string, string> = {}) => {
    const e = document.createElement(HEYPOINTER_TAG) as HeyPointerElement;
    e.setAttribute('base-url', 'http://localhost:1');
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    document.body.appendChild(e);
    return e;
  };
  const launcher = (e: HeyPointerElement) => e.player!.root.querySelector('.hp-launcher') as HTMLButtonElement;

  it('reads labels, theme, color-scheme, dir, lang, launcher and launcher-side from attributes', () => {
    const e = el({
      labels: '{"launcher":"Ayuda"}', theme: '{"accent":"#7c3aed","accentFg":"#ffffff"}', 'color-scheme': 'dark', dir: 'rtl', lang: 'es', launcher: 'none', 'launcher-side': 'start',
    });
    const host = e.player!.host;
    expect(launcher(e).textContent).toBe('Ayuda');
    expect(launcher(e).hidden).toBe(true);
    expect(host.style.getPropertyValue('--hp-accent')).toBe('#7c3aed');
    expect(host.getAttribute('data-scheme')).toBe('dark');
    expect(host.getAttribute('dir')).toBe('rtl');
    expect(host.getAttribute('lang')).toBe('es');
    expect(host.getAttribute('data-launcher-side')).toBe('start');
  });

  it('updates labels, theme and layout in place without remounting', () => {
    const e = el({ labels: '{"launcher":"One"}' });
    const first = e.player;
    e.setAttribute('labels', '{"launcher":"Two"}');
    e.setAttribute('theme', '{"ring":"#00ff00"}');
    e.setAttribute('dir', 'rtl');
    e.setAttribute('launcher', 'none');
    expect(e.player).toBe(first);
    expect(launcher(e).textContent).toBe('Two');
    expect(e.player!.host.style.getPropertyValue('--hp-ring')).toBe('#00ff00');
    expect(e.player!.host.getAttribute('dir')).toBe('rtl');
    expect(launcher(e).hidden).toBe(true);
    e.removeAttribute('labels');
    expect(launcher(e).textContent).toBe('Guide me');
  });

  it('ignores bad JSON and never lets a theme attribute inject CSS', () => {
    const e = el({ labels: '{nope', theme: '{"accent":"red;position:fixed;inset:0","bg":"url(//x)"}' });
    expect(launcher(e).textContent).toBe('Guide me');
    expect(e.player!.host.getAttribute('style')).not.toMatch(/position|inset|url/);
  });

  it('accepts labels and theme as properties, and keeps them across a remount', () => {
    const e = el();
    e.labels = { launcher: 'Prop' };
    e.theme = { ring: '#123456' };
    expect(launcher(e).textContent).toBe('Prop');
    e.setAttribute('base-url', 'http://localhost:2');
    expect(launcher(e).textContent).toBe('Prop');
    expect(e.player!.host.style.getPropertyValue('--hp-ring')).toBe('#123456');
    e.setLabels({ launcher: 'Via method' });
    expect(launcher(e).textContent).toBe('Via method');
  });

  it('drives the guide from the host: open(), close() and the events', () => {
    const e = el({ launcher: 'none' });
    const seen: string[] = [];
    e.addEventListener(OPEN_EVENT, () => seen.push('open'));
    e.addEventListener(CLOSE_EVENT, () => seen.push('close'));
    e.open();
    expect((e.player!.root.querySelector('.hp-panel') as HTMLElement).hidden).toBe(false);
    e.close();
    expect(seen).toEqual(['open', 'close']);
    expect(el({}).ask('x')).toBeInstanceOf(Promise);
    document.createElement(HEYPOINTER_TAG as string);
    expect(() => (document.createElement(HEYPOINTER_TAG) as HeyPointerElement).open()).not.toThrow();
  });
});
