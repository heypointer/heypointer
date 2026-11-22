// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 HeyPointer
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HEYPOINTER_TAG, defineHeyPointerElement, type HeyPointerElement } from '../src/index';

defineHeyPointerElement();
const make = (attrs: Record<string, string> = { 'base-url': 'http://localhost:1' }) => {
  const el = document.createElement(HEYPOINTER_TAG) as HeyPointerElement;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  document.body.appendChild(el);
  return el;
};
afterEach(() => { document.body.innerHTML = ''; vi.unstubAllGlobals(); });

describe('<heypointer-assistant>', () => {
  it('mounts one player inside itself when connected', () => {
    const el = make();
    expect(el.player).not.toBeNull();
    expect(el.querySelectorAll('[data-heypointer-root]')).toHaveLength(1);
    expect(el.style.display).toBe('contents');
  });
  it('does nothing without base-url', () => {
    const el = make({});
    expect(el.player).toBeNull();
    expect(el.querySelector('[data-heypointer-root]')).toBeNull();
  });
  it('remounts when base-url changes, never leaving a duplicate', () => {
    const el = make();
    const first = el.player;
    el.setAttribute('base-url', 'http://localhost:2');
    expect(el.player).not.toBe(first);
    expect(el.querySelectorAll('[data-heypointer-root]')).toHaveLength(1);
  });
  it('forwards client-id to the walkthrough request and remounts when it changes', async () => {
    const seen: string[] = [];
    vi.stubGlobal('fetch', async (_u: string, init: RequestInit) => {
      seen.push((init.headers as Record<string, string>)['X-HeyPointer-Client'] ?? '');
      return new Response('{}', { status: 500 });
    });
    const el = make({ 'base-url': 'http://localhost:1', 'client-id': 'gfc_0123456789abcdef01234567' });
    await el.player!.ask('g');
    const first = el.player;
    el.setAttribute('client-id', 'gfc_aaaaaaaaaaaaaaaaaaaaaaaa');
    expect(el.player).not.toBe(first);
    await el.player!.ask('g');
    expect(seen).toEqual(['gfc_0123456789abcdef01234567', 'gfc_aaaaaaaaaaaaaaaaaaaaaaaa']);
  });
  it('destroys the player on removal', () => {
    const el = make();
    el.remove();
    expect(el.player).toBeNull();
    expect(document.querySelector('[data-heypointer-root]')).toBeNull();
  });
  it('defining twice is harmless', () => {
    expect(() => defineHeyPointerElement()).not.toThrow();
  });
});
