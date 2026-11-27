import * as THREE from 'three';
import type { RoomActor } from '../contracts/room-view.js';
import type { StageActorRef, StagePickHit, StageRect } from '../contracts/stage-editor.js';
import type { ComicStage } from '../renderer/comic-stage.js';
import type { StageActor } from '../renderer/stage-cast.js';
import { ACTOR_Z } from '../renderer/stage-const.js';
import { placeX, unplaceX, unplaceY } from '../renderer/stage-layout.js';

const MIN_HIT_PX = 26;

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

const tmpBox = new THREE.Box3();
const tmpVec = new THREE.Vector3();
const tmpNear = new THREE.Vector3();
const tmpFar = new THREE.Vector3();

function stageCanvasRect(stage: ComicStage): DOMRect {
  const el = stage.mount.querySelector('canvas') ?? stage.mount;
  return el.getBoundingClientRect();
}

function projectNdcToHost(
  stage: ComicStage,
  hostEl: HTMLElement,
  world: THREE.Vector3,
): { x: number; y: number } {
  tmpVec.copy(world).project(stage.camera);
  const canvasRect = stageCanvasRect(stage);
  const hostRect = hostEl.getBoundingClientRect();
  const x = canvasRect.left - hostRect.left + (tmpVec.x * 0.5 + 0.5) * canvasRect.width;
  const y = canvasRect.top - hostRect.top + (-tmpVec.y * 0.5 + 0.5) * canvasRect.height;
  return { x, y };
}

function expandMinHitBox(minX: number, minY: number, maxX: number, maxY: number): StageRect {
  const w = maxX - minX;
  const h = maxY - minY;
  const padW = w < MIN_HIT_PX ? (MIN_HIT_PX - w) / 2 : 0;
  const padH = h < MIN_HIT_PX ? (MIN_HIT_PX - h) / 2 : 0;
  return { left: minX - padW, top: minY - padH, width: w + padW * 2, height: h + padH * 2 };
}

export function projectActorRect(
  stage: ComicStage,
  actor: StageActor,
  hostEl: HTMLElement,
): StageRect | null {
  if (!actor.group.visible) return null;
  actor.group.updateWorldMatrix(true, true);
  tmpBox.setFromObject(actor.body);
  if (tmpBox.isEmpty()) {
    actor.group.getWorldPosition(tmpVec);
    tmpBox.setFromCenterAndSize(tmpVec, new THREE.Vector3(0.4, 0.4, 0.4));
  }
  const { min, max } = tmpBox;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < 8; i++) {
    const pt = projectNdcToHost(
      stage,
      hostEl,
      new THREE.Vector3(i & 1 ? max.x : min.x, i & 2 ? max.y : min.y, i & 4 ? max.z : min.z),
    );
    minX = Math.min(minX, pt.x);
    maxX = Math.max(maxX, pt.x);
    minY = Math.min(minY, pt.y);
    maxY = Math.max(maxY, pt.y);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
  return expandMinHitBox(minX, minY, maxX, maxY);
}

export function actorRefFromRoomActor(
  stage: ComicStage,
  ra: RoomActor,
  actor?: StageActor,
): StageActorRef {
  const actorId = ra.id ?? ra.key;
  const x = actor
    ? round3(unplaceX(stage, actor.home.x))
    : round3(ra.x !== undefined ? ra.x : unplaceX(stage, placeX(stage, 0)));
  const y = actor
    ? round3(unplaceY(stage, actor.home.y))
    : round3(ra.y ?? 0);
  return {
    actorId,
    kind: ra.kind ?? 'prop',
    modelId: ra.model ?? '',
    ...(ra.target !== undefined ? { target: ra.target } : {}),
    ...(ra.portRole !== undefined ? { portRole: ra.portRole } : {}),
    ...(ra.label !== undefined ? { label: ra.label } : {}),
    x,
    y,
    zOrder: ra.zOrder ?? 0,
    scale: ra.scale ?? 1,
    rotation: ra.rotation ?? 0,
    ...(ra.socket !== undefined ? { socket: ra.socket } : {}),
    ...(ra.hidden || (ra.alpha !== undefined && ra.alpha < 0.99) ? { hidden: true } : {}),
  };
}

export function listStageActorRefs(stage: ComicStage): StageActorRef[] {
  const viewActors = stage.view?.actors ?? [];
  const refs: StageActorRef[] = [];
  for (const ra of viewActors) {
    const id = ra.id ?? ra.key;
    const actor = stage.actors.get(id);
    if (!actor) continue;
    refs.push(actorRefFromRoomActor(stage, ra, actor));
  }
  return refs;
}

export function pickStageActorAt(
  stage: ComicStage,
  hostEl: HTMLElement,
  clientX: number,
  clientY: number,
): StagePickHit | null {
  const hostRect = hostEl.getBoundingClientRect();
  const lx = clientX - hostRect.left;
  const ly = clientY - hostRect.top;
  const viewActors = stage.view?.actors ?? [];
  let best: {
    hit: StagePickHit;
    zOrder: number;
    area: number;
    worldZ: number;
  } | null = null;

  for (const ra of viewActors) {
    if (ra.hidden || (ra.alpha ?? 1) < 0.2) continue;
    const id = ra.id ?? ra.key;
    const actor = stage.actors.get(id);
    if (!actor || !actor.group.visible) continue;
    const bounds = projectActorRect(stage, actor, hostEl);
    if (!bounds) continue;
    if (
      lx < bounds.left ||
      lx > bounds.left + bounds.width ||
      ly < bounds.top ||
      ly > bounds.top + bounds.height
    ) {
      continue;
    }
    const zOrder = ra.zOrder ?? 0;
    const area = bounds.width * bounds.height;
    const worldZ = actor.home.z;
    const better =
      !best ||
      zOrder > best.zOrder ||
      (zOrder === best.zOrder && area < best.area - 4) ||
      (zOrder === best.zOrder && Math.abs(area - best.area) <= 4 && worldZ < best.worldZ);
    if (better) {
      best = {
        hit: { ref: actorRefFromRoomActor(stage, ra, actor), bounds },
        zOrder,
        area,
        worldZ,
      };
    }
  }
  return best?.hit ?? null;
}

export function clientToDesignPoint(
  stage: ComicStage,
  clientX: number,
  clientY: number,
  zPlane = ACTOR_Z,
): { x: number; y: number } {
  const rect = stageCanvasRect(stage);
  const w = Math.max(1, rect.width);
  const h = Math.max(1, rect.height);
  const nx = ((clientX - rect.left) / w) * 2 - 1;
  const ny = -((clientY - rect.top) / h) * 2 + 1;
  tmpNear.set(nx, ny, -1).unproject(stage.camera);
  tmpFar.set(nx, ny, 1).unproject(stage.camera);
  const dz = tmpFar.z - tmpNear.z;
  const t = Math.abs(dz) > 1e-6 ? (zPlane - tmpNear.z) / dz : 0.5;
  tmpVec.copy(tmpNear).lerp(tmpFar, t);
  return {
    x: unplaceX(stage, tmpVec.x),
    y: unplaceY(stage, tmpVec.y),
  };
}
