/**
 * AnimTag evaluation: one pure function per AnimType, no scene objects, no clock of its own.
 * `animPoseAt(tag, base, t, ctx)` answers "where is this part at time t".
 *
 * Comic timing is built in: time is quantized to ANIM_STEP_FPS ("on twos"), and periodic motion
 * goes through `animHoldWave`, which lingers on the extremes and snaps through the middle. The
 * pixel-art pass wants poses, not interpolation.
 * Skill: .kiro/skills/procedural-animation-3d/SKILL.md
 */
import * as THREE from 'three';
import { hashSeed } from '../core/rng.js';
import type { AnimTag, AnimType, Vec3 } from '../core/types.js';

/** Poses per second. 24 fps film "on twos". */
export const ANIM_STEP_FPS = 12;

export interface AnimBase {
  pos: Vec3;
  /** Euler XYZ radians. */
  rot: Vec3;
  scale: Vec3;
}

export interface AnimPose extends AnimBase {
  /** Multiplier for the part's emissive (`blink`, `pulse`). 1 = unchanged. */
  emissiveMul: number;
}

export interface AnimContext {
  /** Poses per second. Default ANIM_STEP_FPS; 0 = smooth (continuous) time. */
  fps?: number;
  /** 0 = standing, 1 = walking. Scales `legWalk` / `armSwing`. Default 0. */
  locomotion?: number;
  /** Scales every amplitude except jitter. Default 1. */
  ampMul?: number;
  /** Scales jitter amplitude; 0 switches the glitch off. Default 1. */
  jitterMul?: number;
  /** Part name (or any stable string): the seed of the jitter hash. Default ''. */
  name?: string;
}

export interface AnimTagDefaults {
  axis: 'x' | 'y' | 'z';
  /** Cycles per second (jitter: glitch steps per second). */
  speed: number;
  amp: number;
  /** Largest sane |speed| and |amp|; `validateAnimTags` reports anything beyond. 6 Hz is the most a 12 fps pose clock can show. */
  maxSpeed: number;
  maxAmp: number;
  /** What `amp` measures. */
  unit: 'units' | 'radians' | 'scale' | 'duty';
}

/** Defaults used when a tag leaves a field out. Tuned for a 1.6-unit vibecoder at 58 px per unit. */
export const ANIM_TAG_DEFAULTS: Record<AnimType, AnimTagDefaults> = {
  spin: { axis: 'y', speed: 0.5, amp: 1, maxSpeed: 4, maxAmp: 1, unit: 'scale' },
  bob: { axis: 'y', speed: 0.8, amp: 0.05, maxSpeed: 6, maxAmp: 0.4, unit: 'units' },
  pulse: { axis: 'y', speed: 1, amp: 0.08, maxSpeed: 6, maxAmp: 0.5, unit: 'scale' },
  swing: { axis: 'z', speed: 0.6, amp: 0.25, maxSpeed: 6, maxAmp: 1.6, unit: 'radians' },
  jitter: { axis: 'z', speed: 10, amp: 0.02, maxSpeed: 24, maxAmp: 0.12, unit: 'units' },
  blink: { axis: 'y', speed: 0.4, amp: 0.12, maxSpeed: 6, maxAmp: 0.9, unit: 'duty' },
  breathe: { axis: 'y', speed: 0.25, amp: 0.03, maxSpeed: 1.5, maxAmp: 0.15, unit: 'scale' },
  legWalk: { axis: 'x', speed: 2, amp: 0.45, maxSpeed: 4, maxAmp: 1.1, unit: 'radians' },
  armSwing: { axis: 'x', speed: 2, amp: 0.35, maxSpeed: 4, maxAmp: 1.1, unit: 'radians' },
  orbit: { axis: 'z', speed: 0.4, amp: 0.06, maxSpeed: 3, maxAmp: 1.5, unit: 'units' },
};

/** Share of jitter steps that are big "glitch frames", and how much bigger they are. */
export const ANIM_JITTER_GLITCH_CHANCE = 0.12;
export const ANIM_JITTER_GLITCH_GAIN = 3;
/** Share of jitter steps that rest on the base pose, so the twitch reads as a twitch. */
export const ANIM_JITTER_REST_CHANCE = 0.4;
/** Emissive a `blink` part is lent while lit when its zone does not glow by itself. */
export const ANIM_BLINK_GLOW = 0.6;
/** Emissive multiplier while a `blink` is shut. */
export const ANIM_BLINK_OFF = 0.12;

const TAU = Math.PI * 2;
const AXES: Record<'x' | 'y' | 'z', Vec3> = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };

/** Quantize time to poses. `fps <= 0` returns `t` unchanged. */
export function animStepTime(t: number, fps: number = ANIM_STEP_FPS): number {
  if (!(fps > 0)) return t;
  return Math.floor(t * fps + 1e-6) / fps;
}

/**
 * A sine that holds its extremes: |w| spends most of the cycle near 1 and snaps through 0.
 * Input in cycles, output in [-1, 1], zero at integer and half-integer cycles.
 */
export function animHoldWave(cycles: number): number {
  const s = Math.sin(cycles * TAU);
  const a = Math.abs(s);
  return Math.sign(s) * (1 - (1 - a) * (1 - a));
}

/** One beat per cycle: sharp attack (first 15%), eased decay. Output 0..1. */
export function animBeat(cycles: number): number {
  const p = cycles - Math.floor(cycles);
  if (p < 0.15) return p / 0.15;
  const d = 1 - (p - 0.15) / 0.85;
  return d * d;
}

/** Deterministic 0..1 hash of (seed, step, channel). The only "randomness" in the animation layer. */
export function animHash01(seed: number, step: number, channel = 0): number {
  let h = (seed ^ Math.imul(step | 0, 0x9e3779b1) ^ Math.imul((channel + 1) | 0, 0x85ebca6b)) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const _q = new THREE.Quaternion();
const _qBase = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _axis = new THREE.Vector3();

/**
 * Rotate a base transform by `angle` about `axis` through a model-space `pivot`:
 * translate to the pivot, rotate, translate back. Writes into `out` and returns it.
 */
export function animRotateAboutPivot(base: AnimBase, axis: Vec3, angle: number, pivot: Vec3, out: AnimBase): AnimBase {
  _axis.set(axis[0], axis[1], axis[2]).normalize();
  _q.setFromAxisAngle(_axis, angle);
  _v.set(base.pos[0] - pivot[0], base.pos[1] - pivot[1], base.pos[2] - pivot[2]).applyQuaternion(_q);
  out.pos = [pivot[0] + _v.x, pivot[1] + _v.y, pivot[2] + _v.z];
  _qBase.setFromEuler(_e.set(base.rot[0], base.rot[1], base.rot[2], 'XYZ'));
  _q.multiply(_qBase);
  _e.setFromQuaternion(_q, 'XYZ');
  out.rot = [_e.x, _e.y, _e.z];
  out.scale = [base.scale[0], base.scale[1], base.scale[2]];
  return out;
}

/**
 * `orbit` on a disk seen at an angle: an ellipse round `pivot` (minor/major `squash`, major axis rolled
 * by `tilt`), starting from the part's authored position. z swings by `sway` with the far (upper) half
 * pushed back, so the part slips behind whatever sits at the pivot and comes round in front of it.
 */
function diskOrbit(tag: AnimTag, base: AnimBase, pivot: Vec3, angle: number, pose: AnimPose): void {
  const squash = tag.squash ?? 1;
  const tilt = tag.tilt ?? 0;
  const sway = tag.sway ?? 0;
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  const dx = base.pos[0] - pivot[0];
  const dy = base.pos[1] - pivot[1];
  // Into the disk's own frame: undo the roll, then the squash.
  const u = dx * ct + dy * st;
  const v = (-dx * st + dy * ct) / squash;
  const r = Math.hypot(u, v);
  const t0 = Math.atan2(v, u);
  const t = t0 + angle;
  const lu = r * Math.cos(t);
  const lv = r * squash * Math.sin(t);
  pose.pos[0] = pivot[0] + lu * ct - lv * st;
  pose.pos[1] = pivot[1] + lu * st + lv * ct;
  pose.pos[2] = base.pos[2] + sway * (Math.sin(t) - Math.sin(t0));
}

function restPose(base: AnimBase): AnimPose {
  return {
    pos: [base.pos[0], base.pos[1], base.pos[2]],
    rot: [base.rot[0], base.rot[1], base.rot[2]],
    scale: [base.scale[0], base.scale[1], base.scale[2]],
    emissiveMul: 1,
  };
}

/**
 * The pose of one tagged part at time `t` (seconds). Pure: same arguments, same result.
 * `base` is the part's authored transform (`mesh.userData.base`); it is never mutated.
 */
export function animPoseAt(tag: AnimTag | undefined, base: AnimBase, t: number, ctx: AnimContext = {}): AnimPose {
  const pose = restPose(base);
  if (!tag) return pose;
  const def = ANIM_TAG_DEFAULTS[tag.type];
  const axisId = tag.axis ?? def.axis;
  const axis = AXES[axisId];
  const speed = tag.speed ?? def.speed;
  const ampMul = ctx.ampMul ?? 1;
  const amp = tag.amp ?? def.amp;
  const phase = tag.phase ?? 0;
  const pivot = tag.pivot ?? base.pos;
  const ts = animStepTime(t, ctx.fps ?? ANIM_STEP_FPS);
  const cycles = ts * speed + phase;

  switch (tag.type) {
    case 'spin':
      animRotateAboutPivot(base, axis, cycles * TAU, pivot, pose);
      break;
    case 'swing':
      animRotateAboutPivot(base, axis, amp * ampMul * animHoldWave(cycles), pivot, pose);
      break;
    case 'legWalk':
      animRotateAboutPivot(base, axis, amp * ampMul * (ctx.locomotion ?? 0) * animHoldWave(cycles), pivot, pose);
      break;
    case 'armSwing':
      // Opposite sign: an arm that shares its side's leg phase swings against that leg.
      animRotateAboutPivot(base, axis, -amp * ampMul * (ctx.locomotion ?? 0) * animHoldWave(cycles), pivot, pose);
      break;
    case 'bob': {
      const d = amp * ampMul * animHoldWave(cycles);
      pose.pos[0] += axis[0] * d;
      pose.pos[1] += axis[1] * d;
      pose.pos[2] += axis[2] * d;
      break;
    }
    case 'pulse': {
      const k = animBeat(cycles);
      const s = 1 + amp * ampMul * k;
      for (let i = 0; i < 3; i++) {
        pose.pos[i] = pivot[i]! + (base.pos[i]! - pivot[i]!) * s;
        pose.scale[i] = base.scale[i]! * s;
      }
      pose.emissiveMul = 1 + 0.5 * k;
      break;
    }
    case 'breathe': {
      // Slow, so a plain sine: stepping alone gives it the held look. Squash keeps the volume.
      const w = Math.sin(cycles * TAU) * amp * ampMul;
      const i = axisId === 'x' ? 0 : axisId === 'z' ? 2 : 1;
      for (let k = 0; k < 3; k++) {
        const s = k === i ? 1 + w : 1 - w * 0.5;
        pose.scale[k] = base.scale[k]! * s;
        pose.pos[k] = pivot[k]! + (base.pos[k]! - pivot[k]!) * s;
      }
      break;
    }
    case 'blink': {
      // `amp` is the share of the cycle the light is shut.
      const p = cycles;
      const duty = Math.min(0.95, Math.max(0, amp));
      pose.emissiveMul = p - Math.floor(p) >= 1 - duty ? ANIM_BLINK_OFF : 1;
      break;
    }
    case 'orbit': {
      if (tag.squash !== undefined || tag.tilt !== undefined || tag.sway !== undefined) {
        diskOrbit(tag, base, pivot, (cycles - phase) * TAU, pose);
        break;
      }
      // Circle in the XY page plane, orientation unchanged. Radius: distance to the pivot,
      // or `amp` around the part's own position when no pivot offsets it.
      let rx = base.pos[0] - pivot[0];
      let ry = base.pos[1] - pivot[1];
      let cx = pivot[0];
      let cy = pivot[1];
      if (Math.hypot(rx, ry) < 1e-6) {
        rx = amp * ampMul;
        ry = 0;
        cx = base.pos[0] - rx;
        cy = base.pos[1];
      }
      const a = (cycles - phase) * TAU;
      const c = Math.cos(a);
      const s = Math.sin(a);
      pose.pos[0] = cx + rx * c - ry * s;
      pose.pos[1] = cy + rx * s + ry * c;
      break;
    }
    case 'jitter': {
      // Always stepped, even with fps = 0: a glitch has no in-betweens. With a pose clock it changes
      // only on the pose grid, so a 6 fps zombie never shows more than 6 poses a second.
      const a = amp * (ctx.jitterMul ?? 1);
      if (a <= 0) break;
      const step = Math.floor(ts * speed + phase * 97 + 1e-6);
      const seed = hashSeed(ctx.name ?? '');
      if (animHash01(seed, step, 0) < ANIM_JITTER_REST_CHANCE) break;
      const glitch = animHash01(seed, step, 1) < ANIM_JITTER_GLITCH_CHANCE;
      const gain = a * (glitch ? ANIM_JITTER_GLITCH_GAIN : 1);
      const dx = (animHash01(seed, step, 2) * 2 - 1) * gain;
      const dy = (animHash01(seed, step, 3) * 2 - 1) * gain;
      // Default (axis z) displaces in the XY page plane; axis x or y restricts it to a scanline tear.
      if (tag.axis === 'x') pose.pos[0] += dx;
      else if (tag.axis === 'y') pose.pos[1] += dy;
      else {
        pose.pos[0] += dx;
        pose.pos[1] += dy;
      }
      if (glitch) pose.emissiveMul = 1.6;
      break;
    }
  }
  return pose;
}
