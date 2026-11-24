import type { KernelEvent } from '../contracts/events.js';
import { maxHpFor } from '../game/bestiary.js';
import { giveItem, hasItem, holdItem, starterInventory } from '../game/inventory.js';
import { runLine, type Host } from '../game/shell.js';
import { lookup, makeNode } from '../game/tree.js';
import type { CommandResult, FloorId, GameSnapshot, TickResult } from '../game/types.js';
import { evaluateBatchEvents, formatAchievementLines } from './achievements.js';
import { readMetagame, recordTelemetry } from './catalog.js';
import type { LevelSpec } from './types.js';
import { applySkipTutorial, bullyingNote, evalCond, levelScript, runTimed, syncTutorial } from './script.js';
import { ensureDirChain, type ChapterState, type EditorOpenPayload } from './session-state.js';
import { stepKiroCrack } from './session-kiro.js';
import { arriveCurrentLevel, levelBannerText, loadLevel, rebootLevel } from './session-level.js';
import { cmdHank } from './session-meta.js';
import { allWinRulesMet, playEventsSfx, refreshExitGates, syncValidatedCodeBugs } from './session-rules.js';
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
    }
    // A grant that gives the lantern also puts it in his hand.
    if (hasItem(g.inventory, 'lantern')) g.inventory = holdItem(g.inventory, 'lantern');
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

export function isTacticalMode(g: ChapterState): boolean {
    return g.tacticalMode;
  }

export function setTacticalMode(g: ChapterState, enabled: boolean): void {
    g.tacticalMode = enabled;
  }

export function isChaosMode(g: ChapterState): boolean {
    return g.chaosMode;
  }

export function consumeEditorRequest(g: ChapterState): EditorOpenPayload | null {
    const req = g.pendingEditor;
    g.pendingEditor = null;
    return req;
  }

export function jumpToLevel(g: ChapterState, levelIdOrIndex: string | number): TickResult {
    const events: KernelEvent[] = [];
    let idx = -1;
    if (typeof levelIdOrIndex === 'number') {
      idx = Math.max(0, Math.min(g.levels.length - 1, levelIdOrIndex - 1));
    } else {
      idx = g.levels.findIndex((l) => l.id === levelIdOrIndex);
    }
    if (idx < 0) idx = 0;
    g.fullRun = false;
    g.ended = false;
    g.endedAt = null;
    g.intro = false;
    applyInitialLoadout(g, idx);
    loadLevel(g, idx, false, events);
    const banner = levelBannerText(g);
    return { output: banner, events, snapshot: snapshot(g) };
  }

export function arriveLevel(g: ChapterState): TickResult {
    g.intro = false;
    const events: KernelEvent[] = [];
    const output = arriveCurrentLevel(g, events);
    playEventsSfx(g, events);
    return { output, events, snapshot: snapshot(g) };
  }

export function exec(g: ChapterState, host: Host, line: string): CommandResult {
    g.deadNow = false;
    g.deathText = '';
    const typed = line.trim();
    if (g.intro) g.intro = false;

    if (!typed) {
      return { output: '', events: [], snapshot: snapshot(g) };
    }
    if (g.ended) {
      if (typed === 'restart') {
        const r = restart(g);
        return { output: r.output, events: r.events, snapshot: r.snapshot };
      }
      if (!/[;&|<>]/.test(typed) && /^(?:achievements|ach|trophies|man\s+achievements)(?:\s|$)/i.test(typed)) {
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
    const arrivalOut = !g.rt.levelArrived ? arriveCurrentLevel(g, arrivalEvents) : '';

    g.commands += 1;
    g.rt.levelCommands += 1;
    const firstWord = typed.split(/\s+/)[0] ?? '';
    if (firstWord && !g.preview) recordTelemetry({ commands: [firstWord] });
    g.lastCmdStartedCrack = /(?:^|[;&|]\s*)kiro\s+(?:crack|decrypt|hack)\b/i.test(typed);

    const step = runLine(typed, host);
    const actionEvents: KernelEvent[] = step.events.some((e) => e.type === 'VIBECODER_ACTION')
      ? step.events
      : [{ type: 'VIBECODER_ACTION', action: 'type', command: typed }, ...step.events];
    const events = [...arrivalEvents, ...actionEvents];
    let combinedOutput = arrivalOut + step.output;
    let combinedStderr = step.stderr;
    const levelChanged = g.levelIdx !== prevLevelIdx;

    if (!g.deadNow && !g.ended && !levelChanged) {
      if (!g.lastCmdStartedCrack && !g.tacticalMode && g.kiro.activeCrack) {
        combinedOutput += stepKiroCrack(g, events);
      }
      syncValidatedCodeBugs(g);
      g.rt.world.sync(events);
      refreshExitGates(g, events);
      const preTutorialNotes = g.rt.world.drain() + g.rt.completionNote;
      g.rt.completionNote = '';
      combinedOutput += preTutorialNotes;
      combinedOutput += syncTutorial(g, events);
      combinedOutput += bullyingNote(g, allWinRulesMet(g), events);
      if (g.tacticalMode) {
        const tickRes = internalTick(g, true);
        events.push(...tickRes.events);
        combinedOutput += tickRes.output;
        if (tickRes.stderr) combinedStderr += tickRes.stderr;
      }
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
    playEventsSfx(g, events);
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

export function tick(g: ChapterState): TickResult {
    if (g.paused || g.intro || g.ended || g.tacticalMode || g.lab?.clock === 'manual') {
      return { output: '', events: [], snapshot: snapshot(g) };
    }
    return internalTick(g, false);
  }

export function internalTick(g: ChapterState, _fromCommand: boolean): TickResult {
    g.deadNow = false;
    g.deathText = '';
    const events: KernelEvent[] = [];

    // Anti-softlock cron_restorer for questCritical files
    for (const q of g.rt.quests) {
      const existing = lookup(g.rt.root, q.path);
      if (!existing) {
        q.missingTicks += 1;
        if (q.missingTicks >= 2) {
          const parent = ensureDirChain(g.rt.root, q.parentPath);
          const restored = makeNode(parent, q.name, 'file', q.mode);
          restored.uid = q.uid;
          restored.questCritical = true;
          restored.content = q.content;
          q.missingTicks = 0;
          events.push({
            type: 'SYSTEM_HAND_SPAWN',
            entityKind: 'inode',
            id: restored.id,
            name: restored.name,
            reason: 'cron_restore',
          });
          events.push({ type: 'FILE_CREATED', inodeId: restored.id, name: restored.name });
        }
      } else {
        q.missingTicks = 0;
      }
    }

    let kiroOut = '';
    if ((!_fromCommand || !g.lastCmdStartedCrack) && g.kiro.activeCrack) {
      kiroOut = stepKiroCrack(g, events);
    }
    const timedOut = runTimed(g, events);
    const tickOut = kiroOut + timedOut + (enemiesHeld(g) ? '' : g.rt.world.tick(events));
    syncValidatedCodeBugs(g);
    g.rt.world.sync(events);
    refreshExitGates(g, events);
    const notes = g.rt.world.drain();
    const stderr = g.deathText || undefined;
    const achEvents = _fromCommand ? [] : evaluateBatchEvents(events, { preview: g.preview, lab: g.lab !== null });
    if (achEvents.length > 0) events.push(...achEvents);
    const output = tickOut + notes + (g.deathText || '') + formatAchievementLines(achEvents);
    playEventsSfx(g, events);
    if (g.lab) observe(g, { output, eventTypes: events.map((e) => e.type) });
    return { output, stderr, events, snapshot: snapshot(g) };
  }

/** The world does not tick yet: before the level's first command, and while the script's `holdEnemiesUntil` is unmet. */
export function enemiesHeld(g: ChapterState): boolean {
  const holdUntil = levelScript(g).holdEnemiesUntil;
  return g.rt.levelCommands === 0 || (holdUntil !== undefined && !evalCond(g, holdUntil));
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

export function restart(g: ChapterState): TickResult {
    const events: KernelEvent[] = [];
    g.kiro.reset();
    g.commands = 0;
    g.deaths = 0;
    g.startedAt = Date.now();
    g.pausedMs = 0;
    g.ended = false;
    g.endedAt = null;
    g.fullRun = true;
    g.intro = false;
    applyInitialLoadout(g, 0);
    loadLevel(g, 0, false, events);
    return { output: levelBannerText(g), events, snapshot: snapshot(g) };
  }

export function restartFloor(g: ChapterState): TickResult {
    const events: KernelEvent[] = [];
    const arrival = rebootLevel(g, events);
    return { output: `[RETRY] Reloaded ${g.rt.spec.title}.\n${arrival}`, events, snapshot: snapshot(g) };
  }

export function debugTeleport(g: ChapterState, floor: FloorId): TickResult {
    return jumpToLevel(g, Math.min(g.levels.length, Math.max(1, floor)));
  }

export function debugHeal(g: ChapterState): GameSnapshot {
    g.hp = maxHpFor(g.ram);
    return snapshot(g);
  }

export function skipTutorial(g: ChapterState): TickResult {
    const events: KernelEvent[] = [];
    const output = applySkipTutorial(g, events);
    return { output, events, snapshot: snapshot(g) };
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
