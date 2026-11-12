import { ZONES, type ZoneId } from '../core/palette.js';
import { FX_FAMILY_ZONES, FX_LIMITS, type FxAdd } from './validate-core.js';
import { fxShapeSoup } from './shapes.js';
import type { FxKey, FxLayer, FxPreset, FxRole } from './types.js';

const L = FX_LIMITS;

export function isZone(id: string): id is ZoneId {
  return Object.prototype.hasOwnProperty.call(ZONES, id);
}

function peak(keys: readonly FxKey[] | undefined, fallback = 1): number {
  return keys && keys.length ? Math.max(...keys.map((k) => k[1])) : fallback;
}

function keyProblems(keys: readonly FxKey[], maxValue: number): string | null {
  if (keys.length === 0) return 'has no keys';
  if (keys.length > L.maxKeys) return `has ${keys.length} keys (max ${L.maxKeys}): that many steps reads as a smooth tween`;
  if (keys[0]![0] !== 0) return `starts at t = ${keys[0]![0]}, not 0: the particle would be invisible when it spawns`;
  for (let i = 0; i < keys.length; i++) {
    const [t, v] = keys[i]!;
    if (!(t >= 0 && t < 1)) return `key ${i} has t = ${t}, outside [0, 1)`;
    if (i > 0 && t <= keys[i - 1]![0]) return `key ${i} is not after key ${i - 1}`;
    if (!(v >= 0 && v <= maxValue)) return `key ${i} has value ${v}, outside [0, ${maxValue}]`;
  }
  return null;
}

function emitProblems(layer: FxLayer): string | null {
  const radius = layer.spawn?.radius;
  const moving = (layer.speed?.[1] ?? 0) > 0;
  switch (layer.emit) {
    case 'cone':
      if (!layer.angle) return '`cone` needs `angle`';
      if (!moving) return '`cone` needs `speed`';
      return null;
    case 'ring':
      return radius && radius[1] > 0 ? null : '`ring` needs `spawn.radius`';
    case 'implode':
      return radius && radius[0] > 0 ? null : '`implode` needs `spawn.radius` above 0 (where particles start)';
    case 'line':
      return (layer.spawn?.width ?? 0) > 0 || (layer.spawn?.height ?? 0) > 0 ? null : '`line` needs `spawn.width` or `spawn.height`';
    case 'rain':
      if (!((layer.spawn?.width ?? 0) > 0)) return '`rain` needs `spawn.width`';
      return moving || (layer.gravity ?? 0) > 0 ? null : '`rain` needs `speed` or `gravity`';
    case 'burst':
      return null;
  }
}

/** Layer count, unique names, and the required primary / accent roles. */
export function checkStructure(preset: FxPreset, add: FxAdd): void {
  const layers = preset.layers ?? [];
  if (!/^fx\.[a-z0-9]+(-[a-z0-9]+)*$/.test(preset.id)) add('error', 'FX_ID', `id "${preset.id}" must look like fx.kebab-name`);
  if (layers.length < L.minLayers || layers.length > L.maxLayers) {
    add('error', 'FX_LAYERS', `${layers.length} layer(s); an effect needs ${L.minLayers} to ${L.maxLayers}`);
  }
  const names = new Set<string>();
  for (const layer of layers) {
    if (names.has(layer.name)) add('error', 'FX_LAYERS', `layer name "${layer.name}" is used twice`, layer.name);
    names.add(layer.name);
  }
  for (const role of ['primary', 'accent'] as const) {
    if (!layers.some((l) => l.role === role)) add('error', 'FX_ROLES', `no \`${role}\` layer`);
  }
}

/** Returns a zone checker (also used for the onomatopoeia) bound to the preset's family. */
export function makeZoneChecker(preset: FxPreset, add: FxAdd): (zoneId: string, where: string, layer?: string) => boolean {
  const allowed = FX_FAMILY_ZONES[preset.family] ?? [];
  return (zoneId, where, layer) => {
    if (!isZone(zoneId)) {
      add('error', 'FX_ZONE', `${where} uses "${zoneId}", which is not in ZONES`, layer);
      return false;
    }
    const family = ZONES[zoneId].family;
    if (FX_FAMILY_ZONES[preset.family] && !allowed.includes(family)) {
      add('error', 'FX_FAMILY', `${where} uses \`${zoneId}\` (${family}); a ${preset.family} effect may only use ${allowed.join(', ')}`, layer);
    }
    return true;
  };
}

/** Family and zone rules. Returns the layers whose zone exists. */
export function checkPalette(preset: FxPreset, add: FxAdd, checkZone: ReturnType<typeof makeZoneChecker>): FxLayer[] {
  const layers = preset.layers ?? [];
  if (!FX_FAMILY_ZONES[preset.family]) add('error', 'FX_FAMILY', `unknown family "${String(preset.family)}"`);
  const validLayers = layers.filter((l) => checkZone(l.zone, `layer "${l.name}"`, l.name));
  if (preset.family === 'malware' && !validLayers.some((l) => ZONES[l.zone].family === 'malware')) {
    add('error', 'FX_FAMILY', 'a malware effect must use at least one malware zone, or it reads as friendly');
  }
  return validLayers;
}

export interface LayerStats {
  area: Record<FxRole, number>;
  instances: number;
  triangles: number;
  minParticlePx: number;
  vibecoderShapePx: number;
  lastParticleMs: number;
}

function checkKeysAndEmit(layer: FxLayer, add: FxAdd): boolean {
  const scaleErr = keyProblems(layer.scale ?? [], 4);
  if (scaleErr) add('error', 'FX_KEYS', `scale ${scaleErr}`, layer.name);
  const alphaErr = layer.alpha ? keyProblems(layer.alpha, 1) : null;
  if (alphaErr) add('error', 'FX_KEYS', `alpha ${alphaErr}`, layer.name);
  const emitErr = emitProblems(layer);
  if (emitErr) add('error', 'FX_EMIT', emitErr, layer.name);
  if (!(layer.count >= 1) || !Number.isInteger(layer.count)) add('error', 'FX_EMIT', `count ${layer.count} must be a positive integer`, layer.name);
  if (!(layer.lifeMs?.[0] > 0) || layer.lifeMs[1] < layer.lifeMs[0]) add('error', 'FX_EMIT', 'lifeMs must be [min, max] with 0 < min <= max', layer.name);
  return scaleErr !== null;
}

function checkDepth(layer: FxLayer, soupSize: readonly number[], across: number, add: FxAdd): void {
  if ((layer.zSpread ?? 0) > L.maxZSpread) {
    add('error', 'FX_IN_PLANE', `zSpread ${layer.zSpread} (max ${L.maxZSpread}): depth is invisible to the front camera and only risks clipping into actors`, layer.name);
  }
  if (across > 0 && soupSize[2]! > across * L.maxDepthRatio + 1e-6) {
    add('warning', 'FX_IN_PLANE', `chunk is ${soupSize[2]!.toFixed(2)} deep but ${across.toFixed(2)} across: keep depth under ${L.maxDepthRatio * 100}% of the face`, layer.name);
  }
}

/** Per-layer geometry, timing and stepping rules; accumulates the budget metrics. */
export function checkLayers(preset: FxPreset, add: FxAdd): LayerStats {
  const stats: LayerStats = {
    area: { primary: 0, secondary: 0, accent: 0 },
    instances: 0,
    triangles: 0,
    minParticlePx: Infinity,
    vibecoderShapePx: 0,
    lastParticleMs: 0,
  };
  for (const layer of preset.layers ?? []) {
    const soup = fxShapeSoup(layer.shape);
    const scaleBad = checkKeysAndEmit(layer, add);
    const peakScale = peak(layer.scale);
    const sizeMin = layer.size?.[0] ?? 1, sizeMax = layer.size?.[1] ?? 1;
    const across = Math.max(soup.size[0], soup.size[1]);
    const count = Math.max(0, layer.count | 0);
    stats.instances += count;
    stats.triangles += count * soup.triCount;
    if (layer.role in stats.area) stats.area[layer.role] += count * soup.frontArea * Math.pow(peakScale * (sizeMin + sizeMax) / 2, 2);
    const smallPx = across * peakScale * sizeMin * L.pxPerUnit;
    stats.minParticlePx = Math.min(stats.minParticlePx, smallPx);
    stats.vibecoderShapePx = Math.max(stats.vibecoderShapePx, across * peakScale * sizeMax * L.pxPerUnit);
    if (smallPx < L.minParticlePx) {
      add('error', 'FX_SIZE', `chunks are ${smallPx.toFixed(1)} px at their peak (min ${L.minParticlePx}): the pixel-art pass will eat them`, layer.name);
    }
    if (!scaleBad && layer.scale[0]![1] < peakScale * 0.55) {
      add('warning', 'FX_POP', `starts at ${layer.scale[0]![1]} and grows to ${peakScale}: comic effects pop on near full size; they do not grow in`, layer.name);
    }
    checkDepth(layer, soup.size, across, add);
    stats.lastParticleMs = Math.max(stats.lastParticleMs, (layer.delayMs?.[1] ?? 0) + (layer.lifeMs?.[1] ?? 0));
  }
  return stats;
}

/** 60 / 30 / 10 balance. Returns the share per role, in percent. */
export function checkRoleBalance(preset: FxPreset, area: Record<FxRole, number>, add: FxAdd): Record<FxRole, number> {
  const share: Record<FxRole, number> = { primary: 0, secondary: 0, accent: 0 };
  const total = area.primary + area.secondary + area.accent;
  if (total <= 0) return share;
  for (const role of ['primary', 'secondary', 'accent'] as const) {
    share[role] = (area[role] / total) * 100;
    const [lo, hi] = L.share[role];
    const present = (preset.layers ?? []).some((l) => l.role === role);
    if (present && (share[role] < lo || share[role] > hi)) {
      add('error', 'FX_ROLE_BALANCE', `${role} is ${share[role].toFixed(0)}% of the emitted area (want ${lo}..${hi}%, target 60/30/10)`);
    }
  }
  return share;
}
