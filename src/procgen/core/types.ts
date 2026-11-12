import type { ZoneId } from './palette.js';

export type Vec2 = [number, number];
export type Vec3 = [number, number, number];

/**
 * Shapes are plain data so a model can be validated and drawn without WebGL.
 * Model space: y up, feet at y = 0, the model FACES −z (the camera sits on −z).
 * World +x is SCREEN-LEFT. Symmetric models do not care; asymmetric ones must.
 */
export type ShapeSpec =
  | { kind: 'box'; size: Vec3; /** Rounded edge radius. */ bevel?: number }
  | { kind: 'cylinder'; rTop: number; rBottom: number; height: number; /** 3..8 gives prisms. */ sides?: number }
  | { kind: 'capsule'; radius: number; length: number }
  | { kind: 'sphere'; radius: number }
  | { kind: 'cone'; radius: number; height: number; sides?: number }
  | { kind: 'torus'; radius: number; tube: number; arc?: number }
  /** A 2D silhouette in the XY plane (as drawn on the page), extruded and centred on z. The workhorse of the 2.5D look. */
  | { kind: 'extrude'; outline: Vec2[]; depth: number; bevel?: number }
  /** A cable, tentacle or trace along a smooth path. */
  | { kind: 'tube'; path: Vec3[]; radius: number; closed?: boolean }
  /** A profile [radius, y] spun around y. */
  | { kind: 'lathe'; profile: Vec2[]; sides?: number };

export type AnimType =
  | 'spin'      // continuous rotation around `axis` through `pivot`
  | 'bob'       // sine translation along `axis`
  | 'pulse'     // uniform scale throb around `pivot`
  | 'swing'     // sine rotation around `axis` through `pivot`
  | 'jitter'    // glitch: stepped random offsets, the malware signature
  | 'blink'     // emissive on/off
  | 'breathe'   // slow non-uniform y scale
  | 'legWalk'   // swing, phase-locked to locomotion
  | 'armSwing'  // counter-phase to legWalk
  | 'orbit';    // circles `pivot` in the XY (page) plane

export interface AnimTag {
  type: AnimType;
  axis?: 'x' | 'y' | 'z';
  /** Cycles per second. */
  speed?: number;
  /** Units for translations, radians for rotations, scale delta for pulse/breathe. */
  amp?: number;
  /** 0..1 offset within the cycle. Parts of one limb share a phase. */
  phase?: number;
  /** Model-space pivot. Defaults to the part position. */
  pivot?: Vec3;
  /**
   * `orbit` only: turn the circle into a disk seen at an angle. `squash` is the path's minor/major
   * ratio (1 = circle), `tilt` rolls the major axis in the page plane (radians), and `sway` moves the
   * part along z (units) so it passes behind the pivot on the far (upper) half and in front on the near half.
   */
  squash?: number;
  tilt?: number;
  sway?: number;
}

export interface PartSpec {
  /** Unique within the model. Role words in the name (eye, leg, pin, led, lock, blade) drive validator checks. */
  name: string;
  shape: ShapeSpec;
  zone: ZoneId;
  pos: Vec3;
  /** Euler XYZ radians. */
  rot?: Vec3;
  scale?: Vec3;
  /** Ink outline shell. Default true. Turn off for tiny emissive dots and decals. */
  outline?: boolean;
  /** TextureCatalog id used as an albedo map on this part. */
  texture?: string;
  anim?: AnimTag;
}

/** Every model category, in display order. `agent` and `npc` are cast: AI agents and friendly characters. */
export const MODEL_CATEGORIES = ['vibecoder', 'npc', 'agent', 'malware', 'boss', 'pickup', 'door', 'prop', 'room', 'fx'] as const;
export type ModelCategory = (typeof MODEL_CATEGORIES)[number];

/** Categories drawn as corrupted hardware with one glowing eye: every hostile-model rule applies to them. */
const HOSTILE: ReadonlySet<string> = new Set<ModelCategory>(['malware', 'boss', 'agent']);

export function isHostile(category: string): boolean {
  return HOSTILE.has(category);
}

export interface ModelSpec {
  /** `<category>.<name>`, e.g. `malware.worm`, `pickup.ram`, `door.usb`. */
  id: string;
  category: ModelCategory;
  label: string;
  parts: PartSpec[];
  /** Named attach points in model space: `bubble`, `fx`, `hand`, `eye`, `lock`, `label`. */
  sockets?: Record<string, Vec3>;
  /** Ink shell thickness in world units. Default 0.028 (rooms 0.02). */
  inkWeight?: number;
  /**
   * `hover` (need not touch y = 0), `wall` (mounted on the back wall), `flat` (decal-like),
   * `detached` (animated parts may fly free of the body: shield rings, orbiting satellites).
   */
  tags?: string[];
}

export interface ModelEntry {
  id: string;
  category: ModelCategory;
  label: string;
  /** One line: what this is in the computer, and what it does in the game. */
  lore: string;
  /** Manifest / game key this model replaces, if any (`vibecoder`, `locked_gate`, ...). */
  gameKey?: string;
  build: (seed: number) => ModelSpec;
}

/** RGBA8 pixels, row 0 at the top. Works in node and in the browser. */
export interface PixelBuffer {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export type TextureUsage = 'surface' | 'backdrop' | 'decal' | 'overlay';

export interface TextureEntry {
  id: string;
  label: string;
  usage: TextureUsage;
  /** Must wrap seamlessly on both axes. */
  tileable: boolean;
  build: (seed: number) => PixelBuffer;
}
