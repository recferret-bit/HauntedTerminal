/**
 * Animator states as data. A state modulates the AnimTags of any model (clock speed, amplitude,
 * jitter, emissive, opacity, tint) and may add a keyed whole-body pose: the comic beats
 * (anticipation, strike, recover) are held poses with snaps between them, never floaty curves.
 * Skill: .kiro/skills/procedural-animation-3d/SKILL.md
 */
import type { ZoneId } from '../core/palette.js';
import { ANIM_STEP_FPS, animStepTime } from './tags.js';

export type AnimState =
  | 'idle'
  | 'walk'
  | 'windup'
  | 'attack'
  | 'hit'
  | 'death'
  | 'hidden'
  | 'revealed'
  | 'petrified'
  | 'frozen'
  | 'enraged';

export const ANIM_STATE_IDS: readonly AnimState[] = [
  'idle', 'walk', 'windup', 'attack', 'hit', 'death', 'hidden', 'revealed', 'petrified', 'frozen', 'enraged',
];

/** A whole-body pose, applied to every part in model space. The stage keeps ownership of the Group transform. */
export interface AnimRootPose {
  /** Units along the facing direction (see `setFacing`). Negative = pulled back. */
  forward: number;
  /** Units up. */
  up: number;
  /** Radians, positive leans toward the facing direction. Rotates about z: stays in the page plane. */
  lean: number;
  /** Squash and stretch about the feet (hover models: about their centre). */
  scaleX: number;
  scaleY: number;
  /** Added to every material's emissive: the flash. */
  emissiveAdd: number;
  /** Multiplies every material's opacity. */
  opacity: number;
  /** Units each part flies out from the model centre along its own hashed direction: the shatter. */
  scatter: number;
}

export const ANIM_ROOT_REST: Readonly<AnimRootPose> = {
  forward: 0, up: 0, lean: 0, scaleX: 1, scaleY: 1, emissiveAdd: 0, opacity: 1, scatter: 0,
};

export interface AnimRootKey extends Partial<AnimRootPose> {
  /** Seconds from the start of the state. */
  at: number;
  /** Beat name, reported through `onBeat` when the key is reached (`strike` is where damage lands). */
  beat?: string;
  /** `snap` (default): jump to this pose at `at` and hold. `ease`: ease out from the previous key, arriving at `at`. */
  ease?: 'snap' | 'ease';
}

export interface AnimStateDef {
  /** Looping states run until replaced. One-shots last `duration` seconds, then go to `next`. */
  loop: boolean;
  duration: number;
  /** `resume` = the looping state that was active before. `null` = hold the last pose (death). */
  next: AnimState | 'resume' | null;
  /** Multiplies the tag clock. 0 freezes every tag at its current pose. */
  timeScale: number;
  ampMul: number;
  jitterMul: number;
  emissiveMul: number;
  opacityMul: number;
  /** A looping state that one-shots do not return to (the wind-up before an attack). */
  transient?: boolean;
  /** Forces the locomotion weight. Unset = whatever `setLocomotion` says. */
  locomotion?: number;
  /** Colour hint handed to the `onTint` hook. The animator never touches `uColor` itself. */
  tintZone?: ZoneId;
  tintAmount?: number;
  /** Stepped random emissive glint, on wall time (works while the tag clock is frozen). */
  shimmer?: number;
  keys?: AnimRootKey[];
}

const base = (over: Partial<AnimStateDef>): AnimStateDef => ({
  loop: true, duration: 0, next: null, timeScale: 1, ampMul: 1, jitterMul: 1, emissiveMul: 1, opacityMul: 1, ...over,
});

/**
 * Every state, for any model. Timings are seconds; all key times sit on the 12 fps grid
 * or between poses on purpose (a snap lands on the next drawn pose).
 */
export const ANIM_STATES: Record<AnimState, AnimStateDef> = {
  idle: base({}),
  walk: base({ locomotion: 1 }),
  // The tell before an attack: the same parts, louder, for as long as the stage holds it. No tint.
  windup: base({ transient: true, timeScale: 1.3, ampMul: 1.3, jitterMul: 2, emissiveMul: 1.4 }),
  attack: base({
    loop: false, duration: 0.6, next: 'resume',
    keys: [
      { at: 0, beat: 'anticipation', forward: -0.12, lean: -0.14, scaleX: 1.06, scaleY: 0.92 },
      { at: 0.25, beat: 'strike', forward: 0.38, lean: 0.2, scaleX: 1.16, scaleY: 0.9, emissiveAdd: 0.35 },
      { at: 0.37, beat: 'recover', forward: 0.3, lean: 0.1, scaleX: 1.04, scaleY: 0.97 },
      { at: 0.6, ease: 'ease' },
    ],
  }),
  hit: base({
    loop: false, duration: 0.3, next: 'resume',
    keys: [
      { at: 0, beat: 'impact', forward: -0.14, lean: -0.2, scaleX: 0.92, scaleY: 1.06, emissiveAdd: 0.9 },
      { at: 0.09, beat: 'hold', forward: -0.14, lean: -0.12 },
      { at: 0.3, ease: 'ease' },
    ],
  }),
  death: base({
    loop: false, duration: 0.7, next: null, jitterMul: 2,
    keys: [
      { at: 0, beat: 'impact', forward: -0.1, scaleX: 1.1, scaleY: 0.9, emissiveAdd: 1 },
      { at: 0.12, beat: 'hold', forward: -0.1, scaleX: 1.04, scaleY: 0.96, emissiveAdd: 0.3 },
      { at: 0.25, beat: 'collapse', forward: -0.1, scaleX: 1.04, scaleY: 0.96, emissiveAdd: 0.3 },
      { at: 0.55, ease: 'ease', forward: -0.1, scaleX: 1.5, scaleY: 0.1, scatter: 0.35, opacity: 0.7 },
      { at: 0.7, beat: 'gone', ease: 'ease', forward: -0.1, scaleX: 1.6, scaleY: 0.05, scatter: 0.6, opacity: 0 },
    ],
  }),
  hidden: base({ ampMul: 0.4, jitterMul: 0, emissiveMul: 0.2, opacityMul: 0.06 }),
  revealed: base({
    loop: false, duration: 0.5, next: 'idle',
    keys: [
      { at: 0, opacity: 0.06, scaleX: 0.8, scaleY: 0.8 },
      { at: 0.08, beat: 'pop', opacity: 0.55, scaleX: 1.12, scaleY: 1.12, emissiveAdd: 0.6 },
      { at: 0.2, scaleX: 0.96, scaleY: 0.96, emissiveAdd: 0.2 },
      { at: 0.32 },
    ],
  }),
  petrified: base({
    timeScale: 0, jitterMul: 0, emissiveMul: 0.1, tintZone: 'heatsink', tintAmount: 0.85,
    keys: [{ at: 0, beat: 'set', emissiveAdd: 0.5 }, { at: 0.1 }],
  }),
  frozen: base({
    timeScale: 0, jitterMul: 0, tintZone: 'ice', tintAmount: 0.6, shimmer: 0.14,
    keys: [{ at: 0, beat: 'set', emissiveAdd: 0.6 }, { at: 0.1 }],
  }),
  enraged: base({
    timeScale: 1.6, ampMul: 1.25, jitterMul: 2.5, emissiveMul: 1.7, tintZone: 'lockRed', tintAmount: 0.3,
    keys: [{ at: 0, beat: 'flare', scaleX: 1.15, scaleY: 1.15, emissiveAdd: 0.8 }, { at: 0.12, scaleX: 0.97, scaleY: 0.97 }, { at: 0.25 }],
  }),
};

const easeOut = (x: number): number => 1 - (1 - x) * (1 - x) * (1 - x);

const FIELDS: (keyof AnimRootPose)[] = ['forward', 'up', 'lean', 'scaleX', 'scaleY', 'emissiveAdd', 'opacity', 'scatter'];

/**
 * The whole-body pose of a state (by name, or a custom definition) `stateTime` seconds after it started. Pure.
 * Time is quantized to `fps` poses per second (0 = smooth), so a snap key lands on a drawn pose.
 */
export function animRootPoseAt(state: AnimState | AnimStateDef, stateTime: number, fps: number = ANIM_STEP_FPS): AnimRootPose {
  const out: AnimRootPose = { ...ANIM_ROOT_REST };
  const keys = (typeof state === 'string' ? ANIM_STATES[state] : state).keys;
  if (!keys || keys.length === 0) return out;
  // The last key is always reached exactly, even when it sits between two drawn poses.
  const last = keys[keys.length - 1]!.at;
  const t = stateTime >= last ? stateTime : Math.max(0, animStepTime(stateTime, fps));
  let prev: AnimRootKey | null = null;
  let next: AnimRootKey | null = null;
  for (const key of keys) {
    if (key.at <= t + 1e-9) prev = key;
    else {
      next = key;
      break;
    }
  }
  const eased = next && next.ease === 'ease';
  const span = eased && next ? next.at - (prev?.at ?? 0) : 0;
  const k = eased && next && span > 0 ? easeOut(Math.min(1, Math.max(0, (t - (prev?.at ?? 0)) / span))) : 0;
  for (const f of FIELDS) {
    const a = prev?.[f] ?? ANIM_ROOT_REST[f];
    out[f] = eased && next ? a + ((next[f] ?? ANIM_ROOT_REST[f]) - a) * k : a;
  }
  return out;
}

/** Per-model changes to the shared states: only the fields given are replaced (`keys` as a whole). */
export type AnimStateOverrides = Partial<Record<AnimState, Partial<AnimStateDef>>>;

/** ANIM_STATES with a model's overrides merged in. */
export function animResolveStates(overrides?: AnimStateOverrides): Record<AnimState, AnimStateDef> {
  const out = {} as Record<AnimState, AnimStateDef>;
  for (const id of ANIM_STATE_IDS) out[id] = { ...ANIM_STATES[id], ...(overrides?.[id] ?? {}) };
  return out;
}
