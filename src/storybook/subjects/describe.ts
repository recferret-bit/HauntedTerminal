import { zone, type ZoneId } from '../../procgen/core/palette.js';
import type { AnimTag, ModelSpec, Vec3 } from '../../procgen/core/types.js';
import { bakeModel, modelBounds, type BakedPart } from '../../procgen/geometry/geometry.js';
import { rasterizeModel } from '../../procgen/geometry/raster.js';
import type { Bounds } from '../domain/framing.js';
import type { SubjectInfo } from './types.js';

const FALLBACK_BOUNDS: Bounds = { min: [-0.5, 0, -0.1], max: [0.5, 1, 0.1] };
const SHARE_RASTER_SIZE = 160;

function sizeOf(b: Bounds): Vec3 {
  return [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
}

/** Front-view pixel share per zone, from the software raster. All shares are 0 when the raster fails. */
function zoneShares(spec: ModelSpec, baked: BakedPart[], seed: number): SubjectInfo['zones'] {
  const perZone = new Map<string, { parts: number; px: number }>();
  for (const part of spec.parts) {
    const z = perZone.get(part.zone) ?? { parts: 0, px: 0 };
    z.parts++;
    perZone.set(part.zone, z);
  }
  let filled = 0;
  try {
    const r = rasterizeModel(spec, { size: SHARE_RASTER_SIZE, background: null, seed }, baked);
    r.coverage.forEach((px, i) => {
      const part = spec.parts[i];
      if (!part) return;
      perZone.get(part.zone)!.px += px;
      filled += px;
    });
  } catch {
    filled = 0;
  }
  return [...perZone.entries()]
    .map(([id, z]) => ({ zone: id, family: zone(id as ZoneId)?.family ?? '?', parts: z.parts, share: filled > 0 ? z.px / filled : 0 }))
    .sort((a, b) => b.share - a.share || b.parts - a.parts);
}

/** Bounds and the numbers the art bible gives budgets for. */
export function describeModel(spec: ModelSpec, seed: number): { bounds: Bounds; info: SubjectInfo } {
  const baked = bakeModel(spec);
  const b = modelBounds(baked);
  const finite = baked.length > 0 && b.min.every(Number.isFinite);
  const bounds: Bounds = finite ? { min: b.min, max: b.max } : FALLBACK_BOUNDS;
  const size = sizeOf(bounds);
  return {
    bounds,
    info: {
      parts: spec.parts.length,
      triangles: b.triCount,
      size,
      minY: bounds.min[1],
      depthRatio: size[2] / Math.max(size[0], size[1], 1e-6),
      zones: zoneShares(spec, baked, seed),
      anim: spec.parts.filter((p) => p.anim).map((p) => ({ part: p.name, type: (p.anim as AnimTag).type })),
      sockets: Object.keys(spec.sockets ?? {}),
      tags: spec.tags ?? [],
      textures: [...new Set(spec.parts.map((p) => p.texture).filter((t): t is string => !!t))],
    },
  };
}
