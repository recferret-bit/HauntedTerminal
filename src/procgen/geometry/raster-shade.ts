import { TextureCatalog } from '../core/catalog.js';
import { hexToRgb, INK, zone } from '../core/palette.js';
import { getPixel } from '../core/pixels.js';
import { celBand } from '../core/tri-raster.js';
import type { PixelBuffer } from '../core/types.js';
import type { BakedPart } from './geometry.js';

/** Per-pixel shading of the software preview; mirrors src/shaders/comic-material.ts. */
export type Rgb = [number, number, number];
export type RasterView = 'front' | 'side' | 'top';

export const LIGHT: [number, number, number] = normalize([-0.35, 0.82, -0.48]);
const INK_RGB = hexToRgb(INK);

function normalize(v: [number, number, number]): [number, number, number] {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

/** Returns [screenX, screenY, depth]; smaller depth is nearer the camera. */
export function project(view: RasterView, x: number, y: number, z: number): [number, number, number] {
  if (view === 'front') return [-x, y, z];
  if (view === 'side') return [z, y, -x];
  return [-x, z, -y];
}

/** Unit vector from the scene towards the camera, in world space. */
export function toCamera(view: RasterView): [number, number, number] {
  if (view === 'front') return [0, 0, -1];
  if (view === 'side') return [1, 0, 0];
  return [0, 1, 0];
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Ghost and low-opacity zones are blended after the opaque pass instead of writing depth. */
export function isTranslucent(b: BakedPart): boolean {
  const z = zone(b.part.zone);
  return z.ghost === true || (z.opacity ?? 1) < 0.9;
}

export interface PartMaterial {
  base: Rgb;
  emissive: number;
  halftone: boolean;
  ghost: boolean;
  opacity: number;
  tex: PixelBuffer | null;
}

export function partMaterial(b: BakedPart, useTextures: boolean, seed: number): PartMaterial {
  const z = zone(b.part.zone);
  const textured = useTextures && b.part.texture && b.uv && TextureCatalog.has(b.part.texture);
  return {
    base: hexToRgb(z.color),
    emissive: z.emissive ?? 0,
    halftone: z.halftone === true,
    ghost: z.ghost === true,
    opacity: z.opacity ?? 1,
    tex: textured ? TextureCatalog.build(b.part.texture!, seed) : null,
  };
}

/** Barycentric blend of the three vertex normals of triangle at float offset `o`, unit length. */
function interpolatedNormal(b: BakedPart, o: number, w0: number, w1: number, w2: number): Rgb {
  const nx = w0 * b.nrm[o]! + w1 * b.nrm[o + 3]! + w2 * b.nrm[o + 6]!;
  const ny = w0 * b.nrm[o + 1]! + w1 * b.nrm[o + 4]! + w2 * b.nrm[o + 7]!;
  const nz = w0 * b.nrm[o + 2]! + w1 * b.nrm[o + 5]! + w2 * b.nrm[o + 8]!;
  const nl = Math.hypot(nx, ny, nz) || 1;
  return [nx / nl, ny / nl, nz / nl];
}

export interface ShadeInput {
  part: BakedPart;
  material: PartMaterial;
  tri: number;
  w: [number, number, number];
  px: number;
  py: number;
  ppu: number;
  cam: [number, number, number];
}

export interface ShadeResult {
  rgb: Rgb;
  /** Fresnel term; the ghost zones use it to fade in at grazing angles. */
  fres: number;
}

/** Cel band, texture, halftone dots, rim ink and emissive add for one covered pixel. */
export function shadePixel(s: ShadeInput): ShadeResult {
  const { part: b, material: m, tri: t, w: [w0, w1, w2], px, py, ppu, cam } = s;
  let [nx, ny, nz] = interpolatedNormal(b, t * 9, w0, w1, w2);
  let facing = nx * cam[0] + ny * cam[1] + nz * cam[2];
  if (facing < 0) { nx = -nx; ny = -ny; nz = -nz; facing = -facing; }

  const band = celBand(nx, ny, nz, LIGHT);
  let r = m.base[0] * band, g = m.base[1] * band, bl = m.base[2] * band;
  if (m.tex && b.uv) {
    const u = w0 * b.uv[t * 6]! + w1 * b.uv[t * 6 + 2]! + w2 * b.uv[t * 6 + 4]!;
    const v = w0 * b.uv[t * 6 + 1]! + w1 * b.uv[t * 6 + 3]! + w2 * b.uv[t * 6 + 5]!;
    const [tr, tg, tb] = getPixel(m.tex, u * m.tex.width, (1 - v) * m.tex.height);
    r = r * 0.14 + tr * band * 0.86; g = g * 0.14 + tg * band * 0.86; bl = bl * 0.14 + tb * band * 0.86;
  }
  if (m.halftone && band < 0.95) {
    const cell = Math.max(4, Math.round(ppu / 16));
    const hx = (px % cell) - cell / 2 + 0.5, hy = (py % cell) - cell / 2 + 0.5;
    if (Math.hypot(hx, hy) < cell * 0.32) { r *= 0.78; g *= 0.78; bl *= 0.78; }
  }
  const fres = Math.pow(1 - facing, 2.6);
  const rim = smoothstep(0.55, 0.92, fres) * 0.55;
  r = r * (1 - rim) + INK_RGB[0] * rim; g = g * (1 - rim) + INK_RGB[1] * rim; bl = bl * (1 - rim) + INK_RGB[2] * rim;
  r += m.base[0] * m.emissive; g += m.base[1] * m.emissive; bl += m.base[2] * m.emissive;
  return { rgb: [r, g, bl], fres };
}

/** Alpha and violet rim of a translucent part for one pixel. */
export function translucentAlpha(m: PartMaterial, fres: number, rgb: Rgb): number {
  let a = m.opacity;
  if (m.ghost) {
    a = Math.min(0.92, m.opacity * (0.12 + fres * 1.15));
    rgb[0] += 64 * fres; rgb[1] += 20 * fres; rgb[2] += 89 * fres;
  }
  return a;
}
