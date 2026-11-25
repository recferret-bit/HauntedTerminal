import { FLOOR_THEMES, INK, PAPER, ZONES, hexToRgb } from '../core/palette.js';
import { blendPixel, makePixels } from '../core/pixels.js';
import { anyWithinRadius, celBand, rasterTriangle, type PixelWindow } from '../core/tri-raster.js';
import type { PixelBuffer } from '../core/types.js';
import { FX_WORD_DEFAULT_SIZE, fxLayoutWord, fxWordSoup } from './lettering.js';
import { fxShapeSoup, type FxSoup } from './shapes.js';
import { FX_ROLE_EMISSIVE_FLOOR, fxLightState, fxSimulate, fxWordState } from './simulate.js';
import type { FxLightState, FxPreset } from './types.js';

/**
 * Software preview of one frame of an effect, as the game camera sees it: page plane, flat cel
 * bands, ink outline. No WebGL, so it runs in node (the filmstrip) and in the browser.
 *
 * Parity: the light vector and the band thresholds below are the ones in
 * src/shaders/comic-material.ts and src/procgen/geometry/raster-shade.ts, with x mirrored because
 * effects are authored in page space (+x = screen-right) and world +x is screen-left.
 */
const LIGHT_LEN = Math.hypot(0.35, 0.82, 0.48);
const PAGE_LIGHT: [number, number, number] = [0.35 / LIGHT_LEN, 0.82 / LIGHT_LEN, -0.48 / LIGHT_LEN];

export interface FxFrameOptions {
  seed?: number;
  width?: number;
  height?: number;
  /** Default 58, the game scale. */
  pxPerUnit?: number;
  /** Pixel position of the effect origin. Default: centred, lower for `feet` anchors. */
  origin?: [number, number];
  /** Backdrop colour. Default: the floor 1 backdrop. null leaves it transparent. */
  background?: number | null;
  /** Draw a 1.6-unit vibecoder-sized ghost behind the effect for scale. Default true. */
  reference?: boolean;
  /** Ink line width in pixels. Default: 0.028 units at this scale, at least 1. */
  outlinePx?: number;
  /** Replaces the preset's word (`+16GB` -> `+64GB`). */
  text?: string;
}

interface Stamp {
  soup: FxSoup;
  /** Pixel position of the chunk origin. */
  px: number;
  py: number;
  rot: number;
  rotY?: number;
  /** Pixels per chunk unit. */
  scale: number;
  color: number;
  emissive: number;
  alpha: number;
  outline: number | null;
  outlinePx: number;
}

/** A front-facing chunk triangle in page pixels: (ax, ay, bx, by, cx, cy), its cel band and mean depth. */
interface StampTri {
  xy: number[];
  band: number;
  z: number;
}

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Rotate, scale and place the chunk's front faces on the page, with their cel band; also returns the pixel extent. */
function stampTriangles(s: Stamp): { tris: StampTri[]; bounds: Bounds } {
  const cos = Math.cos(s.rot), sin = Math.sin(s.rot);
  const cosY = s.rotY ? Math.cos(s.rotY) : 1;
  const sinY = s.rotY ? Math.sin(s.rotY) : 0;
  const tris: StampTri[] = [];
  const bounds: Bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (let t = 0; t < s.soup.triCount; t++) {
    const rawNx = s.soup.nrm[t * 3]!, rawNy = s.soup.nrm[t * 3 + 1]!, rawNz = s.soup.nrm[t * 3 + 2]!;
    const yNx = rawNx * cosY + rawNz * sinY;
    const nz = -rawNx * sinY + rawNz * cosY;
    if (nz >= -1e-4) continue; // back faces and edge-on walls
    const nx = yNx * cos - rawNy * sin;
    const ny = yNx * sin + rawNy * cos;
    const xy: number[] = [];
    let z = 0;
    for (let v = 0; v < 3; v++) {
      const o = t * 9 + v * 3;
      const lx0 = s.soup.pos[o]!, ly = s.soup.pos[o + 1]!, lz0 = s.soup.pos[o + 2]!;
      const lx = lx0 * cosY + lz0 * sinY;
      const lz = -lx0 * sinY + lz0 * cosY;
      const x = s.px + (lx * cos - ly * sin) * s.scale;
      const y = s.py - (lx * sin + ly * cos) * s.scale;
      xy.push(x, y);
      z += lz / 3;
      if (x < bounds.minX) bounds.minX = x; if (x > bounds.maxX) bounds.maxX = x;
      if (y < bounds.minY) bounds.minY = y; if (y > bounds.maxY) bounds.maxY = y;
    }
    tris.push({ xy, band: celBand(nx, ny, nz, PAGE_LIGHT), z });
  }
  return { tris, bounds };
}

/** Nearest-triangle cel band per pixel of `win` (0 where nothing covers it). */
function bandMap(tris: StampTri[], win: PixelWindow): Float32Array {
  const w = win.x1 - win.x0 + 1;
  const band = new Float32Array(w * (win.y1 - win.y0 + 1));
  const depth = new Float32Array(band.length).fill(Infinity);
  for (const tri of tris) {
    rasterTriangle(tri.xy, win, (x, y) => {
      const i = (y - win.y0) * w + (x - win.x0);
      if (tri.z < depth[i]!) { depth[i] = tri.z; band[i] = tri.band; }
    });
  }
  return band;
}

/** Rasterize one chunk into `buf`: its own ink line first, then the banded fill on top. */
function stamp(buf: PixelBuffer, s: Stamp): void {
  const { tris, bounds } = stampTriangles(s);
  if (tris.length === 0) return;
  const o = s.outline === null ? 0 : s.outlinePx;
  const win: PixelWindow = {
    x0: Math.max(0, Math.floor(bounds.minX) - o), y0: Math.max(0, Math.floor(bounds.minY) - o),
    x1: Math.min(buf.width - 1, Math.ceil(bounds.maxX) + o), y1: Math.min(buf.height - 1, Math.ceil(bounds.maxY) + o),
  };
  const w = win.x1 - win.x0 + 1, h = win.y1 - win.y0 + 1;
  if (w <= 0 || h <= 0) return;
  const band = bandMap(tris, win);
  const [r, g, b] = hexToRgb(s.color);
  const ink = s.outline === null ? null : hexToRgb(s.outline);
  const e = s.emissive;
  const covered = (q: number): boolean => band[q]! > 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = band[y * w + x]!;
      if (k > 0) {
        blendPixel(buf, x + win.x0, y + win.y0, Math.min(255, r * k + r * e), Math.min(255, g * k + g * e), Math.min(255, b * k + b * e), s.alpha);
      } else if (ink && anyWithinRadius(x, y, o, w, h, covered)) {
        blendPixel(buf, x + win.x0, y + win.y0, ink[0], ink[1], ink[2], s.alpha >= 0.9 ? 1 : s.alpha);
      }
    }
  }
}

/** Ink keyline colour for a zone: ink, or paper when the chunk itself is ink. null: no line (translucent zones). */
export function fxKeylineColor(zoneId: keyof typeof ZONES, outline = true): number | null {
  const z = ZONES[zoneId] as { opacity?: number; ghost?: boolean };
  if (!outline || z.ghost || (z.opacity ?? 1) < 0.9) return null;
  return zoneId === 'ink' ? PAPER : INK;
}

/** Stepped 3-ring Ben-Day light pool on the preview backdrop, mirroring comicFxLight() in comic-material.ts. */
function drawLightPool(buf: PixelBuffer, light: FxLightState | null, ox: number, oy: number, ppu: number): void {
  if (!light || light.power <= 0.001) return;
  const cx = ox + light.x * ppu;
  const cy = oy - light.y * ppu;
  const radPx = Math.max(1, light.radius * ppu);
  const [lr, lg, lb] = hexToRgb(light.color);
  const x0 = Math.max(0, Math.floor(cx - radPx));
  const y0 = Math.max(0, Math.floor(cy - radPx));
  const x1 = Math.min(buf.width - 1, Math.ceil(cx + radPx));
  const y1 = Math.min(buf.height - 1, Math.ceil(cy + radPx));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dist = Math.hypot(x - cx, y - cy);
      const cellX = Math.floor(x / 3);
      const cellY = Math.floor(y / 3);
      const dth = (((cellX + cellY * 2) % 4) / 4 - 0.375) * 0.16;
      const fall = 1 - dist / radPx + dth;
      const ring = fall > 0.64 ? 1 : fall > 0.34 ? 0.58 : fall > 0 ? 0.26 : 0;
      if (ring <= 0) continue;
      const lit = Math.min(1.4, ring * light.power);
      const i = (y * buf.width + x) * 4;
      const br = buf.data[i]!, bg = buf.data[i + 1]!, bb = buf.data[i + 2]!;
      buf.data[i] = Math.min(255, Math.round(br + (br * (lr / 255) * 0.45 + lr * 0.16) * lit));
      buf.data[i + 1] = Math.min(255, Math.round(bg + (bg * (lg / 255) * 0.45 + lg * 0.16) * lit));
      buf.data[i + 2] = Math.min(255, Math.round(bb + (bb * (lb / 255) * 0.45 + lb * 0.16) * lit));
    }
  }
}

/** Draw the effect at `tMs`. Pure and deterministic. */
export function fxRenderFrame(preset: FxPreset, tMs: number, opts: FxFrameOptions = {}): PixelBuffer {
  const ppu = opts.pxPerUnit ?? 58;
  const width = opts.width ?? 200;
  const height = opts.height ?? 176;
  const bg = opts.background === undefined ? FLOOR_THEMES[1].bg : opts.background;
  const buf = makePixels(width, height, bg ?? 0, bg === null ? 0 : 255);
  const originY = preset.anchor === 'feet' ? 0.72 : preset.anchor === 'top' ? 0.42 : 0.56;
  const [ox, oy] = opts.origin ?? [Math.round(width / 2), Math.round(height * originY)];
  const outlinePx = opts.outlinePx ?? Math.max(1, Math.round(0.028 * ppu));
  const light = bg === null ? null : fxLightState(preset, tMs);

  const drawGhost = (): void => {
    if (opts.reference === false || bg === null) return;
    // A vibecoder-sized ghost (0.7 x 1.6 units) and the floor line: scale, not art.
    const [r, g, b] = hexToRgb(bg);
    const feet = oy + Math.round((preset.anchor === 'feet' ? 0 : preset.anchor === 'top' ? 1.6 : 0.8) * ppu);
    const hw = Math.round(0.35 * ppu), hh = Math.round(1.6 * ppu);
    for (let y = feet - hh; y < feet; y++) for (let x = ox - hw; x < ox + hw; x++) blendPixel(buf, x, y, r + 22, g + 20, b + 26, 1);
    for (let x = 0; x < width; x++) blendPixel(buf, x, feet, r + 40, g + 36, b + 46, 1);
  };

  const states = fxSimulate(preset, opts.seed ?? 1, tMs).sort((a, b) => a.z - b.z || a.layer - b.layer || a.index - b.index);
  const drawParticles = (list: typeof states): void => {
    for (const p of list) {
      const layer = preset.layers[p.layer]!;
      const zone = ZONES[layer.zone] as { color: number; emissive?: number; opacity?: number };
      const shape = (p.shapeIndex !== undefined ? layer.shapes?.[p.shapeIndex] : undefined) ?? layer.shape;
      const emissive = zone.color === INK ? 0 : Math.max(zone.emissive ?? 0, FX_ROLE_EMISSIVE_FLOOR[layer.role]);
      stamp(buf, {
        soup: fxShapeSoup(shape),
        px: ox + p.x * ppu,
        py: oy - p.y * ppu,
        rot: p.rot,
        rotY: p.rotY,
        scale: p.scale * ppu,
        color: zone.color,
        emissive,
        alpha: p.alpha * (zone.opacity ?? 1),
        outline: fxKeylineColor(layer.zone, layer.outline !== false),
        outlinePx,
      });
    }
  };
  if (preset.wrapActor) {
    drawLightPool(buf, light, ox, oy, ppu);
    drawParticles(states.filter((p) => p.z < 0));
    drawGhost();
    drawParticles(states.filter((p) => p.z >= 0));
  } else {
    drawGhost();
    drawLightPool(buf, light, ox, oy, ppu);
    drawParticles(states);
  }

  const word = fxWordState(preset, tMs, opts.text);
  if (word && preset.onomatopoeia) {
    const zone = ZONES[preset.onomatopoeia.zone] as { color: number; emissive?: number };
    const wordEmissive = zone.color === INK ? 0 : Math.max(zone.emissive ?? 0, FX_ROLE_EMISSIVE_FLOOR.primary);
    stamp(buf, {
      soup: fxWordSoup(fxLayoutWord(word.text, preset.onomatopoeia.size ?? FX_WORD_DEFAULT_SIZE)),
      px: ox + word.x * ppu,
      py: oy - word.y * ppu,
      rot: word.rot,
      scale: word.scale * ppu,
      color: zone.color,
      emissive: wordEmissive,
      alpha: word.alpha,
      outline: preset.onomatopoeia.zone === 'ink' ? PAPER : INK,
      outlinePx: Math.max(2, outlinePx),
    });
  }
  return buf;
}
