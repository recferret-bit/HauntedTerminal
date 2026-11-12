import { shapeToGeometry } from '../geometry/geometry.js';
import type { ShapeSpec, Vec2 } from '../core/types.js';

/**
 * The chunk vocabulary of comic effects. Every helper returns a plain ShapeSpec whose outline is
 * drawn in PAGE space (x = screen-right, y = up), centred on the origin, with its long axis on +x
 * so `align: true` points it along its direction of travel.
 * Chunks are reliefs like every model: a 2D outline with a little thickness and a bevel, so the
 * cel bands and the ink shell have an edge to catch.
 */

const DEPTH = 0.07;
const BEVEL = 0.014;

function extrude(outline: Vec2[], depth = DEPTH, bevel = BEVEL): ShapeSpec {
  return { kind: 'extrude', outline, depth, bevel };
}

/** The impact flash: a spiky star. `points` 5..12; uneven radii make it look hand-drawn. */
export function fxStarburst(points: number, rOuter: number, rInner: number, wobble = 0.18): ShapeSpec {
  const outline: Vec2[] = [];
  for (let i = 0; i < points * 2; i++) {
    const a = (i / (points * 2)) * Math.PI * 2 + Math.PI / 2;
    const tip = i % 2 === 0;
    // Deterministic unevenness: every third tip is longer, every other valley deeper.
    const k = tip ? 1 + wobble * (((i / 2) % 3) - 1) : 1 - wobble * 0.5 * ((((i - 1) / 2) % 2) * 2 - 1);
    const r = (tip ? rOuter : rInner) * k;
    outline.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return extrude(outline, DEPTH, 0);
}

/** A four-point sparkle (lantern glints, pickups). */
export function fxSparkle(r: number, waist = 0.24): ShapeSpec {
  const w = r * waist;
  return extrude([[r, 0], [w, w], [0, r], [-w, w], [-r, 0], [-w, -w], [0, -r], [w, -w]], 0.05, 0);
}

/** A jagged shard of something broken, pointing along +x. */
export function fxShard(length: number, width: number): ShapeSpec {
  const l = length / 2, w = width / 2;
  return extrude([[l, 0.1 * w], [0.15 * l, w], [-l, 0.55 * w], [-0.7 * l, -0.2 * w], [-0.25 * l, -w]]);
}

/** A splinter: long thin triangle, for sparks. */
export function fxSpark(length: number, width: number): ShapeSpec {
  const l = length / 2, w = width / 2;
  return extrude([[l, 0], [-l, w], [-0.75 * l, 0], [-l, -w]], 0.04, 0);
}

/** A speed line: a flat tapered stroke along +x. */
export function fxSpeedLine(length: number, width: number): ShapeSpec {
  const l = length / 2, w = width / 2;
  return extrude([[l, 0.25 * w], [-l, w], [-l, -w], [l, -0.25 * w]], 0.03, 0);
}

/** A flat low-poly disc facing the camera. */
export function fxDisc(radius: number, sides = 8): ShapeSpec {
  const outline: Vec2[] = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2 + Math.PI / sides;
    outline.push([Math.cos(a) * radius, Math.sin(a) * radius]);
  }
  return extrude(outline, 0.05, 0);
}

/** A comic dust cloud: a scalloped blob, flat on the bottom. */
export function fxPuff(radius: number): ShapeSpec {
  const r = radius;
  return extrude([
    [-r, -0.45 * r], [-1.05 * r, 0.05 * r], [-0.7 * r, 0.5 * r], [-0.35 * r, 0.42 * r], [-0.1 * r, 0.85 * r],
    [0.4 * r, 0.7 * r], [0.5 * r, 0.35 * r], [0.95 * r, 0.3 * r], [1.05 * r, -0.2 * r], [0.75 * r, -0.5 * r],
  ], 0.06, 0);
}

/** A ring in the page plane (shock rings, status rings). */
export function fxRing(radius: number, tube: number): ShapeSpec {
  return { kind: 'torus', radius, tube };
}

/** A pixel: the unit of glitch and of anything digital falling apart. */
export function fxBlock(width: number, height = width): ShapeSpec {
  return { kind: 'box', size: [width, height, Math.min(width, height) * 0.5] };
}

/** An ice crystal: an elongated six-sided gem along +x. */
export function fxCrystal(length: number, width: number): ShapeSpec {
  const l = length / 2, w = width / 2;
  return extrude([[l, 0], [0.45 * l, w], [-0.6 * l, w], [-l, 0], [-0.6 * l, -w], [0.45 * l, -w]], 0.09, 0.02);
}

/** A drop of liquid or ink, heavy end leading along +x. */
export function fxDrop(length: number, width: number): ShapeSpec {
  const l = length / 2, w = width / 2;
  return extrude([[l, 0.35 * w], [0.55 * l, w], [0.05 * l, 0.8 * w], [-l, 0], [0.05 * l, -0.8 * w], [0.55 * l, -w], [l, -0.35 * w]], 0.06, 0);
}

/** A splat: an ink blot with uneven lobes. */
export function fxSplat(radius: number): ShapeSpec {
  const lobes = [1, 0.5, 0.85, 0.45, 1.1, 0.55, 0.75, 0.4, 0.95, 0.5, 0.8, 0.45];
  const outline: Vec2[] = lobes.map((k, i) => {
    const a = (i / lobes.length) * Math.PI * 2;
    return [Math.cos(a) * radius * k, Math.sin(a) * radius * k];
  });
  return extrude(outline, 0.04, 0);
}

/** A torn strip of page, long axis on +x, both long edges ragged. */
export function fxTornStrip(length: number, width: number): ShapeSpec {
  const l = length / 2, w = width / 2;
  return extrude([
    [-l, -0.6 * w], [-0.6 * l, -w], [-0.2 * l, -0.55 * w], [0.25 * l, -0.95 * w], [0.6 * l, -0.5 * w], [l, -0.8 * w],
    [l, 0.5 * w], [0.55 * l, w], [0.15 * l, 0.6 * w], [-0.3 * l, 0.95 * w], [-0.65 * l, 0.55 * w], [-l, 0.85 * w],
  ], 0.04, 0);
}

/** A lightning bolt, top at +y, tip at -y, `height` tall. Drawn as a jagged ink-edged blade. */
export function fxBolt(height: number, width: number): ShapeSpec {
  const h = height / 2, w = width / 2;
  return extrude([
    [-0.2 * w, h], [w, h], [0.15 * w, 0.28 * h], [0.95 * w, 0.28 * h], [-0.1 * w, -0.3 * h], [0.55 * w, -0.3 * h],
    [-0.55 * w, -h], [-0.25 * w, -0.48 * h], [-0.95 * w, -0.48 * h], [-0.45 * w, 0.1 * h], [-w, 0.1 * h],
  ], 0.05, 0);
}

export type FxGlyphName = 'plus' | 'minus' | 'slash' | 'chevron' | 'bracket' | 'one' | 'zero' | 'hash';

/**
 * A terminal glyph as a solid: the bits that assemble a file or fall out of a dying process.
 * `size` is the glyph height; stroke weight is a fifth of it, like a 5-row pixel font.
 */
export function fxGlyph(name: FxGlyphName, size: number): ShapeSpec {
  const h = size / 2, s = size / 5;
  const t = s / 2;
  switch (name) {
    case 'plus':
      return extrude([[-t, h], [t, h], [t, t], [h, t], [h, -t], [t, -t], [t, -h], [-t, -h], [-t, -t], [-h, -t], [-h, t], [-t, t]], 0.05, 0);
    case 'minus':
      return { kind: 'box', size: [size, s, 0.05] };
    case 'slash':
      return extrude([[h - s, h], [h, h], [-h + s, -h], [-h, -h]], 0.05, 0);
    case 'chevron':
      return extrude([[-h * 0.6, h], [-h * 0.6 + s * 1.2, h], [h * 0.6, 0], [-h * 0.6 + s * 1.2, -h], [-h * 0.6, -h], [h * 0.6 - s * 1.2, 0]], 0.05, 0);
    case 'bracket':
      return extrude([[-h * 0.5, h], [h * 0.5, h], [h * 0.5, h - s], [-h * 0.5 + s, h - s], [-h * 0.5 + s, -h + s], [h * 0.5, -h + s], [h * 0.5, -h], [-h * 0.5, -h]], 0.05, 0);
    case 'one':
      return extrude([[-t, h], [t, h], [t, -h + s], [s * 1.5, -h + s], [s * 1.5, -h], [-s * 1.5, -h], [-s * 1.5, -h + s], [-t, -h + s]], 0.05, 0);
    case 'zero':
      return { kind: 'torus', radius: h - t, tube: t };
    case 'hash':
      return extrude([
        [-s * 1.5, h], [-t, h], [-t, s * 1.5], [t, s * 1.5], [t, h], [s * 1.5, h], [s * 1.5, s * 1.5], [h, s * 1.5], [h, t],
        [s * 1.5, t], [s * 1.5, -t], [h, -t], [h, -s * 1.5], [s * 1.5, -s * 1.5], [s * 1.5, -h], [t, -h], [t, -s * 1.5],
        [-t, -s * 1.5], [-t, -h], [-s * 1.5, -h], [-s * 1.5, -s * 1.5], [-h, -s * 1.5], [-h, -t], [-s * 1.5, -t],
        [-s * 1.5, t], [-h, t], [-h, s * 1.5], [-s * 1.5, s * 1.5],
      ], 0.05, 0);
  }
}

/** Triangle soup of one chunk in page space. The validator, the node preview and nothing else read this. */
export interface FxSoup {
  /** 9 floats per triangle. */
  pos: Float32Array;
  /** 3 floats per triangle: the face normal. z < 0 faces the camera. */
  nrm: Float32Array;
  triCount: number;
  /** Area of the silhouette as the camera sees it, in square units. */
  frontArea: number;
  /** Page-space extent: [width, height, depth]. */
  size: [number, number, number];
  min: [number, number, number];
  max: [number, number, number];
}

const soupCache = new Map<string, FxSoup>();

export function fxSoupFromTriangles(pos: Float32Array): FxSoup {
  const triCount = pos.length / 9;
  const nrm = new Float32Array(triCount * 3);
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  let frontArea = 0;
  for (let t = 0; t < triCount; t++) {
    const o = t * 9;
    const ux = pos[o + 3]! - pos[o]!, uy = pos[o + 4]! - pos[o + 1]!, uz = pos[o + 5]! - pos[o + 2]!;
    const vx = pos[o + 6]! - pos[o]!, vy = pos[o + 7]! - pos[o + 1]!, vz = pos[o + 8]! - pos[o + 2]!;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nrm[t * 3] = nx / len; nrm[t * 3 + 1] = ny / len; nrm[t * 3 + 2] = nz / len;
    if (nz < 0) frontArea += -nz / 2;
    for (let v = 0; v < 3; v++) {
      for (let a = 0; a < 3; a++) {
        const c = pos[o + v * 3 + a]!;
        if (c < min[a]!) min[a] = c;
        if (c > max[a]!) max[a] = c;
      }
    }
  }
  if (triCount === 0) { min.fill(0); max.fill(0); }
  return { pos, nrm, triCount, frontArea, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]], min, max };
}

/** Cached per shape: presets reuse a handful of chunks. */
export function fxShapeSoup(shape: ShapeSpec): FxSoup {
  const key = JSON.stringify(shape);
  let soup = soupCache.get(key);
  if (!soup) {
    const source = shapeToGeometry(shape);
    const geo = source.index ? source.toNonIndexed() : source;
    const p = geo.getAttribute('position');
    const pos = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      pos[i * 3] = p.getX(i); pos[i * 3 + 1] = p.getY(i); pos[i * 3 + 2] = p.getZ(i);
    }
    if (geo !== source) geo.dispose();
    source.dispose();
    soup = fxSoupFromTriangles(pos);
    soupCache.set(key, soup);
  }
  return soup;
}
