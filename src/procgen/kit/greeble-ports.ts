/** Status LEDs, port shells, screws and label plates. See `greebles.ts` for the shared conventions. */
import type { ZoneId } from '../core/palette.js';
import type { AnimTag, PartSpec, Vec2 } from '../core/types.js';
import { type GreebleBase, face, mount } from './greeble-base.js';
import {
  kitBox, kitDisc, kitPlate, outlineRoundRect, outlineTransform,
} from './shapes.js';

// ---------------------------------------------------------------- lights

export interface LedOptions extends GreebleBase {
  /**
   * Exact name of the lamp part. Doors must have one called `led`; extra lamps end in `led` too (`link.led`).
   * The bezel is named after the stem: `led` → `bezel`, `link.led` → `link.bezel`.
   */
  name: string;
  radius?: number;
  /** A `signal` zone: phosphor (open / ok), powerAmber (busy), lockRed (locked), dataCyan (data). Default phosphor. */
  zone?: ZoneId;
  /** Dark ring behind the lamp. Default 'silicon'; pass null for a bare lamp. */
  bezelZone?: ZoneId | null;
  square?: boolean;
  /** Blink speed in cycles per second. Omit for a steady light. */
  blink?: number;
  anim?: AnimTag;
}

/** A status light. The lamp is flat, emissive and has no ink shell; the bezel carries the ink. */
export function greebleLed(o: LedOptions): PartSpec[] {
  const r = o.radius ?? 0.04;
  const [x, y, z] = o.pos;
  const parts: PartSpec[] = [];
  let lampZ = z;
  if (o.bezelZone !== null) {
    const stem = o.name.replace(/\.?led$/i, '');
    const bezelName = stem ? `${stem}.bezel` : 'bezel';
    const bz = o.bezelZone ?? 'silicon';
    parts.push(o.square
      ? kitBox(bezelName, [r * 2.9, r * 2.9, 0.03], bz, [x, y, mount(z, 0.03)])
      : kitDisc(bezelName, r * 1.5, 0.03, bz, [x, y, mount(z, 0.03)], { sides: 10 }));
    lampZ = face(z, 0.03);
  }
  const anim: AnimTag | undefined = o.anim ?? (o.blink ? { type: 'blink', speed: o.blink } : undefined);
  const lamp = o.square
    ? kitBox(o.name, [r * 2, r * 2, 0.02], o.zone ?? 'phosphor', [x, y, mount(lampZ, 0.02)], { outline: false })
    : kitDisc(o.name, r, 0.02, o.zone ?? 'phosphor', [x, y, mount(lampZ, 0.02)], { outline: false, sides: 10 });
  if (anim) lamp.anim = anim;
  parts.push(lamp);
  return parts;
}

// ---------------------------------------------------------------- ports, screws, plates

export interface PortShellOptions extends GreebleBase {
  width: number;
  height: number;
  /** Thickness of the shell along z. Default 0.24. */
  depth?: number;
  /** Rim width around the cavity. Default 0.07. */
  wall?: number;
  zone?: ZoneId;
  cavityZone?: ZoneId;
  /** Corner radius of the shell. Default 0.04. */
  radius?: number;
  /** Custom shell outline (centred). The cavity is then `cavityOutline`, or the shell scaled inward. */
  outline?: Vec2[];
  cavityOutline?: Vec2[];
}

/**
 * A connector shell with a dark mouth: `${name}.shell` and `${name}.cavity`.
 * Extrudes cannot have holes, so the cavity is a dark plate on the shell's face; the ink line around it
 * reads as the edge of the opening. Mount contacts and tongues on `greeblePortCavityZ(...)`.
 */
export function greeblePortShell(o: PortShellOptions): PartSpec[] {
  const depth = o.depth ?? 0.24;
  const wall = o.wall ?? 0.07;
  const radius = o.radius ?? 0.04;
  const [x, y, z] = o.pos;
  const shellOutline = o.outline ?? outlineRoundRect(o.width, o.height, radius, 2);
  const cavityOutline = o.cavityOutline
    ?? (o.outline
      ? outlineTransform(o.outline, { scale: [(o.width - wall * 2) / o.width, (o.height - wall * 2) / o.height] })
      : outlineRoundRect(o.width - wall * 2, o.height - wall * 2, Math.max(0, radius - wall * 0.5), 2));
  return [
    kitPlate(`${o.name}.shell`, shellOutline, depth, o.zone ?? 'solder', [x, y, mount(z, depth)], { bevel: Math.min(0.015, depth / 4) }),
    kitPlate(`${o.name}.cavity`, cavityOutline, 0.02, o.cavityZone ?? 'silicon', [x, y, mount(face(z, depth), 0.02)]),
  ];
}

/** The z to mount things inside a port made by greeblePortShell with the same `pos` and `depth`. */
export function greeblePortCavityZ(z: number, depth = 0.24): number {
  return face(face(z, depth), 0.02);
}

export interface ScrewOptions extends GreebleBase {
  radius?: number;
  zone?: ZoneId;
  /** `slot` and `cross` are flat heads; `thumb` is a tall knurled thumbscrew (serial ports). */
  style?: 'slot' | 'cross' | 'thumb';
  /** Slot angle in radians. Vary it per screw so they do not look stamped. */
  angle?: number;
}

/** `${name}.head` plus an ink slot (`${name}.slot`). */
export function greebleScrew(o: ScrewOptions): PartSpec[] {
  const r = o.radius ?? 0.045;
  const style = o.style ?? 'slot';
  const [x, y, z] = o.pos;
  const depth = style === 'thumb' ? 0.09 : 0.03;
  const parts: PartSpec[] = [kitDisc(`${o.name}.head`, r, depth, o.zone ?? 'solder', [x, y, mount(z, depth)], { sides: style === 'thumb' ? 8 : 10 })];
  const front = face(z, depth);
  const a = o.angle ?? 0.6;
  const slot = (suffix: string, angle: number): PartSpec =>
    kitBox(`${o.name}.${suffix}`, [r * 1.5, Math.max(0.02, r * 0.36), 0.01], 'ink', [x, y, mount(front, 0.01)], { outline: false, rot: [0, 0, angle] });
  if (style === 'thumb') {
    parts.push(kitDisc(`${o.name}.cap`, r * 0.62, 0.03, o.zone ?? 'solder', [x, y, mount(front, 0.03)], { sides: 8 }));
    parts.push({ ...slot('slot', a), pos: [x, y, mount(face(front, 0.03), 0.01)] });
  } else {
    parts.push(slot('slot', a));
    if (style === 'cross') parts.push(slot('slot2', a + Math.PI / 2));
  }
  return parts;
}

export interface LabelPlateOptions extends GreebleBase {
  width: number;
  height: number;
  zone?: ZoneId;
  /** Number of text lines drawn as ink bars. Default 3. */
  lines?: number;
  lineZone?: ZoneId;
  depth?: number;
  texture?: string;
}

/** A sticker or nameplate: `${name}.plate` with `${name}.line0..` of uneven length, ragged right on screen. */
export function greebleLabelPlate(o: LabelPlateOptions): PartSpec[] {
  const depth = o.depth ?? 0.02;
  const [x, y, z] = o.pos;
  const plate = kitPlate(`${o.name}.plate`, outlineRoundRect(o.width, o.height, Math.min(o.width, o.height) * 0.1, 1), depth, o.zone ?? 'plastic', [x, y, mount(z, depth)]);
  if (o.texture) plate.texture = o.texture;
  const parts: PartSpec[] = [plate];
  const lines = o.lines ?? 3;
  const lengths = [0.78, 0.56, 0.7, 0.42, 0.64];
  const pitch = o.height / (lines + 1);
  const thick = Math.min(pitch * 0.45, Math.max(0.03, pitch * 0.36));
  for (let i = 0; i < lines; i++) {
    const w = o.width * lengths[i % lengths.length]!;
    // Left-aligned on screen: screen-left is +x.
    const lx = x + (o.width * 0.84 - w) / 2;
    parts.push(kitBox(`${o.name}.line${i}`, [w, thick, 0.01], o.lineZone ?? 'ink', [lx, y + o.height / 2 - pitch * (i + 1), mount(face(z, depth), 0.01)], { outline: false }));
  }
  return parts;
}
