import type { KernelEvent } from '../contracts/events.js';
import { maxHpFor } from '../game/bestiary.js';
import { World } from '../game/entities.js';
import type { EnemySpawn, PickupSpawn } from '../game/floors.js';
import { lookup, makeNode, makeRoot } from '../game/tree.js';
import type { LevelSpec } from './types.js';
import { readMetagame, recordTelemetry } from './catalog.js';
import { arrivalScript, hiddenEnemyId, isNodeHidden, levelScript } from './script.js';
import { ensureDirChain, hashSeed, resolveTauntAgent, splitParentAndName, type ChapterState, type QuestBackup } from './session-state.js';
import { refreshExitGates } from './session-rules.js';

/** Tab-complete and globs skip a tutorial file until its reveal condition is met. */
export const isHiddenTutorialNode = isNodeHidden;

export function rebootLevel(g: ChapterState, events: KernelEvent[]): string {
  g.ram = g.entryRam;
  g.ssd = g.entrySsd;
  g.hp = maxHpFor(g.ram);
  loadLevel(g, g.levelIdx, true, events);
  const arrival = g.rt.arrivalNote || '';
  g.rt.arrivalNote = '';
  return arrival;
}

function levelSpawns(
  g: ChapterState,
  spec: LevelSpec,
  seedHash: number,
): { enemySpawns: EnemySpawn[]; pickupSpawns: PickupSpawn[] } {
  const enemySpawns: EnemySpawn[] = spec.enemies.map((e, eIdx) => {
    let pid = e.pid;
    if (g.chaosMode && pid && pid !== 1) {
      pid = 1100 + ((pid * 37 + seedHash + eIdx * 97) % 7800);
    }
    return {
      id: e.id,
      type: e.type,
      path: e.path,
      pid,
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
  }));
  return { enemySpawns, pickupSpawns };
}

export function loadLevel(g: ChapterState, idx: number, isRetry: boolean, events: KernelEvent[]): void {
    g.kiro.clearRoomTransient();
    g.levelIdx = idx;
    const spec = g.levels[idx]!;
    g.entryRam = g.ram;
    g.entrySsd = g.ssd;
    if (!isRetry && idx === 0) {
      g.hp = maxHpFor(g.ram);
    }

    const root = makeRoot();
    ensureDirChain(root, '/home/dev');
    ensureDirChain(root, spec.cwd);

    const quests: QuestBackup[] = [];
    for (const f of spec.files) {
      if (f.kind === 'dir') {
        const dir = ensureDirChain(root, f.path);
        dir.mode = f.mode ?? 0o755;
        dir.uid = f.uid ?? 1000;
        continue;
      }
      const { parentPath, name } = splitParentAndName(f.path);
      const parent = ensureDirChain(root, parentPath);
      const node = makeNode(parent, name, f.kind, f.mode ?? 0o644);
      node.uid = f.uid ?? 1000;
      node.questCritical = f.questCritical;
      node.content = f.content ?? '';
      if (f.questCritical && f.kind === 'file') {
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

    const seedHash = hashSeed(`${g.chaosSeed}:${spec.id}`);
    const cwd = lookup(root, spec.cwd) ?? root;
    const { enemySpawns, pickupSpawns } = levelSpawns(g, spec, seedHash);

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
    const entry = g.pack.dialogs?.levels[g.rt.spec.id];
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
