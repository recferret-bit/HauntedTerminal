import { SSD_PER_BACKUP, maxHpFor } from '../game/bestiary.js';
import { pickTransform, type ActorKind } from '../contracts/room-view.js';
import { battleView } from '../game/battle.js';
import { absPath, type VNode } from '../game/tree.js';
import type { GameSnapshot, LevelInfo, RoomView } from '../game/types.js';
import { buildRoom, roomSeedForPath, type SceneFacts, type ViewThing } from '../game/view.js';
import { computeRunRank, splitParentAndName, type ChapterState } from './session-state.js';
import { hasSkippableDialog, isEnemyHidden, isNodeHidden, isPickupHidden, kiroStage, openingActive, pendingLaptopTasks, tutorialState } from './script.js';
import { chapterHintGoals } from './session-hints.js';
import { allWinRulesMet, computeBossPhase, getChecklist } from './session-rules.js';

/** A `*.sock` node is locked only when gated by an unsolved riddle or boss verification token. */
function chapterSocketOpen(g: ChapterState, child: VNode): boolean {
  if (child.kind !== 'socket') return true;
  const sockPath = absPath(child);
  const specRiddle = (g.rt.spec.riddles ?? []).find((r) => r.path === sockPath);
  const labRiddle = g.lab?.content.riddles.find((r) => r.path === sockPath);
  const riddle = specRiddle ?? labRiddle;
  if (riddle) return g.rt.lab.solved.has(riddle.id);
  const bossRule = g.rt.spec.winRules.find((r) => r.kind === 'boss_defeated');
  if (bossRule && bossRule.kind === 'boss_defeated' && (bossRule.verifySocket === child.name || bossRule.verifySocket === sockPath)) {
    return (g.rt.socketInputs.get(bossRule.verifySocket) ?? '').includes(bossRule.expectedToken);
  }
  return true;
}

/** `LOCKED: <first missing> (+N more)`, only in the room that holds the exit door while the exit is locked (D7). */
function lockedCaption(g: ChapterState, cwdPath: string, exitOpen: boolean): string | null {
  const exitDir = g.rt.spec.exitDir;
  if (exitOpen || !exitDir || splitParentAndName(exitDir).parentPath !== cwdPath) return null;
  const missing = getChecklist(g).filter((c) => !c.done);
  if (missing.length === 0) return null;
  const more = missing.length > 1 ? ` (+${missing.length - 1} more)` : '';
  return `LOCKED: ${missing[0]!.description}${more}`;
}

/** Title, objective (first unfinished win rule, else the summary, else a default), checklist and bug counts for the HUD level block. */
function levelInfo(g: ChapterState, counts: { left: number; total: number }): LevelInfo {
  const checklist = getChecklist(g);
  const objective = checklist.find((c) => !c.done)?.description || g.rt.spec.summary || 'Open the exit.';
  return { title: g.rt.spec.title, objective, checklist, bugsLeft: counts.left, bugsTotal: counts.total };
}

function kiroStageActor(g: ChapterState, cwdPath: string, exitOpen: boolean) {
  return kiroStage(g, g.kiro.stageActorProps(cwdPath, 2.4), cwdPath, exitOpen);
}

/** Attack countdown (`RoomActor.strikeIn`): in a battle's player phase, the actions until each hurting enemy's hit lands. */
function markStrikeCountdowns(g: ChapterState, room: RoomView): void {
  if (g.battle.phase !== 'player' || g.ended) return;
  const hurting = new Set(g.rt.world.threats().map((e) => e.id));
  for (const actor of room.actors) {
    const e = actor.id && hurting.has(actor.id) ? g.rt.world.get(actor.id) : undefined;
    const toTell = e && !actor.hidden ? g.rt.world.ticksToTell(e) : null;
    if (e && toTell !== null) actor.strikeIn = e.told ? 0 : toTell + 1;
  }
}

function spawnedActorKind(model: string): ActorKind {
  if (model.startsWith('vibecoder.')) return 'vibecoder';
  if (model.startsWith('boss.')) return 'boss';
  if (model.startsWith('malware.') || model.startsWith('agent.')) return 'enemy';
  if (model.startsWith('door.')) return 'door';
  if (model.startsWith('pickup.') || model.startsWith('item.')) return 'pickup';
  if (model.startsWith('npc.')) return 'npc';
  return 'prop';
}

function appendComposeActors(g: ChapterState, room: RoomView): void {
  const composeRule = g.rt.spec.winRules.find((r) => r.kind === 'docker_compose_healthy');
  const isFloatingCompose = Boolean(
    composeRule && composeRule.kind === 'docker_compose_healthy' && composeRule.floating,
  );
  if (isFloatingCompose && g.rt.composeHealthyServices.size > 0) {
    const floatXs = [-0.35, 0.85, 2.05, 3.25];
    Array.from(g.rt.composeHealthyServices).forEach((svc, idx) => {
      room.actors.push({
        key: 'entity',
        id: `docker:float:${idx}`,
        model: 'prop.file',
        kind: 'prop',
        state: 'idle',
        x: floatXs[idx] ?? (-0.35 + idx * 1.15),
        y: 1.9 + (idx % 2) * 0.25,
        hidden: false,
        label: `[${svc}]`,
      });
    });
    return;
  }
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
    room.actors.push({
      key: 'entity',
      id: `docker:crate:${idx}`,
      model: 'prop.tar',
      kind: 'prop',
      state: 'idle',
      x: freeX,
      hidden: false,
      label,
    });
  });
}

function decorateSnapshotRoom(
  g: ChapterState,
  room: RoomView,
  cwdPath: string,
  exitBase: string,
  exitOpen: boolean,
  lockedCaption: string | null,
  subdirCaption?: string,
): void {
    // The HUD floor is the level index, also on the ended (stats) room.
    room.floor = g.rt.spec.index;
    if (!g.ended) {
      room.kind = g.rt.spec.roomKind;
      room.roomSeed =
        cwdPath === g.rt.spec.cwd && g.rt.spec.roomSeed !== undefined
          ? g.rt.spec.roomSeed
          : roomSeedForPath(cwdPath, g.rt.spec.index);
      const modeBadges = [
        ...(g.chaosMode ? ['CHAOS'] : []),
      ];
      const prefix = modeBadges.length > 0 ? `[${modeBadges.join('+')}] ` : '';
      room.title = `${prefix}LEVEL ${String(g.rt.spec.index).padStart(2, '0')}/${String(g.levels.length).padStart(2, '0')} // ${cwdPath}`;
      const dEntry = g.rt.dialog;
      room.caption = exitOpen
        ? `SECTOR CLEAR — ${exitBase ? `cd ${exitBase}` : `run ${g.rt.spec.exitCommand ?? 'exit'}`} to advance!`
        : lockedCaption ?? subdirCaption ?? dEntry?.banner ?? g.rt.spec.summary;

      // Materialize running Docker containers as physical 3D crates or floating code sheets on the stage!
      appendComposeActors(g, room);

      for (const [id, spec] of g.rt.spawnedActors.entries()) {
        if (room.actors.some((a) => a.id === id)) continue;
        room.actors.push({
          key: 'entity',
          id,
          model: spec.model,
          kind: spawnedActorKind(spec.model),
          state: 'idle',
          x: spec.x,
          ...(spec.y !== undefined ? { y: spec.y } : {}),
          ...pickTransform(spec),
          hidden: false,
          ...(spec.label ? { label: spec.label } : {}),
        });
      }

      if (g.lab) room.actors.push(...g.lab.extraActors);

      // The chapter's boss cameo supervisor (manifest boss.cameoModel) stands on stage in boss levels.
      const cameoModel = g.pack.manifest.boss.cameoModel;
      const cameoT = g.pack.manifest.boss.cameoTransform;
      if (g.rt.spec.mechanic === 'boss' && cameoModel && !room.actors.some((a) => a.model === cameoModel)) {
        room.actors.push({
          key: 'entity',
          id: 'boss:cameo',
          model: cameoModel,
          kind: 'enemy',
          state: exitOpen ? 'death' : 'idle',
          x: cameoT?.x ?? -1.02,
          y: cameoT?.y ?? 0.35,
          ...(cameoT?.zOrder !== undefined ? { zOrder: cameoT.zOrder } : {}),
          ...(cameoT?.scale !== undefined ? { scale: cameoT.scale } : {}),
          ...(cameoT?.rotation !== undefined ? { rotation: cameoT.rotation } : {}),
          hidden: false,
          label: cameoT?.label ?? g.pack.manifest.boss.cameoLabel ?? 'SUPERVISOR',
        });
      }
    } else {
      const { title, outro } = g.pack.manifest;
      room.title = `ISSUE CLEAR // ${title}`;
      room.caption = outro?.caption ?? 'ISSUE CLEAR';
      for (const a of outro?.actors ?? []) {
        room.actors.push({
          key: 'entity',
          id: a.id,
          model: a.model,
          kind: 'npc',
          state: 'idle',
          x: a.x,
          ...(a.y !== undefined ? { y: a.y } : {}),
          ...(a.zOrder !== undefined ? { zOrder: a.zOrder } : {}),
          ...(a.scale !== undefined ? { scale: a.scale } : {}),
          ...(a.rotation !== undefined ? { rotation: a.rotation } : {}),
          hidden: false,
          label: a.label,
        });
      }
    }
}

function buildFactsForRoom(
  g: ChapterState,
  cwdPath: string,
  exitOpen: boolean,
  exits: Record<string, boolean>,
  entities: ReturnType<ChapterState['rt']['world']['views']>,
  things: ViewThing[],
  effectiveCounts: { left: number; total: number },
  maxHp: number,
): { facts: SceneFacts; subdirCaption?: string; levelMusic?: string } {
  const stage = g.rt.spec.stage;
  const subdir = stage?.subdirs?.[cwdPath];
  const kiroProps = kiroStageActor(g, cwdPath, exitOpen);
  const levelProps = (g.rt.spec.props ?? [])
    .filter((p) => (p.cwd ?? g.rt.spec.cwd) === cwdPath)
    .map((p) => ({
      id: p.id.startsWith('prop:') ? p.id : `prop:${p.id}`,
      model: p.model,
      kind: p.kind ?? (p.model.startsWith('door.') ? ('door' as const) : ('prop' as const)),
      x: p.x,
      y: p.y,
      ...(p.socket ? { socket: p.socket } : {}),
      ...pickTransform(p),
      label: p.label,
    }));
  const entryOverride = subdir?.entryPort !== undefined ? subdir.entryPort : (cwdPath === g.rt.spec.cwd ? stage?.entryPort : undefined);
  const defaultEntry = g.rt.spec.index > 1 && cwdPath === g.rt.spec.cwd;
  const entryDoor = entryOverride === false ? false : entryOverride ? true : defaultEntry;
  const levelMusic = g.rt.musicOverride !== undefined ? (g.rt.musicOverride || undefined) : (subdir?.music ?? stage?.music);
  const hero = subdir?.hero ?? stage?.hero;
  const backdrop = subdir?.backdrop ?? stage?.backdrop;
  const ambient = subdir?.ambient ?? stage?.ambient;
  const facts: SceneFacts = {
    floor: g.rt.spec.floorTheme,
    cwd: cwdPath,
    ended: g.ended,
    lantern: g.rt.lantern,
    dark: !g.inventory.items.includes('tube_transistor'),
    entryDoor,
    ...(entryOverride ? { entryPort: entryOverride } : {}),
    ...(hero !== undefined ? { hero } : {}),
    ...(backdrop ? { backdrop } : {}),
    ...(ambient ? { ambient } : {}),
    props: levelProps,
    held: g.inventory.held,
    hp: g.hp,
    maxHp,
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
  return { facts, subdirCaption: subdir?.caption, levelMusic };
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
    const showHidden = g.editorShowHidden;
    const entityTargets = new Set(rawEntities.map((e) => e.target));
    const entities = rawEntities.flatMap((e) => {
      const isGated = e.kind === 'pickup' ? isPickupHidden(g, e.id) : isEnemyHidden(g, e.id);
      if (isGated && !showHidden) return [];
      if (showHidden && (isGated || e.unseen)) {
        return [{ ...e, alpha: 0.55, ...(e.state === 'hidden' ? { state: 'idle' as const } : {}) }];
      }
      return [e];
    });
    let hiddenTotal = 0;
    let hiddenLeft = 0;
    for (const e of g.rt.world.enemies) {
      if (e.minion || !isEnemyHidden(g, e.id)) continue;
      hiddenTotal += 1;
      if (!e.dead && !g.rt.world.petrified(e)) hiddenLeft += 1;
    }
    const effectiveCounts = hiddenTotal > 0
      ? { left: Math.max(0, counts.left - hiddenLeft), total: Math.max(0, counts.total - hiddenTotal) }
      : counts;
    const things: ViewThing[] = [];
    const hiddenThingNames = new Set<string>();
    for (const child of g.rt.cwd.children.values()) {
      const nodeHidden = isNodeHidden(g, child);
      if (nodeHidden && !showHidden) continue;
      if (nodeHidden) hiddenThingNames.add(child.name);
      const fSpec = g.rt.filesByPath.get(absPath(child));
      things.push({
        name: child.name,
        type: child.kind,
        open: child.kind === 'dir' ? (child.mode & 0o111) !== 0 : child.kind === 'socket' ? chapterSocketOpen(g, child) : true,
        entity: entityTargets.has(child.name) ? child.name : undefined,
        ...(fSpec?.x !== undefined ? { x: fSpec.x } : {}),
        ...(fSpec?.y !== undefined ? { y: fSpec.y } : {}),
        ...(fSpec?.zOrder !== undefined ? { zOrder: fSpec.zOrder } : {}),
        ...(fSpec?.scale !== undefined ? { scale: fSpec.scale } : {}),
        ...(fSpec?.rotation !== undefined ? { rotation: fSpec.rotation } : {}),
        ...(fSpec?.model !== undefined ? { model: fSpec.model } : {}),
        ...(fSpec?.socket !== undefined ? { socket: fSpec.socket } : {}),
        ...(fSpec?.label !== undefined ? { label: fSpec.label } : {}),
      });
    }

    const { facts, subdirCaption, levelMusic } = buildFactsForRoom(
      g,
      cwdPath,
      exitOpen,
      exits,
      entities,
      things,
      effectiveCounts,
      maxHp,
    );

    const room = buildRoom(facts);
    decorateSnapshotRoom(g, room, cwdPath, exitBase, exitOpen, lockedCaption(g, cwdPath, exitOpen), subdirCaption);
    if (showHidden && hiddenThingNames.size > 0) {
      for (const a of room.actors) {
        if (a.target && hiddenThingNames.has(a.target) && (a.alpha === undefined || a.alpha === 1)) {
          a.alpha = 0.55;
        }
      }
    }
    markStrikeCountdowns(g, room);

    const rank = g.ended ? computeRunRank(g.commands, g.deaths, g.levels) : null;
    const shortcuts: string[] = [];
    if (g.chaosMode) shortcuts.push('CHAOS');

    const pendingLaptop = pendingLaptopTasks(g);
    return {
      cwd: cwdPath,
      floor: g.rt.spec.floorTheme,
      hub: g.rt.spec.mechanic === 'hub',
      bossLevel: g.rt.spec.mechanic === 'boss',
      ...(levelMusic ? { levelMusic } : {}),
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
      inventory: { items: [...g.inventory.items], held: g.inventory.held, vram: g.inventory.vram },
      battle: battleView(g.battle),
      openingDialog: openingActive(g),
      skippableDialog: hasSkippableDialog(g),
      ...(pendingLaptop.length > 0 ? { pendingLaptopTasks: pendingLaptop } : {}),
      volume: g.volume,
      level: levelInfo(g, effectiveCounts),
      hintGoals: chapterHintGoals(g),
    };
  }
