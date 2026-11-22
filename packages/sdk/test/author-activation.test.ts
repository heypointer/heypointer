// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 HeyPointer
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HeyPointer } from '../src/player';
import { defineHeyPointerElement, HEYPOINTER_TAG } from '../src/element';
import { authorRequested } from '../src/author-loader';
import { startAuthoring } from '../src/author/index';

const settle = () => new Promise((r) => setTimeout(r, 30));
const panels = () => document.querySelectorAll('[data-heypointer-author]').length;
const guides: HeyPointer[] = [];
const make = (o: Partial<ConstructorParameters<typeof HeyPointer>[0]> = {}) => { const g = new HeyPointer({ baseUrl: 'http://127.0.0.1:1', ...o }); guides.push(g); return g; };

beforeEach(() => {
  document.body.innerHTML = '';
  history.replaceState({}, '', '/');
  sessionStorage.clear();
});
afterEach(() => {
  for (const g of guides.splice(0)) g.destroy();
  startAuthoring({ persist: false }).stop(); // whatever is running, end it
  history.replaceState({}, '', '/');
  sessionStorage.clear();
});

describe('author mode only starts when asked', () => {
  it('not by default', async () => {
    make();
    await settle();
    expect(panels()).toBe(0);
  });

  it('author: true starts it, once, from its own lazy chunk', async () => {
    make({ author: true });
    make({ author: true });
    await settle();
    expect(panels()).toBe(1);
  });

  it('the URL parameter does nothing unless the host allowed it', async () => {
    history.replaceState({}, '', '/?heypointer-author=1');
    make();
    make({ allowAuthorParam: false });
    await settle();
    expect(panels()).toBe(0);
  });

  it('allowAuthorParam without the parameter does nothing', async () => {
    make({ allowAuthorParam: true });
    await settle();
    expect(panels()).toBe(0);
  });

  it('allowAuthorParam with the parameter starts it', async () => {
    history.replaceState({}, '', '/page?heypointer-author=1');
    make({ allowAuthorParam: true });
    await settle();
    expect(panels()).toBe(1);
  });

  it('a draft left by an earlier page resumes it on a page without the parameter, only when the host allows the parameter', async () => {
    sessionStorage.setItem('heypointer:author:active:v1', '1');
    make();
    await settle();
    expect(panels()).toBe(0);
    make({ allowAuthorParam: true });
    await settle();
    expect(panels()).toBe(1);
  });

  it('authorRequested reads only the documented switches', () => {
    expect(authorRequested({})).toBe(false);
    expect(authorRequested({ author: true })).toBe(true);
    history.replaceState({}, '', '/?heypointer-author');
    expect(authorRequested({ allowAuthorParam: true })).toBe(true);
    expect(authorRequested({})).toBe(false);
  });
});

describe('the element and its attributes', () => {
  it('<heypointer-assistant author> and allow-author-param', async () => {
    defineHeyPointerElement();
    const el = document.createElement(HEYPOINTER_TAG);
    el.setAttribute('base-url', 'http://127.0.0.1:1');
    document.body.append(el);
    await settle();
    expect(panels()).toBe(0);
    el.setAttribute('author', '');
    await settle();
    expect(panels()).toBe(1);
  });

  it('author="false" is off, and allow-author-param needs the parameter', async () => {
    defineHeyPointerElement();
    const el = document.createElement(HEYPOINTER_TAG);
    el.setAttribute('base-url', 'http://127.0.0.1:1');
    el.setAttribute('author', 'false');
    el.setAttribute('allow-author-param', '');
    document.body.append(el);
    await settle();
    expect(panels()).toBe(0);
    history.replaceState({}, '', '/?heypointer-author=1');
    el.setAttribute('allow-author-param', 'true'); // an attribute change remounts the guide
    await settle();
    expect(panels()).toBe(1);
  });
});

describe('the guide and the author panel stay out of each other\'s way', () => {
  it('the guide\'s resolver and the guide\'s panel never see the author panel as a target', async () => {
    document.body.innerHTML = '<button>Stop and review</button>';
    make({ author: true });
    await settle();
    const { resolveDetailed } = await import('../src/targeting/index');
    // The page's own button is the only match: the author panel's button of the same name is not searched.
    expect(resolveDetailed({ selectors: [], text: 'Stop and review' }).status).toBe('found');
  });
});
