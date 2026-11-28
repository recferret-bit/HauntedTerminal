import { installFullscreenKey, isFullscreen, onFullscreenChange, toggleFullscreen } from '../chapters/fullscreen.js';
import { queryMuted } from '../audio/page.js';
import type { TerminalSkinId } from '../contracts/terminal-skins.js';
import { mountEscMenu } from '../ui/esc-menu.js';
import { readSoundPref, writeSoundPref } from '../ui/sound-pref.js';
import { applySkin, initialSkin, writeSkinPref } from '../ui/terminal-skin.js';
import { colourise } from '../ui/terminal.js';
import { syncPlayAudio } from './audio-sync.js';
import { anyModalOpen, type Play } from './state.js';

/** Where "Back to main menu" goes (the chapter select page). */
const MAIN_MENU_URL = '/chapters.html';

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
  if (!play.lifecycle.canRestartFloor()) return;
  const res = play.session.restartFloor();
  play.shell.printAbove(colourise(res.output));
  play.events.emit({ kind: 'apply-events', events: res.events, snap: res.snapshot });
}

/**
 * Puts `id` on the terminal window (from the Esc menu or a `skin <id>` command) and keeps it for the next visit,
 * except in a preview or a lab, which record nothing (spec .kiro/specs/terminal-skins/ Req 7).
 */
function setPlaySkin(play: Play, id: TerminalSkinId): void {
  play.skin = id;
  applySkin(document.getElementById('terminal-bezel'), id);
  if (!play.preview && !play.terminalLab) writeSkinPref(id);
  play.menu?.update(play.session.snapshot());
}

/** The Esc menu: mounted once on body to cover stage and terminal, opened by Esc (capture phase). */
export function mountPlayMenu(play: Play): void {
  const menu = mountEscMenu(document.body, {
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
    onRestartLevel: () => play.events.emit({ kind: 'floor-restart' }),
    onLeave: () => window.location.assign(MAIN_MENU_URL),
    onFullscreen: () => void toggleFullscreen(),
    isFullscreen,
    onSkin: (id) => setPlaySkin(play, id),
    currentSkin: () => play.skin,
  });
  play.menu = menu;
  applySavedSound(play);
  play.skin = initialSkin();
  applySkin(document.getElementById('terminal-bezel'), play.skin);
  installFullscreenKey();
  onFullscreenChange(() => menu.update(play.session.snapshot()));

  play.events.subscribe((ev) => {
    if (ev.kind === 'skin-change') setPlaySkin(play, ev.id);
    else if (ev.kind === 'floor-restart') restartLevel(play);
  });

  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.repeat) return;
    if (play.shell?.isVimOpen?.()) return;
    if (play.laptopOverlay) {
      e.preventDefault();
      e.stopPropagation();
      play.events.emit({ kind: 'modal', modal: 'laptop', action: 'close' });
      return;
    }
    if (menu.isOpen()) {
      e.preventDefault();
      e.stopPropagation();
      play.events.emit({ kind: 'modal', modal: 'menu', action: 'close' });
      return;
    }
    const statsOpen = play.dom.statsEl.classList.contains('open');
    if (!play.lifecycle.canOpenEscMenu(statsOpen) || anyModalOpen(play, ['menu'])) return;
    e.preventDefault();
    e.stopPropagation();
    play.events.emit({ kind: 'modal', modal: 'menu', action: 'open' });
  }, true);
}
