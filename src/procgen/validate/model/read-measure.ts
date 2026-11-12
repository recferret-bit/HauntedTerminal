import type { BakedPart, ModelBounds } from '../../geometry/geometry.js';
import { rasterTriangle, type PixelWindow } from '../../core/tri-raster.js';

/**
 * Pixel measurements of the front view used by the read checks: per-part stroke thickness,
 * nearest-surface coverage and silhouette shape. Pure functions of baked geometry.
 */

/**
 * Project the triangle at float offset `o` into front-view pixels (screen x = −world x, y = world y),
 * origin at world (−x0, y1) plus a 1 px border. Fills out = [ax, ay, bx, by, cx, cy, az, bz, cz].
 */
function frontTriangle(p: Float32Array, o: number, x0: number, y1: number, ppu: number, out: Float64Array): void {
  for (let v = 0; v < 3; v++) {
    out[v * 2] = (-p[o + v * 3] - x0) * ppu + 1;
    out[v * 2 + 1] = (y1 - p[o + v * 3 + 1]) * ppu + 1;
    out[6 + v] = p[o + v * 3 + 2];
  }
}

/** Chamfer (3-4) distance transform of a mask with an empty 1 px border; returns the largest distance. */
function maxChamferDistance(mask: Uint8Array, w: number, h: number): number {
  const dt = new Int32Array(w * h);
  const BIG = 1 << 28;
  for (let i = 0; i < dt.length; i++) dt[i] = mask[i] ? BIG : 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (!dt[i]) continue;
      dt[i] = Math.min(dt[i], dt[i - 1] + 3, dt[i - w] + 3, dt[i - w - 1] + 4, dt[i - w + 1] + 4);
    }
  }
  let maxD = 0;
  for (let y = h - 2; y >= 1; y--) {
    for (let x = w - 2; x >= 1; x--) {
      const i = y * w + x;
      if (!dt[i]) continue;
      dt[i] = Math.min(dt[i], dt[i + 1] + 3, dt[i + w] + 3, dt[i + w + 1] + 4, dt[i + w - 1] + 4);
      if (dt[i] > maxD) maxD = dt[i];
    }
  }
  return maxD;
}

/** One part alone, seen from the front: pixel area and the width of its thickest stroke (pixels). */
export function soloFootprint(b: BakedPart, ppu: number, wantThickness: (areaPx: number, longPx: number) => boolean): { area: number; thickness: number } {
  const x0 = -b.max[0], y1 = b.max[1];
  const w = Math.max(1, Math.ceil((b.max[0] - b.min[0]) * ppu)) + 2;
  const h = Math.max(1, Math.ceil((b.max[1] - b.min[1]) * ppu)) + 2;
  const mask = new Uint8Array(w * h);
  const win: PixelWindow = { x0: 0, y0: 0, x1: w - 1, y1: h - 1 };
  const tri = new Float64Array(9);
  for (let o = 0; o < b.pos.length; o += 9) {
    frontTriangle(b.pos, o, x0, y1, ppu, tri);
    rasterTriangle(tri, win, (px, py) => { mask[py * w + px] = 1; });
  }
  let area = 0;
  for (let i = 0; i < mask.length; i++) area += mask[i];
  if (!area || !wantThickness(area, Math.max(w, h) - 2)) return { area, thickness: Infinity };
  // A stroke k px wide has a largest distance of ceil(k / 2) px (edge pixels are at distance 1).
  return { area, thickness: (maxChamferDistance(mask, w, h) / 3) * 2 - 0.5 };
}

/**
 * Nearest part per pixel from the front, translucent parts included: the surface the player looks at.
 * (`rasterizeModel` records a translucent part only where nothing opaque is behind it, which is right
 * for "is this part hidden?" but would give a glass screen no share of the colour.)
 */
export function topCoverage(baked: BakedPart[], bounds: ModelBounds, ppu: number): Float64Array {
  const x0 = -bounds.max[0], y1 = bounds.max[1];
  const w = Math.max(1, Math.ceil(bounds.size[0] * ppu)) + 2;
  const h = Math.max(1, Math.ceil(bounds.size[1] * ppu)) + 2;
  const depth = new Float32Array(w * h).fill(Infinity);
  const id = new Int16Array(w * h).fill(-1);
  const win: PixelWindow = { x0: 0, y0: 0, x1: w - 1, y1: h - 1 };
  const tri = new Float64Array(9);
  let owner = -1;
  const visit = (px: number, py: number, w0: number, w1: number, w2: number): void => {
    const d = w0 * tri[6] + w1 * tri[7] + w2 * tri[8];
    const i = py * w + px;
    if (d < depth[i]) { depth[i] = d; id[i] = owner; }
  };
  for (const b of baked) {
    owner = b.index;
    for (let o = 0; o < b.pos.length; o += 9) {
      frontTriangle(b.pos, o, x0, y1, ppu, tri);
      rasterTriangle(tri, win, visit);
    }
  }
  const out = new Float64Array(baked.length);
  for (let i = 0; i < id.length; i++) if (id[i] >= 0) out[id[i]]++;
  return out;
}

/** Area of the convex hull of the silhouette, from the first and last filled pixel of each row. */
function hullArea(rows: Int32Array, top: number, bottom: number): number {
  const pts: [number, number][] = [];
  for (let y = top; y <= bottom; y++) {
    const lo = rows[y * 2], hi = rows[y * 2 + 1];
    if (hi < lo) continue;
    pts.push([lo, y], [lo, y + 1], [hi + 1, y], [hi + 1, y + 1]);
  }
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: [number, number], a: [number, number], b: [number, number]): number =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: [number, number][]): [number, number][] => {
    const out: [number, number][] = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  const hull = [...half(pts), ...half([...pts].reverse())];
  let area = 0;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(area) / 2;
}

/** Silhouette shape of a part-id image: how much of its box and of its convex hull it fills. */
export function silhouetteShape(partId: Int16Array, width: number, height: number, filled: number): { boxFill: number; hullDeficit: number } {
  const rows = new Int32Array(height * 2);
  let top = height, bottom = -1, left = width, right = -1;
  for (let y = 0; y < height; y++) {
    let lo = width, hi = -1;
    for (let x = 0; x < width; x++) {
      if (partId[y * width + x] < 0) continue;
      if (x < lo) lo = x;
      hi = x;
    }
    rows[y * 2] = lo; rows[y * 2 + 1] = hi;
    if (hi < 0) continue;
    if (y < top) top = y;
    bottom = y;
    if (lo < left) left = lo;
    if (hi > right) right = hi;
  }
  return {
    boxFill: filled / ((right - left + 1) * (bottom - top + 1)),
    hullDeficit: Math.max(0, 1 - filled / hullArea(rows, top, bottom)),
  };
}
