import type { TerminalSkinId } from '../contracts/terminal-skins.js';
import type { KernelEvent } from '../contracts/events.js';
import { maxHpFor } from '../game/bestiary.js';
import { addVram, giveItem, hasItem, holdItem, ITEMS, starterInventory, type ItemId } from '../game/inventory.js';
import { setHold, skipIntro as endBattleIntro, type BattleHold } from '../game/battle.js';
import { runLine, type Host } from '../game/shell.js';
import type { CommandResult, FloorId, GameSnapshot, TickResult } from '../game/types.js';
import { evaluateBatchEvents, formatAchievementLines } from './achievements.js';
import { readMetagame, recordTelemetry } from './catalog.js';
import { fillPids } from './pids.js';
import type { LevelSpec } from './types.js';
import {
  applySkipTutorial,
  bullyingNote,
  completeOpeningBeats,
  emitLevelTaunt,
  hasOpeningGate,
  levelScript,
  openingActive,
  runTimed,
  syncScriptTriggers,
  syncTutorial,
} from './script.js';
import type { ChapterState, EditorOpenPayload } from './session-state.js';
import { afterCommand, battleSecond, enemyTurn, maybeBeginBattle } from './session-battle.js';
import { arriveCurrentLevel, levelBannerText, loadLevel, restartChapterLevel } from './session-level.js';
import { cmdHank } from './session-meta.js';
import { allWinRulesMet, refreshExitGates, syncValidatedCodeBugs } from './session-rules.js';
import { observe } from './session-lab-checks.js';
import { snapshot } from './session-snapshot.js';

export function applyInitialLoadout(g: ChapterState, startIdx: number): void {
    g.kiro.reset();
    g.inventory = starterInventory(g.pack.manifest.startItems);
    const perks = g.preview ? [] : readMetagame().activePerks;
    let bonusRam = perks.includes('perk-overclock-dimm') ? 16 : 0;
    let bonusSsd = perks.includes('perk-nvme-snapshot') ? 256 : 0;

    // Entering a late level directly: hold what the chapter's `grants` say earlier levels would have given.
    let core = '';
    for (const grant of g.pack.manifest.grants ?? []) {
      if (startIdx < grant.afterLevel) continue;
      bonusRam += grant.ram ?? 0;
      bonusSsd += grant.ssd ?? 0;
      if (grant.core) core = grant.core;
      for (const item of grant.items ?? []) g.inventory = giveItem(g.inventory, item);
      if (grant.vram) g.inventory = addVram(g.inventory, grant.vram);
    }
    // A grant that gives the tube transistor also puts it in his hand.
    if (hasItem(g.inventory, 'tube_transistor')) g.inventory = holdItem(g.inventory, 'tube_transistor');
    else if (g.inventory.held === null && hasItem(g.inventory, 'terminal')) g.inventory = holdItem(g.inventory, 'terminal');
    if (core) g.kiro.loadCore(core);

    g.ram = bonusRam;
    g.ssd = bonusSsd;
    g.hp = maxHpFor(g.ram);
  }

export function getCurrentLevel(g: ChapterState): LevelSpec {
    return g.rt.spec;
  }

export function getLevels(g: ChapterState): readonly LevelSpec[] {
    return g.levels;
  }

export function isChaosMode(g: ChapterState): boolean {
    return g.chaosMode;
  }

export function consumeEditorRequest(g: ChapterState): EditorOpenPayload | null {
    const req = g.pendingEditor;
    g.pendingEditor = null;
    return req;
  }

export function consumeManualRequest(g: ChapterState): string | null {
    const req = g.pendingManual;
    g.pendingManual = null;
    return req;
  }

export function consumeMapRequest(g: ChapterState): string | null {
    const req = g.pendingMap;
    g.pendingMap = null;
    return req;
  }

export function consumeSkinRequest(g: ChapterState): TerminalSkinId | null {
    const id = g.pendingSkin;
    g.pendingSkin = null;
    return id;
  }

export function jumpToLevel(g: ChapterState, levelIdOrIndex: string | number): TickResult {
    const events: KernelEvent[] = [];
    const rawIdx = typeof levelIdOrIndex === 'number'
      ? Math.max(0, Math.min(g.levels.length - 1, levelIdOrIndex - 1))
      : g.levels.findIndex((l) => l.id === levelIdOrIndex);
    const idx = rawIdx < 0 ? 0 : rawIdx;
    g.fullRun = false;
    g.ended = false;
    g.endedAt = null;
    g.intro = false;
    // A level he has already reached keeps the run he has (items, core, RAM, SSD, HP, VRAM, taken pickups); a level beyond it, or a
    // direct entry, starts from what the chapter's grants give.
    const revisit = idx <= g.reachedIdx;
    if (!revisit) applyInitialLoadout(g, idx);
    loadLevel(g, idx, false, events);
    // A return does not lock the terminal for the opening conversation again: it ends at once, as Skip Dialog would.
    const opening = revisit && openingActive(g) ? resolveOpeningTransition(g, events) : '';
    return { output: levelBannerText(g) + opening, events, snapshot: snapshot(g) };
  }

export function arriveLevel(g: ChapterState): TickResult {
    g.intro = false;
    return settle(g, (events) => arriveCurrentLevel(g, events));
  }

function syncWorldAndGates(g: ChapterState, events: KernelEvent[]): string {
  syncValidatedCodeBugs(g);
  g.rt.world.sync(events);
  refreshExitGates(g, events);
  return g.rt.world.drain() + syncScriptTriggers(g, events);
}

/** Completes the level's opening Vibecoder + Kiro dialog (`openingSec`), then starts the battle or emits the Big Four taunt. */
function resolveOpeningTransition(g: ChapterState, events: KernelEvent[]): string {
  if (g.rt.openingDone || !hasOpeningGate(g) || g.ended) return '';
  let out = completeOpeningBeats(g, events) + syncWorldAndGates(g, events);
  const mark = events.length;
  out += maybeBeginBattle(g, events);
  const battleBegan = events.slice(mark).some((e) => e.type === 'BATTLE_STARTED');
  if (!battleBegan) {
    out += emitLevelTaunt(g, events);
  }
  return out;
}
/** Copies every VIBECODER_ACTION with `failed: true` on a non-zero exit; a success leaves the events untouched. */
function markFailedActions(events: KernelEvent[], code: number | undefined): KernelEvent[] {
  if (!code) return events;
  return events.map((e) => (e.type === 'VIBECODER_ACTION' ? { ...e, failed: true } : e));
}

export function exec(g: ChapterState, host: Host, line: string): CommandResult {
    g.deadNow = false;
    g.reloadedNow = false;
    g.freeAction = false;
    g.deathText = '';
    const typed = fillPids(line, g.rt.pids).trim();
    g.commandCue = null;
    if (g.intro) g.intro = false;

    if (!typed) {
      return { output: '', events: [], snapshot: snapshot(g) };
    }
    if (g.ended) {
      if (typed === 'restart') {
        const r = restart(g);
        return { output: r.output, events: r.events, snapshot: r.snapshot };
      }
      if (!/[;&|<>]/.test(typed) && /^(?:achievements|ach|trophies|manual|map|man\s+achievements)(?:\s|$)/i.test(typed)) {
        const s = runLine(typed, host);
        return { output: s.output, stderr: s.stderr || undefined, code: s.code, events: s.events, snapshot: snapshot(g) };
      }
      return {
        output: 'Issue complete! Run `restart`, `achievements`, or open CHAPTERS to select another level.\n',
        events: [],
        snapshot: snapshot(g),
      };
    }

    const prevLevelIdx = g.levelIdx;
    const arrivalEvents: KernelEvent[] = [];
    const isSkipTutorialCmd = /^tutorial\s+(?:skip|off)$/i.test(typed);
    let arrivalOut = !g.rt.levelArrived ? arriveCurrentLevel(g, arrivalEvents) : '';
    if (!isSkipTutorialCmd && openingActive(g)) {
      arrivalOut += resolveOpeningTransition(g, arrivalEvents);
    }
    // A line sent during the battle intro ends it and is the player's first action (headless drivers; the play page skips on Enter itself).
    endBattleIntro(g.battle, arrivalEvents);

    g.commands += 1;
    g.rt.levelCommands += 1;
    const firstWord = typed.split(/\s+/)[0] ?? '';
    if (firstWord && !g.preview) recordTelemetry({ commands: [firstWord] });
    g.lastCmdStartedCrack = /(?:^|[;&|]\s*)kiro\s+(?:crack|decrypt)\b/i.test(typed);

    const step = runLine(typed, host);
    const actionEvents: KernelEvent[] = step.events.some((e) => e.type === 'VIBECODER_ACTION')
      ? markFailedActions(step.events, step.code)
      : markFailedActions([{ type: 'VIBECODER_ACTION', action: 'type', command: typed }, ...step.events], step.code);
    const events = [...arrivalEvents, ...actionEvents];
    let combinedOutput = arrivalOut + step.output;
    let combinedStderr = step.stderr;
    const levelChanged = g.levelIdx !== prevLevelIdx;

    if (g.reloadedNow) {
      // `restart-level` reloaded the level: the fresh level gets no world step and no enemy turn for this line.
    } else if (!g.deadNow && !g.ended && !levelChanged) {
      syncValidatedCodeBugs(g);
      g.rt.world.sync(events);
      refreshExitGates(g, events);
      const preTutorialNotes = g.rt.world.drain() + g.rt.completionNote;
      g.rt.completionNote = '';
      combinedOutput += preTutorialNotes;
      combinedOutput += syncScriptTriggers(g, events);
      combinedOutput += syncTutorial(g, events);
      combinedOutput += bullyingNote(g, allWinRulesMet(g), events);
      // Turn-based: the command was an action; the world answers with one step (an enemy turn in a battle).
      if (!g.freeAction) combinedOutput += afterCommand(g, events);
    } else if (!levelChanged && !g.freeAction) {
      afterCommand(g, events);
    }
    g.lastCmdStartedCrack = false;

    const worldNotes = g.rt.world.drain() + g.rt.completionNote;
    g.rt.completionNote = '';
    combinedOutput += worldNotes + (g.deathText || '');
    combinedStderr += g.deathText || '';
    const achEvents = evaluateBatchEvents(events, { preview: g.preview, lab: g.lab !== null });
    if (achEvents.length > 0) {
      events.push(...achEvents);
      combinedOutput += formatAchievementLines(achEvents);
    }
    if (typed) {
      const result = g.commandCue ?? (step.code ? 'fail' : 'ok');
      g.commandCue = null;
      g.bus.emit({ kind: 'command', result });
    }
    if (g.lab) observe(g, { line: typed, output: combinedOutput, code: step.code, eventTypes: events.map((e) => e.type) });

    return {
      output: combinedOutput,
      stderr: combinedStderr || undefined,
      code: step.code,
      events,
      snapshot: snapshot(g),
      clear: step.clear,
    };
  }

/** One real second: `script.timed` entries and the battle clock (intro, turn timer). Enemies never act in real time. */
export function tick(g: ChapterState): TickResult {
    if (g.paused || g.intro || g.ended || g.lab?.clock === 'manual') {
      return { output: '', events: [], snapshot: snapshot(g) };
    }
    return clockTick(g, (events) => battleSecond(g, events));
  }

/** One second of the level clock (`script.timed`), then `then` (the battle second, or a lab step), then the bookkeeping. */
export function clockTick(g: ChapterState, then: (events: KernelEvent[]) => string): TickResult {
    return settle(g, (events) => {
      let out = runTimed(g, events) + syncWorldAndGates(g, events) + then(events);
      if (openingActive(g) && g.rt.levelTicks >= (levelScript(g).openingSec ?? 0)) {
        out += resolveOpeningTransition(g, events);
        return out;
      }
      return out + maybeBeginBattle(g, events);
    });
  }

/** Runs a step outside a command line and turns it into a TickResult: death text, achievements, sfx, lab checks. */
function settle(g: ChapterState, step: (events: KernelEvent[]) => string): TickResult {
    g.deadNow = false;
    g.deathText = '';
    const events: KernelEvent[] = [];
    const body = step(events);
    const achEvents = evaluateBatchEvents(events, { preview: g.preview, lab: g.lab !== null });
    if (achEvents.length > 0) events.push(...achEvents);
    const output = body + (g.deathText || '') + formatAchievementLines(achEvents);
    if (g.lab) observe(g, { output, eventTypes: events.map((e) => e.type) });
    return { output, stderr: g.deathText || undefined, events, snapshot: snapshot(g) };
  }

/** Battle intro -> the player's first turn (Enter on the play page). Null when no intro plays. */
export function skipBattleIntro(g: ChapterState): TickResult | null {
    if (g.battle.phase !== 'intro') return null;
    return settle(g, (events) => {
      endBattleIntro(g.battle, events);
      return '';
    });
  }

/** Opening Vibecoder + Kiro conversation -> Big Four taunt / battle start (Skip Dialog button). Null when none is active. */
export function skipOpeningDialog(g: ChapterState): TickResult | null {
    if (!openingActive(g)) return null;
    g.intro = false;
    return settle(g, (events) => {
      const arr = !g.rt.levelArrived ? arriveCurrentLevel(g, events) : '';
      return arr + resolveOpeningTransition(g, events);
    });
  }

/** The player's turn ends now and the enemies act (the solver's timer runouts). Null outside a player turn. */
export function forceEnemyTurn(g: ChapterState): TickResult | null {
    if (g.paused || g.ended || g.battle.phase !== 'player') return null;
    return settle(g, (events) => enemyTurn(g, events, 'forced'));
  }

export function holdTurnTimer(g: ChapterState, hold: BattleHold, on: boolean): void {
    setHold(g.battle, hold, on);
  }

export function hint(g: ChapterState): string {
    const step = cmdHank(g, []);
    return step.stdout;
  }

export function toggleMute(g: ChapterState): boolean {
    g.muted = !g.muted;
    g.sfx.setMuted(g.muted);
    return g.muted;
  }

export function setVolume(g: ChapterState, volume: number): void {
    g.volume = Math.min(1, Math.max(0, Number.isFinite(volume) ? volume : 1));
    g.sfx.setVolume(g.volume);
  }

export function restart(g: ChapterState, options?: { intro?: boolean }): TickResult {
    const events: KernelEvent[] = [];
    g.kiro.reset();
    g.commands = 0;
    g.deaths = 0;
    g.startedAt = Date.now();
    g.pausedMs = 0;
    g.ended = false;
    g.endedAt = null;
    g.fullRun = true;
    g.seenPickups.clear();
    g.intro = Boolean(options?.intro);
    applyInitialLoadout(g, 0);
    loadLevel(g, 0, false, options?.intro ? [] : events);
    if (options?.intro) {
      return { output: '', events: [], snapshot: snapshot(g) };
    }
    return { output: levelBannerText(g), events, snapshot: snapshot(g) };
  }

export function restartFloor(g: ChapterState): TickResult {
  const events: KernelEvent[] = [];
  return { output: restartChapterLevel(g, events), events, snapshot: snapshot(g) };
}

export function debugTeleport(g: ChapterState, floor: FloorId): TickResult {
    return jumpToLevel(g, Math.min(g.levels.length, Math.max(1, floor)));
  }

export function debugHeal(g: ChapterState): GameSnapshot {
    g.hp = maxHpFor(g.ram);
    return snapshot(g);
  }

/** Dev panel: puts an item in the inventory (held when his hands are empty or it is the tube transistor). */
export function debugGrantItem(g: ChapterState, item: ItemId): TickResult {
    const had = hasItem(g.inventory, item);
    g.inventory = giveItem(g.inventory, item);
    if (!had && (item === 'tube_transistor' || g.inventory.held === null)) g.inventory = holdItem(g.inventory, item);
    const events: KernelEvent[] = had ? [] : [{ type: 'ITEM_GIVEN', item, model: ITEMS[item].model, held: g.inventory.held === item }];
    return { output: `\x1b[36m${had ? 'Already carrying' : 'Granted'} ${ITEMS[item].label} (dev panel).\x1b[0m`, events, snapshot: snapshot(g) };
  }

export function debugDamage(g: ChapterState, amount = 10): TickResult {
    const dmg = Math.max(1, Math.round(amount));
    g.hp = Math.max(0, g.hp - dmg);
    const events: KernelEvent[] = [
      { type: 'PLAYER_DAMAGED', amount: dmg, hpRemaining: g.hp, sourceName: 'dev_panel' },
    ];
    return { output: '', events, snapshot: snapshot(g) };
  }

export function skipTutorial(g: ChapterState): TickResult {
    return settle(g, (events) => applySkipTutorial(g, events));
  }

export function setPaused(g: ChapterState, paused: boolean): void {
    if (paused === g.paused) return;
    g.paused = paused;
    if (paused) {
      g.pausedAt = Date.now();
    } else if (g.pausedAt !== null) {
      g.pausedMs += Date.now() - g.pausedAt;
      g.pausedAt = null;
    }
  }

export function skipIntro(g: ChapterState): void {
    g.intro = false;
  }
