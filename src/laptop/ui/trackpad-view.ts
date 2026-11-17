/**
 * The palm rest's trackpad and its two buttons. A fingertip mirrors the real pointer: where the
 * pointer is over the laptop's screen is where the finger is on the pad, and real clicks press the
 * pad's buttons.
 */
import { h } from '../../editor-core/dom.js';

export interface TrackpadView {
  el: HTMLElement;
  /** Puts the finger at (u, v) in 0..1 across the pad; null lifts it. */
  touch(at: { u: number; v: number } | null): void;
  /** Presses (true) or lets go of (false) a button: 0 left, 2 right. */
  button(which: number, down: boolean): void;
  /** A scroll stroke: the finger drags a little in `dy`'s direction. */
  scroll(dy: number): void;
  state(): { u: number; v: number; touching: boolean; buttons: number[] };
}

export function createTrackpad(): TrackpadView {
  const finger = h('i', { class: 'lt-finger' });
  const pad = h('div', { class: 'lt-pad' }, finger);
  const left = h('b', { class: 'lt-btn' });
  const right = h('b', { class: 'lt-btn' });
  const el = h('div', { class: 'lt-trackpad' }, pad, h('div', { class: 'lt-btns' }, left, right));
  let at = { u: 0.5, v: 0.5 };
  let touching = false;
  const held = new Set<number>();
  let scrollTimer = 0;

  const place = (): void => {
    finger.style.left = `${(at.u * 100).toFixed(2)}%`;
    finger.style.top = `${(at.v * 100).toFixed(2)}%`;
  };
  place();

  return {
    el,
    touch(next) {
      touching = !!next;
      el.classList.toggle('touching', touching);
      if (next) at = { u: Math.min(1, Math.max(0, next.u)), v: Math.min(1, Math.max(0, next.v)) };
      place();
    },
    button(which, down) {
      const btn = which === 2 ? right : left;
      if (down) held.add(which);
      else held.delete(which);
      btn.classList.toggle('down', down);
      pad.classList.toggle('pressed', held.size > 0);
    },
    scroll(dy) {
      el.classList.add('scrolling');
      finger.style.setProperty('--drag', `${Math.sign(dy) * 8}px`);
      window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(() => el.classList.remove('scrolling'), 180);
    },
    state: () => ({ ...at, touching, buttons: [...held] }),
  };
}
