import * as THREE from 'three';
import { buildModel, createAnimator, disposeModel, ModelCatalog, type BuiltModel, type ModelAnimator } from '../procgen/index.js';
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
}

export interface BatsState {
  nextIn: number;
  flying: FlyingBat[];
}

const BAT_MODEL = 'prop.bat';
/** The bat model's body centre above its origin; the route is drawn through the body, not the feet. */
const BODY_CENTRE_Y = 0.54;
/** Wings beat this much faster in flight than on the wall prop. */
const FLAP_RATE = 3.2;
/** The prop bat is drawn for a wall perch; in flight it is blown up to read next to the hero. */
const FLIGHT_SCALE = 2.6;
const BAT_Z = ACTOR_Z - 0.45;

const gap = (): number => FLOCK_GAP_SEC[0] + Math.random() * (FLOCK_GAP_SEC[1] - FLOCK_GAP_SEC[0]);

export function createBatsState(): BatsState {
  return { nextIn: gap(), flying: [] };
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
  const flock = makeFlock(Math.random, viewBounds(stage));
  for (const flight of flock) {
    const seed = Math.floor(Math.random() * 0x7fffffff);
    const model = buildModel(ModelCatalog.build(BAT_MODEL, seed), { seed });
    stampMaterialBases(model.allMaterials);
    const animator = createAnimator(model, {});
    animator.update(flight.phase * 2);
    model.group.visible = false;
    stage.world.add(model.group);
    for (const mat of model.allMaterials) stage.extraComics.add(mat);
    stage.bats.flying.push({ flight, model, animator, age: -flight.delaySec });
  }
}

function removeBat(stage: ComicStage, bat: FlyingBat): void {
  bat.model.group.removeFromParent();
  for (const mat of bat.model.allMaterials) stage.extraComics.delete(mat);
  bat.animator.dispose();
  disposeModel(bat.model);
}

function placeBat(bat: FlyingBat): void {
  const { flight } = bat;
  const t = Math.min(1, Math.max(0, bat.age / flight.durationSec));
  const e = easeInOutSine(t);
  const at = cubicBezier(flight.p0, flight.p1, flight.p2, flight.p3, e);
  const ahead = cubicBezier(flight.p0, flight.p1, flight.p2, flight.p3, Math.min(1, e + 0.02));
  const g = bat.model.group;
  g.visible = bat.age >= 0;
  const size = flight.scale * FLIGHT_SCALE;
  g.scale.setScalar(size);
  g.position.set(at.x, at.y - BODY_CENTRE_Y * size, BAT_Z);
  // Bank into the turn: lean with the vertical part of the heading, kept small so the bat still reads front-on.
  const bank = Math.atan2(ahead.y - at.y, Math.abs(ahead.x - at.x) + 1e-6);
  g.rotation.z = THREE.MathUtils.clamp(bank, -0.5, 0.5) * (ahead.x < at.x ? -1 : 1);
}

/** Advance the flock timer and every flight by `dt` seconds. Frozen while the game is paused. */
export function stepBats(stage: ComicStage, dt: number): void {
  const bats = stage.bats;
  if (stage.stormPaused || stage.devNoStorm) return;
  if (stage.reducedMotion.on) {
    for (const bat of [...bats.flying]) removeBat(stage, bat);
    bats.flying = [];
    return;
  }
  bats.nextIn -= dt;
  if (bats.nextIn <= 0) {
    bats.nextIn = gap();
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
    placeBat(bat);
    alive.push(bat);
  }
  bats.flying = alive;
}
