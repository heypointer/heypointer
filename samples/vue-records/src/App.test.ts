// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 HeyPointer
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createApp, nextTick } from 'vue';
import App from './App.vue';

let host: HTMLElement;
let app: ReturnType<typeof createApp>;

// jsdom does not implement <dialog>.show()/close(); real browsers do.
HTMLDialogElement.prototype.show ??= function () { this.setAttribute('open', ''); };
HTMLDialogElement.prototype.close ??= function () { this.removeAttribute('open'); };

beforeEach(async () => {
  location.hash = '#/records';
  host = document.createElement('div');
  document.body.appendChild(host);
  app = createApp(App);
  app.mount(host);
  await nextTick();
});
afterEach(() => { app.unmount(); host.remove(); });

it('lists the two seed records with repeated Edit and Archive buttons', () => {
  expect(host.querySelectorAll('tbody tr')).toHaveLength(2);
  expect(host.querySelectorAll('.row-actions button')).toHaveLength(4);
});

it('mounts exactly one real guide through @heypointerhq/vue', () => {
  expect(document.querySelectorAll('heypointer-assistant')).toHaveLength(1);
  expect(document.querySelectorAll('[data-heypointer-root]')).toHaveLength(1);
});

it('saves a record and shows it as text, never markup', async () => {
  const set = (id: string, value: string) => { const el = host.querySelector<HTMLInputElement>(id)!; el.value = value; el.dispatchEvent(new Event('input')); };
  set('#rec-title', '<img src=x onerror=alert(1)>');
  set('#rec-owner', 'Ada');
  host.querySelector<HTMLFormElement>('#record-form')!.dispatchEvent(new Event('submit', { cancelable: true }));
  await nextTick();
  expect(host.querySelector('img')).toBeNull();
  expect(host.querySelector('#notice')!.textContent).toContain('Record saved: <img');
  expect(host.querySelectorAll('tbody tr')).toHaveLength(3);
});

it('shows the archive page for #/archive', async () => {
  location.hash = '#/archive';
  dispatchEvent(new HashChangeEvent('hashchange'));
  await nextTick();
  expect(host.querySelector('h2')!.textContent).toBe('Archive');
});
