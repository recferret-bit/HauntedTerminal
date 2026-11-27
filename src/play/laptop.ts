/**
 * The in-game laptop overlay (spec .kiro/specs/play-laptop-overlay/): the Laptop Lab's own laptop
 * (`mountLaptop`: model, lifecycle, desktop, apps, tasks, sounds) shown full screen (over the stage and
 * the terminal) while the developer carries `laptop`. A fresh laptop per open, lid closed, disposed on close. It never
 * holds the battle turn timer.
 */
import '../styles/laptop.css';
import '../styles/play-laptop.css';
import { dom } from '../contracts/dom.js';
import { laptopHear } from '../laptop/app-bus.js';
import { mountLaptop } from '../laptop/ui/laptop.js';
import { closeOtherModals, type Play } from './state.js';

/** In-game task progress; the Laptop Lab keeps its own (`credits.laptop.progress`). */
const PLAY_LAPTOP_PROGRESS_KEY = 'out-of-credits:laptop-progress:v1';

export function isLaptopOpen(play: Play): boolean {
  return Boolean(play.laptopOverlay);
}

/** Opens the laptop full screen if he carries it and a modal may open now. `onClose` runs after it closes. */
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
  play.shell.blur();
  play.laptopOverlay = {
    state: () => lt.machine.state,
    close: () => {
      play.laptopOverlay = null;
      lt.dispose();
      root.remove();
      onClose();
    },
  };
  closeBtn.onclick = () => play.laptopOverlay?.close();
}

export function closeLaptop(play: Play): void {
  play.laptopOverlay?.close();
}
