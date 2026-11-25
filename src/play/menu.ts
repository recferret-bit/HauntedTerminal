import { installFullscreenKey, isFullscreen, onFullscreenChange, toggleFullscreen } from '../chapters/fullscreen.js';
import { queryMuted } from '../audio/page.js';
import { syncPlayAudio } from './audio-sync.js';
import { mountEscMenu } from '../ui/esc-menu.js';
import { readSoundPref, writeSoundPref } from '../ui/sound-pref.js';
import { colourise } from '../ui/terminal.js';
import type { PauseReason, Play } from './state.js';

/** While one of these holds, Esc does nothing: a card, a cinematic or the end of the run owns the screen. */
const BLOCKERS: PauseReason[] = ['intro', 'card', 'outro', 'ended', 'cinematic', 'reveal'];

/** Where "Back to main menu" goes (the chapter select page). */
const MAIN_MENU_URL = '/chapters.html';

function blocked(play: Play): boolean {
  return play.phase !== 'play' || BLOCKERS.some((r) => play.reasons.has(r)) || play.dom.statsEl.classList.contains('open');
}

function saveSound(play: Play): void {
  const snap = play.session.snapshot();
  writeSoundPref({ muted: snap.muted, volume: snap.volume ?? 1 });
}

/** Applies the saved sound choice once, right after the session exists. */
function applySavedSound(play: Play): void {
  const pref = readSoundPref();
  if (pref) play.session.setVolume(pref.volume);
  const wantMuted = queryMuted() ? true : (pref?.muted ?? false);
  if (wantMuted !== play.session.snapshot().muted) play.session.toggleMute();
  play.hud?.update(play.session.snapshot());
}

function restartLevel(play: Play): void {
  if (play.phase !== 'play' || play.reasons.has('card')) return;
  const res = play.session.restartFloor();
  play.shell.printAbove(colourise(res.output));
  play.apply(res.events, res.snapshot);
}

/** The Esc menu: mounted once, opened by Esc (capture phase, so xterm and the page never see that key). */
export function mountPlayMenu(play: Play): void {
  const menu = mountEscMenu(play.dom.stageWrap, {
    onMute: () => {
      play.session.toggleMute();
      saveSound(play);
      play.hud?.update(play.session.snapshot());
    },
    onVolume: (volume) => {
      play.session.setVolume(volume);
      saveSound(play);
    },
    onMove: () => play.session.bus?.emit({ kind: 'menu', action: 'move' }),
    onOpen: () => syncPlayAudio(play),
    onClose: () => syncPlayAudio(play),
    onRestartLevel: () => {
      restartLevel(play);
    },
    onLeave: () => window.location.assign(MAIN_MENU_URL),
    onFullscreen: () => void toggleFullscreen(),
    isFullscreen,
  });
  play.menu = menu;
  applySavedSound(play);
  // F11 and the menu toggle share one helper; the label follows every change (F11, browser Esc, the OS).
  installFullscreenKey();
  onFullscreenChange(() => menu.update(play.session.snapshot()));

  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.repeat) return;
    if (menu.isOpen()) {
      e.preventDefault();
      e.stopPropagation();
      menu.close();
      return;
    }
    // The code editor, field manual and native hint dialog handle Esc themselves; leave the key to them.
    if (blocked(play) || play.codeEditor?.isOpen() || play.manualBook?.isOpen() || play.hintDialog?.isOpen()) return;
    e.preventDefault();
    e.stopPropagation();
    menu.open(play.session.snapshot());
  }, true);
}
