import * as THREE from 'three';
import type { KernelEvent } from '../contracts/events.js';
import type { RoomSocketId } from '../contracts/room-view.js';
import { createStateMachine, type StateMachine, type TransitionTable } from '../contracts/state-machine.js';
import { disposeModel, type ModelAnimator, type BuiltModel } from '../procgen/index.js';
import { createComicMaterial } from '../shaders/comic-material.js';
import type { ComicStage } from './comic-stage.js';
import type { RoomKind } from './room-view.js';
import { claim, dropHitbox, owns, release } from './stage-actor.js';
import { disposeStageActor, type StageActor } from './stage-cast.js';
import { disposeTree, themeFor } from './stage-const.js';
import { smootherstep } from './stage-flight-path.js';
import { floorCaptionInfo, playCaptionBox } from './stage-fx.js';
import { HERO_HALF_YAW, HERO_TURN_YAW, applyDoorTuck, poseHeroWalk, resetHeroPose } from './stage-hero-turn.js';
import { roomSocket } from './stage-resolve.js';
import { stepped } from './tween.js';

export const LEVEL_TRANSITION_PHASES = ['idle', 'exit_walk', 'gutter_pan', 'entry_walk'] as const;
export type LevelTransitionPhase = (typeof LEVEL_TRANSITION_PHASES)[number];
export type LevelTransitionEvent = 'BEGIN' | 'ENTER_DOOR' | 'FINISH_PAN' | 'LAND' | 'SKIP';

export const LEVEL_TRANSITION_TRANSITIONS: TransitionTable<LevelTransitionPhase, LevelTransitionEvent> = {
  idle: { BEGIN: 'exit_walk' },
  exit_walk: { ENTER_DOOR: 'gutter_pan', SKIP: 'idle' },
  gutter_pan: { FINISH_PAN: 'entry_walk', SKIP: 'idle' },
  entry_walk: { LAND: 'idle', SKIP: 'idle' },
};

const EXIT_WALK_MS = 520;
const GUTTER_PAN_MS = 680;
const ENTRY_WALK_MS = 560;
const GUTTER_WORLD_W = 0.44;
const INK_BORDER_W = 0.09;
const ARM_WINDOW_MS = 250;

type FloorEnteredEvent = Extract<KernelEvent, { type: 'FLOOR_ENTERED' }>;

interface DetachedRoom {
  kind: RoomKind;
  seed: number;
  model: BuiltModel;
  animator: ModelAnimator;
}

interface TransitionState {
  machine: StateMachine<LevelTransitionPhase, LevelTransitionEvent>;
  armedClearedAt: number | null;
  pendingEnter: FloorEnteredEvent | null;
  enterEv: FloorEnteredEvent | null;
  phaseElapsed: number;
  panSpan: number;
  fromX: number;
  toDoorX: number;
  entryDoorX: number;
  heroGen: number;
  outgoingGroup: THREE.Group | null;
  outgoingRoom: DetachedRoom | null;
  outgoingActors: StageActor[];
  outgoingExtraMats: THREE.ShaderMaterial[];
  captionDrop: (() => void) | null;
}

const states = new WeakMap<ComicStage, TransitionState>();

function stateOf(stage: ComicStage): TransitionState {
  let st = states.get(stage);
  if (!st) {
    st = {
      machine: createStateMachine<LevelTransitionPhase, LevelTransitionEvent>({
        initial: 'idle',
        transitions: LEVEL_TRANSITION_TRANSITIONS,
      }),
      armedClearedAt: null,
      pendingEnter: null,
      enterEv: null,
      phaseElapsed: 0,
      panSpan: 0,
      fromX: 0,
      toDoorX: 0,
      entryDoorX: 0,
      heroGen: 0,
      outgoingGroup: null,
      outgoingRoom: null,
      outgoingActors: [],
      outgoingExtraMats: [],
      captionDrop: null,
    };
    states.set(stage, st);
  }
  return st;
}

/** Arms the outgoing transition window when `FLOOR_CLEARED` is queued. */
export function noteFloorCleared(stage: ComicStage): void {
  const st = stateOf(stage);
  if (stage.reducedMotion.on) {
    st.armedClearedAt = null;
    st.pendingEnter = null;
    return;
  }
  st.armedClearedAt = stage.clockMs;
}

/** Pairs `FLOOR_ENTERED` with a recent `FLOOR_CLEARED` so the incoming sync stages a two-panel scroll. */
export function noteFloorEntered(stage: ComicStage, ev: FloorEnteredEvent): boolean {
  const st = stateOf(stage);
  const armed = st.armedClearedAt !== null && stage.clockMs - st.armedClearedAt <= ARM_WINDOW_MS;
  st.armedClearedAt = null;
  if (!armed || stage.reducedMotion.on) {
    st.pendingEnter = null;
    return false;
  }
  st.pendingEnter = ev;
  stage.cursor = stage.clockMs;
  return true;
}

/** Clears an armed floor exit when the chapter finishes instead of entering another level. */
export function noteGameEnded(stage: ComicStage): void {
  const st = stateOf(stage);
  st.armedClearedAt = null;
  st.pendingEnter = null;
}

export function isLevelTransitionActiveOrArmed(stage: ComicStage): boolean {
  const st = stateOf(stage);
  if (st.machine.state !== 'idle' || st.pendingEnter !== null) return true;
  return st.armedClearedAt !== null && stage.clockMs - st.armedClearedAt <= ARM_WINDOW_MS;
}

export function isLevelTransitionPhase(stage: ComicStage, phase: LevelTransitionPhase): boolean {
  return stateOf(stage).machine.state === phase;
}

export function findExitDoorX(stage: ComicStage): number {
  let portX: number | null = null;
  let bestX: number | null = null;
  for (const a of stage.actors.values()) {
    if (a.exiting || a.kind !== 'door') continue;
    if (a.portRole === 'exit') {
      if (portX === null || a.home.x < portX) portX = a.home.x;
      continue;
    }
    const tagged = a as StageActor & { roomSocket?: RoomSocketId };
    if (tagged.roomSocket === 'door.right' || a.key === 'gate' || a.modelId === 'door.ethernet') {
      if (bestX === null || a.home.x < bestX) bestX = a.home.x;
    }
  }
  return portX ?? bestX ?? roomSocket(stage, 'door.right')?.x ?? (stage.panelRight + 0.65);
}

export function findEntryDoorX(stage: ComicStage): number {
  for (const a of stage.actors.values()) {
    if (!a.disposed && a.kind === 'door' && a.portRole === 'entry') return a.home.x;
  }
  const entry = stage.actors.get('door:entry');
  if (entry && !entry.disposed) return entry.home.x;
  return roomSocket(stage, 'door.left')?.x ?? (stage.panelLeft - 0.65);
}

function addPanelStrip(group: THREE.Group, w: number, h: number, x: number, y: number, color: number, z: number, order: number): void {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }),
  );
  mesh.rotation.y = Math.PI;
  mesh.position.set(x, y, z);
  mesh.renderOrder = order;
  group.add(mesh);
}

function buildInkBorders(stage: ComicStage, group: THREE.Group, panSpan: number, panelW: number, panelH: number, panelCy: number): void {
  const cxLeft = (stage.panelLeft + stage.panelRight) / 2 + panSpan;
  const cxRight = (stage.panelLeft + stage.panelRight) / 2;
  const topY = stage.viewTop - INK_BORDER_W / 2;
  const botY = stage.feetY - 0.5 + INK_BORDER_W / 2;
  addPanelStrip(group, GUTTER_WORLD_W, panelH, stage.panelLeft + (GUTTER_WORLD_W - INK_BORDER_W) / 2, panelCy, 0xefe6d2, -0.43, 4);
  addPanelStrip(group, INK_BORDER_W, panelH, stage.panelRight + panSpan - INK_BORDER_W / 2, panelCy, 0x110e1b, -0.45, 5);
  addPanelStrip(group, INK_BORDER_W, panelH, stage.panelLeft - INK_BORDER_W / 2, panelCy, 0x110e1b, -0.45, 5);
  addPanelStrip(group, panelW, INK_BORDER_W, cxLeft, topY, 0x110e1b, -0.45, 5);
  addPanelStrip(group, panelW, INK_BORDER_W, cxLeft, botY, 0x110e1b, -0.45, 5);
  addPanelStrip(group, panelW, INK_BORDER_W, cxRight, topY, 0x110e1b, -0.45, 5);
  addPanelStrip(group, panelW, INK_BORDER_W, cxRight, botY, 0x110e1b, -0.45, 5);
}

function detachOutgoingPanel(stage: ComicStage, st: TransitionState, panSpan: number): void {
  const panelW = Math.max(2, stage.panelLeft - stage.panelRight);
  const panelH = Math.max(2, stage.viewTop - (stage.feetY - 0.5));
  const panelCy = (stage.viewTop + (stage.feetY - 0.5)) / 2;
  const panelCx = (stage.panelLeft + stage.panelRight) / 2;
  const group = new THREE.Group();
  group.name = 'level-transition-outgoing';

  const bgMat = createComicMaterial(themeFor(stage.view?.kind ?? 'attic').bg, { halftone: true });
  const oldBackdrop = new THREE.Mesh(new THREE.PlaneGeometry(panelW, panelH), bgMat);
  oldBackdrop.rotation.y = Math.PI;
  oldBackdrop.position.set(panelCx + panSpan, panelCy, 1.7);
  group.add(oldBackdrop);
  stage.extraComics.add(bgMat);
  st.outgoingExtraMats.push(bgMat);

  if (stage.room) {
    const oldRoom = stage.room;
    stage.room = null;
    const oldMats = new Set(oldRoom.model.allMaterials);
    stage.comics = stage.comics.filter((m) => !oldMats.has(m));
    for (const mat of oldRoom.model.allMaterials) {
      stage.extraComics.add(mat);
      st.outgoingExtraMats.push(mat);
    }
    oldRoom.model.group.position.x += panSpan;
    group.add(oldRoom.model.group);
    st.outgoingRoom = oldRoom;
  }

  for (const a of [...stage.actors.values()]) {
    if (a.kind === 'vibecoder') continue;
    stage.actors.delete(a.id);
    dropHitbox(stage, a.id);
    for (const mat of a.model.allMaterials) {
      stage.extraComics.add(mat);
      st.outgoingExtraMats.push(mat);
    }
    a.group.position.x += panSpan;
    st.outgoingActors.push(a);
    group.add(a.group);
  }

  buildInkBorders(stage, group, panSpan, panelW, panelH, panelCy);
  stage.world.add(group);
  st.outgoingGroup = group;
}

function disposeOutgoing(stage: ComicStage, st: TransitionState): void {
  for (const mat of st.outgoingExtraMats) stage.extraComics.delete(mat);
  st.outgoingExtraMats.length = 0;
  if (st.outgoingRoom) {
    st.outgoingRoom.animator.dispose();
    disposeModel(st.outgoingRoom.model);
    st.outgoingRoom = null;
  }
  for (const a of st.outgoingActors) disposeStageActor(a);
  st.outgoingActors.length = 0;
  if (st.outgoingGroup) {
    disposeTree(st.outgoingGroup);
    st.outgoingGroup.removeFromParent();
    st.outgoingGroup = null;
  }
}

/**
 * Called at the start of `syncRoomInner` when a level-exit pair is pending. Detaches Panel A at `+panSpan`
 * so `syncRoomInner` builds Panel B at canonical `x = 0`, then returns a finisher that arms `exit_walk`.
 */
export function prepareIncomingLevelRoom(stage: ComicStage): (() => void) | null {
  const st = stateOf(stage);
  if (!st.pendingEnter) return null;
  if (st.machine.state !== 'idle' || st.outgoingGroup) skipLevelTransition(stage);
  const enterEv = st.pendingEnter;
  st.pendingEnter = null;
  st.armedClearedAt = null;
  if (!enterEv) return null;

  const panelW = Math.max(2, stage.panelLeft - stage.panelRight);
  const panSpan = panelW + GUTTER_WORLD_W;
  const heroX = stage.hero()?.base.x ?? (stage.panelLeft - 0.41 * panelW);
  const exitDoorX = findExitDoorX(stage);

  detachOutgoingPanel(stage, st, panSpan);

  return () => {
    const hero = stage.hero();
    if (!hero) {
      disposeOutgoing(stage, st);
      stage.camPanX = 0;
      return;
    }
    st.enterEv = enterEv;
    st.panSpan = panSpan;
    st.fromX = heroX + panSpan;
    st.toDoorX = exitDoorX + panSpan;
    st.entryDoorX = findEntryDoorX(stage);
    st.phaseElapsed = 0;
    st.heroGen = claim(hero);
    stage.camPanX = panSpan;
    hero.base.set(st.fromX, hero.home.y, hero.home.z);
    hero.offset.set(0, 0, 0);
    hero.group.position.copy(hero.base);
    st.machine.send('BEGIN');
  };
}

function showLevelCaption(stage: ComicStage, st: TransitionState): void {
  const ev = st.enterEv;
  if (!ev) return;
  const { title, path, accent } = floorCaptionInfo(stage, ev);
  st.captionDrop = playCaptionBox(stage, `ENTERING SECTOR ${String(ev.floorId).padStart(2, '0')}`, title, path, accent, 1180);
}

/** Advances the 3-phase comic level transition (`exit_walk` -> `gutter_pan` -> `entry_walk`). */
export function stepLevelTransition(stage: ComicStage, dtMs: number): void {
  const st = stateOf(stage);
  if (st.machine.state === 'idle') return;
  const hero = stage.hero();
  if (!hero || !owns(hero, st.heroGen)) {
    skipLevelTransition(stage);
    return;
  }

  st.phaseElapsed += dtMs;
  if (st.machine.state === 'exit_walk') {
    const t = Math.min(1, st.phaseElapsed / EXIT_WALK_MS);
    const k = stepped(t, 6);
    const dir = Math.sign(st.toDoorX - st.fromX) || -1;
    hero.base.set(st.fromX + (st.toDoorX - st.fromX) * k, hero.home.y, hero.home.z);
    hero.offset.y = 0;
    poseHeroWalk(hero, dir, t);
    applyDoorTuck(hero, t >= 0.65 ? (t - 0.65) / 0.35 : 0);
    if (st.phaseElapsed >= EXIT_WALK_MS) {
      st.phaseElapsed -= EXIT_WALK_MS;
      st.machine.send('ENTER_DOOR');
      hero.base.set(st.entryDoorX, hero.home.y, hero.home.z);
      applyDoorTuck(hero, 1);
      hero.body.rotation.y = hero.baseRot[1] + HERO_TURN_YAW;
      hero.animator.setState('idle');
      showLevelCaption(stage, st);
    }
  }
  if (st.machine.state === 'gutter_pan') {
    const t = Math.min(1, st.phaseElapsed / GUTTER_PAN_MS);
    stage.camPanX = st.panSpan * (1 - smootherstep(t));
    if (st.phaseElapsed >= GUTTER_PAN_MS) {
      st.phaseElapsed -= GUTTER_PAN_MS;
      stage.camPanX = 0;
      disposeOutgoing(stage, st);
      st.machine.send('FINISH_PAN');
    }
  }
  if (st.machine.state === 'entry_walk') {
    const t = Math.min(1, st.phaseElapsed / ENTRY_WALK_MS);
    const k = stepped(t, 6);
    const dir = Math.sign(hero.home.x - st.entryDoorX) || -1;
    applyDoorTuck(hero, t < 0.35 ? 1 - t / 0.35 : 0);
    hero.base.set(st.entryDoorX + (hero.home.x - st.entryDoorX) * k, hero.home.y, hero.home.z);
    if (t < 0.85) poseHeroWalk(hero, dir, t);
    else {
      hero.body.rotation.y = hero.baseRot[1] + (dir < 0 ? 1 : -1) * HERO_HALF_YAW;
      if (hero.animator.state !== 'idle') hero.animator.setState('idle');
    }
    if (st.phaseElapsed >= ENTRY_WALK_MS) {
      st.machine.send('LAND');
      release(hero, st.heroGen);
      hero.base.copy(hero.home);
      resetHeroPose(hero);
      st.enterEv = null;
    }
  }
}

/** Immediately settles any active transition to the landed Panel B state. */
export function skipLevelTransition(stage: ComicStage): void {
  const st = stateOf(stage);
  const active = st.machine.state !== 'idle';
  if (!active && !st.outgoingGroup && st.armedClearedAt === null && !st.pendingEnter) return;
  st.armedClearedAt = null;
  st.pendingEnter = null;
  st.enterEv = null;
  st.phaseElapsed = 0;
  st.captionDrop?.();
  st.captionDrop = null;
  disposeOutgoing(stage, st);
  stage.camPanX = 0;
  if (active) st.machine.send('SKIP');
  const hero = stage.hero();
  if (hero && owns(hero, st.heroGen)) {
    release(hero, st.heroGen);
    hero.base.copy(hero.home);
    resetHeroPose(hero);
  }
}
