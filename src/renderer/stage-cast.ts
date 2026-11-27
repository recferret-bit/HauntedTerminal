import * as THREE from 'three';
import {
  normalizeRotationRad, normalizeScale, zOrderToRenderOrder,
  type ActorKind, type ActorState, type RoomActor,
} from '../contracts/room-view.js';
import {
  animActingOptions, ANIM_MALWARE_ACTING, buildModel, compensateInkOutlines, createAnimator, createAnimMaterialTint,
  disposeModel, ModelCatalog, TextureCatalog, toDataTexture,
  type AnimState, type AnimTint, type BuiltModel, type ModelAnimator, type ZoneId,
} from '../procgen/index.js';
import { createVortexMaterial, type ComicMaterial } from '../shaders/comic-material.js';
import { applyHeroFaceTier, heroFaceTierForHp, type HeroFaceTier } from './portrait.js';
import { LEGACY_CAST, stampMaterialBases, type HauntedCast } from './procgen-cast.js';
import { disposeDoorRig, type DoorRig } from './stage-door-rig.js';

/**
 * One live actor on the stage, built from a RoomActor: `RoomActor.model` when present, else the
 * legacy key's model (LEGACY_CAST). Any number of instances; keyed by `RoomActor.id ?? key`.
 *
 * Position = `base` (where it stands, walked toward `home` by the stage) + `offset` (tweens: hops,
 * lunges, rattles). Tweens that own the motion bump `lock`; every delayed callback checks `gen`.
 */
export interface StageActor {
  id: string;
  key: string;
  kind: ActorKind;
  modelId: string;
  seed: number;
  faceTier: HeroFaceTier;
  /** Outer group: placed by the stage. */
  group: THREE.Group;
  /** Holds the model (legacy scale lives here). Overlays (pips, plates) hang off `group`, not this. */
  body: THREE.Group;
  model: BuiltModel;
  animator: ModelAnimator;
  /** Every comic material, collected after the animator split its emissive clones. */
  all: ComicMaterial[];
  glow?: ComicMaterial;
  vortex?: THREE.ShaderMaterial;
  vortexMesh?: THREE.Mesh;
  /** Model height in world units (after scale), for overlays. */
  height: number;
  base: THREE.Vector3;
  home: THREE.Vector3;
  offset: THREE.Vector3;
  /** Number of tweens that own the motion: while > 0 the stage does not walk `base` toward `home`. */
  lock: number;
  /** Bumped by every new motion and by disposal: a stale tween callback sees a different value and bails. */
  gen: number;
  /** Last resting state the view asked for (so a re-sync does not restart a one-shot). */
  rest: AnimState;
  viewState?: ActorState;
  hp?: number;
  maxHp?: number;
  displayHp?: number;
  /** Attack countdown from the view (`RoomActor.strikeIn`). */
  strikeIn?: number;
  pid?: number;
  label?: string;
  target?: string;
  portRole?: 'entry' | 'exit' | 'sub';
  viewLocked?: boolean;
  doorRig: DoorRig | null;
  /** Last view x / y (design space), to tell a real move from a re-sync. */
  viewX: number;
  viewY: number;
  /** Inherited stage scale before per-actor JSON `scale` multiplier. */
  baseScale: [number, number, number];
  /** Effective [sx, sy, sz] resting scale on `body` (before facing sign). */
  scaleVec: [number, number, number];
  /** Effective [rx, ry, rz] resting rotation on `body` in radians. */
  baseRot: [number, number, number];
  /** Model raw dimensions for clearance & height updates when `scale` changes. */
  baseRawTop: number;
  rawMinY: number;
  rawMidY: number;
  rawHalfWidthX: number;
  isPickupModel: boolean;
  laidTransistor: boolean;
  transformKey: string;
  renderOrder: number;
  /** Killed / collected / removed: plays its exit, ignored by syncRoom, disposed at the end. */
  exiting: boolean;
  /** Death finished but the view still lists it: kept invisible until it leaves. */
  dead: boolean;
  disposed: boolean;
  /** Created hidden because a spawn event for it is still queued. */
  awaitingSpawn: boolean;
  /** Stepped travel (malware acting sheets): one jump of `stepUnits` every `stepEveryMs`. */
  stepUnits: number;
  stepEveryMs: number;
  stepClock: number;
  pips: THREE.Sprite | null;
  pipKey: string;
  plate: THREE.Sprite | null;
  plateKey: string;
  lockPlate: THREE.Sprite | null;
  /** Animator beat listener the stage may set per action. */
  onBeat: ((state: AnimState, beat: string) => void) | null;
  /** Re-apply the current state tint (after something else wrote uColor, e.g. a hit flash). */
  retint: () => void;
}

function kindForModel(modelId: string): ActorKind {
  if (modelId.startsWith('vibecoder.')) return 'vibecoder';
  if (modelId.startsWith('boss.')) return 'boss';
  if (modelId.startsWith('malware.')) return 'enemy';
  if (modelId.startsWith('pickup.')) return 'pickup';
  if (modelId.startsWith('door.')) return modelId === 'door.socket' ? 'npc' : 'door';
  return 'prop';
}

export function actorId(ra: RoomActor): string {
  return ra.id ?? ra.key;
}

function modelIdFor(ra: RoomActor): string {
  const legacy = ra.key !== 'entity' ? LEGACY_CAST[ra.key as keyof HauntedCast] : undefined;
  if (ra.model && ModelCatalog.has(ra.model)) return ra.model;
  if (legacy && ModelCatalog.has(legacy.model)) return legacy.model;
  return 'prop.file';
}

/** Resting animator state for a RoomActor, highest priority first (ANIM_ACTOR_FLAG_STATES + RoomActor.state). */
export function restStateFor(ra: RoomActor): AnimState {
  if (ra.petrified || ra.state === 'petrified') return 'petrified';
  if (ra.frozen || ra.state === 'frozen') return 'frozen';
  if (ra.hidden || ra.state === 'hidden' || (ra.alpha ?? 1) < 0.2) return 'hidden';
  if (ra.state === 'enraged') return 'enraged';
  if (ra.state === 'walk') return 'walk';
  if (ra.state === 'windup') return 'windup';
  return 'idle';
}

// ---- Textures for state looks and decals (built once, never disposed: userData.keep). ----

const texCache = new Map<string, THREE.DataTexture>();
function procTexture(id: string, tileable = true): THREE.DataTexture | null {
  if (!TextureCatalog.has(id)) return null;
  let tex = texCache.get(id);
  if (!tex) {
    tex = toDataTexture(TextureCatalog.build(id, 1), tileable);
    texCache.set(id, tex);
  }
  return tex;
}

const MALWARE_ZONES = new Set<ZoneId>(['corruptMagenta', 'corruptViolet', 'toxicGreen', 'voidPurple']);

/**
 * The stage's tint hook: the animator's colour lerp (createAnimMaterialTint) plus a surface swap,
 * so stone reads as stone and ice as ice, not just grey and blue:
 *   petrified (heatsink tint) -> tex.stone on every non-glowing material
 *   frozen    (ice tint)      -> tex.ice on every non-glowing material
 *   enraged   (lockRed tint)  -> tex.corruption on the malware-family zones only
 */
function stateTintHook(model: BuiltModel): ((tint: AnimTint | null) => void) & { again: () => void } {
  const lerp = createAnimMaterialTint(model);
  let last: AnimTint | null = null;
  const saved = new Map<ComicMaterial, { map: unknown; has: number }>();
  const restore = () => {
    for (const [mat, s] of saved) {
      if (mat.uniforms.uMap) mat.uniforms.uMap.value = s.map;
      if (mat.uniforms.uHasMap) mat.uniforms.uHasMap.value = s.has;
    }
    saved.clear();
  };
  const apply = (tint: AnimTint | null) => {
    last = tint;
    lerp(tint, model);
    restore();
    if (!tint) return;
    const texId = tint.zone === 'heatsink' ? 'tex.stone' : tint.zone === 'ice' ? 'tex.ice' : tint.zone === 'lockRed' ? 'tex.corruption' : null;
    const tex = texId ? procTexture(texId) : null;
    if (!tex) return;
    const targets: ComicMaterial[] = [];
    if (tint.zone === 'lockRed') {
      for (const [zoneId, mat] of model.materials) if (MALWARE_ZONES.has(zoneId)) targets.push(mat);
    } else {
      for (const mat of model.allMaterials) {
        if (((mat.userData.baseEmissive as number | undefined) ?? (mat.uniforms.uEmissive?.value as number) ?? 0) >= 0.3) continue;
        targets.push(mat);
      }
    }
    for (const mat of targets) {
      if (!mat.uniforms.uMap || !mat.uniforms.uHasMap || saved.has(mat)) continue;
      saved.set(mat, { map: mat.uniforms.uMap.value, has: mat.uniforms.uHasMap.value as number });
      mat.uniforms.uMap.value = tex;
      mat.uniforms.uHasMap.value = 1;
    }
  };
  return Object.assign(apply, { again: () => apply(last) });
}

function buildActorModel(
  modelId: string,
  assetKey: string,
  seed: number,
  faceTier: HeroFaceTier,
  onBeat: (state: AnimState, beat: string) => void,
): { model: BuiltModel; animator: ModelAnimator; tint: ReturnType<typeof stateTintHook> } {
  const spec = applyHeroFaceTier(ModelCatalog.build(modelId, seed), faceTier);
  const model = buildModel(spec, { seed });
  stampMaterialBases(model.allMaterials);
  const tint = stateTintHook(model);
  // Prime the colour lerp now: it captures base colours on its first call, which must not be mid-flash.
  tint(null);
  const animator = createAnimator(model, {
    ...animActingOptions(modelId),
    onTint: (t) => tint(t),
    onBeat,
  });
  model.group.userData.assetKey = assetKey;
  return { model, animator, tint };
}

/** Hot-swaps the 3D `vibecoder` actor mesh to match an HP or `'ouch'` face tier without losing animation phase. */
export function setHeroFaceTier(
  actor: StageActor,
  tier: HeroFaceTier,
  onSwap?: (group: THREE.Group) => void,
): void {
  if (actor.disposed || actor.exiting || actor.kind !== 'vibecoder' || actor.faceTier === tier) return;
  const prevState = actor.animator.state;
  const prevTime = actor.animator.time;
  const prevLoco = actor.animator.locomotion;
  actor.body.remove(actor.model.group);
  try {
    actor.animator.dispose();
  } catch {
    /* already gone */
  }
  disposeModel(actor.model);

  const built = buildActorModel(
    actor.modelId,
    actor.key,
    actor.seed,
    tier,
    (state, beat) => actor.onBeat?.(state, beat),
  );
  built.animator.time = prevTime;
  built.animator.setLocomotion(prevLoco);
  if (prevState !== 'idle') built.animator.setState(prevState);
  actor.body.add(built.model.group);
  actor.model = built.model;
  actor.animator = built.animator;
  actor.all = [...built.model.allMaterials];
  actor.glow = built.model.materials.get('lantern');
  actor.retint = () => built.tint.again();
  actor.faceTier = tier;
  applyActorRenderOrder(actor);
  compensateInkOutlines(actor.body);
  onSwap?.(actor.group);
}

const PICKUP_STAGE_SCALE = 2.4;
const PICKUP_FLOOR_CLEARANCE = 0.22;

function applyActorRenderOrder(actor: StageActor): void {
  actor.group.renderOrder = actor.renderOrder;
  actor.body.traverse((obj) => {
    obj.renderOrder = actor.renderOrder;
  });
}

/** Applies JSON `scale`, `rotation`, and `zOrder` renderOrder onto `actor.body` with ink compensation. */
export function applyActorTransform(actor: StageActor, ra: RoomActor, force = false): void {
  const key = JSON.stringify([ra.scale ?? null, ra.rotation ?? null, ra.zOrder ?? 0]);
  if (!force && actor.transformKey === key) return;
  actor.transformKey = key;
  const [sxMul, syMul, szMul] =
    ra.scale !== undefined
      ? normalizeScale(ra.scale)
      : actor.laidTransistor
        ? [1.45, 1.45, 1.45]
        : [1, 1, 1];
  const [rxRad, ryRad, rzRad] =
    ra.rotation !== undefined
      ? normalizeRotationRad(ra.rotation)
      : actor.laidTransistor
        ? [0, 0, Math.PI / 2]
        : [0, 0, 0];
  const prevScaleX = actor.scaleVec[0];
  const sx = actor.baseScale[0] * sxMul;
  const sy = actor.baseScale[1] * syMul;
  const sz = actor.baseScale[2] * szMul;
  actor.scaleVec = [sx, sy, sz];
  const restZ = rzRad;
  actor.baseRot = [rxRad, ryRad, restZ];
  actor.renderOrder = zOrderToRenderOrder(ra.zOrder);
  const wasFlipped = (prevScaleX < 0 ? -actor.body.scale.x : actor.body.scale.x) < 0;
  const facingSign = sx >= 0 && wasFlipped ? -1 : 1;
  if (!actor.exiting) {
    actor.body.scale.set(sx * facingSign, sy, sz);
    if (!actor.lock) actor.body.rotation.set(rxRad, ryRad, restZ);
  }
  const sideways = actor.laidTransistor && Math.abs(Math.abs(restZ) - Math.PI / 2) < 0.35;
  if (actor.isPickupModel && Number.isFinite(actor.rawMinY)) {
    actor.body.position.set(0, PICKUP_FLOOR_CLEARANCE - actor.rawMinY * Math.abs(sy), 0);
  } else if (sideways) {
    actor.body.position.set(actor.rawMidY * Math.abs(sx), actor.rawHalfWidthX * Math.abs(sy), 0);
  } else {
    actor.body.position.set(0, 0, 0);
  }
  actor.body.userData.restRotZ = restZ;
  actor.body.userData.baseRot = [...actor.baseRot];
  actor.body.userData.scaleVec = [...actor.scaleVec];
  const topY = sideways ? actor.rawHalfWidthX : actor.baseRawTop;
  actor.height = Math.max(0.3, topY * Math.abs(sy) + actor.body.position.y);
  applyActorRenderOrder(actor);
  compensateInkOutlines(actor.body);
}

export function buildStageActor(ra: RoomActor, seed: number): StageActor {
  const modelId = modelIdFor(ra);
  const legacy = ra.key !== 'entity' ? LEGACY_CAST[ra.key as keyof HauntedCast] : undefined;
  const kind: ActorKind = ra.kind ?? (legacy && (!ra.model || ra.model === legacy.model) ? legacy.kind : kindForModel(modelId));
  const faceTier: HeroFaceTier =
    kind === 'vibecoder' && ra.hp !== undefined && ra.maxHp !== undefined ? heroFaceTierForHp(ra.hp, ra.maxHp) : 0;
  const actorRef: { a: StageActor | null } = { a: null };
  const { model, animator, tint } = buildActorModel(
    modelId,
    ra.key,
    seed,
    faceTier,
    (state, beat) => actorRef.a?.onBeat?.(state, beat),
  );
  const group = new THREE.Group();
  const id = actorId(ra);
  group.name = `actor:${id}`;
  const body = new THREE.Group();
  body.name = 'body';
  body.add(model.group);
  group.add(body);
  const rawBox = new THREE.Box3().setFromObject(model.group);
  const isPickup = modelId.startsWith('pickup.');
  const laidTransistor = kind === 'pickup' && modelId === 'item.tube_transistor';
  const scale = legacy && modelId === legacy.model && legacy.scale
    ? legacy.scale
    : isPickup
      ? PICKUP_STAGE_SCALE
      : 1;
  body.scale.setScalar(laidTransistor && ra.scale === undefined ? 1.45 : scale);
  // Pickups bake ~0.5 hover into geometry; compensate so 2.4x scale keeps them near waist height instead of floating too high.
  if (isPickup && Number.isFinite(rawBox.min.y)) {
    body.position.y = PICKUP_FLOOR_CLEARANCE - rawBox.min.y * scale;
  } else if (laidTransistor && Number.isFinite(rawBox.max.x) && Number.isFinite(rawBox.max.y)) {
    // Lay the Tube Transistor on its side flush on the floor (y = 0), centered on its slot.
    body.rotation.z = Math.PI / 2;
    body.position.set(((rawBox.min.y + rawBox.max.y) * 0.5) * 1.45, ((rawBox.max.x - rawBox.min.x) * 0.5) * 1.45, 0);
  }
  body.userData.restRotZ = body.rotation.z;

  let vortex: THREE.ShaderMaterial | undefined;
  let vortexMesh: THREE.Mesh | undefined;
  if (modelId === 'door.devnull') {
    // /dev/null: the shader vortex sits in the ring's mouth; the ink disc of the model hides behind it.
    const v = model.sockets.vortex ?? [0, 0.75, -0.2];
    vortex = createVortexMaterial();
    vortexMesh = new THREE.Mesh(new THREE.SphereGeometry(0.34, 24, 16), vortex);
    vortexMesh.position.set(v[0], v[1], v[2] - 0.12);
    vortexMesh.userData.assetKey = 'black_hole';
    body.add(vortexMesh);
    const voidPart = model.parts.get('void');
    if (voidPart) voidPart.visible = false;
  }

  const rawTop = Number.isFinite(rawBox.max.y) ? rawBox.max.y : 1;
  const rawMinY = Number.isFinite(rawBox.min.y) ? rawBox.min.y : 0;
  const rawMidY = Number.isFinite(rawBox.min.y) && Number.isFinite(rawBox.max.y) ? (rawBox.min.y + rawBox.max.y) * 0.5 : 0;
  const rawHalfWidthX = Number.isFinite(rawBox.min.x) && Number.isFinite(rawBox.max.x) ? (rawBox.max.x - rawBox.min.x) * 0.5 : 0;
  const height = Math.max(0.3, rawTop * scale + body.position.y);
  const sheet = ANIM_MALWARE_ACTING[modelId];
  const actor: StageActor = {
    id,
    key: ra.key,
    kind,
    modelId,
    seed,
    faceTier,
    group,
    body,
    model,
    animator,
    all: [...model.allMaterials],
    glow: model.materials.get('lantern'),
    vortex,
    vortexMesh,
    height,
    base: new THREE.Vector3(),
    home: new THREE.Vector3(),
    offset: new THREE.Vector3(),
    lock: 0,
    gen: 0,
    rest: 'idle',
    viewState: undefined,
    hp: ra.hp,
    maxHp: ra.maxHp,
    displayHp: ra.hp,
    pid: ra.pid,
    label: ra.label,
    target: ra.target,
    portRole: ra.portRole,
    viewLocked: ra.locked,
    doorRig: null,
    viewX: Number.NaN,
    viewY: Number.NaN,
    baseScale: [scale, scale, scale],
    scaleVec: [scale, scale, scale],
    baseRot: [0, 0, body.rotation.z],
    baseRawTop: rawTop,
    rawMinY,
    rawMidY,
    rawHalfWidthX,
    isPickupModel: isPickup,
    laidTransistor,
    transformKey: '',
    renderOrder: 0,
    exiting: false,
    dead: false,
    disposed: false,
    awaitingSpawn: false,
    stepUnits: sheet?.stepUnits ?? 0,
    stepEveryMs: sheet?.stepEveryMs ?? 0,
    stepClock: 0,
    pips: null,
    pipKey: '',
    plate: null,
    plateKey: '',
    lockPlate: null,
    onBeat: null,
    retint: () => tint.again(),
  };
  applyActorTransform(actor, ra, true);
  actorRef.a = actor;
  return actor;
}

/** The world position of a model socket (`fx`, `lock`, `bubble`, `vortex`...), following the hover bob. */
export function actorSocket(actor: StageActor, socket: string, out = new THREE.Vector3()): THREE.Vector3 {
  const s = actor.model.sockets[socket] ?? actor.model.sockets.fx;
  actor.group.updateWorldMatrix(true, true);
  if (s) {
    out.set(s[0], s[1] + actor.animator.hoverOffset, s[2]);
    return actor.model.group.localToWorld(out);
  }
  out.set(0, actor.height * 0.5, 0);
  return actor.group.localToWorld(out);
}

export function disposeStageActor(actor: StageActor): void {
  if (actor.disposed) return;
  actor.disposed = true;
  actor.gen++;
  actor.onBeat = null;
  disposeDoorRig(actor);
  actor.group.removeFromParent();
  try {
    actor.animator.dispose();
  } catch {
    /* already gone */
  }
  if (actor.vortexMesh) {
    actor.vortexMesh.geometry.dispose();
    actor.vortex?.dispose();
  }
  disposeModel(actor.model);
}

// ---- Overlay data (the DOM overlay draws it: src/renderer/stage-overlay.ts) ----

/** HP pips for a damaged enemy or boss (at most 8 cells), or null when none should show. */
export function pipState(actor: StageActor): { lit: number; cells: number } | null {
  const max = actor.maxHp ?? 0;
  const hp = Math.max(0, actor.displayHp ?? actor.hp ?? max);
  const show = (actor.kind === 'enemy' || actor.kind === 'boss') && max > 0 && hp < max && hp > 0 && !actor.exiting && !actor.dead;
  if (!show) return null;
  const cells = Math.min(8, Math.max(1, Math.round(max)));
  return { lit: Math.max(1, Math.ceil((hp / max) * cells)), cells };
}
