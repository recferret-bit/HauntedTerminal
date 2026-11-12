import { SSD_PER_BACKUP, maxHpFor } from '../game/bestiary.js';
import { absPath } from '../game/tree.js';
import type { GameSnapshot, RoomActor, RoomView } from '../game/types.js';
import { buildRoom, type SceneFacts, type ViewThing } from '../game/view.js';
import { computeRunRank, splitParentAndName, type ChapterState } from './session-state.js';
import { hiddenEnemyId, isNodeHidden, kiroStage, tutorialState } from './script.js';
import { allWinRulesMet, computeBossPhase } from './session-rules.js';

function kiroStageActor(g: ChapterState, cwdPath: string, exitOpen: boolean) {
  return kiroStage(g, g.kiro.stageActorProps(cwdPath, 2.4), cwdPath, exitOpen);
}

function decorateSnapshotRoom(g: ChapterState, room: RoomView, cwdPath: string, exitBase: string, exitOpen: boolean): void {
    if (!g.ended) {
      room.kind = g.rt.spec.roomKind;
      room.floor = g.rt.spec.index;
      const modeBadges = [
        ...(g.chaosMode ? ['CHAOS'] : []),
      ];
      const prefix = modeBadges.length > 0 ? `[${modeBadges.join('+')}] ` : '';
      room.title = `${prefix}LEVEL ${String(g.rt.spec.index).padStart(2, '0')}/${String(g.levels.length).padStart(2, '0')} // ${cwdPath}`;
      const dEntry = g.pack.dialogs?.levels[g.rt.spec.id];
      room.caption = exitOpen
        ? `SECTOR CLEAR — ${exitBase ? `cd ${exitBase}` : `run ${g.rt.spec.exitCommand ?? 'exit'}`} to advance!`
        : dEntry?.banner ?? g.rt.spec.summary;

      // Enforce level chroot visually: hide synthetic `..` parent panel when standing at the level's chroot root `spec.cwd`.
      if (cwdPath === g.rt.spec.cwd) {
        room.neighbors = room.neighbors.filter((n) => n.relation !== 'parent');
      }

      // Materialize running Docker containers as physical 3D crates on the stage without overlapping existing ground actors!
      const containerNames =
        g.rt.composeHealthyServices.size > 0
          ? Array.from(g.rt.composeHealthyServices).map((s) => `${s} [healthy]`)
          : g.rt.containers.map((c) => `${c.image} [UP]`);
      const crateCandidates = [0.25, -0.25, -0.68, 3.0, 4.5, 1.25, 0.65, -0.55];
      containerNames.slice(0, 3).forEach((label, idx) => {
        const usedX = room.actors.filter((a) => !a.y || a.y < 0.2).map((a) => a.x);
        const freeX =
          crateCandidates.find((cx) => usedX.every((ux) => Math.abs(ux - cx) >= 0.36)) ??
          -0.25 - idx * 0.45;
        const actor: RoomActor = {
          key: 'entity',
          id: `docker:crate:${idx}`,
          model: 'prop.tar',
          kind: 'prop',
          state: 'idle',
          x: freeX,
          hidden: false,
          label,
        };
        room.actors.push(actor);
      });

      // The chapter's boss cameo supervisor (manifest boss.cameoModel) stands on stage in boss levels.
      const cameoModel = g.pack.manifest.boss.cameoModel;
      if (g.rt.spec.mechanic === 'boss' && cameoModel && !room.actors.some((a) => a.model === cameoModel)) {
        room.actors.push({
          key: 'entity',
          id: 'boss:cameo',
          model: cameoModel,
          kind: 'enemy',
          state: exitOpen ? 'death' : 'idle',
          x: -1.02,
          y: 0.35,
          hidden: false,
          label: g.pack.manifest.boss.cameoLabel ?? 'SUPERVISOR',
        });
      }
    } else {
      const { title, outro } = g.pack.manifest;
      room.title = `ISSUE CLEAR // ${title}`;
      room.caption = outro?.caption ?? 'ISSUE CLEAR';
      for (const a of outro?.actors ?? []) {
        room.actors.push({ key: 'entity', id: a.id, model: a.model, kind: 'npc', state: 'idle', x: a.x, hidden: false, label: a.label });
      }
    }
}

export function snapshot(g: ChapterState): GameSnapshot {
    const maxHp = maxHpFor(g.ram);
    if (g.hp > maxHp) g.hp = maxHp;
    const cwdPath = absPath(g.rt.cwd);
    const counts = g.rt.world.counts();
    const now = g.endedAt ?? Date.now();
    const activePaused = g.pausedAt !== null ? now - g.pausedAt : 0;
    const timeSec = Math.max(0, Math.floor((now - g.startedAt - g.pausedMs - activePaused) / 1000));

    const exitBase = g.rt.spec.exitDir ? splitParentAndName(g.rt.spec.exitDir).name : '';
    const exitOpen = allWinRulesMet(g);
    const exits: Record<string, boolean> = exitBase ? { [exitBase]: exitOpen } : {};

    const rawEntities = g.rt.world.views(cwdPath);
    const entityTargets = new Set(rawEntities.map((e) => e.target));
    const hiddenId = hiddenEnemyId(g);
    const entities = hiddenId ? rawEntities.filter((e) => e.id !== hiddenId) : rawEntities;
    const effectiveCounts = hiddenId
      ? { left: Math.max(0, counts.left - 1), total: Math.max(0, counts.total - 1) }
      : counts;
    const things: ViewThing[] = [];
    for (const child of g.rt.cwd.children.values()) {
      if (isNodeHidden(g, child)) continue;
      things.push({
        name: child.name,
        type: child.kind,
        open: child.kind === 'dir' ? (child.mode & 0o111) !== 0 : true,
        entity: entityTargets.has(child.name) ? child.name : undefined,
      });
    }

    const kiroProps = kiroStageActor(g, cwdPath, exitOpen);

    const facts: SceneFacts = {
      floor: g.rt.spec.floorTheme,
      cwd: cwdPath,
      ended: g.ended,
      lantern: g.rt.lantern,
      xray: g.rt.xray,
      flood: 0,
      things,
      entities,
      exits,
      ghost: entities.some((e) => e.model === 'malware.rootkit' && e.state !== 'death'),
      mimic: false,
      gateOpen: exitOpen,
      plankBridged: true,
      gargoyle: 'gone',
      zombies: 0,
      bossDead: effectiveCounts.left === 0,
      bossFrozen: false,
      phase1: computeBossPhase(g) >= 1,
      portal: exitOpen,
      powerOn: exitOpen,
      valveOpen: exitOpen,
      hostiles: effectiveCounts.left,
      kiro: kiroProps,
    };

    const room = buildRoom(facts);
    decorateSnapshotRoom(g, room, cwdPath, exitBase, exitOpen);

    const rank = g.ended ? computeRunRank(g.commands, g.deaths, g.levels.length) : null;
    const shortcuts: string[] = [];
    if (g.tacticalMode) shortcuts.push('TACTICAL');
    if (g.chaosMode) shortcuts.push('CHAOS');

    return {
      cwd: cwdPath,
      floor: g.rt.spec.floorTheme,
      hp: g.hp,
      maxHp,
      commands: g.commands,
      prompt: `dev@byterig:${cwdPath}$ `,
      promptGold: exitOpen,
      muted: g.muted,
      ended: g.ended,
      rank,
      timeSec,
      shortcuts,
      room,
      intro: g.intro,
      ram: g.ram,
      ssd: g.ssd,
      backups: Math.floor(g.ssd / SSD_PER_BACKUP),
      paused: g.paused,
      enemiesLeft: effectiveCounts.left,
      enemiesTotal: effectiveCounts.total,
      tutorial: tutorialState(g),
    };
  }
