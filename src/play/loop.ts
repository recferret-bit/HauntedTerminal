import type { KernelEvent } from '../contracts/events.js';
import type { GameSnapshot, TickResult } from '../game/types.js';
import { colourise } from '../ui/terminal.js';
import { mountTutorial, taunt } from '../ui/tutorial.js';
import { CARD_MS, type Play } from './state.js';

const EVENT_LOG_CAP = 400;

function syncPause(play: Play): void {
  play.session.setPaused(play.reasons.size > 0);
  const blocking = [...play.reasons].some((r) => r !== 'hidden');
  play.shell.setBlocked(blocking);
  play.hud?.update(play.session.snapshot());
}

function paint(play: Play, snap: GameSnapshot): void {
  play.hud?.update(snap);
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

/** The single sink for everything the session returns: stage FX, HUD reactions, flow, then the room. */
/** `printed`: the text the session already printed with these events (taunts it contains are not repeated). */
function applyEvents(play: Play, events: KernelEvent[], snap: GameSnapshot, printed = ''): void {
  play.eventLog.push(...events);
  if (play.eventLog.length > EVENT_LOG_CAP) play.eventLog.splice(0, play.eventLog.length - EVENT_LOG_CAP);
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
      case 'FLOOR_ENTERED':
        if (play.phase === 'play') holdForCard(play);
        break;
      case 'AGENT_TAUNT':
        if (printed.includes(ev.text)) break;
        if (play.execTaunts) play.execTaunts.push(taunt(ev));
        else play.shell.printAbove(taunt(ev));
        break;
      case 'TUTORIAL_STEP':
        play.tutorial.step(ev);
        break;
      case 'GAME_ENDED':
        play.beginEnding({ rank: ev.rank, timeSec: ev.timeSec, commands: ev.commands, shortcuts: snap.shortcuts });
        break;
      default:
        break;
    }
  }
  paint(play, snap);
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
  const skipTutorial = play.skipTutorial;
  play.tutorial = mountTutorial(
    play.dom.stageWrap,
    skipTutorial
      ? () => {
          if (play.phase !== 'play') return;
          const r = skipTutorial();
          if (r && 'snapshot' in r) {
            if (r.output) play.shell.printAbove(colourise(r.output, r.stderr));
            play.apply(r.events, r.snapshot, r.output);
          } else play.paint(r ?? play.session.snapshot());
        }
      : undefined,
  );
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
}
