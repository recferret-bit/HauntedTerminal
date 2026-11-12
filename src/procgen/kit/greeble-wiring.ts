/** Cables, ribbon cables and PCB traces. See `greebles.ts` for the shared conventions. */
import type { ZoneId } from '../core/palette.js';
import type { PartSpec, Vec2, Vec3 } from '../core/types.js';
import { type GreebleBase, face, mount } from './greeble-base.js';
import {
  kitBox, kitDisc, kitPlate, outlineStroke, sagPath,
} from './shapes.js';

// ---------------------------------------------------------------- cables and traces

export interface CableOptions {
  name: string;
  from: Vec3;
  to: Vec3;
  /** How far the middle hangs below the straight line. Default 0.1. */
  sag?: number;
  radius?: number;
  zone?: ZoneId;
}

/** A round cable hanging between two points: one `tube` part named `name`. About 220 triangles. */
export function greebleCable(o: CableOptions): PartSpec[] {
  const sag = o.sag ?? 0.1;
  const rel = (p: Vec3): Vec3 => [p[0] - o.from[0], p[1] - o.from[1], p[2] - o.from[2]];
  const end = rel(o.to);
  const mid: Vec3 = [end[0] / 2, end[1] / 2 - sag, end[2] / 2];
  return [{ name: o.name, shape: { kind: 'tube', path: [[0, 0, 0], mid, end], radius: o.radius ?? 0.03 }, zone: o.zone ?? 'rubber', pos: o.from }];
}

export interface RibbonCableOptions {
  name: string;
  /** End points on the page (x, y). */
  from: Vec2;
  to: Vec2;
  /** Surface z it lies on. */
  z: number;
  width?: number;
  sag?: number;
  zone?: ZoneId;
  /** The marked pin-1 strand along one edge. Default 'copper'; null for none. */
  markZone?: ZoneId | null;
  /** Add connector blocks at both ends. */
  plugs?: boolean;
  depth?: number;
}

/** A flat ribbon cable seen face-on: `${name}.band`, `${name}.mark`, optional `${name}.plug.a` / `.b`. Cheap: ~60 triangles. */
export function greebleRibbonCable(o: RibbonCableOptions): PartSpec[] {
  const width = o.width ?? 0.14;
  const depth = o.depth ?? 0.03;
  const path = sagPath(o.from, o.to, o.sag ?? 0.12, 8);
  const parts: PartSpec[] = [kitPlate(`${o.name}.band`, outlineStroke(path, width), depth, o.zone ?? 'solder', [0, 0, mount(o.z, depth)])];
  if (o.markZone !== null) {
    const edge = outlineStroke(path, width);
    // The first half of a stroke outline is its left edge; pull the mark strand in from it.
    const leftEdge = edge.slice(0, path.length);
    const strand = leftEdge.map((p, i) => {
      const c = path[i]!;
      return [c[0] + (p[0] - c[0]) * 0.62, c[1] + (p[1] - c[1]) * 0.62] as Vec2;
    });
    parts.push(kitPlate(`${o.name}.mark`, outlineStroke(strand, Math.max(0.03, width * 0.2)), 0.01, o.markZone ?? 'copper', [0, 0, mount(face(o.z, depth), 0.01)], { outline: false }));
  }
  if (o.plugs) {
    const plug = (suffix: string, at: Vec2, toward: Vec2): PartSpec => {
      const a = Math.atan2(toward[1] - at[1], toward[0] - at[0]);
      return kitBox(`${o.name}.plug.${suffix}`, [0.07, width * 1.25, depth + 0.03], 'silicon', [at[0], at[1], mount(o.z, depth + 0.03)], { rot: [0, 0, a] });
    };
    parts.push(plug('a', o.from, path[1]!), plug('b', o.to, path[path.length - 2]!));
  }
  return parts;
}

export interface TraceOptions extends GreebleBase {
  /** Polyline relative to `pos`, on the page. Keep to 0 / 45 / 90 degree runs: that is what makes it a PCB trace. */
  points: Vec2[];
  width?: number;
  zone?: ZoneId;
  depth?: number;
  /** Round solder pads on the ends. Default 'end' (last point only). */
  pads?: 'none' | 'end' | 'both';
  /** Traces are thin, so they skip the ink shell by default. */
  outline?: boolean;
}

/** A PCB trace: `${name}.trace` plus `${name}.pad.a` / `.b`. */
export function greebleTrace(o: TraceOptions): PartSpec[] {
  const width = o.width ?? 0.035;
  const depth = o.depth ?? 0.015;
  const zone = o.zone ?? 'gold';
  const [x, y, z] = o.pos;
  const parts: PartSpec[] = [kitPlate(`${o.name}.trace`, outlineStroke(o.points, width), depth, zone, [x, y, mount(z, depth)], { outline: o.outline ?? false })];
  const pads = o.pads ?? 'end';
  const pad = (suffix: string, p: Vec2): PartSpec =>
    kitDisc(`${o.name}.pad.${suffix}`, width * 1.15, depth + 0.006, zone, [x + p[0], y + p[1], mount(z, depth + 0.006)], { outline: o.outline ?? false, sides: 8 });
  if (pads === 'both') parts.push(pad('a', o.points[0]!));
  if (pads !== 'none') parts.push(pad('b', o.points[o.points.length - 1]!));
  return parts;
}
