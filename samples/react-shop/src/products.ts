export interface Product {
  id: string;
  name: string;
  price: number;
  category: 'audio' | 'accessories';
  description: string;
  art: 'headphones' | 'speaker';
}

export interface CartLine { product: Product; quantity: number }

export const products: Product[] = [
  { id: 'aurora-headphones', name: 'Aurora Wireless Headphones', price: 79.99, category: 'audio', art: 'headphones', description: 'Comfortable over-ear headphones with Bluetooth, 30-hour battery and a built-in microphone.' },
  { id: 'studio-headphones', name: 'Studio Pro Wireless Headphones', price: 129.99, category: 'audio', art: 'headphones', description: 'Noise-reducing over-ear headphones with a travel case and USB-C charging.' },
  { id: 'pocket-speaker', name: 'Pocket Bluetooth Speaker', price: 34.99, category: 'audio', art: 'speaker', description: 'Compact water-resistant speaker for a desk, kitchen or weekend trip.' },
  { id: 'desk-speaker', name: 'Desk Mini Speaker', price: 49.99, category: 'accessories', art: 'speaker', description: 'Small USB-C speaker with clear calls and simple volume controls.' },
];

/** The stylesheet names these `headphone-art` and `speaker-art`. */
export const artClass = (art: Product['art']): string => (art === 'headphones' ? 'headphone-art' : 'speaker-art');

export const total = (lines: CartLine[]): number => lines.reduce((sum, l) => sum + l.product.price * l.quantity, 0);
export const count = (lines: CartLine[]): number => lines.reduce((n, l) => n + l.quantity, 0);
export const search = (query: string): Product[] => {
  const q = query.toLowerCase();
  return products.filter((p) => `${p.name} ${p.description}`.toLowerCase().includes(q));
};
