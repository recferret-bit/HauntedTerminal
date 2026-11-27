import type { GameSnapshot } from '../game/types.js';
import { matrixBoot } from '../ui/screen.js';
import type { Play } from './state.js';

/** Remember whether this run opens with the terminal already in hand. */
export function armOpeningTerminal(play: Play, hasTerm: boolean): void {
  play.termBooted = hasTerm;
}

/**
 * Play the visor sting when the terminal is already owned at the start of the run.
 * The tutorial gift plays `term_boot` from `ITEM_GIVEN` instead, so this stays quiet then.
 */
export function cueOpeningBoot(play: Play): boolean {
  if (!play.termBooted) return false;
  play.session.bus?.emit({ kind: 'cine', cue: 'boot' });
  return true;
}

/** Hide the panel until he has a terminal. The first time it appears, run the visor boot. */
export function syncTerminalPresence(play: Play, snap: GameSnapshot): void {
  if (play.editorMode) return;
  const has = snap.inventory.items.includes('terminal');
  const first = has && !play.shell.available && !play.termBooted && play.lifecycle.phase() === 'play';
  if (!first) {
    play.shell.setAvailable(has);
    return;
  }
  play.termBooted = true;
  play.shell.setAvailable(true, false);
  void matrixBoot(false);
}
