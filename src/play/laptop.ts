/**
 * The in-game laptop overlay (specs .kiro/specs/play-laptop-overlay/ and .kiro/specs/laptop-rework/):
 * the Laptop Lab's CSS 3D laptop (`mountLaptop`: model, lifecycle, desktop, apps, tasks, sounds)
 * floating transparently over `/play` (the stage and terminal stay visible behind it, while `/laptop-lab`
 * keeps its comic-panel stage). Auto-opens the lid on launch so the physical Power button is ready right
 * away; on close, quickly folds the lid shut (`220ms`) and hides the book with the same fast `160ms`
 * motion used when it appears. Never holds the battle turn timer.
 */
import '../styles/laptop.css';
import '../styles/play-laptop.css';
import { dom } from '../contracts/dom.js';
import { laptopHear } from '../laptop/app-bus.js';
import { mountLaptop, type LaptopHandle } from '../laptop/ui/laptop.js';
import { closeOtherModals, type Play } from './state.js';

/** In-game task progress; the Laptop Lab keeps its own (`credits.laptop.progress`). */
const PLAY_LAPTOP_PROGRESS_KEY = 'out-of-credits:laptop-progress:v1';
const BOOK_IO_MS = 160;
const CLOSE_LID_MS = 220;

const isInsideLaptopOrClose = (target: EventTarget | null): boolean =>
  target instanceof Element && Boolean(target.closest('.lt-deck, .laptop-overlay-close'));

const isReducedMotion = (): boolean =>
  typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

function createCloser(
  play: Play,
  root: HTMLElement,
  lt: LaptopHandle,
  onState: (next: string) => void,
  onClose: () => void,
): (immediate?: boolean) => void {
  let closing = false;
  let timer = 0;

  const finish = (): void => {
    window.clearTimeout(timer);
    play.laptopOverlay = null;
    lt.dispose();
    root.remove();
    onClose();
  };

  const hideBook = (): void => {
    onState('closed');
    lt.view.show('closed');
    root.classList.add('is-hiding');
    timer = window.setTimeout(finish, BOOK_IO_MS);
  };

  return (immediate = false): void => {
    if (immediate || isReducedMotion()) {
      finish();
      return;
    }
    if (closing) return;
    closing = true;
    root.classList.add('is-closing');
    const wasShut = lt.machine.state === 'closed';
    lt.machine.dispose();
    lt.view.boot.stop();
    lt.ctx.sound.note('fan-off');
    lt.view.led('power', 'off');
    lt.view.led('disk', 'off');
    if (wasShut) {
      hideBook();
      return;
    }
    lt.ctx.sound.note('close');
    for (const key of ['--t-closing', '--t-diving', '--t-surfacing']) {
      lt.view.el.style.setProperty(key, `${CLOSE_LID_MS}ms`);
    }
    onState('closing');
    lt.view.show('closing');
    timer = window.setTimeout(hideBook, CLOSE_LID_MS);
  };
}

export function isLaptopOpen(play: Play): boolean {
  return Boolean(play.laptopOverlay);
}

/** Opens the floating laptop overlay if he carries it and a modal may open now. `onClose` runs after it closes. */
export function openLaptop(play: Play, onClose: () => void): void {
  if (play.laptopOverlay || play.lifecycle.phase() !== 'play' || !play.lifecycle.canOpenManualOrMap()) return;
  const snap = play.session.snapshot();
  if (!snap.inventory.items.includes('laptop')) return;
  closeOtherModals(play, 'laptop');
  const panel = dom('div', { class: 'laptop-overlay-panel' });
  const closeBtn = dom('button', { class: 'laptop-overlay-close', type: 'button', 'aria-label': 'Close the laptop' }, ['CLOSE [Esc]']);
  const root = dom('div', { class: 'laptop-overlay', id: 'laptop-overlay', role: 'dialog', 'aria-label': 'Laptop' }, [panel, closeBtn]);
  document.body.appendChild(root);
  const bus = play.session.bus;
  const lt = mountLaptop(panel, {
    start: 'closed',
    speed: 1,
    muted: snap.muted,
    storageKey: play.preview || play.terminalLab ? null : PLAY_LAPTOP_PROGRESS_KEY,
    hear: bus ? laptopHear(bus) : undefined,
  });
  let currentState: string = lt.machine.state;
  lt.onState((next) => { currentState = next; });
  // Snap the closed rig transform and flush layout before opening so the 1.5s lid spring transition plays smoothly.
  lt.view.frame(false);
  lt.machine.send('OPEN');
  play.shell.blur();
  const close = createCloser(play, root, lt, (next) => { currentState = next; }, onClose);
  play.laptopOverlay = {
    state: () => currentState,
    close,
  };
  let downInside = false;
  root.addEventListener('pointerdown', (ev) => { downInside = isInsideLaptopOrClose(ev.target); }, true);
  root.addEventListener('click', (ev) => {
    const clickedInside = isInsideLaptopOrClose(ev.target);
    const shouldClose = !downInside && !clickedInside;
    downInside = false;
    if (shouldClose) {
      ev.stopPropagation();
      play.laptopOverlay?.close();
    }
  });
  closeBtn.onclick = (ev) => {
    ev.stopPropagation();
    play.laptopOverlay?.close();
  };
}

export function closeLaptop(play: Play): void {
  play.laptopOverlay?.close();
}
