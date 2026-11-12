/**
 * CPU animator for a BuiltModel. The game shows a handful of actors, each a Group with one Mesh per
 * part, so setting mesh transforms once per frame is the right tool: no skinning, no shader rig.
 *
 * The animator owns: each part mesh's position / rotation / scale, and the `uEmissive` / `uOpacity`
 * uniforms of the model's comic materials (always `base * multiplier`, the base is never lost).
 * It never touches `model.group`'s own transform (the stage tweens that) and never touches `uColor`
 * (tints go through the `onTint` hook).
 *
 * Modules: types (public API), runtime (clocks + state machine), parts (part slots, material clones),
 * materials (emissive / opacity writing), hover (rigid hover bob), pose (pose application), tint.
 * Skill: .kiro/skills/procedural-animation-3d/SKILL.md
 */
import type { BuiltModel } from '../build.js';
import { ANIM_STEP_FPS } from '../../anim/tags.js';
import type { AnimState } from '../../anim/states.js';
import { createMatTable, restoreMats } from './materials.js';
import { resolveHover } from './hover.js';
import { buildPartRig, releaseClones, restoreParts } from './parts.js';
import { applyPose, type PoseRig } from './pose.js';
import { advance, applyTint, clamp01, createRuntime, enterState, flushBeats, relatch, resetRuntime, restartClocks } from './runtime.js';
import type { AnimatorOptions, ModelAnimator } from './types.js';

export type { AnimTint, AnimTintHook, AnimatorOptions, ModelAnimator } from './types.js';
export { createAnimMaterialTint } from './tint.js';

interface BuiltRig {
  rig: PoseRig;
  /** Swap the shared materials back and drop the split-emissive clones. */
  release: () => void;
  /** Drop the part and material slots. */
  clear: () => void;
}

/** Build the fixed per-model data the pose needs: part slots, material table, hover. */
function buildPoseRig(model: BuiltModel, opts: AnimatorOptions): BuiltRig {
  const table = createMatTable(model);
  const hover = resolveHover(model, opts);
  const parts = buildPartRig(model, opts, table, hover.bodyBob);
  const rig: PoseRig = {
    fps: opts.smooth ? 0 : opts.fps ?? ANIM_STEP_FPS,
    bounce: opts.bounce ?? 0.035,
    bounceRate: opts.bounceRate ?? 4,
    lookAmp: opts.lookAmp ?? 0.02,
    modelSeed: parts.modelSeed,
    pivotX: parts.pivotX,
    pivotY: parts.pivotY,
    hover,
    slots: parts.slots,
    mats: table.mats,
    emSum: new Float64Array(table.mats.length),
    emCount: new Uint16Array(table.mats.length),
  };
  return {
    rig,
    release: () => releaseClones(model, parts.clones),
    clear: () => {
      parts.slots.length = 0;
      table.clear();
    },
  };
}

export function createAnimator(model: BuiltModel, opts: AnimatorOptions = {}): ModelAnimator {
  const rt = createRuntime(model, opts);
  const { rig, release, clear } = buildPoseRig(model, opts);
  const apply = (): void => applyPose(rig, rt);
  const restore = (): void => {
    restoreParts(rig.slots);
    restoreMats(rig.mats);
  };
  const update = (dt: number): void => advance(rt, dt, apply);

  const api: ModelAnimator = {
    update,
    seek(t: number): void {
      if (rt.disposed) return;
      restartClocks(rt, 0);
      update(Math.max(0, t));
    },
    setState(next: AnimState): void {
      if (rt.disposed) return;
      enterState(rt, next);
      apply();
      flushBeats(rt);
    },
    setLocomotion(weight: number): void {
      rt.locomotion = clamp01(Number.isFinite(weight) ? weight : 0);
    },
    setFacing(f: 1 | -1): void {
      rt.facing = f >= 0 ? 1 : -1;
    },
    setLook(x: number, y: number): void {
      if (rt.defs[rt.state].timeScale === 0) return;
      rt.lookX = Math.abs(x) < 0.15 ? 0 : Math.sign(x);
      rt.lookY = Math.abs(y) < 0.15 ? 0 : Math.sign(y);
    },
    setEnabled(on: boolean): void {
      if (rt.disposed || rt.enabled === on) return;
      rt.enabled = on;
      if (!on) restore();
      applyTint(rt);
      apply();
    },
    reset(): void {
      if (rt.disposed) return;
      restore();
      resetRuntime(rt);
      applyTint(rt);
    },
    dispose(): void {
      if (rt.disposed) return;
      restore();
      if (rt.tinted) opts.onTint?.(null, model);
      rt.tinted = false;
      rt.disposed = true;
      release();
      clear();
    },
    get state() { return rt.state; },
    get stateTime() { return rt.stateTime; },
    get progress() {
      const def = rt.defs[rt.state];
      return def.loop || def.duration <= 0 ? 0 : Math.min(1, rt.stateTime / def.duration);
    },
    get deathProgress() {
      return rt.state === 'death' ? Math.min(1, rt.stateTime / rt.defs.death.duration) : 0;
    },
    get time() { return rt.time; },
    set time(t: number) { restartClocks(rt, Math.max(0, Number.isFinite(t) ? t : 0)); },
    get locomotion() { return rt.locomotion; },
    get hoverOffset() { return rt.hoverOffset; },
    get enabled() { return rt.enabled; },
  };

  relatch(rt);
  applyTint(rt);
  return api;
}

/** Alias of `createAnimator`, the name the storybook looks for (src/storybook/registry.ts). */
export const createModelAnimator = createAnimator;
