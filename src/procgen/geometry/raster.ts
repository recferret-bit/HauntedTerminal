import { hexToRgb, INK } from '../core/palette.js';
import { anyWithinRadius, rasterTriangle } from '../core/tri-raster.js';
import type { ModelSpec, PixelBuffer } from '../core/types.js';
import { bakeModel, type BakedPart } from './geometry.js';
import {
  isTranslucent, partMaterial, project, shadePixel, toCamera, translucentAlpha,
  type PartMaterial, type RasterView,
} from './raster-shade.js';

/**
 * Software preview of a ModelSpec in the game's projection, no WebGL needed.
 * It mirrors src/shaders/comic-material.ts closely enough to judge silhouette, cel bands,
 * palette and ink weight: orthographic, camera on −z, three light bands, rim ink, emissive add,
 * silhouette and crease ink lines. It does not run the pixel-art or CRT passes.
 *
 * `front` is what the player sees. `side` and `top` exist only to debug depth and footprint.
 */
export type { RasterView };

export interface RasterOptions {
  view?: RasterView;
  /** Pixels per world unit. The game shows the vibecoder (1.6 units) at roughly 92 px: ~58 px per unit. */
  pxPerUnit?: number;
  /** Used when pxPerUnit is not given: longest image side in pixels. */
  size?: number;
  marginPx?: number;
  /** null leaves the background transparent. */
  background?: number | null;
  /** Ink width in pixels. Default: the model's inkWeight at this scale, at least 1. */
  outlinePx?: number;
  textures?: boolean;
  seed?: number;
}

export interface RasterResult {
  image: PixelBuffer;
  /** Part index per pixel, −1 where empty. Ink pixels keep the id of the part under them (−1 outside the silhouette). */
  partId: Int16Array;
  /** Visible pixels per part, before ink. */
  coverage: Int32Array;
  /** Pixels inside the silhouette. */
  filled: number;
  pxPerUnit: number;
  /** Screen-space extent in world units: [minX, minY, maxX, maxY]. */
  extent: [number, number, number, number];
}

/** World-to-image mapping: the projected extent, pixel scale and image size. */
interface Frame {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  ppu: number;
  margin: number;
  width: number;
  height: number;
}

/** Image buffers the passes write into. */
interface Grid {
  width: number;
  height: number;
  rgb: Float32Array;
  depth: Float32Array;
  partId: Int16Array;
}

function projectedExtent(view: RasterView, baked: BakedPart[]): [number, number, number, number] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const b of baked) {
    for (let i = 0; i < b.pos.length; i += 3) {
      const [sx, sy] = project(view, b.pos[i]!, b.pos[i + 1]!, b.pos[i + 2]!);
      if (sx < minX) minX = sx; if (sx > maxX) maxX = sx;
      if (sy < minY) minY = sy; if (sy > maxY) maxY = sy;
    }
  }
  if (!Number.isFinite(minX)) return [0, 0, 1, 1];
  return [minX, minY, maxX, maxY];
}

function fitFrame(view: RasterView, baked: BakedPart[], opts: RasterOptions): Frame {
  const margin = opts.marginPx ?? 8;
  const [minX, minY, maxX, maxY] = projectedExtent(view, baked);
  const spanX = Math.max(maxX - minX, 1e-3);
  const spanY = Math.max(maxY - minY, 1e-3);
  const ppu = opts.pxPerUnit ?? ((opts.size ?? 256) - margin * 2) / Math.max(spanX, spanY);
  const width = Math.max(1, Math.ceil(spanX * ppu) + margin * 2);
  const height = Math.max(1, Math.ceil(spanY * ppu) + margin * 2);
  return { minX, minY, maxX, maxY, ppu, margin, width, height };
}

function makeGrid(f: Frame, background: number | null): Grid {
  const n = f.width * f.height;
  const rgb = new Float32Array(n * 3);
  if (background !== null) {
    const [r, g, b] = hexToRgb(background);
    for (let i = 0; i < n; i++) { rgb[i * 3] = r; rgb[i * 3 + 1] = g; rgb[i * 3 + 2] = b; }
  }
  return { width: f.width, height: f.height, rgb, depth: new Float32Array(n).fill(Infinity), partId: new Int16Array(n).fill(-1) };
}

/** Draw one baked part: depth-tested when opaque, alpha-blended over what is already there when translucent. */
function drawPart(g: Grid, f: Frame, view: RasterView, b: BakedPart, m: PartMaterial, translucent: boolean): void {
  const cam = toCamera(view);
  const win = { x0: 0, y0: 0, x1: g.width - 1, y1: g.height - 1 };
  // Screen-space (x0, y0, x1, y1, x2, y2) followed by the three vertex depths.
  const tri = new Float64Array(9);
  let t = 0;
  const visit = (px: number, py: number, w0: number, w1: number, w2: number): void => {
    const d = w0 * tri[6]! + w1 * tri[7]! + w2 * tri[8]!;
    const idx = py * g.width + px;
    if (d >= g.depth[idx]!) return;
    const shaded = shadePixel({ part: b, material: m, tri: t, w: [w0, w1, w2], px, py, ppu: f.ppu, cam });
    const [r, gr, bl] = shaded.rgb;
    if (!translucent) {
      g.rgb[idx * 3] = r; g.rgb[idx * 3 + 1] = gr; g.rgb[idx * 3 + 2] = bl;
      g.depth[idx] = d;
      g.partId[idx] = b.index;
      return;
    }
    const a = translucentAlpha(m, shaded.fres, shaded.rgb);
    g.rgb[idx * 3] = g.rgb[idx * 3]! * (1 - a) + shaded.rgb[0] * a;
    g.rgb[idx * 3 + 1] = g.rgb[idx * 3 + 1]! * (1 - a) + shaded.rgb[1] * a;
    g.rgb[idx * 3 + 2] = g.rgb[idx * 3 + 2]! * (1 - a) + shaded.rgb[2] * a;
    if (g.partId[idx] === -1) g.partId[idx] = b.index;
  };
  for (t = 0; t < b.triCount; t++) {
    const o = t * 9;
    for (let v = 0; v < 3; v++) {
      const [sx, sy, sz] = project(view, b.pos[o + v * 3]!, b.pos[o + v * 3 + 1]!, b.pos[o + v * 3 + 2]!);
      tri[v * 2] = (sx - f.minX) * f.ppu + f.margin;
      tri[v * 2 + 1] = (f.maxY - sy) * f.ppu + f.margin;
      tri[6 + v] = sz;
    }
    rasterTriangle(tri, win, visit);
  }
}

/** Opaque parts first (depth tested), then translucent ones blended on top. */
function drawParts(g: Grid, f: Frame, view: RasterView, baked: BakedPart[], opts: RasterOptions): void {
  const useTextures = opts.textures !== false;
  const seed = opts.seed ?? 1;
  for (const pass of [false, true]) {
    for (const b of baked) {
      if (isTranslucent(b) === pass) drawPart(g, f, view, b, partMaterial(b, useTextures, seed), pass);
    }
  }
}

/** Visible pixels per part and the count of pixels covered by anything. */
function countCoverage(partId: Int16Array, parts: number): { coverage: Int32Array; filled: number } {
  const coverage = new Int32Array(parts);
  let filled = 0;
  for (let i = 0; i < partId.length; i++) {
    const id = partId[i]!;
    if (id >= 0) { coverage[id] = coverage[id]! + 1; filled++; }
  }
  return { coverage, filled };
}

/** Ink: a silhouette line grown outward, and crease lines where a nearer part overlaps a farther one. */
function inkMask(g: Grid, outlinePx: number, baked: BakedPart[]): Uint8Array {
  const inked = new Uint8Array(g.width * g.height);
  const outlined = baked.map((b) => b.part.outline !== false && !isTranslucent(b));
  let id = -1, idx = 0;
  const isInkSource = (q: number): boolean => {
    const other = g.partId[q]!;
    if (other < 0 || other === id || !outlined[other]) return false;
    return id < 0 || g.depth[q]! < g.depth[idx]! - 0.012;
  };
  for (let py = 0; py < g.height; py++) {
    for (let px = 0; px < g.width; px++) {
      idx = py * g.width + px;
      id = g.partId[idx]!;
      if (anyWithinRadius(px, py, outlinePx, g.width, g.height, isInkSource)) inked[idx] = 1;
    }
  }
  return inked;
}

/** Float colour, ink mask and coverage to the final RGBA buffer. */
function composeImage(g: Grid, inked: Uint8Array, opaqueBackground: boolean): PixelBuffer {
  const n = g.width * g.height;
  const ink = hexToRgb(INK);
  const data = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    if (inked[i]) {
      data[i * 4] = ink[0]; data[i * 4 + 1] = ink[1]; data[i * 4 + 2] = ink[2]; data[i * 4 + 3] = 255;
      continue;
    }
    data[i * 4] = g.rgb[i * 3]!; data[i * 4 + 1] = g.rgb[i * 3 + 1]!; data[i * 4 + 2] = g.rgb[i * 3 + 2]!;
    data[i * 4 + 3] = g.partId[i]! >= 0 || opaqueBackground ? 255 : 0;
  }
  return { width: g.width, height: g.height, data };
}

export function rasterizeModel(spec: ModelSpec, opts: RasterOptions = {}, prebaked?: BakedPart[]): RasterResult {
  const view = opts.view ?? 'front';
  const baked = prebaked ?? bakeModel(spec);
  const frame = fitFrame(view, baked, opts);
  const bg = opts.background === undefined ? 0x211a36 : opts.background;
  // Background first so translucent parts blend over it.
  const grid = makeGrid(frame, bg);
  drawParts(grid, frame, view, baked, opts);
  const { coverage, filled } = countCoverage(grid.partId, baked.length);
  const outlinePx = opts.outlinePx ?? Math.max(1, Math.round((spec.inkWeight ?? 0.028) * frame.ppu));
  const image = composeImage(grid, inkMask(grid, outlinePx, baked), bg !== null);
  const extent: [number, number, number, number] = [frame.minX, frame.minY, frame.maxX, frame.maxY];
  return { image, partId: grid.partId, coverage, filled, pxPerUnit: frame.ppu, extent };
}
