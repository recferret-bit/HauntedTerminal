import { hexToRgb } from '../core/palette.js';
import type { PixelBuffer, TextureEntry } from '../core/types.js';
import { TEX_BACKDROP_QUIET_FROM, texAllowedColors, type TexEntry } from '../textures/toolkit.js';

// The drawing toolkit is re-exported here so harness scripts and the game reach it through src/procgen/index.ts.
export * from '../textures/toolkit.js';
export * from '../textures/font.js';

/**
 * Texture validator. A comic texture is flat, hard-edged, palette-locked, readable after the pixel-art
 * pass, seamless when it says it tiles, and deterministic. Each rule below is one of those words as a number.
 * Skill: .kiro/skills/procedural-texture-synthesis (scripts/validate-textures.mjs, scripts/self-test.mjs).
 */
export type TextureIssueCode =
  | 'SIZE_POW2' | 'SIZE_RANGE' | 'BACKDROP_SHAPE'
  | 'ALPHA_HOLES' | 'ALPHA_SOFT' | 'DECAL_OPAQUE'
  | 'SEAM_X' | 'SEAM_Y'
  | 'OFF_PALETTE' | 'COLOR_COUNT'
  | 'GRADIENT' | 'FLAT_FILL'
  | 'BACKDROP_BRIGHT' | 'BACKDROP_CONTRAST' | 'BACKDROP_BAND'
  | 'THIN_DETAIL' | 'DOWNSAMPLE_LOSS'
  | 'NONDETERMINISTIC' | 'SEED_IGNORED' | 'SEED_CHANGES_STATIC' | 'SEED_CHANGES_SIZE';

export interface TextureIssue {
  code: TextureIssueCode;
  severity: 'error' | 'warning';
  message: string;
}

export interface TextureMetrics {
  /** Distinct colours among opaque pixels. */
  colors: number;
  /** Fraction of opaque pixels that are not one of the allowed palette colours. */
  offPalette: number;
  /** Mean colour jump (0..1) across the left/right wrap, and the limit: the worst jump between two interior columns. */
  seamX: number; seamLimitX: number;
  seamY: number; seamLimitY: number;
  /** Fraction of pixels sitting in a smooth ramp (two small same-direction steps in a row). */
  gradient: number;
  /** RMS colour distance from the mean colour, 0..255. 0 is a flat fill. */
  spread: number;
  lumaMean: number; lumaStd: number;
  /** Fraction of pixels brighter than the backdrop highlight limit. */
  bright: number;
  /** Backdrops: luma spread in the quiet band (rows from TEX_BACKDROP_QUIET_FROM down), and the fraction of
   *  band pixels whose luma is further than `bandOutlierLuma` from the band median (ink, holes, accents). */
  bandStd: number; bandOutliers: number;
  /** Fraction of pixels whose run is 1 px wide or 1 px tall: detail the pixel-art pass drops. */
  thin: number;
  /** Luma contrast kept after a 2x box downsample, 0..1. */
  survival: number;
  /** Fraction of pixels with alpha 0, and with alpha strictly between 0 and 255. */
  transparent: number; softAlpha: number;
}

export interface TextureReport {
  id: string;
  usage: TextureEntry['usage'];
  tileable: boolean;
  width: number;
  height: number;
  seed: number;
  metrics: TextureMetrics;
  issues: TextureIssue[];
  errors: number;
  warnings: number;
  ok: boolean;
}

export interface TextureValidateOptions {
  /** Seed `buf` was built with. Default 1. */
  seed?: number;
  /** Rebuild to check determinism and seed sensitivity. Default true. */
  determinism?: boolean;
}

/** Thresholds, tuned on the shipped textures and on the bad cases in scripts/self-test.mjs. */
export const TEXTURE_LIMITS = {
  surfaceMin: 64, surfaceMax: 256,
  /** RGB distance (0..255) within which a pixel counts as a palette colour. */
  paletteTolerance: 6,
  offPaletteWarn: 0, offPaletteError: 0.002,
  colorsWarn: 12, colorsError: 24,
  /** Largest per-channel step that still counts as part of a ramp. */
  rampStep: 48,
  gradientWarn: 0.01, gradientError: 0.03,
  spreadError: 3, spreadWarn: 6,
  bandStd: 7, bandOutlierLuma: 14, bandOutliers: 0.005,
  backdropLumaMean: 52, backdropLumaStd: 22, backdropBrightLuma: 120, backdropBrightFraction: 0.03,
  thinWarn: 0.12, thinError: 0.3,
  survivalWarn: 0.7, survivalError: 0.5,
  seamSlack: 1.2, seamFloor: 0.004,
} as const;

const isPow2 = (n: number): boolean => n > 0 && (n & (n - 1)) === 0;
const pct = (v: number): string => `${(v * 100).toFixed(v > 0 && v < 0.01 ? 2 : 1)}%`;

/** Mean colour jump between column/row `a` and `b`, 0..1. */
function lineJump(buf: PixelBuffer, axis: 'x' | 'y', a: number, b: number): number {
  const { width: w, height: h, data } = buf;
  const n = axis === 'x' ? h : w;
  let sum = 0;
  for (let k = 0; k < n; k++) {
    const i = (axis === 'x' ? k * w + a : a * w + k) * 4, j = (axis === 'x' ? k * w + b : b * w + k) * 4;
    sum += Math.hypot(data[i]! - data[j]!, data[i + 1]! - data[j + 1]!, data[i + 2]! - data[j + 2]!, data[i + 3]! - data[j + 3]!);
  }
  return sum / n / 441.673;
}

function seam(buf: PixelBuffer, axis: 'x' | 'y'): { seam: number; limit: number } {
  const n = axis === 'x' ? buf.width : buf.height;
  const interior: number[] = [];
  for (let k = 0; k + 1 < n; k++) interior.push(lineJump(buf, axis, k, k + 1));
  // The wrap may be as discontinuous as the worst interior line (a fin edge, a block border), never worse.
  const limit = Math.max(...interior, 0) * TEXTURE_LIMITS.seamSlack + TEXTURE_LIMITS.seamFloor;
  return { seam: lineJump(buf, axis, n - 1, 0), limit };
}

function sameBuffer(a: PixelBuffer, b: PixelBuffer): boolean {
  if (a.width !== b.width || a.height !== b.height) return false;
  for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) return false;
  return true;
}

export function measureTexture(entry: TextureEntry, buf: PixelBuffer): TextureMetrics {
  const { width: w, height: h, data } = buf;
  const n = w * h;
  const L = TEXTURE_LIMITS;
  const wrapX = entry.tileable, wrapY = entry.tileable && entry.usage !== 'backdrop';

  const allowed = texAllowedColors(entry).map(hexToRgb);
  const verdict = new Map<number, boolean>();
  const key = new Int32Array(n);
  const luma = new Float32Array(n);
  let opaque = 0, transparent = 0, soft = 0, off = 0, bright = 0;
  let sr = 0, sg = 0, sb = 0, sl = 0;
  for (let p = 0; p < n; p++) {
    const i = p * 4, a = data[i + 3]!;
    if (a === 0) { transparent++; key[p] = -1; luma[p] = 128; continue; }
    if (a < 255) soft++;
    opaque++;
    const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
    const k = (r << 16) | (g << 8) | b;
    key[p] = k;
    let onPalette = verdict.get(k);
    if (onPalette === undefined) {
      onPalette = allowed.some((c) => Math.hypot(c[0] - r, c[1] - g, c[2] - b) <= L.paletteTolerance);
      verdict.set(k, onPalette);
    }
    if (!onPalette) off++;
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    luma[p] = l;
    if (l > L.backdropBrightLuma) bright++;
    sr += r; sg += g; sb += b; sl += l;
  }
  const m = Math.max(1, opaque);
  const mr = sr / m, mg = sg / m, mb = sb / m, ml = sl / m;
  let spread = 0, lvar = 0;
  for (let p = 0; p < n; p++) {
    if (key[p]! < 0) continue;
    const i = p * 4;
    spread += (data[i]! - mr) ** 2 + (data[i + 1]! - mg) ** 2 + (data[i + 2]! - mb) ** 2;
    lvar += (luma[p]! - ml) ** 2;
  }

  // Neighbour lookups: wrap on tiling axes, otherwise repeat the edge pixel.
  const at = (x: number, y: number): number => {
    const px = wrapX ? (x + w) % w : Math.min(w - 1, Math.max(0, x));
    const py = wrapY ? (y + h) % h : Math.min(h - 1, Math.max(0, y));
    return py * w + px;
  };
  const isRamp = (a: number, b: number, c: number): boolean => {
    if (key[a]! < 0 || key[b]! < 0 || key[c]! < 0 || key[a] === key[b] || key[b] === key[c]) return false;
    let big1 = 0, big2 = 0;
    for (let ch = 0; ch < 3; ch++) {
      big1 = Math.max(big1, Math.abs(data[b * 4 + ch]! - data[a * 4 + ch]!));
      big2 = Math.max(big2, Math.abs(data[c * 4 + ch]! - data[b * 4 + ch]!));
    }
    if (big1 > L.rampStep || big2 > L.rampStep) return false;
    return (luma[b]! - luma[a]!) * (luma[c]! - luma[b]!) > 0;
  };
  let ramps = 0, thin = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x, l = at(x - 1, y), r = at(x + 1, y), u = at(x, y - 1), d = at(x, y + 1);
      if (isRamp(l, p, r) || isRamp(u, p, d)) ramps++;
      if (key[p]! >= 0 && ((key[l] !== key[p] && key[r] !== key[p]) || (key[u] !== key[p] && key[d] !== key[p]))) thin++;
    }
  }

  // Contrast kept by a 2x box downsample (what the pixel-art pass at pixelSize 2 can still show).
  let survival = 1;
  const w2 = w >> 1, h2 = h >> 1;
  if (w2 > 0 && h2 > 0) {
    let all = 0, s1 = 0, s2 = 0;
    for (let p = 0; p < n; p++) all += luma[p]!;
    const mean = all / n;
    for (let p = 0; p < n; p++) s1 += (luma[p]! - mean) ** 2;
    for (let y = 0; y < h2; y++) {
      for (let x = 0; x < w2; x++) {
        const v = (luma[y * 2 * w + x * 2]! + luma[y * 2 * w + x * 2 + 1]! + luma[(y * 2 + 1) * w + x * 2]! + luma[(y * 2 + 1) * w + x * 2 + 1]!) / 4;
        s2 += (v - mean) ** 2;
      }
    }
    const before = Math.sqrt(s1 / n), after = Math.sqrt(s2 / (w2 * h2));
    survival = before < 0.5 ? 1 : Math.min(1, after / before);
  }

  // The quiet band behind the actors (meaningful for backdrops only).
  const bandRow = Math.floor(h * TEX_BACKDROP_QUIET_FROM);
  const bandL: number[] = [];
  for (let y = bandRow; y < h; y++) for (let x = 0; x < w; x++) if (key[y * w + x]! >= 0) bandL.push(luma[y * w + x]!);
  let bandStd = 0, bandOutliers = 0;
  if (bandL.length) {
    const bm = bandL.reduce((a, b) => a + b, 0) / bandL.length;
    bandStd = Math.sqrt(bandL.reduce((a, b) => a + (b - bm) ** 2, 0) / bandL.length);
    const sorted = [...bandL].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)]!;
    bandOutliers = bandL.filter((l) => Math.abs(l - median) > L.bandOutlierLuma).length / bandL.length;
  }

  const sx = seam(buf, 'x'), sy = seam(buf, 'y');
  return {
    colors: verdict.size,
    offPalette: off / m,
    seamX: sx.seam, seamLimitX: sx.limit, seamY: sy.seam, seamLimitY: sy.limit,
    gradient: ramps / n,
    spread: Math.sqrt(spread / m),
    lumaMean: ml, lumaStd: Math.sqrt(lvar / m),
    bright: bright / m,
    bandStd, bandOutliers,
    thin: thin / m,
    survival,
    transparent: transparent / n, softAlpha: soft / n,
  };
}

/**
 * Check one texture. `buf` is `entry.build(seed)`; the validator rebuilds it to prove determinism
 * and builds one more seed to see that the seed does something.
 */
export function validateTexture(entry: TextureEntry, buf: PixelBuffer, opts: TextureValidateOptions = {}): TextureReport {
  const L = TEXTURE_LIMITS;
  const seed = opts.seed ?? 1;
  const issues: TextureIssue[] = [];
  const error = (code: TextureIssueCode, message: string): void => { issues.push({ code, severity: 'error', message }); };
  const warn = (code: TextureIssueCode, message: string): void => { issues.push({ code, severity: 'warning', message }); };
  const { width: w, height: h } = buf;
  const m = measureTexture(entry, buf);
  const backdrop = entry.usage === 'backdrop', decal = entry.usage === 'decal';

  if (!isPow2(w) || !isPow2(h)) error('SIZE_POW2', `${w}x${h}: both sides must be powers of two (mipmaps and RepeatWrapping need it)`);
  if (entry.usage === 'surface' && (Math.min(w, h) < L.surfaceMin || Math.max(w, h) > L.surfaceMax)) {
    warn('SIZE_RANGE', `${w}x${h}: surface textures are ${L.surfaceMin} to ${L.surfaceMax} px; smaller loses the drawing, larger is wasted under the pixel-art pass`);
  }
  if (backdrop && w < h * 2) warn('BACKDROP_SHAPE', `${w}x${h}: backdrops are wide (at least 2:1) and tile horizontally`);

  if (m.softAlpha > 0) error('ALPHA_SOFT', `${pct(m.softAlpha)} of pixels have partial alpha; comic edges are hard, use alpha 0 or 255`);
  if (!decal && m.transparent > 0) error('ALPHA_HOLES', `${pct(m.transparent)} of pixels are transparent; only decals may have holes`);
  if (decal && m.transparent === 0) warn('DECAL_OPAQUE', 'a decal with no transparent pixels is a surface; give it a cut-out shape');

  if (entry.tileable) {
    if (m.seamX > m.seamLimitX) error('SEAM_X', `left/right wrap jumps ${m.seamX.toFixed(3)}, interior columns allow ${m.seamLimitX.toFixed(3)}: something stops at the border instead of wrapping`);
    if (!backdrop && m.seamY > m.seamLimitY) error('SEAM_Y', `top/bottom wrap jumps ${m.seamY.toFixed(3)}, interior rows allow ${m.seamLimitY.toFixed(3)}: something stops at the border instead of wrapping`);
  }

  if (m.offPalette > L.offPaletteError) error('OFF_PALETTE', `${pct(m.offPalette)} of pixels are not a palette colour of the declared zones (or their x0.68 / x0.4 cel shades, ink, paper); draw with texColor() or finish with quantizeToPalette()`);
  else if (m.offPalette > L.offPaletteWarn) warn('OFF_PALETTE', `${pct(m.offPalette)} of pixels are off the declared palette`);
  if (m.colors > L.colorsError) error('COLOR_COUNT', `${m.colors} distinct colours: that is shading or noise, not flat comic colour (limit ${L.colorsError})`);
  else if (m.colors > L.colorsWarn) warn('COLOR_COUNT', `${m.colors} distinct colours; flat comic art stays at or under ${L.colorsWarn}`);

  if (m.gradient > L.gradientError) error('GRADIENT', `${pct(m.gradient)} of pixels sit in smooth ramps; comic colour steps, it never fades (limit ${pct(L.gradientError)})`);
  else if (m.gradient > L.gradientWarn) warn('GRADIENT', `${pct(m.gradient)} of pixels sit in smooth ramps`);
  if (m.colors < 2 || m.spread < L.spreadError) error('FLAT_FILL', `colour spread ${m.spread.toFixed(1)}: this is a flat fill; use the zone colour on the part instead of a texture`);
  else if (m.spread < L.spreadWarn) warn('FLAT_FILL', `colour spread ${m.spread.toFixed(1)}: the drawing will barely show under the cel bands`);

  if (backdrop) {
    if (m.lumaMean > L.backdropLumaMean) error('BACKDROP_BRIGHT', `mean luma ${m.lumaMean.toFixed(0)} (limit ${L.backdropLumaMean}): backdrops stay dark so actors pop`);
    if (m.bright > L.backdropBrightFraction) error('BACKDROP_BRIGHT', `${pct(m.bright)} of pixels are brighter than luma ${L.backdropBrightLuma} (limit ${pct(L.backdropBrightFraction)}): keep accents small`);
    if (m.bandStd > L.bandStd || m.bandOutliers > L.bandOutliers) {
      error('BACKDROP_BAND', `the lower ${pct(1 - TEX_BACKDROP_QUIET_FROM)} (behind the actors) has luma spread ${m.bandStd.toFixed(1)} (limit ${L.bandStd}) and ${pct(m.bandOutliers)} of its pixels far from the wall value (limit ${pct(L.bandOutliers)}): keep motifs, ink and accent lights above row ${Math.floor(TEX_BACKDROP_QUIET_FROM * 100)}%, use only the floor bg and its x0.68 shade below`);
    }
    if (m.lumaStd > L.backdropLumaStd) error('BACKDROP_CONTRAST', `luma spread ${m.lumaStd.toFixed(0)} (limit ${L.backdropLumaStd}): backdrops are low-contrast; use the floor bg, its cel shades and x0.4 hardware colours`);
  }

  if (m.thin > L.thinError) error('THIN_DETAIL', `${pct(m.thin)} of pixels are 1 px lines or dots; the pixel-art pass (2 px cells) drops them. Draw at 2 px or more`);
  else if (m.thin > L.thinWarn) warn('THIN_DETAIL', `${pct(m.thin)} of pixels are 1 px lines or dots`);
  if (m.survival < L.survivalError) error('DOWNSAMPLE_LOSS', `only ${pct(m.survival)} of the contrast survives a 2x downsample: the detail is too fine to read in game`);
  else if (m.survival < L.survivalWarn) warn('DOWNSAMPLE_LOSS', `${pct(m.survival)} of the contrast survives a 2x downsample`);

  if (opts.determinism !== false) {
    const again = entry.build(seed);
    if (!sameBuffer(again, buf) || !sameBuffer(entry.build(seed), again)) {
      error('NONDETERMINISTIC', `two builds with seed ${seed} differ; use makeRng(seed), never Math.random() or time`);
    } else {
      const other = entry.build(seed + 1);
      const isStatic = (entry as Partial<TexEntry>).staticLayout === true;
      if (other.width !== w || other.height !== h) error('SEED_CHANGES_SIZE', `seed ${seed + 1} builds ${other.width}x${other.height}; a seed varies layout, never size or identity`);
      else if (sameBuffer(other, buf) && !isStatic) warn('SEED_IGNORED', 'a different seed builds the same pixels; vary the layout with the seed or declare staticLayout: true');
      else if (!sameBuffer(other, buf) && isStatic) warn('SEED_CHANGES_STATIC', 'declared staticLayout but the seed changes the pixels');
    }
  }

  const errors = issues.filter((i) => i.severity === 'error').length;
  return {
    id: entry.id, usage: entry.usage, tileable: entry.tileable, width: w, height: h, seed,
    metrics: m, issues, errors, warnings: issues.length - errors, ok: errors === 0,
  };
}

/** One summary line plus one line per issue. */
export function formatTextureReport(report: TextureReport): string {
  const m = report.metrics;
  const status = report.errors ? 'FAIL' : report.warnings ? 'WARN' : 'OK  ';
  const seamText = report.tileable
    ? `seam x ${m.seamX.toFixed(3)}/${m.seamLimitX.toFixed(3)}${report.usage === 'backdrop' ? '' : ` y ${m.seamY.toFixed(3)}/${m.seamLimitY.toFixed(3)}`}`
    : 'no wrap';
  const head =
    `${status} ${report.id.padEnd(22)} ${report.usage.padEnd(8)} ${`${report.width}x${report.height}`.padEnd(8)} ` +
    `colours ${String(m.colors).padStart(2)}  off-palette ${pct(m.offPalette)}  ramp ${pct(m.gradient)}  thin ${pct(m.thin)}  ` +
    `survive ${m.survival.toFixed(2)}  luma ${m.lumaMean.toFixed(0)}+-${m.lumaStd.toFixed(0)}` +
    `${report.usage === 'backdrop' ? `  band +-${m.bandStd.toFixed(1)} out ${pct(m.bandOutliers)}` : ''}  ${seamText}`;
  return [head, ...report.issues.map((i) => `     ${i.severity} ${i.code}: ${i.message}`)].join('\n');
}
