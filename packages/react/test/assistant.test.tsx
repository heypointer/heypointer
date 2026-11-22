// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 HeyPointer
import { createRef } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { HeyPointerAssistant, type HeyPointerHandle } from '../src/index';

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

let root: Root | null = null;
let box: HTMLElement | null = null;
const mount = async (node: React.ReactNode) => {
  box = document.createElement('div');
  document.body.appendChild(box);
  root = createRoot(box);
  await act(async () => root!.render(node));
  return box;
};
afterEach(async () => {
  await act(async () => root?.unmount());
  box?.remove();
  root = null;
});

describe('<HeyPointerAssistant />', () => {
  it('mounts exactly one real player with the given base URL', async () => {
    const el = await mount(<HeyPointerAssistant baseUrl="http://localhost:1" />);
    expect(el.querySelectorAll('heypointer-assistant')).toHaveLength(1);
    expect(el.querySelector('heypointer-assistant')!.getAttribute('base-url')).toBe('http://localhost:1');
    expect(document.querySelectorAll('[data-heypointer-root]')).toHaveLength(1);
    expect(document.querySelector('[data-heypointer-root]')!.shadowRoot!.querySelector('.hp-launcher')).not.toBeNull();
  });

  it('exposes the live player through a ref', async () => {
    const ref = createRef<HeyPointerHandle>();
    await mount(<HeyPointerAssistant ref={ref} baseUrl="http://localhost:1" />);
    const player = ref.current!.player();
    expect(player).not.toBeNull();
    player!.open();
    const panel = document.querySelector('[data-heypointer-root]')!.shadowRoot!.querySelector('.hp-panel') as HTMLElement;
    expect(panel.hidden).toBe(false);
  });

  it('follows baseUrl changes without duplicating the player', async () => {
    await mount(<HeyPointerAssistant baseUrl="http://localhost:1" />);
    await act(async () => root!.render(<HeyPointerAssistant baseUrl="http://localhost:2" />));
    expect(document.querySelectorAll('[data-heypointer-root]')).toHaveLength(1);
    expect(document.querySelector('heypointer-assistant')!.getAttribute('base-url')).toBe('http://localhost:2');
  });

  it('passes clientId through as client-id and omits it when absent', async () => {
    const el = await mount(<HeyPointerAssistant baseUrl="http://localhost:1" clientId="gfc_0123456789abcdef01234567" />);
    expect(el.querySelector('heypointer-assistant')!.getAttribute('client-id')).toBe('gfc_0123456789abcdef01234567');
    await act(async () => root!.render(<HeyPointerAssistant baseUrl="http://localhost:1" />));
    expect(document.querySelector('heypointer-assistant')!.hasAttribute('client-id')).toBe(false);
    expect(renderToString(<HeyPointerAssistant baseUrl="http://localhost:1" clientId="gfc_0123456789abcdef01234567" />)).toContain('client-id="gfc_0123456789abcdef01234567"');
  });

  it('removes the player on unmount', async () => {
    await mount(<HeyPointerAssistant baseUrl="http://localhost:1" />);
    await act(async () => root!.unmount());
    root = null;
    expect(document.querySelector('[data-heypointer-root]')).toBeNull();
  });

  it('server-renders an inert tag', () => {
    expect(renderToString(<HeyPointerAssistant baseUrl="http://localhost:1" />)).toContain('<heypointer-assistant base-url="http://localhost:1"');
  });
});

describe('<HeyPointerAssistant assist />', () => {
  it('sets the initial assist default and omits the attribute when absent', async () => {
    const el = await mount(<HeyPointerAssistant baseUrl="http://localhost:1" assist />);
    expect(el.querySelector('heypointer-assistant')!.hasAttribute('assist')).toBe(true);
    const toggle = document.querySelector('[data-heypointer-root]')!.shadowRoot!.querySelector<HTMLInputElement>('[data-key=assist]')!;
    expect(toggle.checked).toBe(true);
    await act(async () => root!.unmount());
    root = null;
    const bare = await mount(<HeyPointerAssistant baseUrl="http://localhost:1" />);
    expect(bare.querySelector('heypointer-assistant')!.hasAttribute('assist')).toBe(false);
    expect(document.querySelector('[data-heypointer-root]')!.shadowRoot!.querySelector<HTMLInputElement>('[data-key=assist]')!.checked).toBe(false);
  });
});

describe('<HeyPointerAssistant /> customization', () => {
  const shadow = () => document.querySelector('[data-heypointer-root]')!.shadowRoot!;
  it('passes labels, theme, colorScheme, dir, lang, launcher and launcherSide through', async () => {
    const el = await mount(
      <HeyPointerAssistant baseUrl="http://localhost:1" labels={{ launcher: 'Ayuda' }} theme={{ accent: '#7c3aed', accentFg: '#ffffff' }} colorScheme="dark" dir="rtl" lang="es" launcher="none" launcherSide="start" />,
    );
    const tag = el.querySelector('heypointer-assistant')!;
    expect(tag.getAttribute('color-scheme')).toBe('dark');
    expect(tag.getAttribute('launcher')).toBe('none');
    expect(tag.getAttribute('launcher-side')).toBe('start');
    const host = document.querySelector<HTMLElement>('[data-heypointer-root]')!;
    expect(shadow().querySelector('.hp-launcher')!.textContent).toBe('Ayuda');
    expect((shadow().querySelector('.hp-launcher') as HTMLElement).hidden).toBe(true);
    expect(host.style.getPropertyValue('--hp-accent')).toBe('#7c3aed');
    expect(host.getAttribute('data-scheme')).toBe('dark');
    expect(host.getAttribute('dir')).toBe('rtl');
    expect(host.getAttribute('lang')).toBe('es');
  });

  it('updates labels in place when the prop changes, and omits unset props', async () => {
    const el = await mount(<HeyPointerAssistant baseUrl="http://localhost:1" />);
    const tag = el.querySelector('heypointer-assistant')!;
    for (const a of ['labels', 'theme', 'color-scheme', 'dir', 'lang', 'launcher', 'launcher-side']) expect(tag.hasAttribute(a)).toBe(false);
    await act(async () => root!.render(<HeyPointerAssistant baseUrl="http://localhost:1" labels={{ launcher: 'One' }} />));
    expect(shadow().querySelector('.hp-launcher')!.textContent).toBe('One');
    await act(async () => root!.render(<HeyPointerAssistant baseUrl="http://localhost:1" labels={{ launcher: 'Two' }} />));
    expect(document.querySelectorAll('[data-heypointer-root]')).toHaveLength(1);
    expect(shadow().querySelector('.hp-launcher')!.textContent).toBe('Two');
  });

  it('lets host code open and close the guide through the ref', async () => {
    const ref = createRef<HeyPointerHandle>();
    await mount(<HeyPointerAssistant ref={ref} baseUrl="http://localhost:1" launcher="none" />);
    ref.current!.open();
    expect((shadow().querySelector('.hp-panel') as HTMLElement).hidden).toBe(false);
    ref.current!.close();
    expect((shadow().querySelector('.hp-panel') as HTMLElement).hidden).toBe(true);
  });

  it('server-renders the options as attributes', () => {
    const html = renderToString(<HeyPointerAssistant baseUrl="http://localhost:1" launcher="none" colorScheme="light" />);
    expect(html).toContain('launcher="none"');
    expect(html).toContain('color-scheme="light"');
  });
});
