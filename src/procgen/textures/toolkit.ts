import { FLOOR_THEMES, hexToRgb, INK, PAPER, ZONES, type FloorId, type ZoneId } from '../core/palette.js';
import { getPixel, makePixels, setPixel } from '../core/pixels.js';
import { makeRng } from '../core/rng.js';
import type { PixelBuffer, TextureEntry } from '../core/types.js';

/**
 * Drawing toolkit for comic textures. Everything here is flat and hard-edged on purpose:
 * no anti-aliasing, no gradients, no blur. All writes go through setPixel, which wraps, so a
 * shape drawn across the border comes back in on the other side and the texture stays tileable.
 * Skill: .kiro/skills/procedural-texture-synthesis
 */

/** What a texture declares on top of the core TextureEntry. The validator reads these. */
export interface TexEntry extends TextureEntry {
  /** Palette lock: the only zones this texture may use (ink, paper and cel shades are always allowed). */
  zones: readonly ZoneId[];
  /** Backdrops: the floor whose `FLOOR_THEMES` bg / accent (and their cel shades) are also allowed. */
  floor?: FloorId;
  /** The seed changes nothing. Without this, a seed that changes nothing is reported. */
  staticLayout?: boolean;
  /** One line for the catalog: what the texture is for. */
  purpose: string;
}

/**
 * Backdrops: rows from this fraction of the height down sit behind the actors and must stay quiet
 * (floor bg and its x0.68 shade only). 0.5 of a 128 px wall = row 64; the rooms' ACTOR_BAND
 * (src/procgen/archetypes/rooms/frame.ts, y 0..2.4 of a 5 unit wall) starts at row 66.5.
 */
export const TEX_BACKDROP_QUIET_FROM = 0.5;

/** The cel-band multipliers of the comic material: lit, mid, shadow. */
export const TEX_SHADES = [1, 0.68, 0.4] as const;
export type TexShade = 0 | 1 | 2;

export type TexMask = (x: number, y: number) => boolean;

/** `hex` darkened to cel band `level` (0 lit, 1 mid x0.68, 2 shadow x0.4). */
export function texShade(hex: number, level: TexShade = 0): number {
  const m = TEX_SHADES[level];
  const [r, g, b] = hexToRgb(hex);
  return (Math.round(r * m) << 16) | (Math.round(g * m) << 8) | Math.round(b * m);
}

/** Colour of a palette zone at a cel band. The only way a texture should obtain a colour. */
export function texColor(zone: ZoneId, level: TexShade = 0): number {
  return texShade(ZONES[zone].color, level);
}

/** Backdrop colours: the floor's background or accent at a cel band. */
export function texFloorColor(floor: FloorId, which: 'bg' | 'accent', level: TexShade = 0): number {
  return texShade(FLOOR_THEMES[floor][which], level);
}

/** Every colour a texture restricted to `zones` may contain: each zone at the three cel bands, ink, paper, plus `extra` at the three bands. */
export function texPalette(zones: readonly ZoneId[], extra: readonly number[] = []): number[] {
  const out = new Set<number>([INK, PAPER]);
  for (const z of zones) for (const l of [0, 1, 2] as const) out.add(texColor(z, l));
  for (const hex of extra) for (const l of [0, 1, 2] as const) out.add(texShade(hex, l));
  return [...out];
}

/** The palette an entry is locked to. Entries without `zones` (plain TextureEntry) get the whole game palette. */
export function texAllowedColors(entry: TextureEntry): number[] {
  const meta = entry as Partial<TexEntry>;
  const zones = meta.zones ?? (Object.keys(ZONES) as ZoneId[]);
  const floors = meta.floor ? [meta.floor] : meta.zones ? [] : (Object.keys(FLOOR_THEMES).map(Number) as FloorId[]);
  return texPalette(zones, floors.flatMap((f) => [FLOOR_THEMES[f].bg, FLOOR_THEMES[f].accent]));
}

/** Snap every opaque pixel to the nearest colour in `colors`. Returns how many pixels changed. */
export function texSnapToColors(buf: PixelBuffer, colors: readonly number[]): number {
  const rgb = colors.map(hexToRgb);
  const cache = new Map<number, number>();
  let changed = 0;
  for (let i = 0; i < buf.data.length; i += 4) {
    if (buf.data[i + 3]! === 0) continue;
    const key = (buf.data[i]! << 16) | (buf.data[i + 1]! << 8) | buf.data[i + 2]!;
    let best = cache.get(key);
    if (best === undefined) {
      let bestD = Infinity;
      best = 0;
      for (let k = 0; k < rgb.length; k++) {
        const c = rgb[k]!;
        const d = (c[0] - buf.data[i]!) ** 2 + (c[1] - buf.data[i + 1]!) ** 2 + (c[2] - buf.data[i + 2]!) ** 2;
        if (d < bestD) { bestD = d; best = k; }
      }
      cache.set(key, best);
    }
    const c = rgb[best]!;
    if (c[0] !== buf.data[i] || c[1] !== buf.data[i + 1] || c[2] !== buf.data[i + 2]) changed++;
    buf.data[i] = c[0]; buf.data[i + 1] = c[1]; buf.data[i + 2] = c[2];
  }
  return changed;
}

/**
 * The palette lock as an operation: snap every opaque pixel to the nearest colour allowed for `zones`
 * (their three cel bands, ink, paper, plus `extra`). A texture drawn only with texColor() is unchanged;
 * use it as the last step of anything that blends, scales or imports pixels. Returns the pixels changed.
 */
export function quantizeToPalette(buf: PixelBuffer, zones: readonly ZoneId[], extra: readonly number[] = []): number {
  return texSnapToColors(buf, texPalette(zones, extra));
}

// ---------------------------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------------------------

export function texNew(width: number, height: number, hex: number): PixelBuffer {
  return makePixels(width, height, hex, 255);
}

/**
 * A fully transparent buffer, for decals. The hidden RGB is ink: the comic material reads only `.rgb`
 * of `uMap`, so wherever alpha is not honoured the cut-out shows as an ink plate, not as black.
 */
export function texNewDecal(width: number, height: number): PixelBuffer {
  return makePixels(width, height, INK, 0);
}

export function texRect(buf: PixelBuffer, x: number, y: number, w: number, h: number, hex: number, mask?: TexMask): void {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (!mask || mask(x + i, y + j)) setPixel(buf, x + i, y + j, hex);
}

/** Rectangle outline, `t` pixels thick, drawn inside the given box. */
export function texFrame(buf: PixelBuffer, x: number, y: number, w: number, h: number, hex: number, t = 2): void {
  texRect(buf, x, y, w, t, hex);
  texRect(buf, x, y + h - t, w, t, hex);
  texRect(buf, x, y + t, t, h - 2 * t, hex);
  texRect(buf, x + w - t, y + t, t, h - 2 * t, hex);
}

/** Hard-edged line with a square brush `t` pixels wide (Bresenham, no anti-aliasing). */
export function texLine(buf: PixelBuffer, x0: number, y0: number, x1: number, y1: number, hex: number, t = 2): void {
  let x = Math.round(x0), y = Math.round(y0);
  const ex = Math.round(x1), ey = Math.round(y1);
  const dx = Math.abs(ex - x), dy = -Math.abs(ey - y);
  const sx = x < ex ? 1 : -1, sy = y < ey ? 1 : -1;
  const o = Math.floor(t / 2);
  let err = dx + dy;
  for (;;) {
    texRect(buf, x - o, y - o, t, t, hex);
    if (x === ex && y === ey) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}

export function texPolyline(buf: PixelBuffer, pts: readonly (readonly [number, number])[], hex: number, t = 2, closed = false): void {
  for (let i = 0; i + 1 < pts.length; i++) texLine(buf, pts[i]![0], pts[i]![1], pts[i + 1]![0], pts[i + 1]![1], hex, t);
  if (closed && pts.length > 2) texLine(buf, pts[pts.length - 1]![0], pts[pts.length - 1]![1], pts[0]![0], pts[0]![1], hex, t);
}

/** Filled disc. The centre may be fractional: (8, 8) with r = 3 is a 6 px dot centred on a pixel corner. */
export function texDisc(buf: PixelBuffer, cx: number, cy: number, r: number, hex: number, mask?: TexMask): void {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 > r * r) continue;
      if (!mask || mask(x, y)) setPixel(buf, x, y, hex);
    }
  }
}

/** Ring of outer radius `r` and thickness `t`. `from`/`to` (radians, clockwise on screen from +x) cut an arc. */
export function texRing(buf: PixelBuffer, cx: number, cy: number, r: number, hex: number, t = 2, from = 0, to = Math.PI * 2): void {
  const inner = Math.max(0, r - t);
  const full = to - from >= Math.PI * 2 - 1e-6;
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 > r * r || d2 < inner * inner) continue;
      if (!full) {
        let a = Math.atan2(dy, dx);
        while (a < from) a += Math.PI * 2;
        if (a > to) continue;
      }
      setPixel(buf, x, y, hex);
    }
  }
}

/** Filled polygon (even-odd rule, sampled at pixel centres). */
export function texPolygon(buf: PixelBuffer, pts: readonly (readonly [number, number])[], hex: number): void {
  if (pts.length < 3) return;
  let minY = Infinity, maxY = -Infinity;
  for (const p of pts) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
  for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
    const sy = y + 0.5;
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]!, b = pts[(i + 1) % pts.length]!;
      if ((a[1] <= sy && b[1] > sy) || (b[1] <= sy && a[1] > sy)) xs.push(a[0] + ((sy - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let x = Math.ceil(xs[k]! - 0.5); x + 0.5 < xs[k + 1]!; x++) setPixel(buf, x, y, hex);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Patterns
// ---------------------------------------------------------------------------------------------

export interface TexStripeOptions {
  /** Distance between stripe starts, in pixels. Must divide the texture size for a seamless wrap. */
  period: number;
  /** Stripe width in pixels. */
  width: number;
  /** `h` rows, `v` columns, `/` rising diagonal, `\\` falling diagonal. */
  dir: 'h' | 'v' | '/' | '\\';
  offset?: number;
  mask?: TexMask;
}

export function texStripes(buf: PixelBuffer, hex: number, o: TexStripeOptions): void {
  const off = o.offset ?? 0;
  for (let y = 0; y < buf.height; y++) {
    for (let x = 0; x < buf.width; x++) {
      const t = o.dir === 'h' ? y : o.dir === 'v' ? x : o.dir === '/' ? x + y : x - y;
      if ((((t + off) % o.period) + o.period) % o.period >= o.width) continue;
      if (!o.mask || o.mask(x, y)) setPixel(buf, x, y, hex);
    }
  }
}

export interface TexHatchOptions {
  /** Diagonal pitch in pixels (measured along x). Must divide the texture size. */
  spacing: number;
  thickness?: number;
  /** `/`, `\\` or `x` for both. */
  dirs?: '/' | '\\' | 'x';
  mask?: TexMask;
}

/** Ink shading: diagonal hatch lines, one or both directions. */
export function texCrosshatch(buf: PixelBuffer, hex: number, o: TexHatchOptions): void {
  const width = o.thickness ?? 2;
  const dirs = o.dirs ?? 'x';
  if (dirs !== '\\') texStripes(buf, hex, { period: o.spacing, width, dir: '/', mask: o.mask });
  if (dirs !== '/') texStripes(buf, hex, { period: o.spacing, width, dir: '\\', mask: o.mask });
}

export interface TexHalftoneOptions {
  /** Dot pitch in pixels. Must divide the width; with `stagger`, 2 x cell must divide the height. */
  cell: number;
  /** Dot radius in pixels, or a function for stepped dot sizes (return 0 for no dot). Keep it >= 1.5. */
  radius: number | ((cx: number, cy: number) => number);
  /** Offset every other row by half a cell (the classic Ben-Day lattice). Default true. */
  stagger?: boolean;
  mask?: TexMask;
}

/** Ben-Day dots. */
export function texHalftone(buf: PixelBuffer, hex: number, o: TexHalftoneOptions): void {
  const stagger = o.stagger !== false;
  for (let row = 0; row * o.cell < buf.height; row++) {
    for (let col = 0; col * o.cell < buf.width; col++) {
      const cx = col * o.cell + o.cell / 2 + (stagger && row % 2 === 1 ? o.cell / 2 : 0);
      const cy = row * o.cell + o.cell / 2;
      const r = typeof o.radius === 'number' ? o.radius : o.radius(cx, cy);
      if (r > 0) texDisc(buf, cx, cy, r, hex, o.mask);
    }
  }
}

/** A wrapping lattice of random values in [0, 1): `cols` x `rows`, one value per cell. */
export function texLattice(cols: number, rows: number, seed: number): Float32Array {
  const rng = makeRng(seed);
  const out = new Float32Array(cols * rows);
  for (let i = 0; i < out.length; i++) out[i] = rng.next();
  return out;
}

/**
 * Blocky noise: the texture is cut into `cell`-sized squares and each takes one colour from `colors`
 * (optionally weighted). The hardest-edged noise there is; `cell` must divide the size to wrap.
 */
export function texBlocks(
  buf: PixelBuffer,
  o: { cell: number; seed: number; colors: readonly (number | null)[]; weights?: readonly number[]; mask?: TexMask },
): void {
  const cols = Math.ceil(buf.width / o.cell), rows = Math.ceil(buf.height / o.cell);
  const lat = texLattice(cols, rows, o.seed);
  const weights = o.weights ?? o.colors.map(() => 1);
  const total = weights.reduce((a, b) => a + b, 0);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let v = lat[r * cols + c]! * total, k = 0;
      while (k < weights.length - 1 && v >= weights[k]!) { v -= weights[k]!; k++; }
      const hex = o.colors[k];
      if (hex === null || hex === undefined) continue;
      texRect(buf, c * o.cell, r * o.cell, o.cell, o.cell, hex, o.mask);
    }
  }
}

/**
 * Stepped value noise as a field: smooth, wrapping value noise (`cell` px lattice, optional second octave)
 * returned as a function of (x, y) in [0, 1). Threshold it yourself for masks, or use texSteppedNoise.
 */
export function texNoiseField(width: number, height: number, cell: number, seed: number, octaves = 1): (x: number, y: number) => number {
  const layers: { cols: number; rows: number; size: number; lat: Float32Array; amp: number }[] = [];
  let amp = 1, size = cell, norm = 0;
  for (let o = 0; o < octaves && size >= 2; o++) {
    const cols = Math.max(1, Math.round(width / size)), rows = Math.max(1, Math.round(height / size));
    layers.push({ cols, rows, size, lat: texLattice(cols, rows, seed + o * 7919), amp });
    norm += amp;
    amp *= 0.5;
    size /= 2;
  }
  const smooth = (t: number): number => t * t * (3 - 2 * t);
  return (x, y) => {
    let v = 0;
    for (const l of layers) {
      const fx = (((x + 0.5) / width) * l.cols + l.cols) % l.cols, fy = (((y + 0.5) / height) * l.rows + l.rows) % l.rows;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const x1 = (x0 + 1) % l.cols, y1 = (y0 + 1) % l.rows;
      const tx = smooth(fx - x0), ty = smooth(fy - y0);
      const a = l.lat[y0 * l.cols + x0]!, b = l.lat[y0 * l.cols + x1]!, c = l.lat[y1 * l.cols + x0]!, d = l.lat[y1 * l.cols + x1]!;
      v += (a + (b - a) * tx + (c + (d - c) * tx - (a + (b - a) * tx)) * ty) * l.amp;
    }
    return Math.min(0.999999, v / norm);
  };
}

/**
 * Hard-edged value noise: blobby contour regions, each one flat colour. `colors` are the steps from the
 * lowest to the highest noise value; `null` leaves what is already drawn. `thresholds` (ascending, one
 * fewer than colors) overrides the even split.
 */
export function texSteppedNoise(
  buf: PixelBuffer,
  o: { cell: number; seed: number; colors: readonly (number | null)[]; octaves?: number; thresholds?: readonly number[]; mask?: TexMask },
): void {
  const field = texNoiseField(buf.width, buf.height, o.cell, o.seed, o.octaves ?? 1);
  const n = o.colors.length;
  for (let y = 0; y < buf.height; y++) {
    for (let x = 0; x < buf.width; x++) {
      const v = field(x, y);
      let k = 0;
      if (o.thresholds) while (k < n - 1 && v >= o.thresholds[k]!) k++;
      else k = Math.min(n - 1, Math.floor(v * n));
      const hex = o.colors[k];
      if (hex === null || hex === undefined) continue;
      if (!o.mask || o.mask(x, y)) setPixel(buf, x, y, hex);
    }
  }
}

/**
 * Cell (Voronoi) noise: `points` flat-coloured shards with straight edges, wrapping on both axes.
 * `edge` draws a crack `edgeWidth` px wide (default 2) between cells. Returns the cell index per pixel.
 */
export function texCellNoise(
  buf: PixelBuffer,
  o: { points: number; seed: number; colors: readonly (number | null)[]; weights?: readonly number[]; edge?: number; edgeWidth?: number; mask?: TexMask },
): Int16Array {
  const rng = makeRng(o.seed);
  const w = buf.width, h = buf.height;
  const pts: [number, number, number][] = [];
  const weights = o.weights ?? o.colors.map(() => 1);
  const total = weights.reduce((a, b) => a + b, 0);
  const wrapDist = (ax: number, ay: number, bx: number, by: number): number => {
    let dx = Math.abs(ax - bx), dy = Math.abs(ay - by);
    if (dx > w / 2) dx = w - dx;
    if (dy > h / 2) dy = h - dy;
    return Math.hypot(dx, dy);
  };
  // Sites keep a minimum spacing so no cell is a sliver thinner than its own crack.
  const spacing = 0.55 * Math.sqrt((w * h) / o.points);
  for (let i = 0; i < o.points; i++) {
    let v = rng.next() * total, k = 0;
    while (k < weights.length - 1 && v >= weights[k]!) { v -= weights[k]!; k++; }
    let x = 0, y = 0;
    for (let attempt = 0; attempt < 24; attempt++) {
      x = rng.range(0, w);
      y = rng.range(0, h);
      if (pts.every((q) => wrapDist(x, y, q[0], q[1]) >= spacing)) break;
    }
    pts.push([x, y, k]);
  }
  const cells = new Int16Array(w * h);
  const half = (o.edgeWidth ?? 2) / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let d1 = Infinity, d2 = Infinity, best = 0, second = 0;
      for (let i = 0; i < pts.length; i++) {
        const d = wrapDist(x + 0.5, y + 0.5, pts[i]![0], pts[i]![1]);
        if (d < d1) { d2 = d1; second = best; d1 = d; best = i; } else if (d < d2) { d2 = d; second = i; }
      }
      cells[y * w + x] = best;
      if (o.mask && !o.mask(x, y)) continue;
      // Distance to the straight border between the two nearest sites.
      const gap = wrapDist(pts[best]![0], pts[best]![1], pts[second]![0], pts[second]![1]) || 1;
      const toBorder = (d2 * d2 - d1 * d1) / (2 * gap);
      const hex = o.edge !== undefined && pts.length > 1 && toBorder < half ? o.edge : o.colors[pts[best]![2]];
      if (hex !== null && hex !== undefined) setPixel(buf, x, y, hex);
    }
  }
  return cells;
}

// ---------------------------------------------------------------------------------------------
// Whole-buffer helpers
// ---------------------------------------------------------------------------------------------

/** Copy one RGBA pixel from byte offset `s` of `src` to byte offset `d` of `dst`. */
function copyPixel(src: PixelBuffer, s: number, dst: PixelBuffer, d: number): void {
  dst.data[d] = src.data[s]!; dst.data[d + 1] = src.data[s + 1]!; dst.data[d + 2] = src.data[s + 2]!; dst.data[d + 3] = src.data[s + 3]!;
}

/** A fresh transparent buffer of the given size, every pixel copied from `buf` at the source pixel `src(x, y)` returns. */
function remapPixels(buf: PixelBuffer, width: number, height: number, src: (x: number, y: number) => [number, number]): PixelBuffer {
  const out = makePixels(width, height, 0x000000, 0);
  for (let y = 0; y < out.height; y++) {
    for (let x = 0; x < out.width; x++) {
      const [sx, sy] = src(x, y);
      copyPixel(buf, (sy * buf.width + sx) * 4, out, (y * out.width + x) * 4);
    }
  }
  return out;
}

/** `buf` repeated nx by ny times: how the contact sheet shows seams. */
export function texTile(buf: PixelBuffer, nx: number, ny: number): PixelBuffer {
  return remapPixels(buf, buf.width * nx, buf.height * ny, (x, y) => [x % buf.width, y % buf.height]);
}

/** Nearest-neighbour integer upscale (hard pixels stay hard). */
export function texScaleUp(buf: PixelBuffer, k: number): PixelBuffer {
  return remapPixels(buf, buf.width * k, buf.height * k, (x, y) => [Math.floor(x / k), Math.floor(y / k)]);
}

/**
 * Ink outline for a decal: every transparent pixel within `t` px of an opaque one becomes ink.
 * Draw the shape first, outline last.
 */
export function texInkOutline(buf: PixelBuffer, t = 2, hex: number = INK): void {
  const w = buf.width, h = buf.height;
  const opaque = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) opaque[i] = buf.data[i * 4 + 3]! > 0 ? 1 : 0;
  const [r, g, b] = hexToRgb(hex);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (opaque[y * w + x]) continue;
      let near = false;
      for (let dy = -t; dy <= t && !near; dy++) {
        for (let dx = -t; dx <= t; dx++) {
          const qx = x + dx, qy = y + dy;
          if (qx < 0 || qy < 0 || qx >= w || qy >= h || dx * dx + dy * dy > t * t) continue;
          if (opaque[qy * w + qx]) { near = true; break; }
        }
      }
      if (!near) continue;
      const i = (y * w + x) * 4;
      buf.data[i] = r; buf.data[i + 1] = g; buf.data[i + 2] = b; buf.data[i + 3] = 255;
    }
  }
}

/** Exact colour of a pixel as 0xRRGGBB (wrapping read). */
export function texGet(buf: PixelBuffer, x: number, y: number): number {
  const [r, g, b] = getPixel(buf, x, y);
  return (r << 16) | (g << 8) | b;
}
