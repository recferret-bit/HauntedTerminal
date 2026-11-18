// Pixel side of the visual audit (spec .kiro/specs/qa-visual-audit/): decode, masked baseline diff, filmstrip contact sheet,
// motion flags, blank / black and off-palette measures. Pure functions over { width, height, data: RGBA8 } images.
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

export const DIFF_DEFAULTS = { maxDiffRatio: 0.002, pixelThreshold: 0.1, maxOffPalette: 0.25 };
const MASK_FILL = [255, 0, 255];
const PAPER = [240, 232, 214];

export const readImage = (file) => PNG.sync.read(readFileSync(file));
export const decodeImage = (buf) => PNG.sync.read(buf);
export const encodeImage = (img) => PNG.sync.write(Object.assign(new PNG({ width: img.width, height: img.height }), { data: Buffer.from(img.data) }));
export const blankImage = (width, height, rgb = PAPER) => {
  const data = Buffer.alloc(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set([rgb[0], rgb[1], rgb[2], 255], i);
  return { width, height, data };
};

/** The mask rects of one screen at one size: entries with no `size` apply to every size. Rects are [x, y, w, h] in CSS px. */
export function masksFor(masksDoc, screenId, size) {
  return (masksDoc?.[screenId] ?? []).filter((m) => !m.size || m.size === size).map((m) => m.rect);
}

function fillRect(img, [x, y, w, h], rgb) {
  for (let yy = Math.max(0, y); yy < Math.min(img.height, y + h); yy++) {
    for (let xx = Math.max(0, x); xx < Math.min(img.width, x + w); xx++) img.data.set(rgb, (yy * img.width + xx) * 4);
  }
}

function outlineRect(img, [x, y, w, h], rgb) {
  for (let xx = x; xx < x + w; xx++) for (const yy of [y, y + h - 1]) if (xx >= 0 && xx < img.width && yy >= 0 && yy < img.height) img.data.set(rgb, (yy * img.width + xx) * 4);
  for (let yy = y; yy < y + h; yy++) for (const xx of [x, x + w - 1]) if (xx >= 0 && xx < img.width && yy >= 0 && yy < img.height) img.data.set(rgb, (yy * img.width + xx) * 4);
}

const copy = (img) => ({ width: img.width, height: img.height, data: Buffer.from(img.data) });
const area = (rects) => rects.reduce((s, [, , w, h]) => s + w * h, 0);

/**
 * Compare a capture with its baseline. Masked rects are painted one flat colour in both before pixelmatch, and outlined
 * in the diff image. Returns { status: 'same' | 'diff' | 'size-changed', changed, ratio, diffImage? }.
 */
export function compareImages(baseline, capture, { masks = [], pixelThreshold = DIFF_DEFAULTS.pixelThreshold, maxDiffRatio = DIFF_DEFAULTS.maxDiffRatio } = {}) {
  if (baseline.width !== capture.width || baseline.height !== capture.height) {
    return { status: 'size-changed', changed: null, ratio: null, baseline: `${baseline.width}x${baseline.height}`, capture: `${capture.width}x${capture.height}` };
  }
  const a = copy(baseline);
  const b = copy(capture);
  masks.forEach((r) => { fillRect(a, r, MASK_FILL); fillRect(b, r, MASK_FILL); });
  const out = blankImage(a.width, a.height);
  const changed = pixelmatch(a.data, b.data, out.data, a.width, a.height, { threshold: pixelThreshold, includeAA: false });
  masks.forEach((r) => outlineRect(out, r, [0, 160, 255]));
  const counted = Math.max(1, a.width * a.height - area(masks));
  const ratio = changed / counted;
  return { status: ratio > maxDiffRatio ? 'diff' : 'same', changed, ratio, diffImage: out };
}

/** Changed-pixel ratio of every consecutive frame pair (pixelmatch, same threshold as the diff). */
export function frameChanges(frames, pixelThreshold = DIFF_DEFAULTS.pixelThreshold) {
  const changes = [];
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1];
    const b = frames[i];
    changes.push(pixelmatch(a.data, b.data, null, a.width, a.height, { threshold: pixelThreshold, includeAA: false }) / (a.width * a.height));
  }
  return changes;
}

const median = (xs) => { const s = [...xs].sort((p, q) => p - q); return s.length ? s[Math.floor(s.length / 2)] : 0; };

/**
 * Motion flags of one filmstrip: `frozen` when the screen should animate and no pair changes; `jump` when a pair changes
 * more than 4x the median pair change and more than 15 percent of the frame; `blank-frame` when a blank frame sits between
 * two non-blank ones (a flicker to black or white).
 */
export function motionFlags(frames, { animates = false, pixelThreshold } = {}) {
  const changes = frameChanges(frames, pixelThreshold);
  const flags = [];
  if (animates && changes.length && changes.every((c) => c === 0)) flags.push({ kind: 'frozen', changes });
  const med = median(changes);
  changes.forEach((c, i) => {
    if (c > 0.15 && c > 4 * med) flags.push({ kind: 'jump', pair: [i, i + 1], change: round(c), median: round(med) });
  });
  const blanks = frames.map((f) => blankStats(f).blank);
  for (let i = 1; i < frames.length - 1; i++) {
    if (blanks[i] && !blanks[i - 1] && !blanks[i + 1]) flags.push({ kind: 'blank-frame', frame: i });
  }
  return { changes: changes.map(round), flags };
}

const round = (x) => Math.round(x * 1e5) / 1e5;

/** Share of the most common colour and mean luminance. `blank` when one colour covers > 95 percent or luminance < 6/255. */
export function blankStats(img) {
  const counts = new Map();
  let lum = 0;
  const n = img.width * img.height;
  for (let i = 0; i < img.data.length; i += 4) {
    const r = img.data[i], g = img.data[i + 1], b = img.data[i + 2];
    const key = (r << 16) | (g << 8) | b;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    lum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  let most = 0;
  for (const c of counts.values()) if (c > most) most = c; // no spread: a 1920x1080 frame has too many colours for the stack
  const top = most / n;
  const meanLum = lum / n;
  return { topColourShare: round(top), meanLuminance: Math.round(meanLum * 10) / 10, blank: top > 0.95 || meanLum < 6, black: meanLum < 6 };
}

/** Hex colours (#rgb, #rrggbb, 0xrrggbb) found in source text, as [r, g, b]. */
export function paletteFromText(texts) {
  const out = new Map();
  for (const t of texts) {
    for (const m of t.matchAll(/(?:#|0x)([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g)) {
      let h = m[1];
      if (h.length === 3) h = h.split('').map((c) => c + c).join('');
      out.set(h.toLowerCase(), [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]);
    }
  }
  return [...out.values()];
}

/** Share of pixels whose nearest palette colour is more than `distance` away (RGB). Cached per distinct colour. */
export function offPaletteShare(img, palette, distance = 40) {
  const cache = new Map();
  const d2 = distance * distance;
  let off = 0;
  for (let i = 0; i < img.data.length; i += 4) {
    const key = (img.data[i] << 16) | (img.data[i + 1] << 8) | img.data[i + 2];
    let isOff = cache.get(key);
    if (isOff === undefined) {
      isOff = !palette.some(([r, g, b]) => (r - img.data[i]) ** 2 + (g - img.data[i + 1]) ** 2 + (b - img.data[i + 2]) ** 2 <= d2);
      cache.set(key, isOff);
    }
    if (isOff) off++;
  }
  return round(off / (img.width * img.height));
}

function downscale(img, f) {
  const w = Math.max(1, Math.floor(img.width / f));
  const h = Math.max(1, Math.floor(img.height / f));
  const out = blankImage(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const acc = [0, 0, 0];
      for (let dy = 0; dy < f; dy++) for (let dx = 0; dx < f; dx++) {
        const i = ((y * f + dy) * img.width + x * f + dx) * 4;
        acc[0] += img.data[i]; acc[1] += img.data[i + 1]; acc[2] += img.data[i + 2];
      }
      out.data.set([acc[0] / (f * f), acc[1] / (f * f), acc[2] / (f * f), 255].map(Math.round), (y * w + x) * 4);
    }
  }
  return out;
}

/** 3x5 pixel digits for frame numbers on the contact sheet. */
const DIGITS = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001', '111100111001111', '111100111101111', '111001001001001', '111101111101111', '111101111001111'];
function stamp(img, x, y, n) {
  String(n).split('').forEach((ch, k) => {
    const bits = DIGITS[Number(ch)];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) if (bits[r * 3 + c] === '1') fillRect(img, [x + k * 8 + c * 2, y + r * 2, 2, 2], [0, 0, 0]);
  });
}

/** A cols x rows contact sheet of `frames`, each downscaled by `scale`, 4 px paper gutters, frame numbers top-left. */
export function contactSheet(frames, { cols = 4, scale = 3, gutter = 4 } = {}) {
  const tiles = frames.map((f) => downscale(f, scale));
  const tw = tiles[0].width;
  const th = tiles[0].height;
  const rows = Math.ceil(tiles.length / cols);
  const sheet = blankImage(cols * tw + (cols + 1) * gutter, rows * th + (rows + 1) * gutter);
  tiles.forEach((t, i) => {
    const ox = gutter + (i % cols) * (tw + gutter);
    const oy = gutter + Math.floor(i / cols) * (th + gutter);
    for (let y = 0; y < th; y++) t.data.copy(sheet.data, ((oy + y) * sheet.width + ox) * 4, y * tw * 4, (y + 1) * tw * 4);
    fillRect(sheet, [ox, oy, 8 * String(i).length + 4, 14], [255, 255, 255]);
    stamp(sheet, ox + 2, oy + 2, i);
  });
  return sheet;
}
