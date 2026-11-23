// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 HeyPointer
import { createApp, h, nextTick, ref } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { createSSRApp } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';
import { HeyPointerAssistant } from '../src/index';

let app: ReturnType<typeof createApp> | null = null;
let box: HTMLElement | null = null;
const mount = (baseUrl: { value: string }) => {
  box = document.createElement('div');
  document.body.appendChild(box);
  const comp = ref<InstanceType<typeof HeyPointerAssistant> | null>(null);
  app = createApp({ render: () => h(HeyPointerAssistant, { ref: comp, baseUrl: baseUrl.value }) });
  app.mount(box);
  return comp;
};
afterEach(() => {
  app?.unmount();
  box?.remove();
  app = null;
});

describe('<HeyPointerAssistant />', () => {
  it('mounts exactly one real player with the given base URL', async () => {
    mount(ref('http://localhost:1'));
    await nextTick();
    expect(document.querySelectorAll('heypointer-assistant')).toHaveLength(1);
    expect(document.querySelectorAll('[data-heypointer-root]')).toHaveLength(1);
    expect(document.querySelector('[data-heypointer-root]')!.shadowRoot!.querySelector('.hp-launcher')).not.toBeNull();
  });

  it('exposes the live player and follows baseUrl changes without duplicating', async () => {
    const url = ref('http://localhost:1');
    const comp = mount(url);
    await nextTick();
    expect((comp.value as unknown as { player(): unknown }).player()).not.toBeNull();
    url.value = 'http://localhost:2';
    await nextTick();
    expect(document.querySelectorAll('[data-heypointer-root]')).toHaveLength(1);
    expect(document.querySelector('heypointer-assistant')!.getAttribute('base-url')).toBe('http://localhost:2');
  });

  it('passes clientId through as client-id and omits it when absent', async () => {
    const html = await renderToString(createSSRApp({ render: () => h(HeyPointerAssistant, { baseUrl: 'http://localhost:1', clientId: 'hpc_0123456789abcdef01234567' }) }));
    expect(html).toContain('client-id="hpc_0123456789abcdef01234567"');
    const bare = await renderToString(createSSRApp({ render: () => h(HeyPointerAssistant, { baseUrl: 'http://localhost:1' }) }));
    expect(bare).not.toContain('client-id');
  });

  it('removes the player on unmount', async () => {
    mount(ref('http://localhost:1'));
    await nextTick();
    app!.unmount();
    app = null;
    expect(document.querySelector('[data-heypointer-root]')).toBeNull();
  });

  it('server-renders an inert tag', async () => {
    const html = await renderToString(createSSRApp({ render: () => h(HeyPointerAssistant, { baseUrl: 'http://localhost:1' }) }));
    expect(html).toContain('<heypointer-assistant base-url="http://localhost:1"');
  });
});

describe('<HeyPointerAssistant assist />', () => {
  it('sets the initial assist default and omits the attribute when absent', async () => {
    const on = await renderToString(createSSRApp({ render: () => h(HeyPointerAssistant, { baseUrl: 'http://localhost:1', assist: true }) }));
    expect(on).toMatch(/<heypointer-assistant[^>]*\bassist\b/);
    const off = await renderToString(createSSRApp({ render: () => h(HeyPointerAssistant, { baseUrl: 'http://localhost:1' }) }));
    expect(off).not.toMatch(/\bassist\b/);
    box = document.createElement('div');
    document.body.appendChild(box);
    app = createApp({ render: () => h(HeyPointerAssistant, { baseUrl: 'http://localhost:1', assist: true }) });
    app.mount(box);
    await nextTick();
    expect(document.querySelector('[data-heypointer-root]')!.shadowRoot!.querySelector<HTMLInputElement>('[data-key=assist]')!.checked).toBe(true);
  });
});

describe('<HeyPointerAssistant /> customization', () => {
  const shadow = () => document.querySelector('[data-heypointer-root]')!.shadowRoot!;
  it('passes labels, theme, colorScheme, dir, lang, launcher and launcherSide through', async () => {
    box = document.createElement('div');
    document.body.appendChild(box);
    app = createApp({
      render: () => h(HeyPointerAssistant, {
        baseUrl: 'http://localhost:1', labels: { launcher: 'Ayuda' }, theme: { accent: '#7c3aed', accentFg: '#ffffff' },
        colorScheme: 'dark', dir: 'rtl', lang: 'es', launcher: 'none', launcherSide: 'start',
      }),
    });
    app.mount(box);
    await nextTick();
    const tag = document.querySelector('heypointer-assistant')!;
    expect(tag.getAttribute('color-scheme')).toBe('dark');
    expect(tag.getAttribute('launcher-side')).toBe('start');
    const host = document.querySelector<HTMLElement>('[data-heypointer-root]')!;
    expect(shadow().querySelector('.hp-launcher')!.textContent).toBe('Ayuda');
    expect((shadow().querySelector('.hp-launcher') as HTMLElement).hidden).toBe(true);
    expect(host.style.getPropertyValue('--hp-accent')).toBe('#7c3aed');
    expect(host.getAttribute('dir')).toBe('rtl');
  });

  it('updates labels in place, and omits unset props', async () => {
    const text = ref('One');
    box = document.createElement('div');
    document.body.appendChild(box);
    app = createApp({ render: () => h(HeyPointerAssistant, { baseUrl: 'http://localhost:1', labels: { launcher: text.value } }) });
    app.mount(box);
    await nextTick();
    expect(shadow().querySelector('.hp-launcher')!.textContent).toBe('One');
    text.value = 'Two';
    await nextTick();
    expect(document.querySelectorAll('[data-heypointer-root]')).toHaveLength(1);
    expect(shadow().querySelector('.hp-launcher')!.textContent).toBe('Two');
    const bare = await renderToString(createSSRApp({ render: () => h(HeyPointerAssistant, { baseUrl: 'http://localhost:1' }) }));
    for (const a of ['labels=', 'theme=', 'color-scheme', 'launcher', 'dir=', 'lang=']) expect(bare).not.toContain(a);
  });

  it('exposes open() and close() for the host', async () => {
    box = document.createElement('div');
    document.body.appendChild(box);
    const comp = ref<InstanceType<typeof HeyPointerAssistant> | null>(null);
    app = createApp({ render: () => h(HeyPointerAssistant, { ref: comp, baseUrl: 'http://localhost:1', launcher: 'none' }) });
    app.mount(box);
    await nextTick();
    const api = comp.value as unknown as { open(): void; close(): void };
    api.open();
    expect((shadow().querySelector('.hp-panel') as HTMLElement).hidden).toBe(false);
    api.close();
    expect((shadow().querySelector('.hp-panel') as HTMLElement).hidden).toBe(true);
  });
});
