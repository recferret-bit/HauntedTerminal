import * as THREE from 'three';
import type { StageBatsAmbient } from '../contracts/room-view.js';
import { buildModel, compensateInkOutlines, createAnimator, disposeModel, ModelCatalog, type BuiltModel, type ModelAnimator } from '../procgen/index.js';
import { stampMaterialBases } from './procgen-cast.js';
import { ACTOR_Z } from './stage-const.js';
import {
  cubicBezier, easeInOutSine, FLOCK_GAP_SEC, makeFlock,
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
  lastSize: number;
}

export interface BatsState {
  nextIn: number;
  flying: FlyingBat[];
  enabled: boolean;
  minGapSec: number;
  maxGapSec: number;
  countRange?: [number, number];
  scaleMul: number;
}

const BAT_MODEL = 'prop.bat';
/** The bat model's body centre above its origin; the route is drawn through the body, not the feet. */
const BODY_CENTRE_Y = 0.54;
/** Wings beat this much faster in flight than on the wall prop. */
const FLAP_RATE = 3.2;
/** The prop bat is drawn for a wall perch; in flight it is blown up to read next to the hero. */
const FLIGHT_SCALE = 2.6;
const BAT_Z = ACTOR_Z - 0.45;

const nextGap = (minSec: number, maxSec: number): number =>
  minSec + Math.random() * Math.max(0.05, maxSec - minSec);

export function createBatsState(): BatsState {
  return {
    nextIn: nextGap(FLOCK_GAP_SEC[0], FLOCK_GAP_SEC[1]),
    flying: [],
    enabled: true,
    minGapSec: FLOCK_GAP_SEC[0],
    maxGapSec: FLOCK_GAP_SEC[1],
    scaleMul: 1,
  };
}

function clearBats(stage: ComicStage): void {
  for (const bat of [...stage.bats.flying]) removeBat(stage, bat);
  stage.bats.flying = [];
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
  for (const flight of flock) {
    const seed = Math.floor(Math.random() * 0x7fffffff);
    const model = buildModel(ModelCatalog.build(BAT_MODEL, seed), { seed });
    stampMaterialBases(model.allMaterials);
    const animator = createAnimator(model, {});
    animator.update(flight.phase * 2);
    model.group.visible = false;
    stage.world.add(model.group);
    for (const mat of model.allMaterials) stage.extraComics.add(mat);
    stage.bats.flying.push({ flight, model, animator, age: -flight.delaySec, lastSize: 0 });
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
  const ahead = cubicBezier(flight.p0, flight.p1, flight.p2, flight.p3, Math.min(1, e + 0.02));
  const g = bat.model.group;
  g.visible = bat.age >= 0;
  const size = flight.scale * FLIGHT_SCALE * scaleMul;
  g.scale.setScalar(size);
  if (Math.abs(bat.lastSize - size) > 1e-4) {
    bat.lastSize = size;
    compensateInkOutlines(g);
  }
  g.position.set(at.x, at.y - BODY_CENTRE_Y * size, BAT_Z);
  // Bank into the turn: lean with the vertical part of the heading, kept small so the bat still reads front-on.
  const bank = Math.atan2(ahead.y - at.y, Math.abs(ahead.x - at.x) + 1e-6);
  g.rotation.z = THREE.MathUtils.clamp(bank, -0.5, 0.5) * (ahead.x < at.x ? -1 : 1);
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
  for (const bat of bats.flying) {
    bat.age += dt;
    if (bat.age >= bat.flight.durationSec) {
      removeBat(stage, bat);
      continue;
    }
    bat.animator.update(dt * FLAP_RATE);
    placeBat(bat, bats.scaleMul);
    alive.push(bat);
  }
  bats.flying = alive;
}
