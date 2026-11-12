/**
 * The animator's mutable state and its state machine: clocks, the current state, keyed beats, tint
 * and the "stopped-clock" latch. No transforms are written here; see pose.ts for that.
 */
import { zone } from '../../core/palette.js';
import type { BuiltModel } from '../build.js';
import { animResolveStates, type AnimRootKey, type AnimState, type AnimStateDef } from '../../anim/states.js';
import type { AnimatorOptions } from './types.js';

/** The values the last applied pose was drawn with. */
export interface Shown {
  loco: number;
  ampMul: number;
  jitterMul: number;
  clock: number;
}

export interface AnimRuntime {
  readonly model: BuiltModel;
  readonly opts: AnimatorOptions;
  readonly defs: Record<AnimState, AnimStateDef>;
  readonly initialState: AnimState;
  readonly initialLocomotion: number;
  state: AnimState;
  /** Where a `next: 'resume'` state returns to. */
  resume: AnimState;
  /** Wall time fed to `update`. */
  time: number;
  /** Tag clock: wall time scaled by the state's `timeScale`, stopped once a one-shot has ended. */
  clock: number;
  stateTime: number;
  beatIndex: number;
  locomotion: number;
  facing: 1 | -1;
  enabled: boolean;
  disposed: boolean;
  tinted: boolean;
  endReported: boolean;
  pendingBeats: [AnimState, string][];
  /** Pose grid line last sampled, and the tag clock sampled there. */
  poseGrid: number;
  poseClock: number;
  lookX: number;
  lookY: number;
  hoverOffset: number;
  shown: Shown;
  /** Set while a stopped-clock state holds the pose that was on screen. */
  latched: Shown | null;
}

export const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

export function createRuntime(model: BuiltModel, opts: AnimatorOptions): AnimRuntime {
  const defs = animResolveStates(opts.states);
  const initialState = opts.state ?? 'idle';
  const initialLocomotion = clamp01(opts.locomotion ?? 0);
  return {
    model, opts, defs, initialState, initialLocomotion,
    state: initialState,
    resume: defs[initialState].loop ? initialState : 'idle',
    time: 0, clock: 0, stateTime: 0, beatIndex: 0,
    locomotion: initialLocomotion,
    facing: opts.facing ?? -1,
    enabled: true, disposed: false, tinted: false, endReported: false,
    pendingBeats: [],
    poseGrid: -1, poseClock: 0,
    lookX: 0, lookY: 0, hoverOffset: 0,
    shown: { loco: initialLocomotion, ampMul: 1, jitterMul: 1, clock: 0 },
    latched: null,
  };
}

/** Clocks restarted (seek, time =, reset): a stopped-clock state holds the pose at clock 0. */
export function relatch(rt: AnimRuntime): void {
  rt.shown.clock = 0;
  rt.latched = rt.defs[rt.state].timeScale === 0 ? { ...rt.shown } : null;
}

/** Jump every clock to `t` seconds into the current state and forget beats and the pose grid. */
export function restartClocks(rt: AnimRuntime, t: number): void {
  rt.time = t;
  rt.clock = t;
  rt.stateTime = t;
  rt.beatIndex = 0;
  rt.endReported = false;
  rt.poseGrid = -1;
  relatch(rt);
}

/** Back to the construction state; the caller restores transforms and re-applies the tint. */
export function resetRuntime(rt: AnimRuntime): void {
  rt.locomotion = rt.initialLocomotion;
  rt.lookX = 0;
  rt.lookY = 0;
  rt.state = rt.initialState;
  rt.resume = rt.defs[rt.initialState].loop ? rt.initialState : 'idle';
  rt.shown.loco = rt.initialLocomotion;
  rt.shown.ampMul = 1;
  rt.shown.jitterMul = 1;
  restartClocks(rt, 0);
}

/** Tell `onTint` about the tint the current state asks for (or that it ended). */
export function applyTint(rt: AnimRuntime): void {
  const def = rt.defs[rt.state];
  if (def.tintZone && rt.enabled) {
    rt.tinted = true;
    rt.opts.onTint?.({ zone: def.tintZone, color: zone(def.tintZone).color, amount: def.tintAmount ?? 1 }, rt.model);
  } else if (rt.tinted) {
    rt.tinted = false;
    rt.opts.onTint?.(null, rt.model);
  }
}

/** Queue every keyed beat the state time has reached. */
export function fireBeats(rt: AnimRuntime): void {
  const keys: AnimRootKey[] = rt.defs[rt.state].keys ?? [];
  while (rt.beatIndex < keys.length && keys[rt.beatIndex]!.at <= rt.stateTime + 1e-9) {
    const beat = keys[rt.beatIndex]!.beat;
    rt.beatIndex++;
    if (beat) rt.pendingBeats.push([rt.state, beat]);
  }
}

/** Beats are reported after the pose is applied, so a listener sees the pose it is told about. */
export function flushBeats(rt: AnimRuntime): void {
  if (rt.pendingBeats.length === 0) return;
  const fired = rt.pendingBeats.splice(0, rt.pendingBeats.length);
  for (const [s, beat] of fired) rt.opts.onBeat?.(s, beat);
}

export function enterState(rt: AnimRuntime, next: AnimState): void {
  const prev = rt.state;
  // Entering a stopped-clock state (petrified, frozen) keeps the pose that is on screen: latch the
  // values it was drawn with, so the new state's locomotion / amplitude cannot change it.
  if (rt.defs[next].timeScale === 0) {
    if (!rt.latched) rt.latched = { ...rt.shown };
  } else rt.latched = null;
  rt.state = next;
  if (rt.defs[next].loop && !rt.defs[next].transient) rt.resume = next;
  else if (rt.defs[prev].loop && !rt.defs[prev].transient) rt.resume = prev;
  rt.stateTime = 0;
  rt.beatIndex = 0;
  rt.endReported = false;
  rt.poseGrid = -1;
  applyTint(rt);
  fireBeats(rt);
}

/**
 * Advance the clocks by `dt` seconds, ending or chaining a finished one-shot, then apply the pose
 * (via `apply`) and report the beats.
 */
export function advance(rt: AnimRuntime, dt: number, apply: () => void): void {
  if (rt.disposed || !rt.enabled) return;
  const step = Number.isFinite(dt) ? Math.max(0, dt) : 0;
  rt.time += step;
  // A finished one-shot with nowhere to go (death) holds its last pose: the tag clock stops too.
  if (!rt.endReported) rt.clock += step * rt.defs[rt.state].timeScale;
  rt.stateTime += step;
  fireBeats(rt);
  const def = rt.defs[rt.state];
  if (!def.loop && rt.stateTime >= def.duration) {
    const ended = rt.state;
    if (def.next === null) {
      rt.stateTime = def.duration;
      if (!rt.endReported) {
        rt.endReported = true;
        apply();
        flushBeats(rt);
        rt.opts.onStateEnd?.(ended, null);
        return;
      }
    } else {
      flushBeats(rt);
      enterState(rt, def.next === 'resume' ? rt.resume : def.next);
      rt.opts.onStateEnd?.(ended, rt.state);
    }
  }
  apply();
  flushBeats(rt);
}
