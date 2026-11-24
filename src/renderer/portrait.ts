import {
  animPoseAt,
  animRotateAboutPivot,
  bakeModel,
  modelBounds,
  ModelCatalog,
  rasterizeModel,
  type AnimBase,
  type ModelSpec,
  type PartSpec,
  type PixelBuffer,
  type Vec3,
} from '../procgen/index.js';

/**
 * Multi-frame drawn portraits for the HUD: the head of a character or agent (animated across 4 3D
 * head poses), or the whole model of an `item.*` icon, from the model's software raster (no WebGL,
 * no new asset). Scaling is nearest-neighbour, so only palette zones and ink appear. Cached per
 * model, size, and frame.
 */
export const PORTRAIT_FRAMES = 4;

const HEAD_ASPECT = 1.2;
const HEAD_SHARE = 0.36;
const MARGIN_PX = 1;
const HEAD_PART_RX = /(?:^|\.)(head|hood|face|hair|eye|glasses|lens|beard|mustache|cig|mouth|eyelid)/i;
const LOOK_PART_RX = /(?:^|\.)(eye|pupil|iris|glasses|lens|shades|prompt|cursorEye)/i;

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
    part.anim?.type === 'bob' && (part.anim.axis ?? 'y') === 'y' && !/drop|bit/i.test(part.name);
  const anim = suppressVerticalBob ? undefined : part.anim;
  const cur = animPoseAt(anim, base, pose.t, { fps: 0, jitterMul: 0.35, name: part.name });
  if (applyHead) {
    animRotateAboutPivot(cur, [0, 1, 0], pose.yaw, pivot, cur);
    animRotateAboutPivot(cur, [1, 0, 0], pose.pitch, pivot, cur);
    if (LOOK_PART_RX.test(part.name)) cur.pos[0] += pose.lookX;
  }
  return { ...part, pos: cur.pos, rot: cur.rot, scale: cur.scale };
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

/** Rasterizes one square portrait frame (`0..PORTRAIT_FRAMES - 1`) in CPU memory; returns `null` if unknown model. */
export function rasterPortraitFrame(modelId: string, px: number, frame = 0): PixelBuffer | null {
  const size = Math.max(8, Math.round(px));
  const f = normalizeFrame(frame);
  const frameKey = `${modelId}@${size}#${f}`;
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
    const headCrop = !wholeModel && h0 / w0 > HEAD_ASPECT;
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
    frameCache.set(`${modelId}@${size}#0`, cropNearest(r0.image, sx0, sy0, cropSide, size));
    if (f === 0) return frameCache.get(frameKey)!;
  }

  if (f > 0 && meta.wholeModel) {
    const baseImg = frameCache.get(`${modelId}@${size}#0`)!;
    frameCache.set(frameKey, baseImg);
    return baseImg;
  }

  const posed = poseSpec(baseSpec, f, meta.headCrop, meta.wholeModel);
  const rf = rasterizeModel(posed, { pxPerUnit: meta.ppu, background: null, marginPx: MARGIN_PX });
  const sx = Math.round((meta.worldLeft - rf.extent[0]) * rf.pxPerUnit + MARGIN_PX);
  const sy = Math.round((rf.extent[3] - meta.worldTop) * rf.pxPerUnit + MARGIN_PX);
  const out = cropNearest(rf.image, sx, sy, meta.cropSide, size);
  frameCache.set(frameKey, out);
  return out;
}

export function drawPortrait(modelId: string, px: number, frame = 0): HTMLCanvasElement {
  const size = Math.max(8, Math.round(px));
  const f = normalizeFrame(frame);
  const key = `${modelId}@${size}#${f}`;
  const hit = canvasCache.get(key);
  if (hit) return hit;
  const out = document.createElement('canvas');
  out.width = size;
  out.height = size;
  canvasCache.set(key, out);
  const ctx = out.getContext('2d');
  const buf = rasterPortraitFrame(modelId, size, f);
  if (!ctx || !buf) return out;
  ctx.imageSmoothingEnabled = false;
  ctx.putImageData(new ImageData(new Uint8ClampedArray(buf.data), buf.width, buf.height), 0, 0);
  return out;
}
