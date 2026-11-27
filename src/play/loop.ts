import { forwardSteamAchievement } from '../chapters/steam-bridge.js';
import type { KernelEvent } from '../contracts/events.js';
import type { GameSnapshot, TickResult } from '../game/types.js';
import { setHudHidden } from '../ui/screen.js';
import { colourise } from '../ui/terminal.js';
import { mountTutorial, taunt } from '../ui/tutorial.js';
import { syncPlayAudio } from './audio-sync.js';
import { exposeLabHooks } from './lab.js';
import { LEVEL_TRANSITION_MS, closeOtherModals, type Play } from './state.js';
import { syncTerminalPresence } from './term-reveal.js';

const EVENT_LOG_CAP = 400;

function syncPause(play: Play): void {
  const derived = play.lifecycle.derive({
    manualOpen: Boolean(play.manualBook?.isOpen()),
    mapOpen: Boolean(play.chapterMap?.isOpen()),
  });
  play.session.setPaused(derived.clockPaused);
  play.stage.stormPaused = derived.stormPaused;
  play.shell.setBlocked(derived.shellBlocked);
  // A card, cinematic or the end of the run takes the screen: overlays step aside.
  if (derived.closeOverlays) closeOtherModals(play, 'manual');
  if (derived.closeManual && play.manualBook?.isOpen()) {
    play.manualBook.close();
  }
  setHudHidden(derived.hideHud);
  play.hud?.update(play.session.snapshot());
}

function paint(play: Play, snap: GameSnapshot): void {
  // No terminal in his inventory (the tutorial start): no panel until it is given, then the visor boot.
  play.shell.setDialogLocked?.(Boolean(snap.openingDialog));
  syncTerminalPresence(play, snap);
  if (play.dom.manualBtnEl) {
    const hideManual = !snap.inventory?.items.includes('manual');
    play.dom.manualBtnEl.hidden = hideManual;
    play.dom.manualBtnEl.classList.toggle('hidden', hideManual);
  }
  play.hud?.update(snap);
  play.menu?.update(snap);
  play.hintDialog?.update(snap);
  play.chapterMap?.update(snap);
  const phase = play.lifecycle.phase();
  play.tutorial.sync(phase === 'play' || phase === 'intro' ? (snap.tutorial ?? null) : null);
  play.dom.captionEl.textContent = snap.room.title;
  play.dom.captionEl.title = snap.cwd;
  try {
    play.stage.syncRoom(snap.room);
  } catch (err) {
    console.error(err);
  }
  if (snap.ended && !play.lifecycle.isEndingStarted() && phase === 'play') {
    play.events.emit({ kind: 'ending-begin', stats: null });
  }
  syncPlayAudio(play);
}

/** Completes or skips an active level-exit comic transition and flushes any deferred arrival chatter. */
export function finishPlayLevelTransition(play: Play, skipStage = false): void {
  window.clearTimeout(play.transitionTimer);
  play.transitionTimer = 0;
  if (skipStage) play.stage.skipLevelTransition();
  const hadReason = play.lifecycle.hasReason('transition');
  if (hadReason) play.lifecycle.deleteReason('transition');
  const pending = play.deferredPostTransition.splice(0);
  for (const run of pending) run();
  if (hadReason || pending.length > 0) syncPause(play);
}

function holdForLevelTransition(play: Play): void {
  play.lifecycle.addReason('transition');
  window.clearTimeout(play.transitionTimer);
  play.transitionTimer = window.setTimeout(() => {
    finishPlayLevelTransition(play, false);
  }, LEVEL_TRANSITION_MS);
  syncPause(play);
}

function applyTutorialUi(play: Play, ev: Extract<KernelEvent, { type: 'TUTORIAL_STEP' }>, snap: GameSnapshot): void {
  if (play.dialogs) play.dialogs.handleEvent(ev);
  else play.tutorial.step(ev);
  if (ev.done && snap.tutorial === null) {
    play.dialogs?.clear();
    play.tutorial.hide();
  }
}

function forward(play: Play, ev: KernelEvent): void {
  try {
    play.stage.handleEvent(ev);
  } catch (err) {
    console.error(`stage.handleEvent(${ev.type})`, err);
  }
}

/** Delay between two enemies acting in one enemy turn (turn-based-battles Req 19). */
const ENEMY_STAGGER_MS = 400;

/** Cuts an enemy turn at its ENEMY_ACTING markers: the first slice holds everything up to the second enemy. */
function enemySlices(events: KernelEvent[]): KernelEvent[][] {
  const slices: KernelEvent[][] = [[]];
  let seen = 0;
  for (const ev of events) {
    if (ev.type === 'ENEMY_ACTING' && ++seen > 1) slices.push([]);
    slices[slices.length - 1]!.push(ev);
  }
  return slices;
}

/**
 * The single sink for everything the session returns: stage FX, HUD reactions, flow, then the room.
 * An enemy turn with several enemies plays one enemy every ENEMY_STAGGER_MS; the snapshot paints after the last,
 * unless a newer batch arrived meanwhile.
 */
function applyEvents(play: Play, events: KernelEvent[], snap: GameSnapshot, printed = ''): void {
  play.eventLog.push(...events);
  if (play.eventLog.length > EVENT_LOG_CAP) play.eventLog.splice(0, play.eventLog.length - EVENT_LOG_CAP);
  const isLevelExit = events.some((e) => e.type === 'FLOOR_CLEARED')
    && events.some((e) => e.type === 'FLOOR_ENTERED')
    && !play.stage.reducedMotion.on
    && play.lifecycle.phase() === 'play';
  if (!isLevelExit && events.some((e) => e.type === 'FLOOR_ENTERED') && play.lifecycle.hasReason('transition')) {
    finishPlayLevelTransition(play, true);
  }
  const seq = ++play.applySeq;
  const slices = enemySlices(events);
  const last = slices.length - 1;
  slices.forEach((slice, i) => {
    const run = (): void => applySlice(play, slice, snap, printed, i === last && seq === play.applySeq, isLevelExit);
    if (i === 0) run();
    else globalThis.setTimeout(run, i * ENEMY_STAGGER_MS);
  });
}

function applySlice(
  play: Play,
  events: KernelEvent[],
  snap: GameSnapshot,
  printed: string,
  paintNow: boolean,
  isLevelExit: boolean,
): void {
  let afterFloorEntered = false;
  for (const ev of events) {
    if (ev.type === 'FLOOR_ENTERED' && play.lifecycle.phase() === 'intro') {
      play.stashedFloorCard = ev;
      continue;
    }
    forward(play, ev);
    const runOrDefer = (fn: () => void): void => {
      if (isLevelExit && afterFloorEntered) play.deferredPostTransition.push(fn);
      else fn();
    };
    switch (ev.type) {
      case 'PLAYER_DAMAGED':
        play.hud?.damage(ev.amount, ev.sourceName);
        break;
      case 'PICKUP_COLLECTED':
        play.hud?.pickup(ev.item, ev.label);
        break;
      case 'ITEM_GIVEN':
        play.hud?.itemGiven?.(ev.item);
        break;
      case 'PLAYER_RESPAWNED':
        if (ev.from === 'ssd_backup') play.hud?.backupUsed(ev.hp);
        break;
      case 'DIALOG_BOX':
        runOrDefer(() => play.dialogs?.handleEvent(ev));
        break;
      case 'OBSTACLE_DIALOGUE_RENDERED':
      case 'PUZZLE_DOOR_RESOLVED':
      case 'ROOM_TRANSITION':
        play.dialogs?.handleEvent(ev);
        break;
      case 'FLOOR_ENTERED':
        afterFloorEntered = true;
        play.levelEntryCommands = snap.commands;
        play.dialogs?.handleEvent(ev);
        if (isLevelExit) holdForLevelTransition(play);
        break;
      case 'AGENT_TAUNT':
        runOrDefer(() => play.dialogs?.handleEvent(ev));
        if (printed.includes(ev.text)) break;
        if (play.execTaunts) play.execTaunts.push(taunt(ev));
        else play.shell.printAbove(taunt(ev));
        break;
      case 'TUTORIAL_STEP':
        runOrDefer(() => applyTutorialUi(play, ev, snap));
        break;
      case 'GAME_ENDED':
        play.events.emit({ kind: 'ending-begin', stats: { rank: ev.rank, timeSec: ev.timeSec, commands: ev.commands, shortcuts: snap.shortcuts } });
        break;
      case 'ACHIEVEMENT_UNLOCKED':
        play.hud?.achievement(ev);
        void forwardSteamAchievement(ev.steamApiName);
        break;
      case 'BATTLE_STARTED':
      case 'BATTLE_ENDED':
        runOrDefer(() => play.dialogs?.handleEvent(ev));
        break;
      default:
        break;
    }
  }
  if (paintNow) paint(play, snap);
}

function applyTick(play: Play, res: TickResult): void {
  if (res.output) play.shell.printAbove(colourise(res.output, res.stderr));
  applyEvents(play, res.events, res.snapshot, res.output);
}

export function wirePlayLoop(play: Play): void {
  play.events.subscribe((ev) => {
    switch (ev.kind) {
      case 'sync-pause':
        syncPause(play);
        break;
      case 'paint':
        paint(play, ev.snap);
        break;
      case 'apply-events':
        applyEvents(play, ev.events, ev.snap, ev.printed);
        break;
      case 'apply-tick':
        applyTick(play, ev.res);
        break;
      default:
        break;
    }
  });
  const tutHost = play.dom.stageWrap.querySelector<HTMLElement>('#titleblock') ?? play.dom.stageWrap;
  play.tutorial = mountTutorial(tutHost, () => {
    if (play.lifecycle.phase() !== 'play' || !play.skipTutorial) return;
    const r = play.skipTutorial();
    if (r && 'snapshot' in r) {
      if (r.output) play.shell.printAbove(colourise(r.output, r.stderr));
      applyEvents(play, r.events, r.snapshot, r.output);
    } else paint(play, r ?? play.session.snapshot());
  });
}

function emitHookKernelEvent(play: Play, ev: KernelEvent): void {
  applyEvents(play, [ev], play.session.snapshot());
  if (play.session.bus) {
    play.session.bus.emit({ kind: 'kernel', event: ev });
  }
}

function exposePlayHooks(play: Play): void {
  // Automation hooks for headless playthroughs. Keep them stable.
  (window as unknown as { __game?: unknown }).__game = {
    exec: (line: string) => play.session.exec(line),
    tick: () => play.session.tick(),
    snapshot: () => play.session.snapshot(),
    events: () => play.eventLog,
  };
  (window as unknown as { __editor?: unknown }).__editor = {
    isOpen: () => play.codeEditor?.isOpen() ?? false,
    close: () => play.codeEditor?.close(),
  };
  (window as unknown as { __menu?: unknown }).__menu = {
    open: () => play.events.emit({ kind: 'modal', modal: 'menu', action: 'open' }),
    close: () => play.events.emit({ kind: 'modal', modal: 'menu', action: 'close' }),
    isOpen: () => play.menu?.isOpen() ?? false,
  };
  (window as unknown as { __hint?: unknown }).__hint = {
    open: () => play.events.emit({ kind: 'modal', modal: 'hint', action: 'open' }),
    close: () => play.events.emit({ kind: 'modal', modal: 'hint', action: 'close' }),
    isOpen: () => play.hintDialog?.isOpen() ?? false,
  };
  (window as unknown as { __manual?: unknown }).__manual = {
    isOpen: () => play.manualBook?.isOpen() ?? false,
    open: (queryOrPage?: string | number) => play.events.emit({ kind: 'modal', modal: 'manual', action: 'open', query: queryOrPage }),
    close: () => play.events.emit({ kind: 'modal', modal: 'manual', action: 'close' }),
  };
  (window as unknown as { __map?: unknown }).__map = {
    isOpen: () => play.chapterMap?.isOpen() ?? false,
    open: (queryOrIndex?: string | number) => play.events.emit({ kind: 'modal', modal: 'map', action: 'open', query: queryOrIndex }),
    close: () => play.events.emit({ kind: 'modal', modal: 'map', action: 'close' }),
  };
  (window as unknown as { __laptopOverlay?: unknown }).__laptopOverlay = {
    isOpen: () => Boolean(play.laptopOverlay),
    /** The laptop's lifecycle state while open (`closed`, `opening`, `desktop`, ...), else null. */
    state: () => play.laptopOverlay?.state() ?? null,
    open: () => play.events.emit({ kind: 'modal', modal: 'laptop', action: 'open' }),
    close: () => play.events.emit({ kind: 'modal', modal: 'laptop', action: 'close' }),
  };
  (window as unknown as { __term?: unknown }).__term = {
    submit: (line: string) => play.shell.submit(line),
    input: (data: string) => play.shell.term.input(data, true),
    busy: () => play.shell.busy(),
    print: (text: string) => play.shell.printAbove(text),
    emit: (ev: KernelEvent) => emitHookKernelEvent(play, ev),
    phase: () => play.lifecycle.phase(),
    paused: () => [...play.lifecycle.reasons],
    statsOpen: () => play.dom.statsEl.classList.contains('open'),
    text: () => {
      const buf = play.shell.term.buffer.active;
      const lines: string[] = [];
      for (let i = 0; i < buf.length; i++) lines.push(buf.getLine(i)?.translateToString(true) ?? '');
      return lines.join('\n').trimEnd();
    },
  };
}

export function armPlayClock(play: Play): void {
  window.setInterval(() => {
    applyTick(play, play.session.tick());
  }, 1000);
  exposePlayHooks(play);
  exposeLabHooks(play);
}
