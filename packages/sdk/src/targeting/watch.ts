import { isUsable } from './index';

const ATTRS = ['style', 'class', 'hidden', 'open', 'inert', 'aria-hidden'];
const TRANSITIONS = ['transitionend', 'transitioncancel', 'animationend', 'animationcancel'];
const STARTS = ['transitionrun', 'animationstart'];
const FOLLOW_MS = 1000;

/**
 * Calls `onChange(false)` when `el` stops being usable (removed, hidden, closed) and `onChange(true)` when it
 * comes back. Idle pages cost nothing: work happens at most once per frame after a relevant DOM change, and a
 * short follow-up only while a transition or animation that contains `el` is running. Returns the stop function.
 */
export function watchUsable(el: HTMLElement, onChange: (usable: boolean) => void): () => void {
  let last = true; // the caller has just placed it; the first check below corrects that
  let stopped = false;
  let frame = 0;
  let followUntil = 0;
  const check = () => {
    frame = 0;
    if (stopped) return;
    const now = isUsable(el);
    if (now !== last) {
      last = now;
      onChange(now);
    }
    if (!stopped && performance.now() < followUntil) schedule();
  };
  const schedule = () => {
    if (!frame && !stopped) frame = requestAnimationFrame(check);
  };
  const onTransition = (e: Event) => {
    if (e.target instanceof Node && e.target.contains(el)) schedule();
  };
  const onStart = (e: Event) => {
    if (e.target instanceof Node && e.target.contains(el)) {
      followUntil = performance.now() + FOLLOW_MS;
      schedule();
    }
  };
  const mo = new MutationObserver(schedule);
  mo.observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ATTRS });
  for (const t of TRANSITIONS) document.addEventListener(t, onTransition, true);
  for (const t of STARTS) document.addEventListener(t, onStart, true);
  schedule();
  return () => {
    stopped = true;
    cancelAnimationFrame(frame);
    mo.disconnect();
    for (const t of TRANSITIONS) document.removeEventListener(t, onTransition, true);
    for (const t of STARTS) document.removeEventListener(t, onStart, true);
  };
}
