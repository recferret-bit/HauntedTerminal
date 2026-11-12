import type { KernelEvent } from '../../contracts/events.js';
import type { ZoneId } from '../core/palette.js';
import type { ShapeSpec, Vec2 } from '../core/types.js';

/**
 * Comic effects as plain data, the same way models are.
 * Art direction: .kiro/skills/procedural-particles-3d/SKILL.md
 *
 * PAGE SPACE. Everything in a preset is authored as it is seen on the page:
 * +x is SCREEN-RIGHT, +y is up, angles are degrees counter-clockwise from screen-right
 * (0 = right, 90 = up, 180 = left, 270 = down). Units are world units (58 px at game scale).
 * The emitter mirrors x for you (world +x is screen-left); the simulator never leaves page space.
 * There is no z velocity: the camera is orthographic and looks straight at the page, so motion
 * toward it is invisible. `zSpread` only layers particles so they do not z-fight.
 */

/** Who owns the effect. Decides which palette families its layers may use. */
export type FxFamily =
  /** The machine and the shell: `signal`, `hardware`, `glass`, `neutral`. */
  | 'system'
  /** Hostile things: must use `malware`, may add `hardware` and `neutral`. */
  | 'malware'
  /** The developer: `human` warmth plus `signal` and `neutral`. */
  | 'vibecoder';

/** 60 / 30 / 10 by emitted area. */
export type FxRole = 'primary' | 'secondary' | 'accent';

/** Every game moment that has an effect. One preset per moment. */
export type FxMoment =
  | 'hop'
  | 'panel-smash'
  | 'permission-denied'
  | 'gate-open'
  | 'reveal'
  | 'rm-ash'
  | 'touch-materialize'
  | 'mv-dust'
  | 'sigkill'
  | 'sigstop-ice'
  | 'sigterm-rage'
  | 'fork-spawn'
  | 'pickup-energy'
  | 'pickup-ram'
  | 'pickup-ssd'
  | 'hit-vibecoder'
  | 'malware-hit'
  | 'malware-death'
  | 'devnull-suck'
  | 'lightning-strike'
  | 'flood-splash'
  | 'door-unlock'
  | 'coredump';

/** A KernelEvent type, or a moment the kernel does not announce yet. */
export type FxEventName = KernelEvent['type'] | 'COMMAND' | 'GAME_TICK' | 'INTRO';

export interface FxTrigger {
  event: FxEventName;
  moment: FxMoment;
  /** The exact condition, e.g. `outcome === 'KILLED'`. */
  when: string;
}

export type FxEmissionKind =
  /** From the origin (plus `spawn.radius`), evenly fanned over `angle` (default the full circle). */
  | 'burst'
  /** Same as burst, but `angle` is required: a directed spray. */
  | 'cone'
  /** Spawned evenly on a circle of `spawn.radius`, moving radially outward. */
  | 'ring'
  /** Spawned across a `spawn.width` x `spawn.height` box centred on the origin, moving along `angle`. */
  | 'line'
  /** Spawned across `spawn.width` at `spawn.height` above the origin, moving along `angle` (default straight down). */
  | 'rain'
  /** Spawned on a circle of `spawn.radius` and pulled into the origin over each particle's life. `speed` is ignored. */
  | 'implode';

/** A stepped key: from life fraction `t` (0..1) on, the value is `v`, until the next key. No interpolation. */
export type FxKey = [t: number, v: number];

export interface FxLayer {
  /** Unique within the preset. */
  name: string;
  role: FxRole;
  /** One low-poly chunk. Use the helpers in `fx/shapes.ts`; outlines are drawn in page space. */
  shape: ShapeSpec;
  zone: ZoneId;
  count: number;
  emit: FxEmissionKind;
  /** Offset of this layer's origin from the effect origin, page space. */
  origin?: Vec2;
  spawn?: {
    /** [min, max] distance from the origin. */
    radius?: Vec2;
    width?: number;
    height?: number;
  };
  /** Direction range in degrees, page space. */
  angle?: Vec2;
  /** [min, max] initial speed, units per second. */
  speed?: Vec2;
  /** Downward acceleration, units per second squared. Negative floats upward. */
  gravity?: number;
  /** Exponential velocity decay per second. 6 stops a particle in about a third of a second. */
  drag?: number;
  /** [min, max] spin in degrees per second, around the axis that points at the camera. */
  spin?: Vec2;
  /** [min, max] starting rotation in degrees. Ignored when `align` is set. */
  rotation?: Vec2;
  /** Point the shape's +x along its direction of travel (speed lines, shards, crystals). */
  align?: boolean;
  /** For `implode`: extra degrees swept around the origin on the way in. */
  swirl?: number;
  /** [min, max] start delay in ms. */
  delayMs?: Vec2;
  /** [min, max] lifetime in ms. */
  lifeMs: Vec2;
  /** [min, max] per-particle size multiplier. */
  size?: Vec2;
  /** Stepped scale over life. The first key must be at t = 0: effects pop on, they do not grow in. */
  scale: FxKey[];
  /** Stepped opacity over life. Default: fully opaque for the whole life. */
  alpha?: FxKey[];
  /** Depth jitter for layering only. Keep it under 0.25. */
  zSpread?: number;
  /** Ink shell. Default true. `ink`-zone layers get a paper keyline instead so they read on dark rooms. */
  outline?: boolean;
}

/** Lettering mood. Mirrors `BubbleStyle` in src/contracts/events.ts. */
export type FxWordStyle =
  /** COMIX_CLASSIC: pops oversized, settles, tilted. Hits, pickups, good news. */
  | 'burst'
  /** JAGGED_SCREAM: rattles every step. Damage, denial, rage. */
  | 'jagged'
  /** GHOST_WHISPER: small, half-opaque, drifts up. Hidden things, quiet system notes. */
  | 'whisper'
  /** KERNEL_GLITCH: stepped sideways slips and dropouts. Kernel, corruption, crashes. */
  | 'glitch';

export interface FxOnomatopoeia {
  /** Upper-case, at most 18 characters. A lower-case `x` is allowed as a multiplier (`x3`). */
  text: string;
  zone: ZoneId;
  style: FxWordStyle;
  /** How long the word stays on the page. */
  holdMs: number;
  /** Centre of the word relative to the effect origin, page space. Default [0, 0.7]. */
  offset?: Vec2;
  /** Cap height in world units. Default 0.3. */
  size?: number;
}

export interface FxPreset {
  /** `fx.<name>` */
  id: string;
  /** What the particle randomness is hashed from. Default: `id`. Keep the old id here when renaming a preset. */
  seedKey?: string;
  label: string;
  family: FxFamily;
  trigger: FxTrigger;
  /** Where the origin sits on the thing the effect answers. */
  anchor: 'feet' | 'center' | 'top';
  /** Every particle is gone by this time. */
  durationMs: number;
  /** Animation rate. 12 = on twos. Never above 15. Default 12. */
  stepFps?: number;
  layers: FxLayer[];
  onomatopoeia?: FxOnomatopoeia;
  /** Screen shake multiplier, the argument of ComicStage.triggerShake (0.8 light, 1.6 heavy). */
  shake?: number;
  /** Peak `uFlash` for every comic material (5.5 is a lightning strike). */
  flash?: number;
  /** The effect is allowed to cover the whole panel. */
  fullPanel?: boolean;
  /** Ambient effect: time wraps at `durationMs`. */
  loop?: boolean;
}

export interface FxParticleState {
  /** Index into `preset.layers`. */
  layer: number;
  /** Index within the layer, 0..count-1. */
  index: number;
  /** Page space. */
  x: number;
  y: number;
  /** Layering depth, positive is toward the camera. */
  z: number;
  /** Radians, counter-clockwise on the page. */
  rot: number;
  scale: number;
  alpha: number;
  /** 0..1 fraction of the particle's life. */
  life: number;
}

export interface FxWordState {
  text: string;
  /** Page space centre. */
  x: number;
  y: number;
  /** Radians, counter-clockwise on the page. */
  rot: number;
  scale: number;
  alpha: number;
}
