import type { BakedPart } from '../../geometry/geometry.js';
import type { ShapeSpec } from '../../core/types.js';
import type { ModelRules } from './rules.js';
import { pointInSolid, triBoxes, triOverlapArea2D, triTriDist2 } from './tri.js';

/** Part-level geometry helpers for the contact checks: boxes, surface distance, facing planes. */

export interface Box {
  min: [number, number, number];
  max: [number, number, number];
}

/**
 * A part in "contact space": z is multiplied by a weight, because the fixed front camera cannot see
 * a gap in depth, so a decal sitting 0.01 in front of a surface counts as touching it.
 */
export interface Geo extends Box {
  pos: Float32Array;
  triCount: number;
  boxes: Float32Array;
  closed: boolean;
  tube: boolean;
  area: number;
}

/** Can a ray-parity inside test be trusted on this shape? Tubes, open arcs and open lathes have holes. */
function closedSolid(shape: ShapeSpec): boolean {
  switch (shape.kind) {
    case 'tube': return false;
    case 'torus': return shape.arc === undefined || shape.arc >= Math.PI * 2 - 1e-3;
    case 'lathe': {
      const first = shape.profile[0], last = shape.profile[shape.profile.length - 1];
      return !!first && !!last && Math.abs(first[0]) < 1e-4 && Math.abs(last[0]) < 1e-4;
    }
    default: return true;
  }
}

export function boxGap(a: Box, b: Box): number {
  let g2 = 0;
  for (let c = 0; c < 3; c++) {
    const g = Math.max(a.min[c] - b.max[c], b.min[c] - a.max[c], 0);
    g2 += g * g;
  }
  return Math.sqrt(g2);
}

export function boxInside(a: Box, b: Box, tol: number): boolean {
  for (let c = 0; c < 3; c++) if (a.min[c] < b.min[c] - tol || a.max[c] > b.max[c] + tol) return false;
  return true;
}

/** Unnormalised normal (edge cross product) of the triangle at float offset `o`. */
function triCross(pos: Float32Array, o: number): [number, number, number] {
  const ux = pos[o + 3] - pos[o], uy = pos[o + 4] - pos[o + 1], uz = pos[o + 5] - pos[o + 2];
  const vx = pos[o + 6] - pos[o], vy = pos[o + 7] - pos[o + 1], vz = pos[o + 8] - pos[o + 2];
  return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
}

function surfaceArea(pos: Float32Array): number {
  let area = 0;
  for (let o = 0; o < pos.length; o += 9) area += Math.hypot(...triCross(pos, o)) / 2;
  return area;
}

export function makeGeo(b: BakedPart, zWeight: number): Geo {
  const pos = new Float32Array(b.pos);
  for (let i = 2; i < pos.length; i += 3) pos[i] *= zWeight;
  return {
    pos,
    triCount: b.triCount,
    min: [b.min[0], b.min[1], b.min[2] * zWeight],
    max: [b.max[0], b.max[1], b.max[2] * zWeight],
    boxes: triBoxes(pos),
    closed: closedSolid(b.part.shape),
    tube: b.part.shape.kind === 'tube',
    area: surfaceArea(b.pos),
  };
}

/** Triangles of `g` whose box comes within `reach` of the box of `other`. */
function candidates(g: Geo, other: Box, reach: number): number[] {
  const out: number[] = [];
  const bx = g.boxes;
  for (let t = 0; t < g.triCount; t++) {
    const k = t * 6;
    if (
      bx[k] - other.max[0] > reach || other.min[0] - bx[k + 3] > reach ||
      bx[k + 1] - other.max[1] > reach || other.min[1] - bx[k + 4] > reach ||
      bx[k + 2] - other.max[2] > reach || other.min[2] - bx[k + 5] > reach
    ) continue;
    out.push(t);
  }
  return out;
}

/**
 * Nearest approach of two parts' surfaces, up to `cutoff` (Infinity beyond it).
 * Returns as soon as the distance is known to be <= `stopAt`.
 */
export function surfaceDistance(a: Geo, b: Geo, cutoff: number, stopAt: number): number {
  const ca = candidates(a, b, cutoff);
  if (!ca.length) return Infinity;
  const cb = candidates(b, a, cutoff);
  if (!cb.length) return Infinity;
  const A = a.pos, B = b.pos, ba = a.boxes, bb = b.boxes;
  let best2 = cutoff * cutoff;
  let found = false;
  const stop2 = stopAt * stopAt;
  for (const ta of ca) {
    const i = ta * 6;
    for (const tb of cb) {
      const j = tb * 6;
      const gx = Math.max(ba[i] - bb[j + 3], bb[j] - ba[i + 3], 0);
      const gy = Math.max(ba[i + 1] - bb[j + 4], bb[j + 1] - ba[i + 4], 0);
      const gz = Math.max(ba[i + 2] - bb[j + 5], bb[j + 2] - ba[i + 5], 0);
      if (gx * gx + gy * gy + gz * gz > best2) continue;
      const d2 = triTriDist2(A, ta * 9, B, tb * 9);
      if (d2 <= best2) {
        best2 = d2;
        found = true;
        if (d2 <= stop2) return Math.sqrt(d2);
      }
    }
  }
  return found ? Math.sqrt(best2) : Infinity;
}

export function firstVertexInside(a: Geo, b: Geo): boolean {
  if (!b.closed || !boxInside(a, b, 1e-4) || a.triCount === 0) return false;
  const p = a.pos;
  return pointInSolid(p[0], p[1], p[2], b.pos);
}

/** Camera-facing triangles: [tri index, nx, ny, nz, planeOffset] per entry. */
export function facingTris(pos: Float32Array, facingZ: number): Float64Array {
  const out: number[] = [];
  for (let o = 0; o < pos.length; o += 9) {
    let [nx, ny, nz] = triCross(pos, o);
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-10) continue;
    nx /= len; ny /= len; nz /= len;
    if (nz > facingZ) continue;
    out.push(o / 9, nx, ny, nz, nx * pos[o] + ny * pos[o + 1] + nz * pos[o + 2]);
  }
  return Float64Array.from(out);
}

/** Page-space (XY) area where camera-facing faces of two parts lie in the same plane: the pixels that would fight. */
export function coplanarOverlap(
  a: BakedPart, fa: Float64Array, b: BakedPart, fb: Float64Array, ba: Float32Array, bb: Float32Array, rules: ModelRules,
): number {
  const A = a.pos, B = b.pos;
  let area = 0;
  for (let i = 0; i < fa.length; i += 5) {
    const ta = fa[i], ka = ta * 6, oa = ta * 9;
    for (let j = 0; j < fb.length; j += 5) {
      if (Math.abs(fa[i + 4] - fb[j + 4]) > rules.zfight.planeTol) continue;
      if (fa[i + 1] * fb[j + 1] + fa[i + 2] * fb[j + 2] + fa[i + 3] * fb[j + 3] < rules.zfight.normalDot) continue;
      const tb = fb[j], kb = tb * 6, ob = tb * 9;
      if (ba[ka] >= bb[kb + 3] || bb[kb] >= ba[ka + 3] || ba[ka + 1] >= bb[kb + 4] || bb[kb + 1] >= ba[ka + 4]) continue;
      area += triOverlapArea2D(
        A[oa], A[oa + 1], A[oa + 3], A[oa + 4], A[oa + 6], A[oa + 7],
        B[ob], B[ob + 1], B[ob + 3], B[ob + 4], B[ob + 6], B[ob + 7],
      );
    }
  }
  return area;
}
