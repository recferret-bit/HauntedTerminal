/** Vent and speaker grilles. See `greebles.ts` for the shared conventions. */
import type { ZoneId } from '../core/palette.js';
import type { PartSpec, Vec3 } from '../core/types.js';
import { type GreebleBase, face, mount } from './greeble-base.js';
import {
  kitBox, kitPlate, outlineEllipse, outlineRoundRect,
} from './shapes.js';

// ---------------------------------------------------------------- grilles

export interface VentGrilleOptions extends GreebleBase {
  width: number;
  height: number;
  slats?: number;
  /** Plate colour. */
  zone?: ZoneId;
  /** Slot colour. Default 'ink'. */
  slotZone?: ZoneId;
  /** Vertical slots instead of horizontal ones. */
  vertical?: boolean;
  /** Draw the backing plate. Turn off to cut slots straight into the part underneath. Default true. */
  plate?: boolean;
  depth?: number;
}

/** A louvre: `${name}.plate` with dark `${name}.slot0..` on it. */
export function greebleVentGrille(o: VentGrilleOptions): PartSpec[] {
  const depth = o.depth ?? 0.03;
  const slats = o.slats ?? 4;
  const [x, y, z] = o.pos;
  const parts: PartSpec[] = [];
  let surface = z;
  if (o.plate !== false) {
    parts.push(kitPlate(`${o.name}.plate`, outlineRoundRect(o.width, o.height, 0.02, 1), depth, o.zone ?? 'solder', [x, y, mount(z, depth)]));
    surface = face(z, depth);
  }
  const span = o.vertical ? o.width : o.height;
  const across = (o.vertical ? o.height : o.width) * 0.8;
  const pitch = (span * 0.86) / slats;
  for (let i = 0; i < slats; i++) {
    const t = (i - (slats - 1) / 2) * pitch;
    const size: Vec3 = o.vertical ? [pitch * 0.5, across, 0.01] : [across, pitch * 0.5, 0.01];
    parts.push(kitBox(`${o.name}.slot${i}`, size, o.slotZone ?? 'ink', [x + (o.vertical ? t : 0), y + (o.vertical ? 0 : t), mount(surface, 0.01)], { outline: false }));
  }
  return parts;
}

export interface SpeakerGrilleOptions extends GreebleBase {
  radius: number;
  slats?: number;
  zone?: ZoneId;
  slotZone?: ZoneId;
  /** Squash the circle: 1 is round, 0.6 is a wide mouth. */
  aspect?: number;
  depth?: number;
}

/** A round speaker: `${name}.plate` (a disc) with horizontal slots that follow the circle. A mouth for talking hardware. */
export function greebleSpeakerGrille(o: SpeakerGrilleOptions): PartSpec[] {
  const depth = o.depth ?? 0.03;
  const slats = o.slats ?? 5;
  const aspect = o.aspect ?? 1;
  const [x, y, z] = o.pos;
  const ry = o.radius * aspect;
  const parts: PartSpec[] = [kitPlate(`${o.name}.plate`, outlineEllipse(o.radius, ry, 14), depth, o.zone ?? 'solder', [x, y, mount(z, depth)])];
  const pitch = (ry * 1.7) / slats;
  for (let i = 0; i < slats; i++) {
    const t = (i - (slats - 1) / 2) * pitch;
    const chord = 2 * o.radius * Math.sqrt(Math.max(0.05, 1 - (t / ry) ** 2)) * 0.82;
    parts.push(kitBox(`${o.name}.slot${i}`, [chord, pitch * 0.5, 0.01], o.slotZone ?? 'ink', [x, y + t, mount(face(z, depth), 0.01)], { outline: false, bevel: 0 }));
  }
  return parts;
}
