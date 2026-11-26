import { setRest } from './stage-actor.js';
import type { StageActor } from './stage-cast.js';

/** 3/4 profile yaw in radians (~68 deg), keeping the flat relief back out of view. */
export const HERO_TURN_YAW = 1.18;
/** Mid-turn yaw (~32 deg) used for the first 12 fps beat and deceleration step. */
export const HERO_HALF_YAW = 0.56;

const TURN_STEP_MS = 83;
const YAW_RUNGS = [-HERO_TURN_YAW, -HERO_HALF_YAW, 0, HERO_HALF_YAW, HERO_TURN_YAW] as const;

interface TurnState {
  clock: number;
  baseScale: number;
}

const turnStates = new WeakMap<StageActor, TurnState>();

function stateOf(hero: StageActor): TurnState {
  let st = turnStates.get(hero);
  if (!st) {
    st = { clock: 0, baseScale: Math.abs(hero.body.scale.x) || 1 };
    turnStates.set(hero, st);
  }
  return st;
}

function nearestRungIndex(yaw: number): number {
  let best = 2;
  let dist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < YAW_RUNGS.length; i++) {
    const d = Math.abs(yaw - YAW_RUNGS[i]!);
    if (d < dist) {
      dist = d;
      best = i;
    }
  }
  return best;
}

/**
 * Right-handed yaw toward horizontal displacement (`world +x` is screen-left, `-x` is screen-right;
 * models face `-z`, so positive yaw around `+Y` turns toward screen-right).
 */
export function yawForDx(dx: number): number {
  if (dx < -1e-3) return HERO_TURN_YAW;
  if (dx > 1e-3) return -HERO_TURN_YAW;
  return 0;
}

/** Advances `hero.body.rotation.y` toward `targetYaw` on 12 fps stepped comic rungs. */
export function stepHeroYaw(hero: StageActor, targetYaw: number, dtMs: number): void {
  if (hero.disposed) return;
  const st = stateOf(hero);
  if (Math.abs(hero.body.rotation.y - targetYaw) < 1e-3) {
    hero.body.rotation.y = targetYaw;
    st.clock = 0;
    return;
  }
  st.clock += dtMs;
  const goal = nearestRungIndex(targetYaw);
  while (st.clock >= TURN_STEP_MS) {
    st.clock -= TURN_STEP_MS;
    const cur = nearestRungIndex(hero.body.rotation.y);
    if (cur === goal) {
      hero.body.rotation.y = YAW_RUNGS[goal]!;
      break;
    }
    hero.body.rotation.y = YAW_RUNGS[cur + Math.sign(goal - cur)]!;
  }
}

/** Poses a 3/4 walk step toward horizontal displacement `dir` (`dx`) at progress `0..1`. */
export function poseHeroWalk(hero: StageActor, dir: number, progress01: number): void {
  if (hero.disposed) return;
  stateOf(hero);
  const sign = dir < -1e-3 ? 1 : dir > 1e-3 ? -1 : 0;
  hero.body.rotation.y = sign * (progress01 < 0.18 ? HERO_HALF_YAW : HERO_TURN_YAW);
  if (Math.abs(dir) > 1e-3) hero.animator.setFacing(dir > 0 ? 1 : -1);
  if (hero.animator.state !== 'walk') hero.animator.setState('walk');
}

/** Tucks the developer slightly back into a port cavity (`offset.z` and scale) in stepped comic poses. */
export function applyDoorTuck(hero: StageActor, tuck01: number): void {
  if (hero.disposed) return;
  const st = stateOf(hero);
  const s = Math.round(Math.min(1, Math.max(0, tuck01)) * 2) / 2;
  hero.offset.z = 0.2 * s;
  hero.body.scale.setScalar(st.baseScale * (1 - 0.18 * s));
}

/** Restores front-facing stance, neutral scale, zeroed doorway offset, and resting idle state. */
export function resetHeroPose(hero: StageActor): void {
  if (hero.disposed) return;
  const st = stateOf(hero);
  hero.body.rotation.y = 0;
  hero.body.rotation.z = 0;
  hero.offset.set(0, 0, 0);
  hero.body.scale.setScalar(st.baseScale);
  hero.animator.setFacing(-1);
  st.clock = 0;
  setRest(hero);
}
