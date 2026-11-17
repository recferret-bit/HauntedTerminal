/**
 * The laptop itself, built from CSS 3D planes and drawn like a comic panel: a deck lying flat (keys,
 * trackpad, status lights), a lid on a hinge (screen in a thick bezel, the `>_` sticker on its back) and
 * a camera rig. It only shows a look; the controller decides which (src/laptop/ui/laptop.ts).
 */
import { h } from '../../editor-core/dom.js';
import { framing, geometryVars } from '../domain/geometry.js';
import { LAPTOP_STATES, LOOKS, PHASE_MS, type LaptopState } from '../domain/machine.js';
import { createBootView, type BootView } from './boot-view.js';
import { createKeyboard, type KeyboardView } from './keyboard-view.js';
import { paletteVars } from './palette.js';
import { createTrackpad, type TrackpadView } from './trackpad-view.js';

export type LedId = 'power' | 'disk' | 'caps';

export interface LaptopView {
  el: HTMLElement;
  /** The 640 x 480 panel: the desktop goes in here. */
  screen: HTMLElement;
  keyboard: KeyboardView;
  trackpad: TrackpadView;
  boot: BootView;
  show(state: LaptopState): void;
  led(id: LedId, mode: 'off' | 'on' | 'blink'): void;
  /** Phase length scale, so CSS timings follow the machine's (0 = instant). */
  setSpeed(speed: number): void;
  /** Re-aims the camera for the current size of the scene. */
  frame(animate: boolean): void;
  pow(word: string): void;
}

function leds(): { el: HTMLElement; set: (id: LedId, mode: 'off' | 'on' | 'blink') => void } {
  const map = new Map<LedId, HTMLElement>();
  const el = h('div', { class: 'lt-leds' }, ...(['power', 'disk', 'caps'] as const).map((id) => {
    const lamp = h('i', { class: 'lt-led', 'data-led': id });
    map.set(id, lamp);
    return h('span', {}, lamp, h('small', {}, id === 'caps' ? 'A' : id === 'disk' ? 'HD' : 'PWR'));
  }));
  return { el, set: (id, mode) => { map.get(id)!.dataset.mode = mode; } };
}

export function createLaptopView(onKey: (code: string, down: boolean) => void): LaptopView {
  const keyboard = createKeyboard(onKey);
  const trackpad = createTrackpad();
  const boot = createBootView();
  const lights = leds();
  const screen = h('div', { class: 'lt-screen', 'data-screen': 'off' }, boot.el, boot.bye, h('i', { class: 'lt-glare' }));
  const lid = h('div', { class: 'lt-lid' },
    h('div', { class: 'lt-lid-face' }, screen, h('div', { class: 'lt-brand' }, h('b', {}, 'HAUNTED'), ' BOOK 486')),
    h('div', { class: 'lt-lid-back' }, h('div', { class: 'lt-sticker' }, h('b', {}, '>_'))));
  const deck = h('div', { class: 'lt-deck' },
    h('div', { class: 'lt-grille' }),
    keyboard.el,
    h('div', { class: 'lt-palm' }, lights.el, trackpad.el, h('div', { class: 'lt-badge' }, '486', h('small', {}, 'DX2/66'))),
    h('div', { class: 'lt-front' }, h('i', { class: 'lt-latch' })),
    lid);
  const rig = h('div', { class: 'lt-rig' }, h('div', { class: 'lt-shadow' }), deck);
  const sfx = h('div', { class: 'lt-sfx', 'aria-hidden': 'true' });
  const el = h('div', { class: 'lt-scene', 'data-state': 'closed' }, rig, sfx);
  for (const [k, v] of Object.entries({ ...geometryVars(), ...paletteVars() })) el.style.setProperty(k, v);

  let state: LaptopState = 'closed';
  const view: LaptopView = {
    el, screen, keyboard, trackpad, boot,
    show(next) {
      state = next;
      const look = LOOKS[next];
      el.dataset.state = next;
      el.dataset.camera = look.camera;
      el.dataset.lid = look.lid;
      screen.dataset.screen = look.screen;
      view.frame(true);
    },
    led: lights.set,
    setSpeed(speed) {
      for (const s of LAPTOP_STATES) {
        const ms = PHASE_MS[s];
        if (ms !== undefined) el.style.setProperty(`--t-${s}`, `${Math.round(ms * speed)}ms`);
      }
    },
    frame(animate) {
      const box = el.getBoundingClientRect();
      if (!box.width || !box.height) return;
      const f = framing(LOOKS[state], box.width, box.height);
      rig.classList.toggle('still', !animate);
      rig.style.transform = `translateY(${f.shiftY.toFixed(1)}px) scale(${f.zoom.toFixed(4)}) rotateX(${-f.tilt}deg)`;
      if (!animate) void rig.offsetWidth;
      rig.classList.remove('still');
    },
    pow(word) {
      sfx.replaceChildren();
      const burst = h('span', { class: 'lt-pow', style: `--rot:${(Math.random() * 16 - 8).toFixed(1)}deg; --x:${(20 + Math.random() * 60).toFixed(0)}%` }, word);
      sfx.append(burst);
      window.setTimeout(() => burst.remove(), 1100);
    },
  };
  view.setSpeed(1);
  return view;
}
