// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 HeyPointer
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveDetailed, resolveTarget, isVisible } from '../../src/targeting/index';
import type { StepTarget } from '../../src/types';

describe('targeting: iframe and shadow-root resolution', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('resolves a button inside an open shadow root', () => {
    const host = document.createElement('div');
    container.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const btn = document.createElement('button');
    btn.textContent = 'Shadow Button';
    shadow.appendChild(btn);

    const target: StepTarget = { selectors: [], text: 'Shadow Button' };
    const result = resolveDetailed(target, container);
    expect(result.status).toBe('found');
    if (result.status === 'found') {
      expect(result.element).toBe(btn);
      expect(result.strategy).toBe('text');
    }
  });

  it('resolves a button inside a same-origin iframe', () => {
    const iframe = document.createElement('iframe');
    container.appendChild(iframe);
    const doc = iframe.contentDocument;
    expect(doc).toBeTruthy();
    if (!doc) return;
    const btn = doc.createElement('button');
    btn.textContent = 'Iframe Button';
    doc.body.appendChild(btn);

    const target: StepTarget = { selectors: [], text: 'Iframe Button' };
    const result = resolveDetailed(target, container);
    expect(result.status).toBe('found');
    if (result.status === 'found') {
      expect(result.element).toBe(btn);
      expect(result.strategy).toBe('text');
    }
  });

  it('returns missing for a closed shadow root', () => {
    const host = document.createElement('div');
    container.appendChild(host);
    host.attachShadow({ mode: 'closed' });

    const target: StepTarget = { selectors: [], text: 'Hidden Button' };
    const result = resolveDetailed(target, container);
    expect(result.status).toBe('missing');
  });

  it('returns missing for a cross-origin iframe', () => {
    const iframe = document.createElement('iframe');
    Object.defineProperty(iframe, 'contentDocument', {
      get() { throw new Error('cross-origin'); },
    });
    container.appendChild(iframe);

    const target: StepTarget = { selectors: [], text: 'External Button' };
    const result = resolveDetailed(target, container);
    expect(result.status).toBe('missing');
  });

  it('returns ambiguous when two same-origin iframes have matching buttons', () => {
    const iframe1 = document.createElement('iframe');
    const iframe2 = document.createElement('iframe');
    container.appendChild(iframe1);
    container.appendChild(iframe2);

    for (const iframe of [iframe1, iframe2]) {
      const doc = iframe.contentDocument;
      if (!doc) continue;
      const btn = doc.createElement('button');
      btn.textContent = 'Duplicate';
      doc.body.appendChild(btn);
    }

    const target: StepTarget = { selectors: [], text: 'Duplicate' };
    const result = resolveDetailed(target, container);
    expect(result.status).toBe('ambiguous');
    if (result.status === 'ambiguous') {
      expect(result.count).toBe(2);
    }
  });

  it('resolves by role and text in shadow root', () => {
    const host = document.createElement('div');
    container.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const btn = document.createElement('button');
    btn.textContent = 'Submit';
    shadow.appendChild(btn);

    const target: StepTarget = { selectors: [], role: 'button', text: 'Submit' };
    const result = resolveDetailed(target, container);
    expect(result.status).toBe('found');
    if (result.status === 'found') {
      expect(result.strategy).toBe('role-text');
    }
  });

  it('resolves by label in shadow root', () => {
    const host = document.createElement('div');
    container.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const input = document.createElement('input');
    input.setAttribute('aria-label', 'Email');
    shadow.appendChild(input);

    const target: StepTarget = { selectors: [], label: 'Email' };
    const result = resolveDetailed(target, container);
    expect(result.status).toBe('found');
    if (result.status === 'found') {
      expect(result.strategy).toBe('label');
    }
  });

  it('resolves by selector in shadow root', () => {
    const host = document.createElement('div');
    container.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const btn = document.createElement('button');
    btn.id = 'shadow-btn';
    shadow.appendChild(btn);

    const target: StepTarget = { selectors: ['#shadow-btn'] };
    const result = resolveDetailed(target, container);
    expect(result.status).toBe('found');
    if (result.status === 'found') {
      expect(result.strategy).toBe('selector');
    }
  });

  it('resolveTarget returns null for ambiguous', () => {
    const btn1 = document.createElement('button');
    const btn2 = document.createElement('button');
    btn1.textContent = 'Same';
    btn2.textContent = 'Same';
    container.appendChild(btn1);
    container.appendChild(btn2);

    const target: StepTarget = { selectors: [], text: 'Same' };
    const result = resolveTarget(target, container);
    expect(result).toBeNull();
  });

  it('isVisible returns false for hidden elements', () => {
    const btn = document.createElement('button');
    btn.hidden = true;
    container.appendChild(btn);
    expect(isVisible(btn)).toBe(false);
  });
});
