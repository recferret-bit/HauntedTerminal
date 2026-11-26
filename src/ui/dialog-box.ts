import { createStateMachine, type StateMachine, type TransitionTable } from '../contracts/state-machine.js';
import { el, PORTRAIT_FRAMES, replayClass, type DrawPortrait } from './dom-lite.js';

export type DialogPhase = 'idle' | 'entering' | 'hold' | 'exiting';
export type DialogTransition = 'START' | 'SETTLE' | 'EXIT' | 'CLOSE';

export const DIALOG_TRANSITIONS: TransitionTable<DialogPhase, DialogTransition> = {
  idle: { START: 'entering' },
  entering: { START: 'entering', SETTLE: 'hold', EXIT: 'exiting', CLOSE: 'idle' },
  hold: { START: 'entering', EXIT: 'exiting', CLOSE: 'idle' },
  exiting: { START: 'entering', CLOSE: 'idle' },
};

export type DialogPriority = 'script' | 'prompt' | 'chatter';
export type DialogMood = 'laugh' | 'order' | 'smug' | 'annoyed';

/** One `DIALOG_BOX` or `AGENT_TAUNT` line as the corner dialog box needs it. */
export interface DialogLine {
  speaker: string;
  name: string;
  /** procgen model id drawn as the avatar. */
  model: string;
  text: string;
  /** How long the box stays after the text is shown, in ms. */
  holdMs: number;
  mood?: DialogMood;
  priority?: DialogPriority;
}

export interface DialogBoxOptions {
  onOpen?: (line: DialogLine, side: 'left' | 'right') => void;
  onClose?: () => void;
  canStartLine?: (line: DialogLine, side: 'left' | 'right') => boolean;
}

export interface DialogBox {
  /** Queue a line; it shows at once when the box is idle and permitted. Never blocks input. */
  show(line: DialogLine): void;
  /** Drop the shown line and the whole queue immediately (level change). */
  clear(): void;
  /** Lines waiting, the shown one included. */
  pending(): number;
  /** Currently visible line, or null when closed. */
  activeLine(): DialogLine | null;
  /** Side currently occupied (`left` or `right`), or null when closed. */
  activeSide(): 'left' | 'right' | null;
  /** Shorten remaining hold time of the active line so it transitions out sooner. */
  shortenHold(maxRemainingMs: number): void;
  /** Drop queued lines on `side` and close immediately if the active line is on `side`. */
  dismissSide(side: 'left' | 'right'): void;
  /** Re-check whether a queued line can start now (e.g. after a blocking socket balloon closes). */
  wake(): void;
  /** Prune queued items using `pred`. */
  filterQueue(pred: (line: DialogLine) => boolean): void;
  /** Read-only snapshot of queued lines (not including the currently active line). */
  queuedLines(): readonly DialogLine[];
}

/** Avatar size in CSS px; the canvas is drawn at this size. */
const AVATAR_PX = 64;
/** Stepped comic entrance duration in ms. */
export const ENTER_MS = 220;
/** Stepped comic exit duration in ms before advancing or closing. */
export const EXIT_MS = 180;
/** Interval between stepped calm idle head animation frames. */
export const HEAD_FRAME_MS = 180;

export function cleanSpeakerId(speaker: string): string {
  return speaker.replace(/[^a-z0-9_-]/gi, '').toLowerCase() || 'unknown';
}

function sideForSpeaker(speaker: string): 'left' | 'right' {
  return cleanSpeakerId(speaker) === 'vibecoder' ? 'left' : 'right';
}

interface DialogView {
  parent: HTMLElement;
  root: HTMLElement;
  avatar: HTMLElement;
  name: HTMLElement;
  text: HTMLElement;
  drawPortrait: DrawPortrait;
  opts: DialogBoxOptions;
  queue: DialogLine[];
  holdTimer: number;
  enterTimer: number;
  exitTimer: number;
  headTimer: number;
  headFrame: number;
  holdDeadline: number;
  current: DialogLine | null;
  currentSide: 'left' | 'right' | null;
  usingHeroDrawer: boolean;
  phase: StateMachine<DialogPhase, DialogTransition>;
}

interface HeroDrawerEls {
  hud: HTMLElement;
  drawer: HTMLElement;
  name: HTMLElement;
  text: HTMLElement;
}

const MOOD_CLASSES = ['mood-laugh', 'mood-order', 'mood-smug', 'mood-annoyed'] as const;

function findHeroDrawer(parent: HTMLElement): HeroDrawerEls | null {
  const hud = parent.querySelector<HTMLElement>('#hero-hud');
  const drawer = hud?.querySelector<HTMLElement>('#hero-dialog-drawer');
  const name = hud?.querySelector<HTMLElement>('#hero-dialog-name');
  const text = hud?.querySelector<HTMLElement>('#hero-dialog-text');
  return hud && drawer && name && text ? { hud, drawer, name, text } : null;
}

function closeHeroDrawer(parent: HTMLElement): void {
  const hero = findHeroDrawer(parent);
  if (!hero) return;
  hero.hud.classList.remove('talking', 'open', 'entering', 'exiting', ...MOOD_CLASSES);
  hero.drawer.setAttribute('aria-hidden', 'true');
}

function placeRightTop(root: HTMLElement, parent: HTMLElement, side: 'left' | 'right'): void {
  if (side !== 'right') {
    root.style.top = '';
    return;
  }
  const hud = parent.querySelector('#hud') ?? parent.querySelector('#topbar');
  if (!hud || typeof hud.getBoundingClientRect !== 'function' || typeof parent.getBoundingClientRect !== 'function') {
    root.style.top = '';
    return;
  }
  const hb = hud.getBoundingClientRect();
  const pb = parent.getBoundingClientRect();
  root.style.top = hb.height > 0 && pb.height > 0 ? `${Math.max(68, Math.ceil(hb.bottom - pb.top + 8))}px` : '';
}

function stopTimers(v: DialogView): void {
  globalThis.clearTimeout(v.holdTimer);
  globalThis.clearTimeout(v.enterTimer);
  globalThis.clearTimeout(v.exitTimer);
  globalThis.clearInterval(v.headTimer);
  v.holdTimer = 0;
  v.enterTimer = 0;
  v.exitTimer = 0;
  v.headTimer = 0;
  v.holdDeadline = 0;
}

function closeView(v: DialogView): void {
  const wasOpen = v.current !== null;
  v.current = null;
  v.currentSide = null;
  v.usingHeroDrawer = false;
  v.phase.send('CLOSE');
  v.root.classList.remove('open', 'entering', 'exiting');
  v.root.setAttribute('aria-hidden', 'true');
  v.root.style.top = '';
  closeHeroDrawer(v.parent);
  if (wasOpen) v.opts.onClose?.();
}

function beginExit(v: DialogView): void {
  globalThis.clearTimeout(v.enterTimer);
  globalThis.clearTimeout(v.holdTimer);
  v.enterTimer = 0;
  v.holdTimer = 0;
  v.holdDeadline = 0;
  if (!v.current || !v.phase.send('EXIT')) return;
  const target = v.usingHeroDrawer ? findHeroDrawer(v.parent)?.hud ?? v.root : v.root;
  target.classList.remove('entering');
  target.classList.add('exiting');
  v.exitTimer = globalThis.setTimeout(() => {
    v.exitTimer = 0;
    advanceQueue(v);
  }, EXIT_MS);
}

function speakerDisplayName(line: DialogLine): string {
  return cleanSpeakerId(line.speaker) === 'vibecoder' && (!line.name || line.name.toUpperCase() === 'DEV')
    ? 'VIBECODER'
    : line.name;
}

function showInHeroDrawer(v: DialogView, hero: HeroDrawerEls, line: DialogLine): void {
  v.root.classList.remove('open', 'entering', 'exiting');
  v.root.setAttribute('aria-hidden', 'true');
  v.root.style.top = '';
  hero.name.textContent = speakerDisplayName(line);
  hero.text.textContent = line.text;
  hero.hud.classList.remove('exiting', 'entering', ...MOOD_CLASSES);
  if (line.mood) hero.hud.classList.add(`mood-${line.mood}`);
  replayClass(hero.drawer, 'drawer-step');
  hero.hud.classList.add('talking', 'open', 'entering');
  hero.drawer.setAttribute('aria-hidden', 'false');
}

function showInCornerBox(v: DialogView, line: DialogLine, side: 'left' | 'right'): void {
  closeHeroDrawer(v.parent);
  const cleanSpeaker = cleanSpeakerId(line.speaker);
  v.avatar.dataset.frame = '0';
  v.avatar.replaceChildren(v.drawPortrait(line.model, AVATAR_PX, 0));
  v.name.textContent = speakerDisplayName(line);
  v.text.textContent = line.text;
  const moodClass = line.mood ? ` mood-${line.mood}` : '';
  v.root.className = `dialog-box side-${side} speaker-${cleanSpeaker}${moodClass}`;
  v.root.dataset.side = side;
  v.root.dataset.speaker = cleanSpeaker;
  v.root.dataset.mood = line.mood ?? '';
  placeRightTop(v.root, v.parent, side);
  replayClass(v.root, 'open');
  v.root.classList.add('entering');
  v.root.setAttribute('aria-hidden', 'false');
  v.headTimer = globalThis.setInterval(() => {
    v.headFrame = (v.headFrame + 1) % PORTRAIT_FRAMES;
    v.avatar.dataset.frame = String(v.headFrame);
    v.avatar.replaceChildren(v.drawPortrait(line.model, AVATAR_PX, v.headFrame));
  }, HEAD_FRAME_MS);
}

function advanceQueue(v: DialogView): void {
  stopTimers(v);
  const idx = v.opts.canStartLine
    ? v.queue.findIndex((item) => v.opts.canStartLine!(item, sideForSpeaker(item.speaker)))
    : (v.queue.length ? 0 : -1);
  if (idx < 0) {
    closeView(v);
    return;
  }
  const line = v.queue.splice(idx, 1)[0]!;
  const side = sideForSpeaker(line.speaker);
  const hero = side === 'left' ? findHeroDrawer(v.parent) : null;
  v.current = line;
  v.currentSide = side;
  v.usingHeroDrawer = hero !== null;
  v.phase.send('START');
  v.headFrame = 0;

  if (hero) showInHeroDrawer(v, hero, line);
  else showInCornerBox(v, line, side);
  v.opts.onOpen?.(line, side);

  v.enterTimer = globalThis.setTimeout(() => {
    v.enterTimer = 0;
    v.phase.send('SETTLE');
    v.root.classList.remove('entering');
    findHeroDrawer(v.parent)?.hud.classList.remove('entering');
  }, ENTER_MS);

  const holdMs = Math.max(0, line.holdMs);
  v.holdDeadline = Date.now() + holdMs;
  v.holdTimer = globalThis.setTimeout(() => beginExit(v), holdMs);
}

/**
 * Side-docked comic dialog box: `vibecoder` docks left (`side-left`, avatar on the left); NPCs and
 * agents dock right (`side-right`, avatar on the right). Heads animate calmly across 4 idle poses,
 * and lines enter and exit with stepped comic animations. `pointer-events: none` keeps terminal input free.
 */
export function mountDialogBox(
  parent: HTMLElement,
  drawPortrait: DrawPortrait,
  opts: DialogBoxOptions = {},
): DialogBox {
  const avatar = el('div', 'dialog-avatar');
  const name = el('b', 'dialog-name');
  const text = el('p', 'dialog-text');
  const root = el('div', 'dialog-box', [avatar, el('div', 'dialog-body', [name, text])]);
  root.setAttribute('role', 'status');
  root.setAttribute('aria-live', 'polite');
  root.setAttribute('aria-hidden', 'true');
  parent.querySelector('.dialog-box')?.remove();
  parent.appendChild(root);

  const v: DialogView = {
    parent,
    root,
    avatar,
    name,
    text,
    drawPortrait,
    opts,
    queue: [],
    holdTimer: 0,
    enterTimer: 0,
    exitTimer: 0,
    headTimer: 0,
    headFrame: 0,
    holdDeadline: 0,
    current: null,
    currentSide: null,
    usingHeroDrawer: false,
    phase: createStateMachine({ initial: 'idle', transitions: DIALOG_TRANSITIONS }),
  };

  return {
    show(line) {
      v.queue.push(line);
      if (!v.current) advanceQueue(v);
    },
    clear() {
      v.queue.length = 0;
      stopTimers(v);
      closeView(v);
    },
    pending: () => v.queue.length + (v.current ? 1 : 0),
    activeLine: () => v.current,
    activeSide: () => v.currentSide,
    shortenHold(maxRemainingMs) {
      if (!v.current || v.phase.state === 'exiting' || v.phase.state === 'idle') return;
      const delay = Math.max(0, maxRemainingMs);
      const nextDeadline = Date.now() + delay;
      if (v.holdTimer && v.holdDeadline > 0 && nextDeadline >= v.holdDeadline) return;
      globalThis.clearTimeout(v.holdTimer);
      v.holdDeadline = nextDeadline;
      v.holdTimer = globalThis.setTimeout(() => beginExit(v), delay);
    },
    dismissSide(side) {
      for (let i = v.queue.length - 1; i >= 0; i--) {
        if (sideForSpeaker(v.queue[i]!.speaker) === side) v.queue.splice(i, 1);
      }
      if (v.current && v.currentSide === side) {
        stopTimers(v);
        if (v.queue.length > 0) advanceQueue(v);
        else closeView(v);
      }
    },
    wake() {
      if (!v.current && v.queue.length > 0) advanceQueue(v);
    },
    filterQueue(pred) {
      for (let i = v.queue.length - 1; i >= 0; i--) {
        if (!pred(v.queue[i]!)) v.queue.splice(i, 1);
      }
    },
    queuedLines: () => v.queue,
  };
}
