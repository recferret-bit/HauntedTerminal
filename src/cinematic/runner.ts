/**
 * The clock and input around a cinematic. One fixed rule makes `?t=` freeze frames exact: the
 * simulation only moves through `step(t, dt)`. Live playback feeds it real dt; a freeze (or a skip
 * that jumps ahead) fast-forwards with fixed 1/60 steps and no rendering, then draws.
 */
export interface CineScript {
  /** Seconds at which the cinematic is over. */
  readonly end: number;
  /** After `end`, keep playing and wait for a key or click instead of resolving (the outro's splash). */
  readonly holdAtEnd?: boolean;
  /** Advance the simulation to absolute time `t` (by `dt`). `live` is false while fast-forwarding: no audio. */
  step(t: number, dt: number, live: boolean): void;
  /** Draw a frame at `t` (DOM lettering + the 3D panel). */
  draw(t: number): void;
  /** The window or host changed size. */
  layout(): void;
  /** Skip was pressed at `t`: jump to a time, or end now. */
  skipTo(t: number): number | 'end';
  /** True once a key or click at `t` should resolve (only consulted with `holdAtEnd`). */
  acceptsKey?(t: number): boolean;
  /** The PAUSE / CONTINUE control toggled (suspend audio here). */
  onPause?(paused: boolean): void;
  /** Whether the PAUSE / SKIP controls show at `t` (default: until `end`). */
  showControls?(t: number): boolean;
}

export interface RunOptions {
  skippable: boolean;
  /** Freeze at this time (preview / screenshots): fast-forward, draw, never resolve. */
  freezeAt?: number;
  /** Ignore input this long after start (the Enter that typed `exit` must not skip the outro). */
  inputGraceMs?: number;
}

export interface Runner {
  readonly done: Promise<void>;
  /** Current cinematic time. */
  readonly time: number;
  readonly paused: boolean;
  setPaused(paused: boolean): void;
  finish(): void;
}

/**
 * Input rules (the same for intro and outro):
 *   Space or the PAUSE / CONTINUE button  toggles pause: time, effects, animation and audio stop.
 *   Esc, Enter or the SKIP button          skip (when skippable). Clicking the picture does NOT skip.
 *   Tab moves focus between the two buttons; Enter / Space on a focused button presses it.
 *   After the outro's `end` (holdAtEnd), any key or click continues (resolves).
 */

const STEP = 1 / 60;

interface RunCtx {
  root: HTMLElement;
  script: CineScript;
  opts: RunOptions;
  cleanup: () => void;
  t: number;
  last: number;
  raf: number;
  finished: boolean;
  resolveDone: () => void;
  done: Promise<void>;
  started: number;
  grace: number;
  frozen: boolean;
  observer: ResizeObserver | null;
  paused: boolean;
  controls: HTMLDivElement;
  pauseBtn: HTMLButtonElement;
  skipBtn: HTMLButtonElement;
  onKey: (e: KeyboardEvent) => void;
  onPointer: (e: PointerEvent) => void;
  onResize: () => void;
}

function syncPauseBtn(ctx: RunCtx): void {
  ctx.pauseBtn.textContent = ctx.paused ? '\u25B6 CONTINUE' : '\u275A\u275A PAUSE';
  ctx.pauseBtn.setAttribute('aria-pressed', String(ctx.paused));
  ctx.pauseBtn.setAttribute('aria-label', ctx.paused ? 'Continue (Space)' : 'Pause (Space)');
  ctx.root.classList.toggle('htc-paused', ctx.paused);
}

function mountControls(ctx: RunCtx): void {
  const controls = document.createElement('div');
  controls.className = 'htc-controls';
  const pauseBtn = document.createElement('button');
  pauseBtn.type = 'button';
  pauseBtn.className = 'htc-btn';
  const skipBtn = document.createElement('button');
  skipBtn.type = 'button';
  skipBtn.className = 'htc-btn htc-btn-skip';
  skipBtn.textContent = 'SKIP \u25B8';
  skipBtn.setAttribute('aria-label', 'Skip the cinematic (Esc)');
  controls.append(pauseBtn);
  if (ctx.opts.skippable) controls.append(skipBtn);
  ctx.controls = controls;
  ctx.pauseBtn = pauseBtn;
  ctx.skipBtn = skipBtn;
  syncPauseBtn(ctx);
  if (!ctx.frozen) ctx.root.appendChild(controls);
  // Presses on the controls never reach the root's own pointer handler.
  controls.addEventListener('pointerdown', (e) => e.stopPropagation());
  pauseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePause(ctx);
  });
  skipBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    pressRun(ctx, true, true);
  });
}

function fastForward(ctx: RunCtx, target: number): void {
  while (ctx.t < target - 1e-9) {
    const dt = Math.min(STEP, target - ctx.t);
    ctx.t += dt;
    ctx.script.step(ctx.t, dt, false);
  }
}

function finishRun(ctx: RunCtx): void {
  if (ctx.finished) return;
  ctx.finished = true;
  cancelAnimationFrame(ctx.raf);
  window.removeEventListener('keydown', ctx.onKey, true);
  ctx.root.removeEventListener('pointerdown', ctx.onPointer);
  window.removeEventListener('resize', ctx.onResize);
  ctx.observer?.disconnect();
  ctx.controls.remove();
  try {
    ctx.cleanup();
  } finally {
    ctx.resolveDone();
  }
}

function setRunPaused(ctx: RunCtx, p: boolean): void {
  if (ctx.finished || ctx.frozen || p === ctx.paused) return;
  ctx.paused = p;
  ctx.last = 0;
  syncPauseBtn(ctx);
  try {
    ctx.script.onPause?.(ctx.paused);
  } catch (err) {
    console.warn('[cinematic] pause hook failed', err);
  }
  ctx.script.draw(ctx.t);
}

function togglePause(ctx: RunCtx): void {
  if (ctx.t >= ctx.script.end && ctx.script.holdAtEnd) return;
  setRunPaused(ctx, !ctx.paused);
}

function pressRun(ctx: RunCtx, isSkipKey: boolean, fromButton = false): void {
  if (ctx.finished || ctx.frozen) return;
  if (!fromButton && performance.now() - ctx.started < ctx.grace) return;
  if (ctx.t >= ctx.script.end && ctx.script.holdAtEnd) {
    if (!ctx.script.acceptsKey || ctx.script.acceptsKey(ctx.t)) finishRun(ctx);
    return;
  }
  if (!isSkipKey || !ctx.opts.skippable) return;
  const to = ctx.script.skipTo(ctx.t);
  if (to === 'end') finishRun(ctx);
  else if (to > ctx.t) {
    fastForward(ctx, to);
    setRunPaused(ctx, false);
    ctx.script.draw(ctx.t);
  }
}

function handleRunKey(ctx: RunCtx, e: KeyboardEvent): void {
  // Browser shortcuts and F-keys pass through untouched; Tab moves focus between our buttons.
  if (e.metaKey || e.ctrlKey || e.altKey || /^F\d{1,2}$/.test(e.key)) return;
  if (e.key === 'Tab') {
    e.stopImmediatePropagation();
    return;
  }
  // While a cinematic is up, no other key reaches the terminal underneath.
  e.preventDefault();
  e.stopImmediatePropagation();
  if (e.repeat) return;
  const holding = ctx.t >= ctx.script.end && !!ctx.script.holdAtEnd;
  const focused = document.activeElement;
  if (!holding && (e.key === 'Enter' || e.key === ' ') && (focused === ctx.pauseBtn || focused === ctx.skipBtn)) {
    if (focused === ctx.pauseBtn) togglePause(ctx);
    else pressRun(ctx, true, true);
    return;
  }
  if (holding) {
    if (!['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(e.key)) pressRun(ctx, false);
    return;
  }
  if (e.key === ' ') togglePause(ctx);
  else if (e.key === 'Escape' || e.key === 'Enter') pressRun(ctx, true);
}

function handleRunPointer(ctx: RunCtx, e: PointerEvent): void {
  // Clicking the picture never skips; it only continues past the outro's held splash.
  if (ctx.t >= ctx.script.end && ctx.script.holdAtEnd) {
    e.preventDefault();
    e.stopPropagation();
    pressRun(ctx, false);
  }
}

function frame(ctx: RunCtx, now: number): void {
  ctx.raf = requestAnimationFrame((next) => frame(ctx, next));
  if (ctx.finished) return;
  try {
    if (!ctx.frozen && !ctx.paused) {
      const dt = ctx.last ? Math.min(0.05, (now - ctx.last) / 1000) : STEP;
      ctx.last = now;
      ctx.t += dt;
      ctx.script.step(ctx.t, dt, true);
    }
    ctx.script.draw(ctx.t);
    const show = ctx.script.showControls ? ctx.script.showControls(ctx.t) : ctx.t < ctx.script.end;
    ctx.controls.style.display = show ? '' : 'none';
    if (!ctx.frozen && ctx.t >= ctx.script.end && !ctx.script.holdAtEnd) finishRun(ctx);
  } catch (err) {
    console.error('[cinematic] frame failed, ending it', err);
    finishRun(ctx);
  }
}

function createRunCtx(root: HTMLElement, script: CineScript, opts: RunOptions, cleanup: () => void): RunCtx {
  let resolveDone!: () => void;
  const done = new Promise<void>((r) => (resolveDone = r));
  const ctx: RunCtx = {
    root,
    script,
    opts,
    cleanup,
    t: 0,
    last: 0,
    raf: 0,
    finished: false,
    resolveDone,
    done,
    started: performance.now(),
    grace: opts.inputGraceMs ?? 400,
    frozen: opts.freezeAt !== undefined,
    observer: null,
    paused: false,
    controls: document.createElement('div'),
    pauseBtn: document.createElement('button'),
    skipBtn: document.createElement('button'),
    onKey: () => {},
    onPointer: () => {},
    onResize: () => {},
  };
  ctx.onKey = (e) => handleRunKey(ctx, e);
  ctx.onPointer = (e) => handleRunPointer(ctx, e);
  ctx.onResize = () => {
    ctx.script.layout();
    ctx.script.draw(ctx.t);
  };
  return ctx;
}

function bindRunInput(ctx: RunCtx): void {
  window.addEventListener('keydown', ctx.onKey, true);
  ctx.root.addEventListener('pointerdown', ctx.onPointer);
  window.addEventListener('resize', ctx.onResize);
  if (typeof ResizeObserver !== 'undefined') {
    ctx.observer = new ResizeObserver(() => ctx.onResize());
    ctx.observer.observe(ctx.root);
  }
}

export function runCinematic(root: HTMLElement, script: CineScript, opts: RunOptions, cleanup: () => void): Runner {
  const ctx = createRunCtx(root, script, opts, cleanup);
  mountControls(ctx);
  bindRunInput(ctx);
  try {
    if (ctx.frozen) fastForward(ctx, Math.max(0, opts.freezeAt!));
    script.draw(ctx.t);
    ctx.raf = requestAnimationFrame((now) => frame(ctx, now));
  } catch (err) {
    console.error('[cinematic] failed to start, skipping it', err);
    finishRun(ctx);
  }
  return {
    done: ctx.done,
    get time() { return ctx.t; },
    get paused() { return ctx.paused; },
    setPaused: (p) => setRunPaused(ctx, p),
    finish: () => finishRun(ctx),
  };
}
