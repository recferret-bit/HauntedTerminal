import { publishKernel } from '../contracts/app-bus.js';
import { isChapterSession } from '../chapters/chapter-session.js';
import type { LabConfig } from '../chapters/session-lab-types.js';
import type { ChapterManifest } from '../chapters/types.js';
import type { Session } from '../game/session.js';
import type { GameSnapshot } from '../game/types.js';
import { resetScreen } from '../ui/screen.js';
import { mountPlayAudio, syncPlayAudio } from './audio-sync.js';
import {
  FLOOR_NAMES,
  type Play,
  chapterBanner,
  type DebugGive,
  type SkipTutorial,
} from './state.js';

export interface SwapPlaySessionOptions {
  next: Session;
  manifest: ChapterManifest | undefined;
  terminalLab: LabConfig | null;
  emitFloorCard?: boolean;
  arrive?: boolean;
  resetShell?: boolean;
  focusTerminal?: boolean;
  soft?: boolean;
}

/**
 * Replaces the active session in place without reloading the iframe or rebuilding the WebGL stage.
 * Shared by Terminal Lab (`__lab.swap`) and Chapter Editor Stage Studio (`__stageEditor.swapDraft` / `syncDraftInPlace`).
 */
export function swapPlaySession(play: Play, opts: SwapPlaySessionOptions): GameSnapshot {
  const { next, manifest, terminalLab } = opts;
  const prevSnap = play.session.snapshot();
  const wasMuted = prevSnap.muted;
  const prevVol = prevSnap.volume;

  if (wasMuted !== next.snapshot().muted) next.toggleMute();
  if (prevVol !== undefined) next.setVolume(prevVol);

  window.clearTimeout(play.cardTimer);
  play.cardTimer = 0;
  window.clearTimeout(play.transitionTimer);
  play.transitionTimer = 0;
  play.deferredPostTransition.length = 0;
  play.stage.skipLevelTransition();
  play.stashedFloorCard = null;
  play.eventLog = [];
  play.execLog = [];
  play.execCount = 0;
  play.execTaunts = null;

  if (!opts.soft) {
    play.previewTutorialOverride = null;
    play.codeEditor?.close();
    play.manualBook?.close();
    play.tutorial.hide();
    play.hud?.hideStats();
    resetScreen();
  }

  play.session = next;
  play.terminalLab = terminalLab;
  mountPlayAudio(play);
  syncPlayAudio(play);
  play.activeBanner = chapterBanner(next, manifest);
  play.debugGive = (next as Session & { debugGive?: DebugGive }).debugGive?.bind(next);
  play.skipTutorial = (next as Session & { skipTutorial?: SkipTutorial }).skipTutorial?.bind(next);
  play.sessionSeq += 1;
  if (play.dom.mastheadSubEl) {
    play.dom.mastheadSubEl.textContent = manifest ? `${manifest.badge} // ${manifest.title}` : 'CLASSIC FLOORS';
  }

  play.events.emit({ kind: 'session-swapped' });
  next.skipIntro();
  play.lifecycle.resetForLabSwap(document.hidden);
  play.events.emit({ kind: 'sync-pause' });
  if (opts.resetShell !== false && !play.editorMode) {
    play.shell.reset(play.activeBanner);
  }

  const snap = next.snapshot();
  if (opts.emitFloorCard) {
    const card = {
      type: 'FLOOR_ENTERED' as const,
      floorId: snap.room?.floor ?? snap.floor,
      title: isChapterSession(next)
        ? `LEVEL ${String(next.getCurrentLevel().index).padStart(2, '0')} — ${next.getCurrentLevel().title.toUpperCase()}`
        : (FLOOR_NAMES[snap.floor] ?? `Floor ${snap.floor}`),
      path: snap.cwd,
    };
    play.events.emit({ kind: 'apply-events', events: [card], snap });
    publishKernel(next.bus, [card]);
  } else {
    play.events.emit({ kind: 'apply-events', events: [], snap });
  }

  window.clearTimeout(play.cardTimer);
  play.cardTimer = 0;
  play.lifecycle.deleteReason('card');
  if (opts.arrive && isChapterSession(next)) {
    play.events.emit({ kind: 'apply-tick', res: next.arriveLevel() });
  }
  play.events.emit({ kind: 'sync-pause' });
  if (opts.focusTerminal && !play.editorMode) play.shell.focus();
  return play.session.snapshot();
}
