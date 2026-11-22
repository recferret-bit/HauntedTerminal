import { el, replayClass, type DrawPortrait } from './dom-lite.js';

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
  /** Drop the shown line and the whole queue (level change). */
  clear(): void;
  /** Lines waiting, the shown one included. */
  pending(): number;
}

/** Avatar size in CSS px; the canvas is drawn at this size. */
const AVATAR_PX = 64;

/**
 * The dialog box in the left corner of the screen: avatar canvas, speaker name, text. Lines queue and each one stays `holdMs`.
 * Classes: `dialog-box` (`open` while a line shows, `speaker-<id>`), `dialog-avatar`, `dialog-body`, `dialog-name`, `dialog-text`.
 * The box has `pointer-events: none` in CSS so it never takes a click or a key from the terminal.
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
  let timer = 0;
  let showing = false;

  const close = (): void => {
    showing = false;
    root.classList.remove('open');
    root.setAttribute('aria-hidden', 'true');
  };

  const next = (): void => {
    window.clearTimeout(timer);
    timer = 0;
    const line = queue.shift();
    if (!line) {
      close();
      return;
    }
    showing = true;
    avatar.replaceChildren(drawPortrait(line.model, AVATAR_PX));
    name.textContent = line.name;
    text.textContent = line.text;
    root.className = `dialog-box speaker-${line.speaker.replace(/[^a-z0-9_-]/gi, '')}`;
    replayClass(root, 'open');
    root.setAttribute('aria-hidden', 'false');
    timer = window.setTimeout(next, Math.max(0, line.holdMs));
  };

  return {
    show(line) {
      queue.push(line);
      if (!showing) next();
    },
    clear() {
      queue.length = 0;
      window.clearTimeout(timer);
      timer = 0;
      close();
    },
    pending: () => queue.length + (showing ? 1 : 0),
  };
}
