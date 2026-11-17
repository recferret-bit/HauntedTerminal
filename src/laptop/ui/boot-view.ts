/**
 * The screen while the machine starts: BIOS text, the memory count, then the HAUNTED/OS splash and its
 * block progress bar, all drawn from `bootFrame(t)`. Also the farewell screen of a shutdown.
 */
import { h } from '../../editor-core/dom.js';
import { BOOT, bootFrame } from '../domain/boot.js';

export interface BootView {
  el: HTMLElement;
  bye: HTMLElement;
  /** Starts the timeline; `speed` scales it like the machine's phases (0 shows the last frame). */
  play(speed: number): void;
  stop(): void;
}

/** The OS mascot: a little ghost, the machine's own idea of a logo. */
export const LOGO = [
  '   .-.   ',
  '  (o o)  ',
  '  | O \\ ',
  '   \\   \\',
  "    `~~~'",
].join('\n');

export function createBootView(): BootView {
  const text = h('pre', { class: 'lt-bios' });
  const bar = h('div', { class: 'lt-bar' }, ...Array.from({ length: BOOT.blocks }, () => h('i')));
  const splash = h('div', { class: 'lt-splash' }, h('pre', { class: 'lt-logo' }, LOGO), h('b', {}, 'HAUNTED/OS  3.1'), bar, h('small', {}, 'loading the machine you are trapped in...'));
  const el = h('div', { class: 'lt-boot' }, text, splash);
  const bye = h('div', { class: 'lt-bye' }, h('p', {}, 'It is now safe to turn off'), h('p', {}, 'your computer.'));
  let raf = 0;

  const draw = (t: number): void => {
    const f = bootFrame(t);
    text.textContent = `${f.lines.join('\n')}${f.splash ? '' : '\n_'}`;
    el.classList.toggle('splash', f.splash);
    bar.querySelectorAll('i').forEach((cell, i) => cell.classList.toggle('on', i < f.filled));
  };

  return {
    el,
    bye,
    play(speed) {
      cancelAnimationFrame(raf);
      if (speed <= 0) { draw(Number.MAX_SAFE_INTEGER); return; }
      const start = performance.now();
      const tick = (): void => {
        draw((performance.now() - start) / speed);
        raf = requestAnimationFrame(tick);
      };
      tick();
    },
    stop() {
      cancelAnimationFrame(raf);
      draw(0);
    },
  };
}
