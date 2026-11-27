import { findComixByRole, playComix } from '../cinematic/index.js';
import { isChapterSession } from '../chapters/chapter-session.js';
import { publishKernel } from '../contracts/app-bus.js';
import type { GameSnapshot } from '../game/types.js';
import type { EndStats } from '../ui/hud.js';
import { matrixBoot, powerOff, powerOn, resetScreen, setCinematic } from '../ui/screen.js';
import { holdForComix, syncPlayAudio } from './audio-sync.js';
import { BANNER_MS, CARD_MS, closeOtherModals, FLOOR_NAMES, type Play } from './state.js';
import { armOpeningTerminal, cueOpeningBoot } from './term-reveal.js';

const nextTask = () => new Promise<void>((r) => window.setTimeout(r, 0));
const FORM_TAG = /^(INPUT|TEXTAREA|SELECT)$/;

function parentFormHasFocus(): boolean {
  try {
    if (window.frameElement && window.parent !== window) {
      const active = window.parent.document.activeElement;
      return Boolean(active && FORM_TAG.test(active.tagName));
    }
  } catch {
    /* cross-origin */
  }
  return false;
}

export function statsFrom(snap: GameSnapshot): EndStats {
  return {
    rank: snap.rank ?? 'C',
    timeSec: snap.timeSec,
    commands: snap.commands,
    shortcuts: snap.shortcuts,
  };
}

/** Run a cinematic in the overlay host. Starts on the next task so the click/Enter that caused it cannot skip it. */
export async function runOverlay<T>(play: Play, show: () => Promise<T>): Promise<T | undefined> {
  play.shell.blur();
  setCinematic(true);
  play.holdMusic = true;
  play.dom.cineEl.classList.add('active');
  await nextTask();
  try {
    return await show();
  } catch (err) {
    console.error('cinematic failed', err);
    return undefined;
  } finally {
    play.holdMusic = false;
    play.dom.cineEl.classList.remove('active');
    setCinematic(false);
  }
}

function beginEnding(play: Play, stats: EndStats | null): void {
  if (!play.lifecycle.beginEndingHold()) return;
  const seq = play.sessionSeq;
  closeOtherModals(play);
  play.codeEditor?.close();
  play.events.emit({ kind: 'sync-pause' });
  const final = stats ?? statsFrom(play.session.snapshot());
  // Let the last line and its FX land before the curtain.
  window.setTimeout(async () => {
    if (play.sessionSeq !== seq) return;
    play.lifecycle.send('BEGIN_ENDING');
    play.lifecycle.addReason('outro');
    play.events.emit({ kind: 'sync-pause' });
    play.tutorial.hide();
    await powerOff();
    if (play.sessionSeq !== seq) return;
    const ending = findComixByRole('ending');
    if (ending) {
      await runOverlay(play, () => {
        holdForComix(play, 'ending');
        return playComix(ending.id, play.dom.cineEl, { muted: play.session.snapshot().muted, bus: play.session.bus }, final);
      });
      if (play.sessionSeq !== seq) return;
    }
    play.lifecycle.send('FINISH_OUTRO');
    play.hud?.showStats(final, play.skipIntroPref);
    await powerOn(true);
    if (play.sessionSeq !== seq) return;
    play.lifecycle.deleteReason('outro');
    play.events.emit({ kind: 'sync-pause' });
    syncPlayAudio(play);
  }, 900);
}

/** Opening comix (unless skipped) then the opening floor. Used at boot and by Play Again. */
async function startRun(play: Play): Promise<void> {
  const seq = play.sessionSeq;
  const session = play.session;
  play.lifecycle.send('ENTER_INTRO');
  play.lifecycle.addReason('intro');
  play.events.emit({ kind: 'sync-pause' });
  const opening = findComixByRole('opening');
  const res = !play.skipIntroPref && opening
    ? await runOverlay(play, () => {
        holdForComix(play, 'opening');
        return playComix(opening.id, play.dom.cineEl, { muted: session.snapshot().muted, bus: session.bus });
      })
    : undefined;
  if (play.sessionSeq !== seq) return;
  const introShowedCard = Boolean(res?.showedOverlay);
  if (!isChapterSession(session)) session.skipIntro();
  play.lifecycle.send('BEGIN_PLAY');
  play.lifecycle.deleteReason('intro');
  if (play.editorMode) {
    play.lifecycle.deleteReason('reveal');
    resetScreen();
    play.stage.resize();
    requestAnimationFrame(() => play.stage.resize());
    play.events.emit({ kind: 'apply-events', events: [], snap: session.snapshot() });
    if (isChapterSession(session)) {
      play.events.emit({ kind: 'apply-tick', res: session.arriveLevel() });
    }
    play.events.emit({ kind: 'sync-pause' });
    return;
  }
  play.lifecycle.addReason('reveal');
  play.events.emit({ kind: 'sync-pause' });
  const snap = session.snapshot();
  const card = play.stashedFloorCard ?? {
    type: 'FLOOR_ENTERED' as const,
    floorId: snap.room?.floor ?? snap.floor,
    title: isChapterSession(session)
      ? `LEVEL ${String(session.getCurrentLevel().index).padStart(2, '0')} — ${session.getCurrentLevel().title.toUpperCase()}`
      : (FLOOR_NAMES[snap.floor] ?? `Floor ${snap.floor}`),
    path: snap.cwd,
  };
  const revealStartedAt = performance.now();
  const hadStashedCard = play.stashedFloorCard !== null;
  play.stashedFloorCard = null;
  const hasTerm = snap.inventory.items.includes('terminal');
  armOpeningTerminal(play, hasTerm);
  play.stage.triggerLightningIntro();
  play.events.emit({ kind: 'apply-events', events: introShowedCard ? [] : [card], snap });
  if (!introShowedCard && !hadStashedCard) publishKernel(play.session.bus, [card]);
  if (cueOpeningBoot(play)) await matrixBoot(true);
  else await powerOn(true);
  if (play.sessionSeq !== seq) return;
  await play.shell.typeOut(play.activeBanner, BANNER_MS);
  if (play.sessionSeq !== seq) return;
  if (isChapterSession(session)) {
    const cardRemaining = introShowedCard ? 0 : Math.max(0, CARD_MS + 40 - (performance.now() - revealStartedAt));
    if (cardRemaining > 0) await new Promise<void>((r) => window.setTimeout(r, cardRemaining));
    if (play.sessionSeq !== seq) return;
    play.events.emit({ kind: 'apply-tick', res: session.arriveLevel() });
  }
  play.lifecycle.deleteReason('reveal');
  play.events.emit({ kind: 'sync-pause' });
  if (!parentFormHasFocus()) play.shell.focus();
}

export function wirePlayOutro(play: Play): void {
  play.events.subscribe((ev) => {
    if (ev.kind === 'ending-begin') beginEnding(play, ev.stats);
    else if (ev.kind === 'run-start') void startRun(play);
  });
}
