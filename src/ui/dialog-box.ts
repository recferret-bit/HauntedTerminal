import { el, PORTRAIT_FRAMES, replayClass, type DrawPortrait } from './dom-lite.js';

/** One `DIALOG_BOX` event as the box needs it. */
export interface DialogLine {
  speaker: string;
  name: string;
  /** procgen model id drawn as the avatar. */
  model: string;
  text: string;
  /** How long the box stays after the text is shown, in ms. */
  holdMs: number;
}

export interface DialogBox {
  /** Queue a line; it shows at once when the box is idle. Never blocks input. */
  show(line: DialogLine): void;
  /** Drop the shown line and the whole queue immediately (level change). */
  clear(): void;
  /** Lines waiting, the shown one included. */
  pending(): number;
}

/** Avatar size in CSS px; the canvas is drawn at this size. */
const AVATAR_PX = 64;
/** Stepped comic entrance duration in ms. */
export const ENTER_MS = 220;
/** Stepped comic exit duration in ms before advancing or closing. */
export const EXIT_MS = 180;
/** Interval between stepped head animation frames (10 fps). */
export const HEAD_FRAME_MS = 100;

/**
 * Side-docked comic dialog box: `vibecoder` docks left (`side-left`, avatar on the left); NPCs and
 * agents dock right (`side-right`, avatar on the right). Heads animate across 4 stepped poses, and
 * lines enter and exit with stepped comic animations. `pointer-events: none` keeps terminal input free.
 */
export function mountDialogBox(parent: HTMLElement, drawPortrait: DrawPortrait): DialogBox {
  const avatar = el('div', 'dialog-avatar');
  const name = el('b', 'dialog-name');
  const text = el('p', 'dialog-text');
  const root = el('div', 'dialog-box', [avatar, el('div', 'dialog-body', [name, text])]);
  root.setAttribute('role', 'status');
  root.setAttribute('aria-live', 'polite');
  root.setAttribute('aria-hidden', 'true');
  parent.querySelector('.dialog-box')?.remove();
  parent.appendChild(root);

  const queue: DialogLine[] = [];
  let holdTimer = 0;
  let enterTimer = 0;
  let exitTimer = 0;
  let headTimer = 0;
  let headFrame = 0;
  let showing = false;

  const stopTimers = (): void => {
    globalThis.clearTimeout(holdTimer);
    globalThis.clearTimeout(enterTimer);
    globalThis.clearTimeout(exitTimer);
    globalThis.clearInterval(headTimer);
    holdTimer = 0;
    enterTimer = 0;
    exitTimer = 0;
    headTimer = 0;
  };

  const close = (): void => {
    showing = false;
    root.classList.remove('open', 'entering', 'exiting');
    root.setAttribute('aria-hidden', 'true');
    root.style.top = '';
  };

  const placeRightTop = (side: 'left' | 'right'): void => {
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
    if (hb.height > 0 && pb.height > 0) {
      root.style.top = `${Math.max(68, Math.ceil(hb.bottom - pb.top + 8))}px`;
    } else {
      root.style.top = '';
    }
  };

  const beginExit = (): void => {
    globalThis.clearTimeout(enterTimer);
    enterTimer = 0;
    holdTimer = 0;
    root.classList.remove('entering');
    root.classList.add('exiting');
    exitTimer = globalThis.setTimeout(() => {
      exitTimer = 0;
      next();
    }, EXIT_MS);
  };

  const next = (): void => {
    stopTimers();
    const line = queue.shift();
    if (!line) {
      close();
      return;
    }
    showing = true;
    headFrame = 0;
    const cleanSpeaker = line.speaker.replace(/[^a-z0-9_-]/gi, '').toLowerCase() || 'unknown';
    const side: 'left' | 'right' = cleanSpeaker === 'vibecoder' ? 'left' : 'right';

    avatar.dataset.frame = '0';
    avatar.replaceChildren(drawPortrait(line.model, AVATAR_PX, 0));
    name.textContent = line.name;
    text.textContent = line.text;

    root.className = `dialog-box side-${side} speaker-${cleanSpeaker}`;
    root.dataset.side = side;
    root.dataset.speaker = cleanSpeaker;
    placeRightTop(side);
    replayClass(root, 'open');
    root.classList.add('entering');
    root.setAttribute('aria-hidden', 'false');

    enterTimer = globalThis.setTimeout(() => {
      enterTimer = 0;
      root.classList.remove('entering');
    }, ENTER_MS);

    headTimer = globalThis.setInterval(() => {
      headFrame = (headFrame + 1) % PORTRAIT_FRAMES;
      avatar.dataset.frame = String(headFrame);
      avatar.replaceChildren(drawPortrait(line.model, AVATAR_PX, headFrame));
    }, HEAD_FRAME_MS);

    holdTimer = globalThis.setTimeout(beginExit, Math.max(0, line.holdMs));
  };

  return {
    show(line) {
      queue.push(line);
      if (!showing) next();
    },
    clear() {
      queue.length = 0;
      stopTimers();
      close();
    },
    pending: () => queue.length + (showing ? 1 : 0),
  };
}
