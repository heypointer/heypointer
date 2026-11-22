import { frameOffset } from './highlight';

type Placement = 'below' | 'above' | 'left' | 'right' | 'floating';

/** Position a coachmark near its real target without covering the target or viewport edges. */
export function coachmarkPosition(
  target: Pick<DOMRect, 'top' | 'left' | 'right' | 'bottom'>,
  card: Pick<DOMRect, 'width' | 'height'>,
  viewport: { width: number; height: number },
  mobile = viewport.width <= 600,
  rtl = false,
): { left: number; top: number; placement: Placement; arrowLeft: number } {
  if (mobile) {
    const top = target.bottom + 16 + card.height <= viewport.height - 12
      ? target.bottom + 16
      : target.top - card.height - 16 >= 12
        ? target.top - card.height - 16
        : 16;
    return { left: 12, top, placement: 'floating', arrowLeft: 0 };
  }
  const gap = 16;
  const fits = (left: number, top: number) =>
    left >= 12 && top >= 12 && left + card.width <= viewport.width - 12 && top + card.height <= viewport.height - 12;
  const centeredLeft = target.left + (target.right - target.left - card.width) / 2;
  const centeredTop = target.top + (target.bottom - target.top - card.height) / 2;
  const candidates: { placement: Placement; left: number; top: number }[] = [
    { placement: 'below', left: centeredLeft, top: target.bottom + gap },
    { placement: 'above', left: centeredLeft, top: target.top - card.height - gap },
    { placement: 'right', left: target.right + gap, top: centeredTop },
    { placement: 'left', left: target.left - card.width - gap, top: centeredTop },
  ];
  // Beside the target, prefer the side where the reader's text continues: right in LTR, left in RTL.
  if (rtl) [candidates[2], candidates[3]] = [candidates[3]!, candidates[2]!];
  const chosen = candidates.find((c) => fits(c.left, c.top)) ?? candidates
    .map((c) => ({ ...c, left: Math.max(12, Math.min(c.left, viewport.width - card.width - 12)), top: Math.max(12, Math.min(c.top, viewport.height - card.height - 12)) }))
    .sort((a, b) => {
      const overlap = (c: typeof a) => Math.max(0, Math.min(target.right, c.left + card.width) - Math.max(target.left, c.left)) * Math.max(0, Math.min(target.bottom, c.top + card.height) - Math.max(target.top, c.top));
      return overlap(a) - overlap(b);
    })[0]!;
  const arrowLeft = Math.max(24, Math.min((target.left + target.right) / 2 - chosen.left, card.width - 24));
  return { ...chosen, arrowLeft };
}

/** Visual dimmer plus a real, click-through cutout around the active control. */
export class Spotlight {
  readonly overlay: HTMLDivElement;
  private target: HTMLElement | null = null;
  private offset = { x: 0, y: 0 };
  private enabled = false;
  private onReposition?: () => void;
  private frame = 0;
  private observer?: ResizeObserver;
  private readonly onMove = () => this.position();

  constructor(host: ParentNode & Node) {
    this.overlay = document.createElement('div');
    this.overlay.className = 'hp-spotlight';
    this.overlay.setAttribute('part', 'spotlight');
    this.overlay.setAttribute('aria-hidden', 'true');
    this.overlay.hidden = true;
    host.appendChild(this.overlay);
  }

  show(el: HTMLElement | null, onReposition: () => void): void {
    this.hide();
    this.target = el;
    this.onReposition = onReposition;
    this.enabled = true;
    this.overlay.hidden = false;
    if (el) this.offset = frameOffset(el);
    this.position();
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => this.position());
    addEventListener('scroll', this.onMove, true);
    addEventListener('resize', this.onMove);
    if (typeof ResizeObserver !== 'undefined') {
      this.observer = new ResizeObserver(this.onMove);
      this.observer.observe(document.documentElement);
      this.observer.observe(this.overlay);
      if (el) this.observer.observe(el);
    }
  }

  hide(): void {
    this.target = null;
    this.enabled = false;
    cancelAnimationFrame(this.frame);
    this.overlay.hidden = true;
    this.overlay.style.clipPath = '';
    this.observer?.disconnect();
    removeEventListener('scroll', this.onMove, true);
    removeEventListener('resize', this.onMove);
  }

  private position(): void {
    if (!this.enabled) return;
    if (this.target && !this.target.isConnected) return;
    // Layout after viewport changes can take another frame to settle.
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => {
      if (this.enabled) this.update();
    });
    this.update();
  }

  private update(): void {
    if (!this.enabled) return;
    const r = this.target?.getBoundingClientRect() ?? { top: 0, left: 0, width: 0, height: 0 };
    const x = r.left + this.offset.x - 5;
    const y = r.top + this.offset.y - 5;
    const width = r.width + 10;
    const height = r.height + 10;
    this.overlay.style.clipPath = this.target
      ? `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${x}px ${y}px, ${x}px ${y + height}px, ${x + width}px ${y + height}px, ${x + width}px ${y}px, ${x}px ${y}px)`
      : '';
    this.onReposition?.();
  }
}
