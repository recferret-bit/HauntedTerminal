import { ModelCatalog, rasterizeModel } from '../procgen/index.js';

/**
 * Small drawn portraits for the HUD: the head of a character or agent, or the whole model of an `item.*`
 * icon, from the model's software raster (no WebGL, no new asset). The raster already uses only palette
 * zones and ink; scaling is nearest-neighbour, so no new colours appear. Cached per model and size.
 */
const cache = new Map<string, HTMLCanvasElement>();

/** A portrait is a head crop when the model is clearly taller than wide, else the whole model. */
const HEAD_ASPECT = 1.2;
const HEAD_SHARE = 0.36;

export function drawPortrait(modelId: string, px: number): HTMLCanvasElement {
  const size = Math.max(8, Math.round(px));
  const key = `${modelId}@${size}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const out = document.createElement('canvas');
  out.width = size;
  out.height = size;
  cache.set(key, out);
  const ctx = out.getContext('2d');
  if (!ctx || !ModelCatalog.has(modelId)) return out;
  const entry = ModelCatalog.get(modelId);
  const wholeModel = modelId.startsWith('item.') || entry.category === 'item';
  const spec = ModelCatalog.build(modelId, 1);
  // Raster tall models large enough that the head crop is about `size` px; transparent background.
  const probe = rasterizeModel(spec, { size: size * 3, background: null, marginPx: 1 });
  const { width: w, height: h, data } = probe.image;
  const headCrop = !wholeModel && h / w > HEAD_ASPECT;
  const side = headCrop ? Math.min(w, Math.max(8, Math.round(h * HEAD_SHARE))) : Math.max(w, h);
  const sx = Math.round((w - side) / 2);
  const sy = headCrop ? 0 : Math.round((h - side) / 2);
  const src = document.createElement('canvas');
  src.width = w;
  src.height = h;
  const sctx = src.getContext('2d');
  if (!sctx) return out;
  sctx.putImageData(new ImageData(new Uint8ClampedArray(data), w, h), 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, sx, sy, side, side, 0, 0, size, size);
  return out;
}
