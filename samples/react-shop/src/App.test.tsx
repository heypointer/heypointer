import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { App } from './App';
import { artClass, search, total } from './products';

beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });

let box: HTMLElement;
let root: Root;
beforeEach(async () => {
  box = document.createElement('div');
  document.body.appendChild(box);
  root = createRoot(box);
  await act(async () => root.render(<App />));
});
afterEach(async () => { await act(async () => root.unmount()); box.remove(); });

const click = (el: Element | null) => act(async () => { (el as HTMLElement).click(); });
const submit = (el: Element | null) => act(async () => { el!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
const searchFor = async (value: string) => {
  (document.getElementById('product-search') as HTMLInputElement).value = value;
  await submit(document.getElementById('search-form'));
};

it('shows four mock products, an empty cart and one real guide', () => {
  expect(document.querySelectorAll('[data-product]')).toHaveLength(4);
  expect(document.getElementById('cart-count')!.textContent).toBe('0');
  expect(document.querySelectorAll('[data-heypointer-root]')).toHaveLength(1);
});

it('searches the catalog and handles no matches', async () => {
  await searchFor('wireless headphones');
  expect(document.querySelectorAll('[data-product]')).toHaveLength(2);
  await searchFor('does-not-exist');
  expect(document.querySelector('[data-product]')).toBeNull();
  expect(document.getElementById('app')!.textContent).toContain('No matching products');
});

it('renders search text as text, never markup', async () => {
  await searchFor('<img src=x onerror=alert(1)>');
  expect(document.querySelector('#app img')).toBeNull();
  expect(document.querySelector('h1')!.textContent).toContain('<img');
});

it('adds a selected product to the cart and totals it', async () => {
  await click(document.querySelector('[data-product=aurora-headphones]'));
  expect(document.querySelector('h1')!.textContent).toBe('Aurora Wireless Headphones');
  await act(async () => {
    const q = document.getElementById('quantity') as HTMLSelectElement;
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(q, '2');
    q.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await click(document.getElementById('detail-add'));
  expect(document.getElementById('cart-count')!.textContent).toBe('2');
  await click(document.getElementById('cart-button'));
  expect(document.querySelector('.cart-total')!.textContent).toContain('$159.98');
});

it('does not place an order before the checkout form is submitted', async () => {
  await click(document.querySelector('[data-add=aurora-headphones]'));
  await click(document.getElementById('cart-button'));
  await click(document.getElementById('checkout'));
  expect(document.getElementById('app')!.textContent).not.toContain('Mock order placed');
  await submit(document.getElementById('checkout-form'));
  expect(document.querySelector('[role=status]')!.textContent).toContain('Order NS-1001');
  expect(document.getElementById('cart-count')!.textContent).toBe('0');
});

it('gives the headphone and speaker art the classes the stylesheet defines', () => {
  expect(artClass('headphones')).toBe('headphone-art');
  expect(artClass('speaker')).toBe('speaker-art');
  expect(document.querySelectorAll('.headphone-art')).toHaveLength(2);
  expect(total([])).toBe(0);
  expect(search('speaker')).toHaveLength(2);
});
