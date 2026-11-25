/**
 * Page-level transitions around the cinematics (classes on <body>, animations in game.css):
 *   cine        a fullscreen cinematic is up; the terminal is hidden.
 *   term-off    the terminal is dark (collapsed to nothing).
 *   term-on     CRT power-on: a bright line opens to full height, scanlines and a glitch settle.
 *   term-down   CRT power-off: the picture collapses to a line, then a dot.
 *   stage-drop  the stage page drops into place like a comic panel slapped on the table.
 * Timers, not animationend, so it also resolves in a background tab or headless Chrome.
 */
export const POWER_ON_MS = 760;
export const POWER_OFF_MS = 460;

const body = () => document.body.classList;
const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
let screenSeq = 0;
let hudEnterTimer = 0;
const HUD_ENTER_MS = 420;

/** Cancels any pending CRT power transition timer and leaves the terminal visible and settled. */
export function resetScreen(): void {
  screenSeq += 1;
  window.clearTimeout(hudEnterTimer);
  hudEnterTimer = 0;
  body().remove('cine', 'term-off', 'term-on', 'term-down', 'stage-drop', 'hud-hidden', 'hud-enter');
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
    body().add('term-off');
    body().remove('term-on', 'term-down', 'stage-drop');
  }
}

/** Stage drops in and the terminal powers on. Resolves when the picture is up. */
export async function powerOn(withStage = true): Promise<void> {
  const seq = ++screenSeq;
  body().remove('term-down', 'term-on', 'stage-drop');
  void document.body.offsetWidth;
  body().remove('term-off');
  body().add('term-on');
  if (withStage) body().add('stage-drop');
  await wait(POWER_ON_MS);
  if (screenSeq !== seq) return;
  body().remove('term-on', 'stage-drop');
}

/** The terminal powers off (line, dot, dark). Stays dark until powerOn. */
export async function powerOff(): Promise<void> {
  const seq = ++screenSeq;
  body().remove('term-on', 'stage-drop');
  body().add('term-down');
  await wait(POWER_OFF_MS);
  if (screenSeq !== seq) return;
  body().add('term-off');
  body().remove('term-down');
}
