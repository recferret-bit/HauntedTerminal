import { growTree } from './tree-gen.js';
import type { KernelEvent } from '../contracts/events.js';
import { pickSpatial } from '../contracts/room-view.js';
import { endBattle } from '../game/battle.js';
import { rollOuch } from '../game/ouch.js';
import { SSD_PER_BACKUP, maxHpFor } from '../game/bestiary.js';
import { World } from '../game/entities.js';
import type { EnemySpawn, PickupSpawn } from '../game/floors.js';
import { lookup, makeRoot, type VNode } from '../game/tree.js';
import type { LevelSpec } from './types.js';
import { readMetagame, recordTelemetry } from './catalog.js';
import { arrivalScript, evalCond, hiddenEnemyId, isPickupHidden, levelScript } from './script.js';
import { applyPids, fillPidsDeep, fixedPids, rollPids } from './pids.js';
import { ensureDirChain, placeFile, resolveTauntAgent, splitParentAndName, type ChapterState, type QuestBackup } from './session-state.js';
import { grantManifestItemsUpTo, refreshExitGates } from './session-rules.js';

function rebootLevel(g: ChapterState, events: KernelEvent[]): string {
  g.ram = g.entryRam;
  g.ssd = g.entrySsd;
  g.hp = maxHpFor(g.ram);
  g.inventory = g.entryInventory;
  loadLevel(g, g.levelIdx, true, events);
  const arrival = g.rt.arrivalNote || '';
  g.rt.arrivalNote = '';
  return arrival;
}

/** `spec` is the level as played: its enemies already carry their rolled PIDs (`applyPids`). */
function levelSpawns(spec: LevelSpec): { enemySpawns: EnemySpawn[]; pickupSpawns: PickupSpawn[] } {
  const enemySpawns: EnemySpawn[] = spec.enemies.map((e) => ({
    id: e.id,
    type: e.type,
    path: e.path,
    pid: e.pid,
    ppid: e.ppid,
    hidden: e.hidden,
    port: e.port,
    buffer: e.buffer,
    helps: e.helps,
    ...(e.showIn ? { showIn: e.showIn } : {}),
    ...pickSpatial(e),
    ...(e.socket ? { socket: e.socket } : {}),
    ...(e.model ? { model: e.model } : {}),
    ...(e.label ? { label: e.label } : {}),
    ...(e.attackSfx ? { attackSfx: e.attackSfx } : {}),
    ...(e.killSfx ? { killSfx: e.killSfx } : {}),
  }));
  const pickupSpawns: PickupSpawn[] = spec.pickups.map((p) => ({
    id: p.id,
    type: p.type,
    path: p.path,
    locked: p.locked,
    ...(p.model ? { model: p.model } : {}),
    ...pickSpatial(p),
    ...(p.socket ? { socket: p.socket } : {}),
    ...(p.label ? { label: p.label } : {}),
    ...(p.sfx ? { sfx: p.sfx } : {}),
  }));
  return { enemySpawns, pickupSpawns };
}

/** A pickup he already took stays gone on a return: no file, no pickup (so RAM and SSD cannot be farmed by revisiting). */
function withoutTakenPickups(g: ChapterState, level: LevelSpec): { spec: LevelSpec; goneFiles: string[] } {
  const taken = new Set(g.inventory.taken);
  const goneFiles = level.pickups.filter((p) => taken.has(`${level.id}:${p.id}`)).map((p) => p.path);
  return { spec: goneFiles.length === 0 ? level : { ...level, pickups: level.pickups.filter((p) => !goneFiles.includes(p.path)) }, goneFiles };
}

function removeFiles(root: VNode, paths: readonly string[]): void {
  for (const path of paths) {
    const node = lookup(root, path);
    node?.parent?.children.delete(node.name);
  }
}

function buildLevelRoot(spec: LevelSpec, goneFiles: string[]): { root: VNode; cwd: VNode; quests: QuestBackup[] } {
  const root = makeRoot();
  ensureDirChain(root, '/home/dev');
  ensureDirChain(root, spec.cwd);

  const quests: QuestBackup[] = [];
  for (const f of spec.files) {
    const node = placeFile(root, f);
    if (f.questCritical && f.kind === 'file') {
      const { parentPath, name } = splitParentAndName(f.path);
      quests.push({
        path: f.path,
        name,
        parentPath,
        mode: node.mode,
        uid: node.uid,
        content: node.content,
        missingTicks: 0,
      });
    }
  }

  for (const gen of spec.generate ?? []) growTree(root, gen);
  removeFiles(root, goneFiles);
  return { root, cwd: lookup(root, spec.cwd) ?? root, quests };
}

export function loadLevel(g: ChapterState, idx: number, isRetry: boolean, events: KernelEvent[]): void {
    // A new or restarted level ends any battle; holds (an open editor) stay.
    endBattle(g.battle, 'level', events);
    g.kiro.clearRoomTransient();
    g.levelIdx = idx;
    // A new roll on every load, so a retry has new PIDs; a lab keeps the PIDs its author placed.
    const pids = g.lab ? fixedPids(g.levels[idx]!.enemies) : rollPids(g.levels[idx]!.enemies, g.pidRandom);
    const { spec, goneFiles } = withoutTakenPickups(g, applyPids(g.levels[idx]!, pids));
    g.reachedIdx = Math.max(g.reachedIdx, idx);
    g.entryRam = g.ram;
    g.entrySsd = g.ssd;
    const clearedFloor = !isRetry && idx > 0 && events.some((e) => e.type === 'FLOOR_CLEARED');
    const grantEvents: KernelEvent[] = [];
    const rewardNote = isRetry ? '' : grantManifestItemsUpTo(g, idx, clearedFloor && !g.lab, grantEvents);
    if (!isRetry) g.entryInventory = g.inventory;
    if (!isRetry && idx === 0) {
      g.hp = maxHpFor(g.ram);
    }

    const { root, cwd, quests } = buildLevelRoot(spec, goneFiles);
    const { enemySpawns, pickupSpawns } = levelSpawns(spec);

    if (!g.preview) recordTelemetry({ malware: ['hank.tty', 'kiro.d', g.pack.manifest.allyNpc.id, ...spec.enemies.map((e) => e.type)] });

    const autoLantern = !g.preview && readMetagame().activePerks.includes('perk-linter-goggles');

    g.rt = {
      spec,
      filesByPath: new Map(spec.files.map((f) => [f.path, f])),
      root,
      cwd,
      world: null as unknown as World,
      quests,
      filesRead: new Set(),
      talkedSockets: new Set(),
      socketInputs: new Map(),
      loadedCores: new Set(),
      pids,
      dialog: fillPidsDeep(g.pack.dialogs?.levels[spec.id], pids),
      hintRung: 0,
      usedSpoilerRung: false,
      levelCommands: 0,
      levelDeaths: 0,
      levelStartedAt: Date.now(),
      builtImages: new Map(),
      containers: [],
      composeHealthyServices: new Set(),
      lantern: autoLantern,
      xray: false,
      streamDrained: false,
      completionEmitted: false,
      completionNote: '',
      levelArrived: false,
      arrivalNote: '',
      commandsRun: new Set(),
      commandLog: [],
      tutorialSkipped: false,
      tutorialLastStep: 1,
      hiddenRevealed: false,
      spawned: new Set(),
      spawnedActors: new Map(),
      levelTicks: 0,
      timedFired: new Set(),
      deferred: [],
      skillsUsed: new Set(),
      hintUses: new Map(),
      roomSwept: false,
      droppedPickups: new Set(),
      triggersFired: new Set(),
      openingDone: false,
      dialogBusyUntilTick: 0,
      flags: new Set(),
      levelBattles: 0,
      restartPending: null,
      lab: { absorbed: {}, solved: new Set(), attempts: {}, hits: new Set() },
    };
    g.rt.world = new World(g.host, enemySpawns, pickupSpawns);
    for (const p of spec.pickups) {
      if (p.appearWhen && evalCond(g, p.appearWhen)) g.rt.droppedPickups.add(p.id);
    }
    if (autoLantern) {
      g.rt.world.reveal(cwd, events);
    }
    refreshExitGates(g, events);

    events.push({
      type: 'FLOOR_ENTERED',
      floorId: spec.index,
      title: `LEVEL ${String(spec.index).padStart(2, '0')} — ${spec.title.toUpperCase()}`,
      path: spec.cwd,
      ...(spec.stage?.sfx?.enter ? { sfx: spec.stage.sfx.enter } : {}),
    });
    for (const present of g.rt.world.presentIn(spec.cwd)) {
      if (present.id === hiddenEnemyId(g) || isPickupHidden(g, present.id)) continue;
      events.push({
        type: 'ENTITY_SPAWNED',
        entityId: present.id,
        model: present.model,
        reason: 'room_enter',
      });
    }

    if (grantEvents.length > 0) events.push(...grantEvents);
    if (!g.intro) {
      g.rt.arrivalNote = rewardNote + arriveCurrentLevel(g, events);
    } else if (rewardNote) {
      g.rt.arrivalNote = rewardNote;
    }
  }

export function arriveCurrentLevel(g: ChapterState, events: KernelEvent[]): string {
    if (g.rt.levelArrived) return '';
    g.rt.levelArrived = true;
    return arrivalScript(g, events);
  }

export function restartChapterLevel(g: ChapterState, events: KernelEvent[]): string {
  g.bus.emit({ kind: 'restart', step: 'go' });
  const arrival = rebootLevel(g, events);
  return `[RETRY] Reloaded ${g.rt.spec.title}.\n${arrival}`;
}

export function levelBannerText(g: ChapterState): string {
    const entry = g.rt.dialog;
    const banner = entry?.banner ?? g.rt.spec.title;
    const chaosLine = g.chaosMode
      ? '\n[CHAOS CONTRACT ACTIVE: Randomized PIDs — run `ps` before signaling! +25 Bonus Silicon Scrap]'
      : '';
    const foe = entry?.agentTaunt ? resolveTauntAgent(entry.agentTaunt) : null;
    const clapback =
      foe && !levelScript(g).arrival
        ? `\n${g.kiro.counterTauntLine(foe === 'kiro' ? 'clod' : foe)}`
        : '';
    const arrivalBlock = g.rt.arrivalNote || '';
    g.rt.arrivalNote = '';
    return `\n=== ${banner} ===\nObjective: ${g.rt.spec.summary}${chaosLine}${clapback}${arrivalBlock}\n(Type \`hank\` for Socratic hints, or \`kiro scan\` for a local Ghost sweep.)\n`;
  }

/**
 * Applies damage. A death sets `g.deathText` and returns ''. `exec` and `internalTick` (session-flow.ts) append
 * `g.deathText` once to stdout and stderr, so callers must not embed it themselves.
 */
export function hurt(g: ChapterState, amount: number, source: string, events: KernelEvent[]): string {
  if (g.rt.spec.mechanic === 'hub' || levelScript(g).safe || amount <= 0) {
    return '';
  }
  const { amount: mitigated } = g.kiro.mitigateDamage(amount);
  if (g.lab) {
    g.rt.lab.absorbed[source] = (g.rt.lab.absorbed[source] ?? 0) + mitigated;
    return '';
  }
  g.hp = Math.max(0, g.hp - mitigated);
  events.push({
    type: 'PLAYER_DAMAGED',
    amount: mitigated,
    hpRemaining: g.hp,
    sourceName: source,
    ouch: rollOuch(g.ouch, g.hp),
  });

  if (g.hp > 0) return '';

  g.deaths += 1;
  g.rt.levelDeaths += 1;
  g.deadNow = true;
  if (g.ssd >= SSD_PER_BACKUP) {
    g.ssd -= SSD_PER_BACKUP;
    g.hp = Math.ceil(maxHpFor(g.ram) * 0.6);
    events.push({ type: 'PLAYER_RESPAWNED', from: 'ssd_backup', hp: g.hp });
    g.deathText = `\n[SSD SNAPSHOT RESTORED] ${source} crashed your shell, but your 256GB NVMe backup restored you in place!\n`;
    return '';
  }

  const arrival = rebootLevel(g, events);
  events.push({ type: 'PLAYER_RESPAWNED', from: 'floor_restart', hp: g.hp });
  g.deathText = `\n[KERNEL PANIC] ${source} wiped your session! Rebooted at ${g.rt.spec.cwd}.\n${arrival}`;
  return '';
}
