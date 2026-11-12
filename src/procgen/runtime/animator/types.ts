/**
 * Public types of the CPU animator: tint hook, options and the `ModelAnimator` handle.
 * Skill: .kiro/skills/procedural-animation-3d/SKILL.md
 */
import type { BuiltModel } from '../build.js';
import type { ZoneId } from '../../core/palette.js';
import type { AnimActingOptions } from '../../anim/acting.js';
import type { AnimState } from '../../anim/states.js';

export interface AnimTint {
  zone: ZoneId;
  /** The zone's colour as 0xRRGGBB. */
  color: number;
  /** 0..1: how far toward `color` the model should go. */
  amount: number;
}

/** Called with a tint when a state asks for one (stone, ice, rage) and with `null` when it ends. */
export type AnimTintHook = (tint: AnimTint | null, model: BuiltModel) => void;

export interface AnimatorOptions extends AnimActingOptions {
  /** Continuous time instead of stepped poses. For debugging curves; the game look is stepped. */
  smooth?: boolean;
  /** Initial state. Default `idle`. */
  state?: AnimState;
  /** Initial locomotion weight 0..1. Default 0. */
  locomotion?: number;
  /** +1: forward is model +x (screen-left). -1: forward is -x (screen-right). Default -1. */
  facing?: 1 | -1;
  /** Height of the body bounce at locomotion 1, in units. Default 0.035. */
  bounce?: number;
  /** Bounces per second while walking (two per gait cycle). Default 4. */
  bounceRate?: number;
  /**
   * Rigid hover bob: one y offset added to every part, so the whole model floats as one body (a part
   * can carry only one AnimTag, so this cannot be a tag). Default: on for `hover`-tagged pickup /
   * malware / boss models that have no y-axis `bob` part of their own (so per-part bobs never double),
   * off for everything else. `false` turns it off, an object turns it on with these values.
   * Applied to the parts, not to `model.group`: the stage writes the Group's y absolutely.
   */
  hoverBob?: false | { amp?: number; speed?: number };
  /** Parts whose name matches follow `setLook`. Default /eye|pupil|iris/i. */
  lookParts?: RegExp;
  /** How far a looking part shifts, in units. Default 0.02 (about 1 px at game scale: one pixel of gaze). */
  lookAmp?: number;
  /**
   * Give every part tagged `blink` / `pulse` / `jitter` its own material when it shares a zone material,
   * so one LED can blink without the whole zone blinking. The clone shares every uniform with the zone
   * material except `uEmissive`, so zone-wide tint, fade, uTime and uFlash still reach it. The clones are
   * appended to `model.allMaterials` and removed again by `dispose()`. Default true.
   */
  splitEmissive?: boolean;
  onTint?: AnimTintHook;
  /** A keyed beat was reached (`anticipation`, `strike`, `recover`, `impact`, `collapse`, `gone`...). */
  onBeat?: (state: AnimState, beat: string) => void;
  /** A one-shot state finished. `next` is the state now active (`null`: the last pose is held). */
  onStateEnd?: (state: AnimState, next: AnimState | null) => void;
}

export interface ModelAnimator {
  /** Advance by `dt` seconds and apply the pose. */
  update(dt: number): void;
  /** Jump to absolute time `t` seconds in the current state, as if it had just been entered at 0. */
  seek(t: number): void;
  setState(state: AnimState): void;
  /** 0 = standing, 1 = walking. Scales legWalk / armSwing and the body bounce. */
  setLocomotion(weight: number): void;
  setFacing(facing: 1 | -1): void;
  /**
   * Point the eye parts at something: `x`, `y` are the direction in model space (sign matters, size does not;
   * +x is screen-left). The gaze snaps between nine positions. Ignored while petrified or frozen.
   */
  setLook(x: number, y: number): void;
  /** `false` restores the authored pose and uniforms and stops applying until re-enabled. */
  setEnabled(enabled: boolean): void;
  /** Restore base transforms and uniforms exactly, clear the tint, time 0, initial state. */
  reset(): void;
  /** `reset()` and drop every reference. The model itself is not disposed. */
  dispose(): void;
  readonly state: AnimState;
  /** Seconds since the current state was entered. */
  readonly stateTime: number;
  /** 0..1 through a one-shot state; 0 for looping states. */
  readonly progress: number;
  /** 0..1 through `death`, 0 otherwise. The FX layer keys ash / shards off this. */
  readonly deathProgress: number;
  /** Seconds of wall time fed to `update`. Assigning sets the clocks without applying a pose (`seek` does both). */
  time: number;
  readonly locomotion: number;
  /** The current rigid hover offset in units (0 when off). Add it to socket y so FX follow the body. */
  readonly hoverOffset: number;
  readonly enabled: boolean;
}
