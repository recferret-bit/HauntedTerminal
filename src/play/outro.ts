import { findComixByRole, playComix } from '../cinematic/index.js';
import { isChapterSession } from '../chapters/chapter-session.js';
import type { GameSnapshot } from '../game/types.js';
import type { EndStats } from '../ui/hud.js';
import { powerOff, powerOn, setCinematic } from '../ui/screen.js';
import { BANNER_MS, CARD_MS, FLOOR_NAMES, type Play } from './state.js';

const nextTask = () => new Promise<void>((r) => window.setTimeout(r, 0));

export function statsFrom(snap: GameSnapshot): EndStats {
  return {
    rank: snap.rank ?? 'C',
    timeSec: snap.timeSec,
    commands: snap.commands,
    shortcuts: snap.shortcuts,
  };
}

/** Run a cinematic in the overlay host. Starts on the next task so the click/Enter that caused it cannot skip it. */
/** Fullscreen: the terminal is dark while it runs; the caller powers it back on. */
async function runOverlay<T>(play: Play, show: () => Promise<T>): Promise<T | undefined> {
  play.shell.blur();
  setCinematic(true);
  play.dom.cineEl.classList.add('active');
  await nextTask();
  try {
    return await show();
  } catch (err) {
    console.error('cinematic failed', err);
    return undefined;
  } finally {
    play.dom.cineEl.classList.remove('active');
    setCinematic(false);
  }
}

function beginEnding(play: Play, stats: EndStats | null): void {
  if (play.endingStarted) return;
  play.endingStarted = true;
  play.reasons.add('ended');
  play.syncPause();
  const final = stats ?? statsFrom(play.session.snapshot());
  // Let the last line and its FX land before the curtain.
  window.setTimeout(async () => {
    play.phase = 'outro';
    play.reasons.add('outro');
    play.syncPause();
    play.tutorial.hide();
    await powerOff();
    const ending = findComixByRole('ending');
    if (ending) {
      await play.runCinematic(() => playComix(ending.id, play.dom.cineEl, { muted: play.session.snapshot().muted }, final));
    }
    play.phase = 'stats';
    play.hud?.showStats(final, play.skipIntroPref);
    await powerOn(true);
    play.reasons.delete('outro');
    play.syncPause();
  }, 900);
}

/** Opening comix (unless skipped) then the opening floor. Used at boot and by Play Again. */
async function startRun(play: Play): Promise<void> {
  const session = play.session;
  play.phase = 'intro';
  play.reasons.add('intro');
  play.syncPause();
  // If the opening comix reached its own floor title card overlay, suppress the stage's duplicate card.
  const opening = findComixByRole('opening');
  const res = !play.skipIntroPref && opening
    ? await play.runCinematic(() => playComix(opening.id, play.dom.cineEl, { muted: session.snapshot().muted }))
    : undefined;
  const introShowedCard = Boolean(res?.showedOverlay);
  if (!isChapterSession(session)) session.skipIntro();
  play.phase = 'play';
  // Input stays blocked (and the clock stopped) through the reveal: stage drops in, CRT powers on, banner types.
  play.reasons.delete('intro');
  play.reasons.add('reveal');
  play.syncPause();
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
  play.stashedFloorCard = null;
  play.stage.triggerLightningIntro();
  play.apply(introShowedCard ? [] : [card], snap);
  await powerOn(true);
  await play.shell.typeOut(play.activeBanner, BANNER_MS);
  if (isChapterSession(session)) {
    const cardRemaining = introShowedCard ? 0 : Math.max(0, CARD_MS + 40 - (performance.now() - revealStartedAt));
    if (cardRemaining > 0) await new Promise<void>((r) => window.setTimeout(r, cardRemaining));
    play.applyTick(session.arriveLevel());
  }
  play.reasons.delete('reveal');
  play.syncPause();
  play.shell.focus();
}

export function wirePlayOutro(play: Play): void {
  play.runCinematic = (show) => runOverlay(play, show);
  play.beginEnding = (stats) => beginEnding(play, stats);
  play.startRun = () => startRun(play);
}
