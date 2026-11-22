// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 HeyPointer
/** Visual-only spotlight. Never intercepts pointer events, so the user performs the action themselves. */
/** Sum of frame-element offsets from the element's own document up to the top window. */
export function frameOffset(el: HTMLElement): { x: number; y: number } {
  let x = 0, y = 0;
  let win: Window | null = el.ownerDocument?.defaultView ?? null;
  while (win && win !== win.top) {
    const frame = win.frameElement as HTMLElement | null;
    if (!frame) break; // cross-origin or detached: stop, do not guess
    const r = frame.getBoundingClientRect();
    x += r.left;
    y += r.top;
    win = win.parent;
  }
  return { x, y };
}

export class Highlighter {
  private box: HTMLDivElement;
  private target: HTMLElement | null = null;
  private offset = { x: 0, y: 0 };
  private readonly onMove = () => this.position();
  private frame = 0;
  private observer?: ResizeObserver;

  constructor(private readonly host: ParentNode & Node) {
    this.box = document.createElement('div');
    this.box.className = 'hp-highlight';
    this.box.setAttribute('part', 'highlight');
    this.box.setAttribute('aria-hidden', 'true');
    this.box.hidden = true;
    host.appendChild(this.box);
  }

  show(el: HTMLElement): void {
    this.target = el;
    // Elements inside a same-origin iframe report viewport coordinates of their own document.
    // Walk the frame chain so the overlay in the top document lands on the element.
    this.offset = frameOffset(el);
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView?.({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
    this.box.hidden = false;
    // Re-read geometry after the scroll request; host content may move immediately.
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => this.position());
    this.position();
    addEventListener('scroll', this.onMove, true);
    addEventListener('resize', this.onMove);
    this.observer?.disconnect();
    if (typeof ResizeObserver !== 'undefined') {
      // Layout after a viewport change can settle a frame after the resize event.
      this.observer = new ResizeObserver(this.onMove);
      this.observer.observe(document.documentElement);
      this.observer.observe(el);
    }
  }

  hide(): void {
    this.target = null;
    cancelAnimationFrame(this.frame);
    this.box.hidden = true;
    this.observer?.disconnect();
    removeEventListener('scroll', this.onMove, true);
    removeEventListener('resize', this.onMove);
  }

  current(): HTMLElement | null {
    return this.target;
  }

  private position(): void {
    if (!this.target) return;
    if (!this.target.isConnected) return this.hide();
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => this.place());
    this.place();
  }

  private place(): void {
    if (!this.target?.isConnected) return;
    const r = this.target.getBoundingClientRect();
    const pad = 4;
    Object.assign(this.box.style, {
      top: `${r.top + this.offset.y - pad}px`,
      left: `${r.left + this.offset.x - pad}px`,
      width: `${r.width + pad * 2}px`,
      height: `${r.height + pad * 2}px`,
    });
  }
}
