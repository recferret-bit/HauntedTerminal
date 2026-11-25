import { forwardSteamAchievement } from '../chapters/steam-bridge.js';
import type { KernelEvent } from '../contracts/events.js';
import type { GameSnapshot, TickResult } from '../game/types.js';
import { setHudHidden } from '../ui/screen.js';
import { colourise } from '../ui/terminal.js';
import { openManualModal } from './input.js';
import { exposeLabHooks } from './lab.js';
import { mountTutorial, taunt } from '../ui/tutorial.js';
import { CARD_MS, type Play } from './state.js';

const EVENT_LOG_CAP = 400;

function syncPause(play: Play): void {
  play.session.setPaused(play.reasons.size > 0);
  const blocking = [...play.reasons].some((r) => r !== 'hidden') || Boolean(play.manualBook?.isOpen());
  play.shell.setBlocked(blocking);
  // A card, cinematic or the end of the run takes the screen: the Esc menu steps aside.
  if (play.menu?.isOpen() && [...play.reasons].some((r) => r !== 'hidden' && r !== 'intro')) play.menu.close();
  if (play.manualBook?.isOpen() && [...play.reasons].some((r) => r === 'cinematic' || r === 'outro' || r === 'ended')) {
    play.manualBook.close();
  }
  const hideHud =
    play.phase === 'boot' ||
    play.phase === 'intro' ||
    play.reasons.has('reveal') ||
    play.reasons.has('card') ||
    play.reasons.has('cinematic');
  setHudHidden(hideHud);
  play.hud?.update(play.session.snapshot());
}

function paint(play: Play, snap: GameSnapshot): void {
  play.hud?.update(snap);
  play.menu?.update(snap);
  play.tutorial.sync(play.phase === 'play' || play.phase === 'intro' ? (snap.tutorial ?? null) : null);
  play.dom.captionEl.textContent = snap.room.title;
  play.dom.captionEl.title = snap.cwd;
  try {
    play.stage.syncRoom(snap.room);
  } catch (err) {
    console.error(err);
  }
  if (snap.ended && !play.endingStarted && play.phase === 'play') play.beginEnding(null);
}

function holdForCard(play: Play): void {
  play.reasons.add('card');
  window.clearTimeout(play.cardTimer);
  play.cardTimer = window.setTimeout(() => {
    play.reasons.delete('card');
    play.syncPause();
  }, CARD_MS);
  play.syncPause();
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
let applySeq = 0;

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
 * `printed`: the text the session already printed with these events (taunts it contains are not repeated).
 */
function applyEvents(play: Play, events: KernelEvent[], snap: GameSnapshot, printed = ''): void {
  play.eventLog.push(...events);
  if (play.eventLog.length > EVENT_LOG_CAP) play.eventLog.splice(0, play.eventLog.length - EVENT_LOG_CAP);
  const seq = ++applySeq;
  const slices = enemySlices(events);
  const last = slices.length - 1;
  slices.forEach((slice, i) => {
    const run = (): void => applySlice(play, slice, snap, printed, i === last && seq === applySeq);
    if (i === 0) run();
    else globalThis.setTimeout(run, i * ENEMY_STAGGER_MS);
  });
}

function applySlice(play: Play, events: KernelEvent[], snap: GameSnapshot, printed: string, paintNow: boolean): void {
  for (const ev of events) {
    if (ev.type === 'FLOOR_ENTERED' && play.phase === 'intro') {
      play.stashedFloorCard = ev;
      continue;
    }
    forward(play, ev);
    switch (ev.type) {
      case 'PLAYER_DAMAGED':
        play.hud?.damage(ev.amount, ev.sourceName);
        break;
      case 'PICKUP_COLLECTED':
        play.hud?.pickup(ev.item, ev.label);
        break;
      case 'PLAYER_RESPAWNED':
        if (ev.from === 'ssd_backup') play.hud?.backupUsed(ev.hp);
        break;
      case 'DIALOG_BOX':
      case 'OBSTACLE_DIALOGUE_RENDERED':
      case 'PUZZLE_DOOR_RESOLVED':
      case 'ROOM_TRANSITION':
        play.dialogs?.handleEvent(ev);
        break;
      case 'FLOOR_ENTERED':
        play.dialogs?.handleEvent(ev);
        if (play.phase === 'play') holdForCard(play);
        break;
      case 'AGENT_TAUNT':
        play.dialogs?.handleEvent(ev);
        if (printed.includes(ev.text)) break;
        if (play.execTaunts) play.execTaunts.push(taunt(ev));
        else play.shell.printAbove(taunt(ev));
        break;
      case 'TUTORIAL_STEP':
        if (play.dialogs) play.dialogs.handleEvent(ev);
        else play.tutorial.step(ev);
        break;
      case 'GAME_ENDED':
        play.beginEnding({ rank: ev.rank, timeSec: ev.timeSec, commands: ev.commands, shortcuts: snap.shortcuts });
        break;
      case 'ACHIEVEMENT_UNLOCKED':
        play.hud?.achievement(ev);
        void forwardSteamAchievement(ev.steamApiName);
        break;
      case 'BATTLE_STARTED':
        play.dialogs?.handleEvent(ev);
        break;
      default:
        break;
    }
  }
  if (paintNow) paint(play, snap);
}

function applyTick(play: Play, res: TickResult): void {
  if (res.output) play.shell.printAbove(colourise(res.output, res.stderr));
  play.apply(res.events, res.snapshot, res.output);
}

export function wirePlayLoop(play: Play): void {
  play.syncPause = () => syncPause(play);
  play.paint = (snap) => paint(play, snap);
  play.apply = (events, snap, printed = '') => applyEvents(play, events, snap, printed);
  play.applyTick = (res) => applyTick(play, res);
  const tutHost = play.dom.stageWrap.querySelector<HTMLElement>('#titleblock') ?? play.dom.stageWrap;
  play.tutorial = mountTutorial(tutHost, () => {
    if (play.phase !== 'play' || !play.skipTutorial) return;
    const r = play.skipTutorial();
    if (r && 'snapshot' in r) {
      if (r.output) play.shell.printAbove(colourise(r.output, r.stderr));
      play.apply(r.events, r.snapshot, r.output);
    } else play.paint(r ?? play.session.snapshot());
  });
}

function exposePlayHooks(play: Play): void {
  // Automation hooks for headless playthroughs (.agents/harness). Keep them.
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
    open: () => play.menu?.open(play.session.snapshot()),
    close: () => play.menu?.close(),
    isOpen: () => play.menu?.isOpen() ?? false,
  };
  (window as unknown as { __manual?: unknown }).__manual = {
    isOpen: () => play.manualBook?.isOpen() ?? false,
    open: (queryOrPage?: string | number) => openManualModal(play, queryOrPage),
    close: () => play.manualBook?.close(),
  };
  (window as unknown as { __term?: unknown }).__term = {
    /** Exactly what Enter does: echo, run, print; queued while input is blocked. */
    submit: (line: string) => play.shell.submit(line),
    /** Raw keystrokes as xterm would deliver them (e.g. 'ca\t', '\x1b[A', '\r'). */
    input: (data: string) => play.shell.term.input(data, true),
    busy: () => play.shell.busy(),
    /** Print text above the prompt, as if a command had produced it. */
    print: (text: string) => play.shell.printAbove(text),
    /** Push a synthetic KernelEvent through the same sink as session results (stage + HUD + flow). */
    emit: (ev: KernelEvent) => play.apply([ev], play.session.snapshot()),
    phase: () => play.phase,
    paused: () => [...play.reasons],
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
    // The session ignores ticks while paused; still refresh the HUD clock.
    play.applyTick(play.session.tick());
  }, 1000);
  exposePlayHooks(play);
  exposeLabHooks(play);
}
