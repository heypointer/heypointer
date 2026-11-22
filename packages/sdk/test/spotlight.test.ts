import { describe, expect, it } from 'vitest';
import { coachmarkPosition } from '../src/spotlight';

const target = { left: 900, top: 300, right: 1100, bottom: 350 };
const card = { width: 400, height: 200 };
const viewport = { width: 1280, height: 800 };

describe('coachmark placement', () => {
  it('prefers below, then above, and stays inside the viewport', () => {
    expect(coachmarkPosition(target, card, viewport).placement).toBe('below');
    const top = coachmarkPosition({ ...target, top: 600, bottom: 650 }, card, viewport);
    expect(top.placement).toBe('above');
    expect(top.top).toBeGreaterThanOrEqual(12);
  });

  it('clamps the horizontal position and keeps the arrow aimed at the target', () => {
    const pos = coachmarkPosition(target, card, { width: 1280, height: 500 });
    expect(pos.left).toBeGreaterThanOrEqual(12);
    expect(pos.left + card.width).toBeLessThanOrEqual(1268);
    expect(pos.arrowLeft).toBeGreaterThanOrEqual(24);
    expect(pos.arrowLeft).toBeLessThanOrEqual(card.width - 24);
  });

  it('uses the narrow-screen fallback below the target when possible', () => {
    const pos = coachmarkPosition({ left: 20, top: 100, right: 200, bottom: 140 }, { width: 296, height: 180 }, { width: 320, height: 640 });
    expect(pos).toMatchObject({ left: 12, top: 156, placement: 'floating' });
  });
});
