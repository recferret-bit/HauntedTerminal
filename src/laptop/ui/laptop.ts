/**
 * The laptop, assembled: the lifecycle machine drives the view, the page's real keyboard and pointer
 * drive the deck's keys and trackpad, and the desktop runs the apps. One entry, `mountLaptop`, so a
 * lab page (and later the game) can embed it.
 */
import { createMachine, type LaptopEvent, type LaptopState, type Machine } from '../domain/machine.js';
import { emptyProgress, parseProgress, type Progress } from '../domain/progress.js';
import type { CheckResult } from '../domain/checks.js';
import type { CodeFiles } from '../domain/run.js';
import { taskById } from '../domain/tasks.js';
import { createLaptopSound } from '../runtime/sound.js';
import type { LaptopContext } from './apps/app-types.js';
import type { Workbench } from './apps/workbench.js';
import { createDesktopView, type DesktopView } from './desktop-view.js';
import { createLaptopView, type LaptopView } from './laptop-view.js';

export interface LaptopOptions {
  start?: LaptopState;
  /** Phase length scale (1 = normal, 0 = instant). */
  speed?: number;
  muted?: boolean;
  /** localStorage key for quest progress; null keeps it in memory only. */
  storageKey?: string | null;
  /** Hears laptop actions (`open`, `key`, `fan-on`, ...). The lab turns them into app events. */
  hear?: (action: string) => void;
}

export interface LaptopHandle {
  machine: Machine;
  view: LaptopView;
  desktop: DesktopView;
  ctx: LaptopContext;
  onState(fn: (state: LaptopState, event: LaptopEvent) => void): void;
  setSpeed(speed: number): void;
  /** Goes straight to a state, through the table, without the shouting. */
  jump(to: LaptopState): boolean;
  /** Opens a task in its app, optionally replaces the code, and runs its checks. */
  runTask(id: string, files?: CodeFiles): Promise<CheckResult[]>;
  resetProgress(): void;
  /** Tears down listeners, observers, and desktop windows. */
  dispose(): void;
}

/** The comic word each state change shouts. */
const SHOUT: Partial<Record<LaptopState, string>> = {
  opening: 'CREAK!', diving: 'WHOOSH!', booting: 'BEEP!', desktop: 'DING!', shutting: 'BZZT...', closing: 'KLAK!',
};

function store(key: string | null): { load(): Progress; save(p: Progress): void } {
  return {
    load: () => (key ? parseProgress(localStorage.getItem(key)) : emptyProgress()),
    save: (p) => { if (key) localStorage.setItem(key, JSON.stringify(p)); },
  };
}

/** Real keyboard and pointer to the deck: keys press, the finger follows the pointer over the screen. */
function wireInput(view: LaptopView): () => void {
  const onKeyDown = (ev: KeyboardEvent): void => {
    view.led('caps', ev.getModifierState?.('CapsLock') ? 'on' : 'off');
    view.keyboard.press(ev.code);
  };
  const onKeyUp = (ev: KeyboardEvent): void => {
    view.led('caps', ev.getModifierState?.('CapsLock') ? 'on' : 'off');
    view.keyboard.release(ev.code);
  };
  const onBlur = (): void => {
    view.keyboard.releaseAll();
    view.trackpad.button(0, false);
    view.trackpad.button(2, false);
    view.trackpad.touch(null);
  };
  const onPointerMove = (ev: PointerEvent): void => {
    const r = view.screen.getBoundingClientRect();
    if (r.width) view.trackpad.touch({ u: (ev.clientX - r.left) / r.width, v: (ev.clientY - r.top) / r.height });
  };
  const onPointerLeave = (): void => view.trackpad.touch(null);
  const onPointerDown = (ev: PointerEvent): void => view.trackpad.button(ev.button, true);
  const onPointerUp = (ev: PointerEvent): void => view.trackpad.button(ev.button, false);
  const onPointerCancel = (ev: PointerEvent): void => {
    view.trackpad.button(ev.button, false);
    view.trackpad.touch(null);
  };
  const onWheel = (ev: WheelEvent): void => view.trackpad.scroll(ev.deltaY);

  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('keyup', onKeyUp, true);
  window.addEventListener('blur', onBlur);
  window.addEventListener('pointermove', onPointerMove, true);
  document.documentElement.addEventListener('pointerleave', onPointerLeave);
  window.addEventListener('pointerdown', onPointerDown, true);
  window.addEventListener('pointerup', onPointerUp, true);
  window.addEventListener('pointercancel', onPointerCancel, true);
  window.addEventListener('wheel', onWheel, { passive: true, capture: true });

  return () => {
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('keyup', onKeyUp, true);
    window.removeEventListener('blur', onBlur);
    window.removeEventListener('pointermove', onPointerMove, true);
    document.documentElement.removeEventListener('pointerleave', onPointerLeave);
    window.removeEventListener('pointerdown', onPointerDown, true);
    window.removeEventListener('pointerup', onPointerUp, true);
    window.removeEventListener('pointercancel', onPointerCancel, true);
    window.removeEventListener('wheel', onWheel, { capture: true } as EventListenerOptions);
  };
}

export function mountLaptop(host: HTMLElement, opts: LaptopOptions = {}): LaptopHandle {
  const sound = createLaptopSound(opts.hear);
  sound.muted = !!opts.muted;
  const saved = store(opts.storageKey === undefined ? 'credits.laptop.progress' : opts.storageKey);
  let progress = saved.load();
  const progressFns: ((p: Progress) => void)[] = [];
  const stateFns: ((s: LaptopState, e: LaptopEvent) => void)[] = [];

  const view = createLaptopView((_code, down) => sound.key(down));
  host.append(view.el);
  const unhookInput = wireInput(view);
  view.trackpad.el.addEventListener('pointerdown', () => sound.button());
  // The device answers clicks too: the shut lid opens, the dark screen powers on.
  view.el.addEventListener('click', (ev) => {
    const on = (ev.target as HTMLElement).closest('.lt-lid');
    if (on && machine.state === 'closed') machine.send('OPEN');
    else if (on && machine.state === 'open') machine.send('POWER');
  });

  const ctx: LaptopContext = {
    sound,
    progress: () => progress,
    setProgress(next) {
      progress = next;
      saved.save(next);
      progressFns.forEach((fn) => fn(next));
    },
    onProgress: (fn) => { progressFns.push(fn); },
    open: (app) => desktop.dispatch({ type: 'open', app }),
    startTask(id) {
      const task = taskById(id);
      if (!task) return;
      desktop.dispatch({ type: 'open', app: task.app });
      (desktop.view(task.app) as Workbench | undefined)?.loadTask(task, progress.drafts[id] ?? task.starter);
    },
    shutdown: () => { machine.send('POWER'); },
    pow: (word) => view.pow(word),
  };
  // The screen is zoomed by the camera: desktop drags divide by this.
  const desktop = createDesktopView(ctx, () => view.screen.getBoundingClientRect().width / view.screen.offsetWidth);
  view.screen.append(desktop.el);

  /** True while `jump` walks the table: no shouting for the states it only passes through. */
  let quiet = false;
  const enter = (state: LaptopState, _from: LaptopState, event: LaptopEvent): void => {
    view.show(state);
    const word = SHOUT[state];
    if (word && !quiet && machine.speed > 0) view.pow(word);
    const on = state === 'diving' || state === 'booting' || state === 'desktop' || state === 'shutting';
    view.led('power', on ? 'on' : 'off');
    view.led('disk', state === 'booting' ? 'blink' : 'off');
    if (state === 'booting') {
      view.boot.play(machine.speed);
      sound.beep();
      sound.disk(2400 * machine.speed);
      sound.note('fan-on');
    } else view.boot.stop();
    if (state === 'opening') sound.note('open');
    if (state === 'closing') sound.note('close');
    if (state === 'desktop') sound.note('ready');
    if (state !== 'booting') sound.note('fan-off');
    if (state === 'shutting') sound.note('shutdown');
    if (state === 'shutting') desktop.reset();
    if (state === 'desktop') ctx.open('quests');
    stateFns.forEach((fn) => fn(state, event));
  };
  const machine = createMachine({ after: (ms, fn) => { const t = window.setTimeout(fn, ms); return () => window.clearTimeout(t); } }, enter);

  const setSpeed = (speed: number): void => {
    machine.speed = speed;
    view.setSpeed(speed);
  };
  setSpeed(opts.speed ?? 1);
  view.show('closed');
  const ro = new ResizeObserver(() => view.frame(false));
  ro.observe(view.el);
  const jump = (to: LaptopState): boolean => {
    quiet = true;
    const ok = machine.jump(to);
    quiet = false;
    return ok;
  };
  if (opts.start && opts.start !== 'closed') jump(opts.start);

  return {
    machine, view, desktop, ctx, setSpeed, jump,
    onState: (fn) => { stateFns.push(fn); },
    async runTask(id, files) {
      const task = taskById(id);
      if (!task) throw new Error(`unknown laptop task "${id}"`);
      ctx.startTask(id);
      const bench = desktop.view(task.app) as Workbench | undefined;
      if (!bench) throw new Error(`the ${task.app} window did not open`);
      if (files) bench.setFiles(files);
      return bench.check();
    },
    resetProgress: () => ctx.setProgress(emptyProgress()),
    dispose() {
      unhookInput();
      ro.disconnect();
      view.boot.stop();
      sound.note('fan-off');
      desktop.dispose();
      view.el.remove();
    },
  };
}
