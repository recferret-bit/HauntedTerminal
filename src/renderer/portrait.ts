import {
  animPoseAt,
  animRotateAboutPivot,
  bakeModel,
  modelBounds,
  ModelCatalog,
  rasterizeModel,
  type AnimBase,
  type AnimTag,
  type ModelSpec,
  type PartSpec,
  type PixelBuffer,
  type Vec3,
} from '../procgen/index.js';
import type { ZoneId } from '../procgen/core/palette.js';
import { DEFAULT_PIXEL_PARAMS } from '../shaders/pixel-art.js';

/**
 * Multi-frame drawn portraits for the HUD: the head of a character or agent (animated across 4 3D
 * head poses), or the whole model of an `item.*` icon, from the model's software raster (no WebGL,
 * no new asset). Passes through a software pixel-art filter matching the stage shader and supports
 * Doom/Quake-style HP face tiers for `vibecoder.*`. Cached per model, size, frame, and face tier.
 */
export const PORTRAIT_FRAMES = 4;

/** Doom/Quake-style HP face states (`0` = healthiest .. `4` = critical/KO, `'ouch'` = transient hit). */
export type HeroFaceTier = 0 | 1 | 2 | 3 | 4 | 'ouch';

const HP_TIER_CUTS = [0.8, 0.6, 0.4, 0.2] as const;

/** Maps current/max HP to one of five Doom/Quake-style expression tiers (`0` healthy -> `4` critical). */
export function heroFaceTierForHp(hp: number, maxHp: number): 0 | 1 | 2 | 3 | 4 {
  const ratio = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
  for (let i = 0; i < HP_TIER_CUTS.length; i++) {
    if (ratio >= HP_TIER_CUTS[i]!) return i as 0 | 1 | 2 | 3;
  }
  return 4;
}

const HEAD_ASPECT = 1.2;
const HEAD_SHARE = 0.36;
const MARGIN_PX = 1;
const HEAD_PART_RX =
  /(?:^|\.)(head|hood|face|hair|eye|glasses|lens|shades|goggle|beard|mustache|cig|mouth|smirk|smile|eyelid|brow|bruise|bandage|scar|torso|mugBody|coreHead|crtShell|screen|halo|claw|steam|brace)/i;
const LOOK_PART_RX = /(?:^|\.)(eye|pupil|iris|glasses|lens|shades|goggle|prompt|cursorEye)/i;

interface IdleHeadPose {
  t: number;
  yaw: number;
  pitch: number;
  lookX: number;
}

const IDLE_POSES: readonly IdleHeadPose[] = [
  { t: 0, yaw: 0, pitch: 0, lookX: 0 },
  { t: 0.28, yaw: -0.09, pitch: 0.02, lookX: -0.012 },
  { t: 0.56, yaw: 0.04, pitch: -0.025, lookX: 0.005 },
  { t: 0.84, yaw: 0.09, pitch: 0.015, lookX: 0.012 },
];

interface PortraitMeta {
  ppu: number;
  worldLeft: number;
  worldTop: number;
  cropSide: number;
  headCrop: boolean;
  wholeModel: boolean;
}

const metaCache = new Map<string, PortraitMeta>();
const frameCache = new Map<string, PixelBuffer>();
const canvasCache = new Map<string, HTMLCanvasElement>();

function normalizeFrame(frame: number): number {
  const n = Number.isFinite(frame) ? Math.floor(frame) : 0;
  return ((n % PORTRAIT_FRAMES) + PORTRAIT_FRAMES) % PORTRAIT_FRAMES;
}

function cropNearest(src: PixelBuffer, sx: number, sy: number, side: number, size: number): PixelBuffer {
  const data = new Uint8ClampedArray(size * size * 4);
  const scale = side / size;
  for (let dy = 0; dy < size; dy++) {
    const srcY = Math.floor(sy + (dy + 0.5) * scale);
    if (srcY < 0 || srcY >= src.height) continue;
    for (let dx = 0; dx < size; dx++) {
      const srcX = Math.floor(sx + (dx + 0.5) * scale);
      if (srcX < 0 || srcX >= src.width) continue;
      const si = (srcY * src.width + srcX) * 4;
      const di = (dy * size + dx) * 4;
      data[di] = src.data[si]!;
      data[di + 1] = src.data[si + 1]!;
      data[di + 2] = src.data[si + 2]!;
      data[di + 3] = src.data[si + 3]!;
    }
  }
  return { width: size, height: size, data };
}

function selectHeadTarget(spec: ModelSpec, headCrop: boolean): { mask: boolean[]; pivot: Vec3 } {
  const baked = bakeModel(spec);
  let mask: boolean[];
  if (headCrop) {
    mask = spec.parts.map((p) => HEAD_PART_RX.test(p.name));
    if (!mask.some(Boolean)) {
      const full = modelBounds(baked);
      const cutoffY = full.min[1] + full.size[1] * 0.68;
      mask = spec.parts.map((p) => p.pos[1] >= cutoffY);
    }
  } else {
    mask = spec.parts.map(() => true);
  }
  if (!mask.some(Boolean)) mask = spec.parts.map(() => true);
  const targetBaked = baked.filter((_, i) => mask[i]);
  const b = modelBounds(targetBaked.length ? targetBaked : baked);
  const pivot: Vec3 = [
    (b.min[0] + b.max[0]) * 0.5,
    (b.min[1] + b.max[1]) * 0.5,
    (b.min[2] + b.max[2]) * 0.5,
  ];
  return { mask, pivot };
}

function posePart(part: PartSpec, pose: IdleHeadPose, pivot: Vec3, applyHead: boolean): PartSpec {
  const base: AnimBase = {
    pos: [part.pos[0], part.pos[1], part.pos[2]],
    rot: part.rot ? [part.rot[0], part.rot[1], part.rot[2]] : [0, 0, 0],
    scale: part.scale ? [part.scale[0], part.scale[1], part.scale[2]] : [1, 1, 1],
  };
  // Suppress vertical body/head bob so characters never jump in the portrait crop,
  // while keeping floating sub-parts (droplets/orbiters), breathing, blinking, and damped jitter.
  const suppressVerticalBob =
    part.anim?.type === 'bob' && (part.anim.axis ?? 'y') === 'y' && !/drop|bit|steam|shard|block/i.test(part.name);
  const anim = suppressVerticalBob ? undefined : part.anim;
  const cur = animPoseAt(anim, base, pose.t, { fps: 0, jitterMul: 0.35, name: part.name });
  if (applyHead) {
    animRotateAboutPivot(cur, [0, 1, 0], pose.yaw, pivot, cur);
    animRotateAboutPivot(cur, [1, 0, 0], pose.pitch, pivot, cur);
    if (LOOK_PART_RX.test(part.name)) cur.pos[0] += pose.lookX;
  }
  const blinkedZone: ZoneId =
    cur.emissiveMul < 0.5 && part.zone === 'malwareEye'
      ? (part.name === 'cursorEye' ? 'ink' : 'voidPurple')
      : part.zone;
  return { ...part, zone: blinkedZone, pos: cur.pos, rot: cur.rot, scale: cur.scale };
}

function faceBox(name: string, size: Vec3, zone: ZoneId, pos: Vec3, anim: AnimTag | undefined, rot?: Vec3): PartSpec {
  return { name, shape: { kind: 'box', size }, zone, pos, rot, outline: false, anim };
}

function tierExtraParts(tier: HeroFaceTier, anim: AnimTag | undefined): PartSpec[] {
  switch (tier) {
    case 1:
      return [
        faceBox('brow.l', [0.09, 0.026, 0.022], 'hair', [0.085, 1.258, -0.214], anim, [0, 0, -0.22]),
        faceBox('brow.r', [0.09, 0.026, 0.022], 'hair', [-0.085, 1.258, -0.214], anim, [0, 0, 0.22]),
        faceBox('mouth.line', [0.095, 0.022, 0.02], 'hair', [0, 1.115, -0.212], anim),
        faceBox('bruise.cheek', [0.068, 0.022, 0.02], 'corruptMagenta', [0.112, 1.155, -0.21], anim, [0, 0, 0.45]),
      ];
    case 2:
      return [
        faceBox('brow.l', [0.095, 0.03, 0.022], 'hair', [0.085, 1.254, -0.216], anim, [0, 0, -0.32]),
        faceBox('brow.r', [0.095, 0.03, 0.022], 'hair', [-0.085, 1.254, -0.216], anim, [0, 0, 0.32]),
        faceBox('bruise.l', [0.086, 0.056, 0.02], 'corruptViolet', [0.105, 1.155, -0.208], anim),
        faceBox('bandage.cheek', [0.096, 0.034, 0.022], 'paper', [-0.1, 1.16, -0.214], anim, [0, 0, -0.3]),
        faceBox('mouth.rim', [0.14, 0.048, 0.02], 'ink', [0, 1.11, -0.21], anim),
        faceBox('mouth.teeth', [0.11, 0.026, 0.022], 'paper', [0, 1.11, -0.216], anim),
      ];
    case 3:
      return [
        faceBox('bruise.orbital', [0.118, 0.092, 0.02], 'corruptViolet', [0.085, 1.205, -0.207], anim),
        faceBox('brow.l', [0.105, 0.034, 0.022], 'hair', [0.085, 1.252, -0.218], anim, [0, 0, -0.38]),
        faceBox('brow.r', [0.105, 0.034, 0.022], 'hair', [-0.085, 1.252, -0.218], anim, [0, 0, 0.38]),
        faceBox('scar.forehead', [0.12, 0.028, 0.022], 'lockRed', [-0.072, 1.285, -0.216], anim, [0, 0, 0.55]),
        faceBox('bruise.chin', [0.072, 0.044, 0.02], 'corruptMagenta', [0.06, 1.075, -0.208], anim),
        faceBox('mouth.rim', [0.155, 0.056, 0.02], 'ink', [0, 1.11, -0.21], anim),
        faceBox('mouth.teeth', [0.122, 0.032, 0.022], 'paper', [0, 1.11, -0.218], anim),
      ];
    case 4:
      return [
        faceBox('bruise.l', [0.125, 0.095, 0.02], 'corruptViolet', [0.085, 1.205, -0.207], anim),
        faceBox('bruise.r', [0.118, 0.088, 0.02], 'corruptViolet', [-0.085, 1.205, -0.207], anim),
        faceBox('bruise.cheek', [0.095, 0.06, 0.02], 'corruptMagenta', [0.108, 1.14, -0.208], anim),
        faceBox('eye.xl1', [0.088, 0.024, 0.022], 'lockRed', [0.085, 1.205, -0.218], anim, [0, 0, 0.78]),
        faceBox('eye.xl2', [0.088, 0.024, 0.022], 'ink', [0.085, 1.205, -0.222], anim, [0, 0, -0.78]),
        faceBox('eye.xr1', [0.088, 0.024, 0.022], 'lockRed', [-0.085, 1.205, -0.218], anim, [0, 0, 0.78]),
        faceBox('eye.xr2', [0.088, 0.024, 0.022], 'ink', [-0.085, 1.205, -0.222], anim, [0, 0, -0.78]),
        faceBox('bandage.a', [0.105, 0.034, 0.022], 'paper', [-0.095, 1.155, -0.214], anim, [0, 0, -0.35]),
        faceBox('bandage.b', [0.105, 0.034, 0.022], 'paper', [-0.095, 1.155, -0.218], anim, [0, 0, 0.38]),
        faceBox('scar.forehead', [0.125, 0.028, 0.022], 'lockRed', [0.05, 1.285, -0.218], anim, [0, 0, -0.42]),
        faceBox('scar.cheek', [0.08, 0.024, 0.022], 'lockRed', [0.11, 1.14, -0.216], anim, [0, 0, 0.6]),
        faceBox('mouth.rim', [0.15, 0.066, 0.02], 'ink', [0, 1.105, -0.212], anim),
        faceBox('mouth.teeth', [0.118, 0.032, 0.022], 'lockRed', [0, 1.105, -0.218], anim),
      ];
    case 'ouch':
      return [
        faceBox('brow.l', [0.095, 0.028, 0.022], 'hair', [0.085, 1.275, -0.216], anim, [0, 0, 0.35]),
        faceBox('brow.r', [0.095, 0.028, 0.022], 'hair', [-0.085, 1.275, -0.216], anim, [0, 0, -0.35]),
        faceBox('eye.l1', [0.075, 0.024, 0.022], 'ink', [0.085, 1.216, -0.218], anim, [0, 0, -0.45]),
        faceBox('eye.l2', [0.075, 0.024, 0.022], 'ink', [0.085, 1.192, -0.218], anim, [0, 0, 0.45]),
        faceBox('eye.r1', [0.075, 0.024, 0.022], 'ink', [-0.085, 1.216, -0.218], anim, [0, 0, 0.45]),
        faceBox('eye.r2', [0.075, 0.024, 0.022], 'ink', [-0.085, 1.192, -0.218], anim, [0, 0, -0.45]),
        faceBox('scar.hit', [0.125, 0.042, 0.022], 'lockRed', [0.105, 1.158, -0.216], anim, [0, 0, 0.35]),
        faceBox('mouth.rim', [0.135, 0.092, 0.02], 'ink', [0, 1.108, -0.212], anim),
        faceBox('mouth.inner', [0.088, 0.058, 0.022], 'lockRed', [0, 1.108, -0.218], anim),
      ];
    default:
      return [];
  }
}

export function applyHeroFaceTier(spec: ModelSpec, tier: HeroFaceTier): ModelSpec {
  if (tier === 0 || !spec.id.startsWith('vibecoder.')) return spec;
  const face = spec.parts.find((p) => p.name === 'face');
  if (!face) return spec;
  const hideEyes = tier === 4 || tier === 'ouch';
  const parts = spec.parts
    .filter((p) => !(hideEyes && (p.name === 'eye.l' || p.name === 'eye.r')))
    .map((p) => {
      if (p.name !== 'eye.l' && p.name !== 'eye.r') return p;
      const isLeft = p.name === 'eye.l';
      const scaleY = tier === 1 ? 0.75 : tier === 2 ? (isLeft ? 0.58 : 0.72) : (isLeft ? 0.32 : 0.56);
      const prev = p.scale ?? [1, 1, 1];
      return { ...p, scale: [prev[0] * 1.12, prev[1] * scaleY, prev[2]] as Vec3 };
    });
  parts.push(...tierExtraParts(tier, face.anim));
  return { ...spec, parts };
}

function bayer2(x: number, y: number): number {
  const f = x * 0.5 + y * y * 0.75;
  return f - Math.floor(f);
}

function bayer4x4(x: number, y: number): number {
  const px = ((x % 4) + 4) % 4;
  const py = ((y % 4) + 4) % 4;
  return bayer2(px >> 1, py >> 1) * 0.25 + bayer2(px, py);
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function cellLuma(buf: PixelBuffer, cx: number, cy: number, fallback: number): number {
  if (cx < 0 || cx >= buf.width || cy < 0 || cy >= buf.height) return fallback;
  const i = (cy * buf.width + cx) * 4;
  if (buf.data[i + 3]! === 0) return fallback;
  return (0.299 * buf.data[i]! + 0.587 * buf.data[i + 1]! + 0.114 * buf.data[i + 2]!) / 255;
}

/**
 * Software pixel-art post-filter matching `DEFAULT_PIXEL_PARAMS` from `src/shaders/pixel-art.ts`:
 * macro-pixel block sampling (`2x2` at >= 48px), neighbor edge contours, saturation/contrast,
 * 4x4 Bayer ordered dithering, and 16-level quantization while preserving transparent background.
 */
function applyPixelArtFilter(buf: PixelBuffer, px: number): PixelBuffer {
  const { width: w, height: h, data: src } = buf;
  const out = new Uint8ClampedArray(src.length);
  const blockPx = px >= 48 ? 2 : 1;
  const halfBlock = Math.floor(blockPx / 2);
  const p = DEFAULT_PIXEL_PARAMS;
  const cols = Math.ceil(w / blockPx);
  const rows = Math.ceil(h / blockPx);
  for (let gy = 0; gy < rows; gy++) {
    const cy = Math.min(h - 1, gy * blockPx + halfBlock);
    for (let gx = 0; gx < cols; gx++) {
      const cx = Math.min(w - 1, gx * blockPx + halfBlock);
      const si = (cy * w + cx) * 4;
      const alpha = src[si + 3]!;
      if (alpha === 0) continue;
      let r = src[si]! / 255;
      let g = src[si + 1]! / 255;
      let b = src[si + 2]! / 255;
      const l0 = 0.299 * r + 0.587 * g + 0.114 * b;
      const lN = cellLuma(buf, cx, cy - blockPx, l0);
      const lS = cellLuma(buf, cx, cy + blockPx, l0);
      const lE = cellLuma(buf, cx + blockPx, cy, l0);
      const lW = cellLuma(buf, cx - blockPx, cy, l0);
      const maxL = Math.max(lN, lS, lE, lW);
      const avgL = 0.25 * (lN + lS + lE + lW);
      const outline = smoothstep(0.1, 0.32, maxL - l0) * p.edgeStrength;
      const ridge = Math.max(-0.06, Math.min(0.11, (l0 - avgL) * 1.35)) * p.edgeStrength;
      const edgeScale = 1 - outline * 0.42;
      r = clamp01((clamp01(r * edgeScale + ridge) - 0.5) * p.contrast + 0.5);
      g = clamp01((clamp01(g * edgeScale + ridge) - 0.5) * p.contrast + 0.5);
      b = clamp01((clamp01(b * edgeScale + ridge) - 0.5) * p.contrast + 0.5);
      const satL = 0.299 * r + 0.587 * g + 0.114 * b;
      const dither = (bayer4x4(gx, gy) - 0.46875) * (p.dither / p.colorLevels);
      const quant = (ch: number): number => {
        const satCh = clamp01(satL + (ch - satL) * p.saturation);
        const q = Math.floor(clamp01(satCh + dither) * p.colorLevels + 0.5) / p.colorLevels;
        return Math.round(clamp01(q) * 255);
      };
      const qr = quant(r);
      const qg = quant(g);
      const qb = quant(b);
      for (let dy = 0; dy < blockPx; dy++) {
        const py = gy * blockPx + dy;
        if (py >= h) break;
        const gridMul = blockPx >= 3 && (dy === blockPx - 1) ? 1 - p.gridStrength : 1;
        for (let dx = 0; dx < blockPx; dx++) {
          const pxOut = gx * blockPx + dx;
          if (pxOut >= w) break;
          const gm = blockPx >= 3 && dx === blockPx - 1 ? 1 - p.gridStrength : gridMul;
          const di = (py * w + pxOut) * 4;
          out[di] = Math.round(qr * gm);
          out[di + 1] = Math.round(qg * gm);
          out[di + 2] = Math.round(qb * gm);
          out[di + 3] = 255;
        }
      }
    }
  }
  return { width: w, height: h, data: out };
}

function poseSpec(spec: ModelSpec, frame: number, headCrop: boolean, wholeModel: boolean): ModelSpec {
  if (frame === 0 || wholeModel) return spec;
  const pose = IDLE_POSES[frame]!;
  const { mask, pivot } = selectHeadTarget(spec, headCrop);
  return {
    ...spec,
    parts: spec.parts.map((part, i) => posePart(part, pose, pivot, mask[i]!)),
  };
}

function portraitKey(modelId: string, px: number, frame: number, faceTier: HeroFaceTier): {
  size: number; f: number; tier: HeroFaceTier; key: string;
} {
  const size = Math.max(8, Math.round(px));
  const f = normalizeFrame(frame);
  const tier: HeroFaceTier = modelId.startsWith('vibecoder.') ? faceTier : 0;
  return { size, f, tier, key: `${modelId}@${size}#${f}:t${tier}` };
}

/** Rasterizes one square portrait frame (`0..PORTRAIT_FRAMES - 1`) with pixel-art filtering; returns `null` if unknown model. */
export function rasterPortraitFrame(
  modelId: string,
  px: number,
  frame = 0,
  faceTier: HeroFaceTier = 0,
): PixelBuffer | null {
  const { size, f, tier, key: frameKey } = portraitKey(modelId, px, frame, faceTier);
  const cached = frameCache.get(frameKey);
  if (cached) return cached;
  if (!ModelCatalog.has(modelId)) return null;

  const metaKey = `${modelId}@${size}`;
  const baseSpec = ModelCatalog.build(modelId, 1);
  let meta = metaCache.get(metaKey);
  if (!meta) {
    const entry = ModelCatalog.get(modelId);
    const wholeModel = modelId.startsWith('item.') || entry.category === 'item';
    const r0 = rasterizeModel(baseSpec, { size: size * 3, background: null, marginPx: MARGIN_PX });
    const { width: w0, height: h0 } = r0.image;
    const headCrop = !wholeModel && entry.category !== 'agent' && h0 / w0 > HEAD_ASPECT;
    const cropSide = headCrop ? Math.min(w0, Math.max(8, Math.round(h0 * HEAD_SHARE))) : Math.max(w0, h0);
    const sx0 = Math.round((w0 - cropSide) / 2);
    const sy0 = headCrop ? 0 : Math.round((h0 - cropSide) / 2);
    meta = {
      ppu: r0.pxPerUnit,
      worldLeft: r0.extent[0] + (sx0 - MARGIN_PX) / r0.pxPerUnit,
      worldTop: r0.extent[3] - (sy0 - MARGIN_PX) / r0.pxPerUnit,
      cropSide,
      headCrop,
      wholeModel,
    };
    metaCache.set(metaKey, meta);
    frameCache.set(`${modelId}@${size}#0:t0`, applyPixelArtFilter(cropNearest(r0.image, sx0, sy0, cropSide, size), size));
    if (f === 0 && tier === 0) return frameCache.get(frameKey)!;
  }

  if (f > 0 && meta.wholeModel && tier === 0) {
    const baseImg = frameCache.get(`${modelId}@${size}#0:t0`)!;
    frameCache.set(frameKey, baseImg);
    return baseImg;
  }

  const faced = applyHeroFaceTier(baseSpec, tier);
  const posed = poseSpec(faced, f, meta.headCrop, meta.wholeModel);
  const rf = rasterizeModel(posed, { pxPerUnit: meta.ppu, background: null, marginPx: MARGIN_PX });
  const sx = Math.round((meta.worldLeft - rf.extent[0]) * rf.pxPerUnit + MARGIN_PX);
  const sy = Math.round((rf.extent[3] - meta.worldTop) * rf.pxPerUnit + MARGIN_PX);
  const out = applyPixelArtFilter(cropNearest(rf.image, sx, sy, meta.cropSide, size), size);
  frameCache.set(frameKey, out);
  return out;
}

export function drawPortrait(modelId: string, px: number, frame = 0, faceTier: HeroFaceTier = 0): HTMLCanvasElement {
  const { size, f, tier, key } = portraitKey(modelId, px, frame, faceTier);
  const hit = canvasCache.get(key);
  if (hit) return hit;
  const out = document.createElement('canvas');
  out.width = size;
  out.height = size;
  canvasCache.set(key, out);
  const ctx = out.getContext('2d');
  const buf = rasterPortraitFrame(modelId, size, f, tier);
  if (!ctx || !buf) return out;
  ctx.imageSmoothingEnabled = false;
  ctx.putImageData(new ImageData(new Uint8ClampedArray(buf.data), buf.width, buf.height), 0, 0);
  return out;
}
