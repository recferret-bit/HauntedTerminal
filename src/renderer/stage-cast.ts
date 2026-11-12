import * as THREE from 'three';
import type { ActorKind, ActorState, RoomActor } from '../contracts/room-view.js';
import {
  animActingOptions, ANIM_MALWARE_ACTING, buildModel, createAnimator, createAnimMaterialTint, disposeModel,
  ModelCatalog, TextureCatalog, toDataTexture,
  type AnimState, type AnimTint, type BuiltModel, type ModelAnimator, type ZoneId,
} from '../procgen/index.js';
import { createVortexMaterial, type ComicMaterial } from '../shaders/comic-material.js';
import { LEGACY_CAST, stampMaterialBases, type HauntedCast } from './procgen-cast.js';

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
  pid?: number;
  label?: string;
  target?: string;
  /** Last view x / y (design space), to tell a real move from a re-sync. */
  viewX: number;
  viewY: number;
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

export function kindForModel(modelId: string): ActorKind {
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

export function modelIdFor(ra: RoomActor): string {
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
export function procTexture(id: string, tileable = true): THREE.DataTexture | null {
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

export function buildStageActor(ra: RoomActor, seed: number): StageActor {
  const modelId = modelIdFor(ra);
  const legacy = ra.key !== 'entity' ? LEGACY_CAST[ra.key as keyof HauntedCast] : undefined;
  const kind: ActorKind = ra.kind ?? (legacy && (!ra.model || ra.model === legacy.model) ? legacy.kind : kindForModel(modelId));
  const model = buildModel(ModelCatalog.build(modelId, seed), { seed });
  stampMaterialBases(model.allMaterials);
  const tint = stateTintHook(model);
  // Prime the colour lerp now: it captures base colours on its first call, which must not be mid-flash.
  tint(null);
  const actorRef: { a: StageActor | null } = { a: null };
  const animator = createAnimator(model, {
    ...animActingOptions(modelId),
    onTint: (t) => tint(t),
    onBeat: (state, beat) => actorRef.a?.onBeat?.(state, beat),
  });
  const group = new THREE.Group();
  const id = actorId(ra);
  group.name = `actor:${id}`;
  const body = new THREE.Group();
  body.name = 'body';
  body.add(model.group);
  group.add(body);
  const scale = legacy && modelId === legacy.model && legacy.scale ? legacy.scale : 1;
  body.scale.setScalar(scale);
  model.group.userData.assetKey = ra.key;

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

  const box = new THREE.Box3().setFromObject(model.group);
  const height = Math.max(0.3, (Number.isFinite(box.max.y) ? box.max.y : 1) * scale);
  const sheet = ANIM_MALWARE_ACTING[modelId];
  const actor: StageActor = {
    id,
    key: ra.key,
    kind,
    modelId,
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
    viewX: Number.NaN,
    viewY: Number.NaN,
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

export function actorFeet(actor: StageActor, out = new THREE.Vector3()): THREE.Vector3 {
  return out.copy(actor.group.position);
}

export function disposeStageActor(actor: StageActor): void {
  if (actor.disposed) return;
  actor.disposed = true;
  actor.gen++;
  actor.onBeat = null;
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

/** Every comic material of every model the actor owns (fx and room excluded). */
export function actorMaterials(actor: StageActor): ComicMaterial[] {
  return actor.model.allMaterials;
}
