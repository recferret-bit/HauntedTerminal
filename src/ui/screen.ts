/**
 * Page-level transitions around the cinematics (classes on <body>, animations in game.css):
 *   cine        a fullscreen cinematic is up; the terminal is hidden.
 *   term-off    the terminal is dark (collapsed to nothing).
 *   term-on     CRT power-on: a bright line opens to full height, scanlines and a glitch settle.
 *   term-matrix first time the terminal is shown this run: a dot, then a line, then the
 *               whole panel, with green digital rain (src/ui/term-boot.ts).
 *   term-down   CRT power-off: the picture collapses to a line, then a dot.
 *   stage-drop  the stage page drops into place like a comic panel slapped on the table.
 * Timers, not animationend, so it also resolves in a background tab or headless Chrome.
 */
import { startMatrixRain } from './term-boot.js';

export const POWER_ON_MS = 760;
export const POWER_OFF_MS = 460;
/** Keep in step with the `matrix-boot` / `matrix-fade` durations in game.css. */
export const MATRIX_BOOT_MS = 1800;

const body = () => document.body.classList;
const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
let screenSeq = 0;
let hudEnterTimer = 0;
let stopRain: (() => void) | null = null;
const HUD_ENTER_MS = 420;

function prefersReduced(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function endRain(): void {
  stopRain?.();
  stopRain = null;
}

/** Cancels any pending CRT power transition timer and leaves the terminal visible and settled. */
export function resetScreen(): void {
  screenSeq += 1;
  window.clearTimeout(hudEnterTimer);
  hudEnterTimer = 0;
  endRain();
  body().remove('cine', 'term-off', 'term-on', 'term-matrix', 'term-down', 'stage-drop', 'hud-hidden', 'hud-enter');
}

/** Hides HUD/controls while a level loads or page card flips, then smoothly animates them in once ready. */
export function setHudHidden(hidden: boolean): void {
  if (hidden) {
    window.clearTimeout(hudEnterTimer);
    hudEnterTimer = 0;
    body().remove('hud-enter');
    body().add('hud-hidden');
    return;
  }
  if (!body().contains('hud-hidden')) return;
  window.clearTimeout(hudEnterTimer);
  body().remove('hud-hidden', 'hud-enter');
  void document.body.offsetWidth;
  body().add('hud-enter');
  hudEnterTimer = window.setTimeout(() => {
    hudEnterTimer = 0;
    body().remove('hud-enter');
  }, HUD_ENTER_MS);
}

/** Fullscreen cinematic on/off. While on, the terminal is dark. */
export function setCinematic(on: boolean): void {
  screenSeq += 1;
  body().toggle('cine', on);
  if (on) {
    endRain();
    body().add('term-off');
    body().remove('term-on', 'term-matrix', 'term-down', 'stage-drop');
  }
}

/** Stage drops in and the terminal powers on. Resolves when the picture is up. */
export async function powerOn(withStage = true): Promise<void> {
  const seq = ++screenSeq;
  endRain();
  body().remove('term-down', 'term-on', 'term-matrix', 'stage-drop');
  void document.body.offsetWidth;
  body().remove('term-off');
  body().add('term-on');
  if (withStage) body().add('stage-drop');
  await wait(POWER_ON_MS);
  if (screenSeq !== seq) return;
  body().remove('term-on', 'stage-drop');
}

/**
 * First appearance this run. A centre dot stretches into a line, then the line opens
 * until the whole terminal is visible, under green digital rain.
 */
export async function matrixBoot(withStage = false): Promise<void> {
  const seq = ++screenSeq;
  endRain();
  const bezel = document.getElementById('terminal-bezel');
  bezel?.classList.remove('tty-popin');
  body().remove('term-down', 'term-on', 'term-matrix', 'stage-drop');
  void document.body.offsetWidth;
  body().remove('term-off');
  const reduced = prefersReduced();
  if (!reduced) {
    body().add('term-matrix');
    if (bezel) stopRain = startMatrixRain(bezel);
  }
  if (withStage) body().add('stage-drop');
  await wait(reduced ? 0 : MATRIX_BOOT_MS);
  endRain();
  if (screenSeq !== seq) return;
  body().remove('term-matrix', 'stage-drop');
}

/** The terminal powers off (line, dot, dark). Stays dark until powerOn. */
export async function powerOff(): Promise<void> {
  const seq = ++screenSeq;
  endRain();
  body().remove('term-on', 'term-matrix', 'stage-drop');
  body().add('term-down');
  await wait(POWER_OFF_MS);
  if (screenSeq !== seq) return;
  body().add('term-off');
  body().remove('term-down');
}
