import type { KernelEvent } from '../contracts/events.js';
import { endBattle } from '../game/battle.js';
import { maxHpFor } from '../game/bestiary.js';
import { World } from '../game/entities.js';
import type { EnemySpawn, PickupSpawn } from '../game/floors.js';
import { giveItem, hasItem, holdItem } from '../game/inventory.js';
import { lookup, makeRoot } from '../game/tree.js';
import type { LevelSpec } from './types.js';
import { readMetagame, recordTelemetry } from './catalog.js';
import { arrivalScript, hiddenEnemyId, isNodeHidden, levelScript } from './script.js';
import { applyPids, fillPidsDeep, fixedPids, rollPids } from './pids.js';
import { ensureDirChain, placeFile, resolveTauntAgent, splitParentAndName, type ChapterState, type QuestBackup } from './session-state.js';
import { refreshExitGates } from './session-rules.js';

/** Tab-complete and globs skip a tutorial file until its reveal condition is met. */
export const isHiddenTutorialNode = isNodeHidden;

export function rebootLevel(g: ChapterState, events: KernelEvent[]): string {
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
  const enemySpawns: EnemySpawn[] = spec.enemies.map((e) => {
    return {
      id: e.id,
      type: e.type,
      path: e.path,
      pid: e.pid,
      ppid: e.ppid,
      hidden: e.hidden,
      port: e.port,
      buffer: e.buffer,
      helps: e.helps,
    };
  });
  const pickupSpawns: PickupSpawn[] = spec.pickups.map((p) => ({
    id: p.id,
    type: p.type,
    path: p.path,
    locked: p.locked,
    ...(p.model ? { model: p.model } : {}),
  }));
  return { enemySpawns, pickupSpawns };
}

export function loadLevel(g: ChapterState, idx: number, isRetry: boolean, events: KernelEvent[]): void {
    // A new or restarted level ends any battle; holds (an open editor) stay.
    endBattle(g.battle, 'level', events);
    g.kiro.clearRoomTransient();
    g.levelIdx = idx;
    // A new roll on every load, so a retry has new PIDs; a lab keeps the PIDs its author placed.
    const pids = g.lab ? fixedPids(g.levels[idx]!.enemies) : rollPids(g.levels[idx]!.enemies, g.pidRandom);
    const spec = applyPids(g.levels[idx]!, pids);
    g.entryRam = g.ram;
    g.entrySsd = g.ssd;
    if (!isRetry && idx > 0) {
      for (const grant of g.pack.manifest.grants ?? []) {
        if (idx < grant.afterLevel) continue;
        for (const item of grant.items ?? []) {
          const had = hasItem(g.inventory, item);
          g.inventory = giveItem(g.inventory, item);
          if (!had && (item === 'lantern' || g.inventory.held === null)) {
            g.inventory = holdItem(g.inventory, item);
          }
        }
      }
      if (g.inventory.held === null && hasItem(g.inventory, 'terminal')) {
        g.inventory = holdItem(g.inventory, 'terminal');
      }
    }
    if (!isRetry) g.entryInventory = g.inventory;
    if (!isRetry && idx === 0) {
      g.hp = maxHpFor(g.ram);
    }

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

    const cwd = lookup(root, spec.cwd) ?? root;
    const { enemySpawns, pickupSpawns } = levelSpawns(spec);

    if (!g.preview) recordTelemetry({ malware: ['hank.tty', 'kiro.d', g.pack.manifest.allyNpc.id, ...spec.enemies.map((e) => e.type)] });

    const autoLantern = !g.preview && readMetagame().activePerks.includes('perk-linter-goggles');

    g.rt = {
      spec,
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
      tutorialSkipped: false,
      tutorialLastStep: 1,
      hiddenRevealed: false,
      spawned: new Set(),
      levelTicks: 0,
      timedFired: new Set(),
      restartPending: null,
      lab: { absorbed: {}, solved: new Set(), attempts: {}, hits: new Set() },
    };
    g.rt.world = new World(g.host, enemySpawns, pickupSpawns);
    if (autoLantern) {
      g.rt.world.reveal(cwd, events);
    }
    refreshExitGates(g, events);

    events.push({
      type: 'FLOOR_ENTERED',
      floorId: spec.index,
      title: `LEVEL ${String(spec.index).padStart(2, '0')} — ${spec.title.toUpperCase()}`,
      path: spec.cwd,
    });
    for (const present of g.rt.world.presentIn(spec.cwd)) {
      if (present.id === hiddenEnemyId(g)) continue;
      events.push({
        type: 'ENTITY_SPAWNED',
        entityId: present.id,
        model: present.model,
        reason: 'room_enter',
      });
    }

    if (!g.intro) {
      g.rt.arrivalNote = arriveCurrentLevel(g, events);
    }
  }

export function arriveCurrentLevel(g: ChapterState, events: KernelEvent[]): string {
    if (g.rt.levelArrived) return '';
    g.rt.levelArrived = true;
    return arrivalScript(g, events);
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
