import * as THREE from 'three';
import { ModelCatalog } from '../procgen/index.js';
import { isComic } from '../shaders/comic-material.js';
import { eventEntityIds } from './event-fx.js';
import type { RoomActor, RoomView } from './room-view.js';
import { actorId, actorSocket, buildStageActor, pipState, restStateFor, type StageActor } from './stage-cast.js';
import { ACTOR_Z, lockedNames, themeFor } from './stage-const.js';
import { doorLocked, fade, pendingQueuedSpawn, queuedFor, removeActor, setRest } from './stage-actor.js';
import { clearBubble, playFx, say } from './stage-fx.js';
import { applyLantern, drawNeighbors, placeX, syncFlood, syncRoomModel } from './stage-layout.js';
import { closeDoor, kill, openDoor, playSpawn } from './stage-motion.js';
import { anchorPoint, roomSocket } from './stage-resolve.js';
import type { ComicStage } from './comic-stage.js';

export function syncRoomInner(stage: ComicStage, view: RoomView): void {
  stage.view = view;
  if (!stage.built) return;
  stage.currentFloor = view.floor;
  const theme = themeFor(view.kind);
  const color = stage.backdrop?.material;
  if (color && !Array.isArray(color) && isComic(color)) color.uniforms.uColor.value.setHex(theme.bg);
  stage.scene.background = new THREE.Color(theme.bg);
  syncRoomModel(stage, view.kind);

  const roomChanged = view.path !== stage.lastPath;
  const layoutKey = `${stage.panelLeft.toFixed(3)}|${stage.panelRight.toFixed(3)}|${stage.feetY.toFixed(3)}`;
  const relayout = layoutKey !== stage.layoutKey;
  stage.layoutKey = layoutKey;

  const keepKiro = (view.actors ?? []).some((ra) => ra && actorId(ra) === 'kiro');
  if (roomChanged) {
    // A new panel: everyone but the hero (and Kiro when present in the new room) leaves with the old room.
    for (const a of [...stage.actors.values()]) {
      if (a.kind !== 'vibecoder' && !(keepKiro && a.id === 'kiro')) removeActor(stage, a);
    }
    clearBubble(stage);
  }

  const listed = new Set<string>();
  const seen = new Set<string>();
  let index = 0;
  for (const ra of view.actors ?? []) {
    if (!ra || typeof ra.x !== 'number') continue;
    const id = actorId(ra);
    if (seen.has(id)) continue;
    seen.add(id);
    listed.add(id);
    let a = stage.actors.get(id);
    const wantModel = ra.model;
    if (a && !a.exiting && wantModel && a.modelId !== wantModel && ModelCatalog.has(wantModel)) {
      removeActor(stage, a);
      a = undefined;
    }
    if (a && a.dead && ra.state !== 'death' && !ra.hidden && (ra.hp === undefined || ra.hp > 0)) {
      // Listed alive again (floor restart, respawn with the same id): a fresh actor.
      removeActor(stage, a);
      a = undefined;
    }
    let created = false;
    if (!a) {
      a = createActor(stage, ra);
      created = true;
    }
    (a as StageActor & { listed?: boolean }).listed = true;
    applyActor(stage, a, ra, index++, created || relayout || roomChanged);
    if (created) onActorCreated(stage, a);
  }
  for (const a of stage.actors.values()) {
    if (!listed.has(a.id)) (a as StageActor & { listed?: boolean }).listed = false;
  }

  stage.floodPercent = Math.max(0, Math.min(100, view.flood ?? 0));
  if (view.lantern) applyLantern(stage, 1);
  syncFlood(stage);
  if (!roomChanged && stage.floodPercent > stage.lastFlood + 4) playFx(stage, 'fx.flood-splash', anchorPoint(stage, 'flood', null), {}, 'flood');
  stage.lastFlood = stage.floodPercent;
  drawNeighbors(stage, view);
  stage.lastPath = view.path;
  stage.xrayOn = !!view.xray || stage.xrayProcs.length > 0;
  if (!view.xray && stage.xrayProcs.length === 0) stage.xrayOn = false;
  syncOverlays(stage);
}

function createActor(stage: ComicStage, ra: RoomActor): StageActor {
  const a = buildStageActor(ra, stage.actorSeed++);
  stage.world.add(a.group);
  stage.applyInk(a.group);
  stage.actors.set(a.id, a);
  if (pendingQueuedSpawn(stage, a.id)) a.awaitingSpawn = true;
  return a;
}

function onActorCreated(stage: ComicStage, a: StageActor): void {
  const pending = stage.pendingSpawn.get(a.id);
  if (pending) {
    stage.pendingSpawn.delete(a.id);
    playSpawn(stage, a, pending.reason);
  } else if (stage.revealArmed > stage.clockMs && a.rest !== 'hidden') {
    a.animator.setState('revealed');
  }
}

/** Place, state, hp: idempotent, so main.ts may call it every frame. */
export function applyActor(stage: ComicStage, a: StageActor, ra: RoomActor, index: number, snap: boolean): void {
  if (a.exiting) return;
  if (a.dead) {
    a.group.visible = false;
    return;
  }
  a.label = ra.label;
  a.target = ra.target;
  if (ra.pid !== undefined) a.pid = ra.pid;
  if (ra.maxHp !== undefined) a.maxHp = ra.maxHp;
  if (ra.hp !== undefined && ra.hp !== a.hp) {
    a.hp = ra.hp;
    if (!stage.queue.some((q) => eventEntityIds(q.ev).includes(a.id))) a.displayHp = ra.hp;
  }
  const y = Number.isFinite(ra.y) ? (ra.y as number) : 0;
  if (ra.x !== a.viewX || y !== a.viewY || snap) {
    a.viewX = ra.x;
    a.viewY = y;
    let x = placeX(stage, ra.x);
    // The plank bridges the room's own chasm socket.
    if (a.key === 'crate') {
      const bridge = roomSocket(stage, 'bridge');
      if (bridge && Math.abs(bridge.x - x) < 1.6) x = bridge.x;
    }
    const z = ACTOR_Z - (a.kind === 'pickup' ? 0.12 : a.kind === 'vibecoder' ? 0.06 : (index % 4) * 0.015);
    a.home.set(x, stage.feetY + y, z);
    if (snap && !a.lock) a.base.copy(a.home);
  }
  (a as StageActor & { viewHidden?: boolean }).viewHidden = !!ra.hidden;
  const alpha = ra.hidden ? 0 : ra.alpha ?? 1;
  if ((a as StageActor & { viewAlpha?: number }).viewAlpha !== alpha) {
    (a as StageActor & { viewAlpha?: number }).viewAlpha = alpha;
    if (!ra.hidden) fade(a, Math.max(alpha, 0.04));
  }
  const rest = ra.state === 'death' ? 'death' : restStateFor(ra);
  // The event that explains this change is still queued (behind a hero walk): let it play first.
  // The deferred view is re-applied when the queue no longer names the actor.
  if ((rest !== a.rest || ra.state !== a.viewState) && queuedFor(stage, a)) {
    (a as StageActor & { deferredRa?: RoomActor }).deferredRa = ra;
    return;
  }
  (a as StageActor & { deferredRa?: RoomActor }).deferredRa = undefined;
  if (rest !== a.rest || ra.state !== a.viewState) {
    const wasHidden = a.rest === 'hidden';
    a.rest = rest;
    a.viewState = ra.state;
    if (rest === 'death') {
      if (!a.exiting) kill(stage, a, 'other', 0, false);
    } else if (wasHidden && rest !== 'hidden' && stage.revealArmed > stage.clockMs) {
      a.animator.setState('revealed');
    } else if (!a.lock || rest === 'petrified' || rest === 'frozen') {
      const was = a.animator.state;
      setRest(a);
      if (rest === 'petrified' && was !== 'petrified' && !snap) say(stage, 'CHMOD -X // PETRIFIED!', actorSocket(a, 'fx'), '#adb5bd', 1.0);
    }
  }
}

/** Pips, PS_XRAY plates and lock plates for every actor. */
export function syncOverlays(stage: ComicStage): void {
  const procs = new Map(stage.xrayProcs.map((p) => [p.pid, p]));
  const lockedLabels = lockedNames(stage.view);
  for (const a of stage.actors.values()) {
    const b = a as StageActor & { badge?: { pips: { lit: number; cells: number } | null; plate: { pid: number; name?: string } | null; locked: boolean } };
    const p = a.pid !== undefined ? procs.get(a.pid) : undefined;
    const plateOn = stage.xrayOn && a.pid !== undefined && !a.exiting && !a.dead && (a.kind === 'enemy' || a.kind === 'boss' || p !== undefined);
    b.badge = {
      pips: pipState(a),
      plate: plateOn ? { pid: a.pid!, name: p ? `${p.name} ${Math.round(p.cpu)}%` : a.target ?? a.label } : null,
      locked: b.badge?.locked ?? false,
    };
    if (a.kind === 'door') {
      const locked = doorLocked(a, lockedLabels);
      const shown = a as StageActor & { lockedShown?: boolean };
      // The view is the truth for locks: unlocked (chmod, a solved socket, a valve) opens the door
      // once with a CLANK; re-locked (ransomware, a crack closing up) drops it back.
      if (shown.lockedShown === true && !locked && !a.exiting) {
        openDoor(stage, a);
        playFx(stage, 'fx.gate-open', actorSocket(a, 'fx'), {}, a.id);
      } else if (shown.lockedShown === false && locked && !a.exiting) {
        closeDoor(stage, a);
      }
      shown.lockedShown = locked;
      b.badge.locked = locked;
    }
  }
}
