import type { StageBatsAmbient } from '../contracts/room-view.js';
import { buildModel, compensateInkOutlines, createAnimator, disposeModel, ModelCatalog, type BuiltModel, type ModelAnimator } from '../procgen/index.js';
import { stampMaterialBases } from './procgen-cast.js';
import { ACTOR_Z } from './stage-const.js';
import {
  computeBatHeading, cubicBezier, easeInOutSine, FLOCK_GAP_SEC, makeFlock,
  type BatBounds, type BatFlight,
} from './bat-path.js';
import type { ComicStage } from './comic-stage.js';

/** Ambient bats: a flock now and then crosses the stage corner to corner. Decoration only, never an actor. */
interface FlyingBat {
  flight: BatFlight;
  model: BuiltModel;
  animator: ModelAnimator;
  /** Seconds since the flock spawned, minus this bat's delay. */
  age: number;
  facingLeft: boolean;
  lastScaleKey: string;
}

export interface BatsState {
  nextIn: number;
  flying: FlyingBat[];
  enabled: boolean;
  minGapSec: number;
  maxGapSec: number;
  countRange?: [number, number];
  scaleMul: number;
  flockSize: number;
  entryCueSent: boolean;
  secondCueSent: boolean;
  sinceEntrySec: number;
}

const BAT_MODEL = 'prop.bat_flying';
/** The bat model's body centre above its origin; the route is drawn through the body, not the feet. */
const BODY_CENTRE_Y = 0.52;
/** Wings beat briskly on the 12 fps stepped clock in flight. */
const FLAP_RATE = 2.4;
/** Scaled so the wide 3/4 cartoon bat wingspan (~1.3u) reads crisply (~67–124 px) without dwarfing actors. */
const FLIGHT_SCALE = 1.25;
/** Behind actors (ACTOR_Z = 0.22), projectiles, lightning bolts (z <= 0.22) and FX shaders, in front of room walls (zWallFace ~ 1.12). */
const BAT_Z = ACTOR_Z + 0.18;
const BAT_RENDER_ORDER = -15;
const RECOIL_HOVER = { amp: 0.028, speed: 2.2 } as const;
const SECOND_BURST_DELAY_SEC = 0.28;

const nextGap = (minSec: number, maxSec: number): number =>
  minSec + Math.random() * Math.max(0.05, maxSec - minSec);

function resetFlockAudio(bats: BatsState, flockSize = 0): void {
  bats.flockSize = flockSize;
  bats.entryCueSent = false;
  bats.secondCueSent = false;
  bats.sinceEntrySec = 0;
}

export function createBatsState(): BatsState {
  return {
    nextIn: nextGap(FLOCK_GAP_SEC[0], FLOCK_GAP_SEC[1]),
    flying: [],
    enabled: true,
    minGapSec: FLOCK_GAP_SEC[0],
    maxGapSec: FLOCK_GAP_SEC[1],
    scaleMul: 1,
    flockSize: 0,
    entryCueSent: false,
    secondCueSent: false,
    sinceEntrySec: 0,
  };
}

function clearBats(stage: ComicStage): void {
  for (const bat of [...stage.bats.flying]) removeBat(stage, bat);
  stage.bats.flying = [];
  resetFlockAudio(stage.bats);
}

/** Applies optional JSON `ambient.bats` overrides (resetting to defaults when omitted). */
export function setBatsAmbient(stage: ComicStage, cfg?: StageBatsAmbient): void {
  const bats = stage.bats;
  if (cfg === undefined || cfg === true) {
    bats.enabled = true;
    bats.minGapSec = FLOCK_GAP_SEC[0];
    bats.maxGapSec = FLOCK_GAP_SEC[1];
    bats.countRange = undefined;
    bats.scaleMul = 1;
    return;
  }
  if (cfg === false) {
    bats.enabled = false;
    clearBats(stage);
    return;
  }
  bats.enabled = cfg.enabled ?? true;
  bats.minGapSec = Math.max(0.2, cfg.minGapSec ?? FLOCK_GAP_SEC[0]);
  bats.maxGapSec = Math.max(bats.minGapSec, cfg.maxGapSec ?? FLOCK_GAP_SEC[1]);
  bats.countRange = cfg.count;
  bats.scaleMul = typeof cfg.scale === 'number' && cfg.scale > 0 ? cfg.scale : 1;
  if (!bats.enabled) clearBats(stage);
  else bats.nextIn = Math.min(bats.nextIn, bats.maxGapSec);
}

function viewBounds(stage: ComicStage): BatBounds {
  const left = stage.panelLeft + stage.camPanX;
  const right = stage.panelRight + stage.camPanX;
  return {
    minX: Math.min(left, right),
    maxX: Math.max(left, right),
    minY: stage.feetY - 0.5,
    maxY: stage.viewTop,
  };
}

function spawnFlock(stage: ComicStage): void {
  const flock = makeFlock(Math.random, viewBounds(stage), stage.bats.countRange);
  resetFlockAudio(stage.bats, flock.length);
  for (const flight of flock) {
    const seed = Math.floor(Math.random() * 0x7fffffff);
    const model = buildModel(ModelCatalog.build(BAT_MODEL, seed), { seed });
    stampMaterialBases(model.allMaterials);
    const animator = createAnimator(model, { hoverBob: RECOIL_HOVER });
    animator.update(flight.phase * 2);
    model.group.visible = false;
    model.group.renderOrder = BAT_RENDER_ORDER;
    model.group.traverse((obj) => { obj.renderOrder = BAT_RENDER_ORDER; });
    stage.world.add(model.group);
    (stage as Partial<ComicStage>).applyInk?.(model.group);
    for (const mat of model.allMaterials) stage.extraComics.add(mat);
    stage.bats.flying.push({
      flight,
      model,
      animator,
      age: -flight.delaySec,
      facingLeft: flight.p3.x > flight.p0.x,
      lastScaleKey: '',
    });
  }
}

function removeBat(stage: ComicStage, bat: FlyingBat): void {
  bat.model.group.removeFromParent();
  for (const mat of bat.model.allMaterials) stage.extraComics.delete(mat);
  bat.animator.dispose();
  disposeModel(bat.model);
}

function placeBat(bat: FlyingBat, scaleMul: number): void {
  const { flight } = bat;
  const t = Math.min(1, Math.max(0, bat.age / flight.durationSec));
  const e = easeInOutSine(t);
  const at = cubicBezier(flight.p0, flight.p1, flight.p2, flight.p3, e);
  const e0 = e > 0.98 ? 0.98 : e;
  const pA = e > 0.98 ? cubicBezier(flight.p0, flight.p1, flight.p2, flight.p3, e0) : at;
  const pB = cubicBezier(flight.p0, flight.p1, flight.p2, flight.p3, Math.min(1, e0 + 0.02));
  const heading = computeBatHeading(pA, pB, bat.facingLeft);
  bat.facingLeft = heading.facingLeft;
  const g = bat.model.group;
  g.visible = bat.age >= 0;
  const size = flight.scale * FLIGHT_SCALE * scaleMul;
  const sx = heading.facingLeft ? -size : size;
  g.scale.set(sx, size, size);
  const scaleKey = `${heading.facingLeft ? '-' : '+'}${size.toFixed(4)}`;
  if (bat.lastScaleKey !== scaleKey) {
    bat.lastScaleKey = scaleKey;
    compensateInkOutlines(g);
  }
  g.position.set(at.x, at.y - BODY_CENTRE_Y * size, BAT_Z);
  g.rotation.z = heading.rotZ;
}

function emitFlockAudio(stage: ComicStage, visibleCount: number, dt: number): void {
  const bats = stage.bats;
  if (visibleCount <= 0) return;
  if (!bats.entryCueSent) {
    bats.entryCueSent = true;
    bats.sinceEntrySec = 0;
    stage.audioBus?.emit({ kind: 'sfx', cue: 'bat_wings' });
    return;
  }
  bats.sinceEntrySec += dt;
  if (
    bats.flockSize >= 4 &&
    !bats.secondCueSent &&
    (visibleCount >= Math.ceil(bats.flockSize / 2) || bats.sinceEntrySec >= SECOND_BURST_DELAY_SEC)
  ) {
    bats.secondCueSent = true;
    stage.audioBus?.emit({ kind: 'sfx', cue: 'bat_wings' });
  }
}

/** Advance the flock timer and every flight by `dt` seconds. Frozen while the game is paused. */
export function stepBats(stage: ComicStage, dt: number): void {
  const bats = stage.bats;
  if (stage.stormPaused || stage.devNoStorm) return;
  if (!bats.enabled || stage.reducedMotion.on) {
    if (bats.flying.length > 0) clearBats(stage);
    return;
  }
  bats.nextIn -= dt;
  if (bats.nextIn <= 0) {
    bats.nextIn = nextGap(bats.minGapSec, bats.maxGapSec);
    if (bats.flying.length === 0) spawnFlock(stage);
  }
  const alive: FlyingBat[] = [];
  let visibleCount = 0;
  for (const bat of bats.flying) {
    bat.age += dt;
    if (bat.age >= bat.flight.durationSec) {
      removeBat(stage, bat);
      continue;
    }
    if (bat.age >= 0) visibleCount += 1;
    bat.animator.update(dt * FLAP_RATE);
    placeBat(bat, bats.scaleMul);
    alive.push(bat);
  }
  bats.flying = alive;
  if (alive.length === 0) resetFlockAudio(bats);
  else emitFlockAudio(stage, visibleCount, dt);
}
