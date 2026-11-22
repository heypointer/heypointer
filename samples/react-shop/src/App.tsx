import { useRef, useState, type FormEvent } from 'react';
import { HeyPointerAssistant } from '@heypointerhq/react';
import { artClass, count, products, search, total, type CartLine, type Product } from './products';

// The guide's API address comes from ?api= (or VITE_HEYPOINTER_API), so any server can be tried.
const api = new URLSearchParams(location.search).get('api') ?? import.meta.env.VITE_HEYPOINTER_API ?? 'http://localhost:8791';
// The client id from `heypointer init` (publishable, not a secret): ?client= or VITE_HEYPOINTER_CLIENT_ID.
const clientId = new URLSearchParams(location.search).get('client') ?? import.meta.env.VITE_HEYPOINTER_CLIENT_ID ?? undefined;

type View = 'catalog' | 'product' | 'cart' | 'checkout' | 'order';

export function App() {
  const [view, setView] = useState<View>('catalog');
  const [query, setQuery] = useState('');
  const [productId, setProductId] = useState<string | undefined>();
  const [lines, setLines] = useState<CartLine[]>([]);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const input = useRef<HTMLInputElement>(null);

  const add = (product: Product, quantity: number) =>
    setLines((prev) => {
      const line = prev.find((l) => l.product.id === product.id);
      return line ? prev.map((l) => (l === line ? { ...l, quantity: l.quantity + quantity } : l)) : [...prev, { product, quantity }];
    });

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    setQuery(input.current!.value.trim());
    setProductId(undefined);
    setView('catalog');
  };
  const cartCount = count(lines);

  return (
    <>
      <a className="skip" href="#app">Skip to products</a>
      <header className="header">
        <a className="brand" href="#/" aria-label="Northstar home">northstar<span>mock shop</span></a>
        <form id="search-form" className="search" role="search" onSubmit={onSearch}>
          <label className="sr-only" htmlFor="product-search">Search products</label>
          <input id="product-search" name="query" type="search" placeholder="Search headphones, speakers and more" autoComplete="off" ref={input} />
          <button type="submit">Search</button>
        </form>
        <button id="cart-button" className="cart" type="button" onClick={() => { setView('cart'); setProductId(undefined); }}>
          Cart <span id="cart-count" aria-label={`${cartCount} items in cart`}>{cartCount}</span>
        </button>
      </header>
      <nav className="categories" aria-label="Product categories">
        <a href="#/">Today's deals</a><a href="#/">Electronics</a><a href="#/">Home office</a><a href="#/">Customer service</a>
      </nav>
      <main id="app">
        {view === 'catalog' && (
          <Catalog query={query} added={added}
            onOpen={(id) => { setProductId(id); setView('product'); }}
            onAdd={(p) => { add(p, 1); setAdded((s) => new Set(s).add(p.id)); }} />
        )}
        {view === 'product' && products.find((p) => p.id === productId) && (
          <Detail product={products.find((p) => p.id === productId)!}
            onAdd={(p, q) => add(p, q)}
            onBuyNow={(p, q) => { add(p, q); setView('cart'); }} />
        )}
        {view === 'cart' && <Cart lines={lines} onCheckout={() => setView('checkout')} />}
        {view === 'checkout' && <Checkout lines={lines} onPlace={() => { setLines([]); setView('order'); }} />}
        {view === 'order' && (
          <section className="notice" role="status"><h1>Mock order placed</h1><p>Order NS-1001 is confirmed. No payment or real delivery occurred.</p></section>
        )}
      </main>
      <footer>Northstar is fictional. No real orders, payments, or deliveries.</footer>
      <HeyPointerAssistant baseUrl={api} clientId={clientId} />
    </>
  );
}

function Art({ product }: { product: Product }) {
  return <div className="product-art" aria-hidden="true"><div className={artClass(product.art)} /></div>;
}

function Catalog({ query, added, onOpen, onAdd }: { query: string; added: Set<string>; onOpen: (id: string) => void; onAdd: (p: Product) => void }) {
  const matches = query ? search(query) : products;
  const grid = (
    <div className="products">
      {matches.map((p) => (
        <article className="product" key={p.id}>
          <Art product={p} />
          <h2><a href={`#/product/${p.id}`} data-product={p.id} onClick={(e) => { e.preventDefault(); onOpen(p.id); }}>{p.name}</a></h2>
          <div className="rating">★★★★☆ <span className="muted">328</span></div>
          <div className="price"><small>$</small>{p.price.toFixed(2)}</div>
          <p className="stock">In stock</p>
          <button className="add-button" type="button" data-add={p.id} aria-label={`Add ${p.name} to cart`} onClick={() => onAdd(p)}>
            {added.has(p.id) ? 'Added to cart' : 'Add to cart'}
          </button>
        </article>
      ))}
    </div>
  );
  if (!query) {
    return (
      <>
        <section className="hero"><h1>Small tech. Better everyday.</h1><p>Explore our fictional audio collection. Free mock delivery on every order.</p></section>
        <div className="section-title"><h2>Featured products</h2><span className="muted">Mock prices in USD</span></div>
        {grid}
      </>
    );
  }
  return (
    <>
      <div className="section-title"><h1>Results for “{query}”</h1><span className="muted">{matches.length} products</span></div>
      {matches.length ? grid : <div className="empty"><h2>No matching products</h2><p>Try “headphones” or “speaker”.</p></div>}
    </>
  );
}

function Detail({ product, onAdd, onBuyNow }: { product: Product; onAdd: (p: Product, q: number) => void; onBuyNow: (p: Product, q: number) => void }) {
  const [quantity, setQuantity] = useState('1');
  return (
    <article className="product-detail">
      <Art product={product} />
      <div>
        <h1>{product.name}</h1>
        <div className="rating">★★★★☆ 4.6 · 328 mock reviews</div>
        <div className="price"><small>$</small>{product.price.toFixed(2)}</div>
        <p className="stock">In stock</p>
        <p>{product.description}</p>
        <ul><li>Free fictional delivery</li><li>30-day mock returns</li><li>Two-year imaginary warranty</li></ul>
      </div>
      <div className="buy-box">
        <label htmlFor="quantity">Quantity</label>
        <select id="quantity" value={quantity} onChange={(e) => setQuantity(e.target.value)}><option>1</option><option>2</option><option>3</option></select>
        <button type="button" className="add-button" id="detail-add" onClick={() => onAdd(product, Number(quantity))}>Add to cart</button>
        <button type="button" className="buy-button" id="buy-now" onClick={() => onBuyNow(product, Number(quantity))}>Buy now</button>
      </div>
    </article>
  );
}

function Cart({ lines, onCheckout }: { lines: CartLine[]; onCheckout: () => void }) {
  return (
    <section className="cart-page">
      <h1>Shopping cart</h1>
      {lines.map((l) => (
        <div className="cart-row" key={l.product.id}>
          <div><strong>{l.product.name}</strong><div className="muted">Quantity: {l.quantity}</div></div>
          <span>${(l.product.price * l.quantity).toFixed(2)}</span>
        </div>
      ))}
      <div className="cart-total">Subtotal: <strong>${total(lines).toFixed(2)}</strong></div>
      <button type="button" className="buy-button" id="checkout" onClick={onCheckout}>Proceed to checkout</button>
    </section>
  );
}

function Checkout({ lines, onPlace }: { lines: CartLine[]; onPlace: () => void }) {
  const place = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (e.currentTarget.reportValidity()) onPlace();
  };
  return (
    <section className="checkout">
      <h1>Checkout</h1>
      <p className="muted">Demonstration only. Do not enter real personal or payment information.</p>
      <form id="checkout-form" onSubmit={place}>
        <label htmlFor="delivery-name">Full name</label>
        <input id="delivery-name" required autoComplete="off" defaultValue="Alex Example" />
        <label htmlFor="delivery-address">Delivery address</label>
        <input id="delivery-address" required autoComplete="off" defaultValue="1 Mock Street" />
        <label htmlFor="delivery-speed">Delivery speed</label>
        <select id="delivery-speed"><option>Standard — 3 to 5 days</option><option>Express — next day</option></select>
        <div className="order-summary"><strong>Order total: ${total(lines).toFixed(2)}</strong><br />No payment will be collected.</div>
        <button className="buy-button" type="submit">Place order</button>
      </form>
    </section>
  );
}
