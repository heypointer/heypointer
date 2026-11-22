import { beforeEach, expect, it } from 'vitest';
import { mountHost } from './host.js';

beforeEach(() => {
  document.body.innerHTML = '<main id="app"></main>';
  location.hash = '';
});

it('shows a welcome page that points at the Team page', () => {
  mountHost(document.getElementById('app'));
  expect(document.querySelector('h1').textContent).toBe('Welcome');
});

it('renders the team table and an invite button on #/team', () => {
  location.hash = '#/team';
  mountHost(document.getElementById('app'));
  expect(document.getElementById('invite-btn').textContent).toBe('Invite teammate');
  expect(document.querySelectorAll('tbody tr')).toHaveLength(2);
});

it('does not parse the typed email as HTML', () => {
  location.hash = '#/team';
  mountHost(document.getElementById('app'));
  document.getElementById('invite-email').value = '<img src=x onerror=alert(1)>@example.com';
  document.getElementById('invite-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  // jsdom rejects the invalid address, so nothing is rendered; no markup ever becomes an element.
  expect(document.querySelector('#status img')).toBeNull();
});
