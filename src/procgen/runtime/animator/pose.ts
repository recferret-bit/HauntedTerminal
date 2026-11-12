/**
 * Pose application: samples the tag clock, evaluates every part's tag, adds the whole-body root pose
 * (squash, lean, forward step, death scatter, hover, gaze) and writes mesh transforms and material
 * uniforms. Reads the runtime; writes only `shown`, `poseGrid`, `poseClock` and `hoverOffset` of it.
 */
import * as THREE from 'three';
import { ANIM_BLINK_GLOW, animHash01, animHoldWave, animPoseAt, animStepTime } from '../../anim/tags.js';
import { animRootPoseAt, type AnimRootPose, type AnimStateDef } from '../../anim/states.js';
import { writeMat, type MatSlot } from './materials.js';
import type { HoverRig } from './hover.js';
import type { PartSlot } from './parts.js';
import type { AnimRuntime } from './runtime.js';

/** Everything about the model that is fixed once the animator is built. */
export interface PoseRig {
  fps: number;
  bounce: number;
  bounceRate: number;
  lookAmp: number;
  modelSeed: number;
  pivotX: number;
  pivotY: number;
  hover: HoverRig;
  slots: PartSlot[];
  mats: readonly MatSlot[];
  /** Scratch: summed emissive multipliers of the parts driving each material, and how many. */
  emSum: Float64Array;
  emCount: Uint16Array;
}

/** What the tags of this frame are evaluated with. */
interface FrameInputs {
  loco: number;
  ampMul: number;
  jitterMul: number;
  /** Tag clock to sample. */
  tq: number;
}

/** The whole-body lean of this frame, as sin / cos. */
interface Lean {
  has: boolean;
  cos: number;
  sin: number;
}

const _q = new THREE.Quaternion();
const _qz = new THREE.Quaternion();
const _e = new THREE.Euler();
const Z_AXIS = new THREE.Vector3(0, 0, 1);

/**
 * The pose grid is on wall time (what the player sees), the tags run on the scaled clock: sample the
 * clock at the last grid line, so an enraged actor still shows `fps` poses a second. A stopped-clock
 * state replays the latched values instead.
 */
function resolveInputs(rig: PoseRig, rt: AnimRuntime, def: AnimStateDef): FrameInputs {
  if (rig.fps > 0) {
    const grid = Math.floor(rt.time * rig.fps + 1e-6);
    if (grid !== rt.poseGrid) {
      rt.poseGrid = grid;
      rt.poseClock = rt.clock - (rt.time - animStepTime(rt.time, rig.fps)) * (rt.endReported ? 0 : def.timeScale);
    }
  } else rt.poseClock = rt.clock;
  const inputs: FrameInputs = rt.latched
    ? { loco: rt.latched.loco, ampMul: rt.latched.ampMul, jitterMul: rt.latched.jitterMul, tq: rt.latched.clock }
    : { loco: def.locomotion ?? rt.locomotion, ampMul: def.ampMul, jitterMul: def.jitterMul, tq: rt.poseClock };
  rt.shown.loco = inputs.loco;
  rt.shown.ampMul = inputs.ampMul;
  rt.shown.jitterMul = inputs.jitterMul;
  rt.shown.clock = inputs.tq;
  return inputs;
}

/** Pose one part: tag, then whole-body squash about the pivot, lean about z, then translation. */
function poseSlot(s: PartSlot, rig: PoseRig, rt: AnimRuntime, inputs: FrameInputs, root: AnimRootPose, lean: Lean, up: number): void {
  s.ctx.locomotion = inputs.loco;
  s.ctx.ampMul = inputs.ampMul;
  s.ctx.jitterMul = inputs.jitterMul;
  const pose = animPoseAt(s.tag, s.base, inputs.tq, s.ctx);
  const { pivotX, pivotY } = rig;
  let x = pivotX + (pose.pos[0] - pivotX) * root.scaleX;
  let y = pivotY + (pose.pos[1] - pivotY) * root.scaleY;
  let rx = pose.rot[0];
  let ry = pose.rot[1];
  let rz = pose.rot[2];
  if (lean.has) {
    const ox = x - pivotX;
    const oy = y - pivotY;
    x = pivotX + ox * lean.cos - oy * lean.sin;
    y = pivotY + ox * lean.sin + oy * lean.cos;
    _q.setFromEuler(_e.set(rx, ry, rz, 'XYZ')).premultiply(_qz);
    _e.setFromQuaternion(_q, 'XYZ');
    rx = _e.x;
    ry = _e.y;
    rz = _e.z;
  }
  x += root.forward * rt.facing + s.dirX * root.scatter;
  y += up + s.dirY * root.scatter + (s.hovers ? rt.hoverOffset : 0);
  if (s.looks) {
    x += rt.lookX * rig.lookAmp;
    y += rt.lookY * rig.lookAmp;
  }
  s.mesh.position.set(x, y, pose.pos[2]);
  s.mesh.rotation.set(rx, ry, rz);
  s.mesh.scale.set(pose.scale[0] * root.scaleX, pose.scale[1] * root.scaleY, pose.scale[2]);
  if (s.emissiveMat >= 0) {
    rig.emSum[s.emissiveMat]! += pose.emissiveMul;
    rig.emCount[s.emissiveMat]!++;
  }
}

/** Write the state's emissive / opacity multipliers onto every material. */
function writeMaterials(rig: PoseRig, rt: AnimRuntime, def: AnimStateDef, root: AnimRootPose): void {
  const shimmer = def.shimmer ? def.shimmer * animHash01(rig.modelSeed, Math.floor(rt.time * 6 + 1e-6), 11) : 0;
  const opacity = Math.max(0, def.opacityMul * root.opacity);
  for (let i = 0; i < rig.mats.length; i++) {
    const partMul = rig.emCount[i]! > 0 ? rig.emSum[i]! / rig.emCount[i]! : 1;
    const m = rig.mats[i]!;
    const glow = m.blinkGlow ? ANIM_BLINK_GLOW * partMul * def.emissiveMul : 0;
    writeMat(m, partMul * def.emissiveMul, root.emissiveAdd + shimmer + glow, opacity);
  }
}

/** Evaluate and write the pose of the current state at the current time. */
export function applyPose(rig: PoseRig, rt: AnimRuntime): void {
  if (!rt.enabled || rt.disposed) return;
  const def = rt.defs[rt.state];
  const root = animRootPoseAt(def, rt.stateTime, rig.fps);
  const inputs = resolveInputs(rig, rt, def);
  rig.hover.ctx.ampMul = inputs.ampMul;
  rt.hoverOffset = rig.hover.on ? animPoseAt(rig.hover.tag, rig.hover.base, inputs.tq, rig.hover.ctx).pos[1] : 0;
  const up = root.up + rig.bounce * inputs.loco * Math.abs(animHoldWave(inputs.tq * rig.bounceRate * 0.5));
  const leanAngle = -root.lean * rt.facing;
  const lean: Lean = { has: Math.abs(leanAngle) > 1e-9, cos: Math.cos(leanAngle), sin: Math.sin(leanAngle) };
  if (lean.has) _qz.setFromAxisAngle(Z_AXIS, leanAngle);
  rig.emSum.fill(0);
  rig.emCount.fill(0);
  for (const s of rig.slots) poseSlot(s, rig, rt, inputs, root, lean, up);
  writeMaterials(rig, rt, def, root);
}
