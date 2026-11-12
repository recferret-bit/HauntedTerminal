import type { BakedPart, ModelBounds } from '../../geometry/geometry.js';
import { rasterizeModel, type RasterResult } from '../../geometry/raster.js';
import { isHostile, type ModelSpec } from '../../core/types.js';
import { silhouetteShape, soloFootprint, topCoverage } from './read-measure.js';
import { modelPartList, type ModelIssueSink, type ModelRules, type ModelStats } from './rules.js';
import { modelPartTranslucent, modelZoneDef } from './zone-info.js';

const pct = (v: number): string => `${Math.round(v * 100)}%`;

/** What the read checks share: the front raster and the per-part measurements derived from it. */
interface ReadCtx {
  spec: ModelSpec;
  baked: BakedPart[];
  rules: ModelRules;
  sink: ModelIssueSink;
  stats: ModelStats;
  /** Magnification over the game scale (rooms are measured smaller). */
  scale: number;
  ppu: number;
  /** Converts pixels at `ppu` to pixels at game scale. */
  toGamePx: number;
  raster: RasterResult;
  /** Nearest-surface pixels per part, translucent parts included. */
  front: Float64Array;
  topFilled: number;
  /** Pixels at game scale where each part is the thing the player sees. */
  visible: Float64Array;
}

interface ZoneShare {
  zoneId: string;
  share: number;
}

/** Hidden-part warning for one part; returns true when it was hidden (so the thin check is skipped). */
function checkHidden(ctx: ReadCtx, b: BakedPart, soloPx: number): boolean {
  const { rules, sink, visible } = ctx;
  const part = b.part;
  if (visible[b.index] >= rules.read.hiddenPx || soloPx < rules.read.hiddenMinSoloPx) return false;
  const moving = !!part.anim && !['blink', 'pulse', 'breathe'].includes(part.anim.type);
  if (!moving && !sink.issues.some((i) => i.code === 'BURIED_PART' && i.part === part.name)) {
    sink.add('warning', 'HIDDEN_PART',
      `"${part.name}" would cover ~${Math.round(soloPx)} px but none of it is visible from the front: other parts hide it completely`,
      'Bring it to the −z (camera) side of whatever covers it, let it stick out past the silhouette, or delete it: it costs triangles and is never seen.',
      part.name);
  }
  return true;
}

/** Hidden parts and parts thinner than the readable minimum, one pass over the parts. */
function checkParts(ctx: ReadCtx): void {
  const { baked, rules, sink, scale, ppu, toGamePx, raster, front, visible } = ctx;
  const thin: { name: string; px: number }[] = [];
  for (const b of baked) {
    const part = b.part;
    // Opaque parts show through glass; a translucent part is seen wherever it is the nearest surface.
    visible[b.index] = (modelPartTranslucent(part) ? front[b.index] : raster.coverage[b.index]) * toGamePx;
    const checkThin = part.outline !== false;
    const solo = soloFootprint(b, ppu, (area, longPx) => checkThin && area / Math.max(1, longPx) < 8 * scale);
    if (checkHidden(ctx, b, solo.area * toGamePx)) continue;
    const thickness = solo.thickness / scale;
    if (checkThin && thickness < rules.read.minFeaturePx - rules.read.featureTolPx) thin.push({ name: part.name, px: thickness });
  }
  if (!thin.length) return;
  const game = rules.gamePxPerUnit;
  thin.sort((a, b) => a.px - b.px);
  sink.add('warning', 'THIN_FEATURE',
    `${thin.length} outlined part${thin.length > 1 ? 's are' : ' is'} thinner than ${rules.read.minFeaturePx} px at game scale: ${modelPartList(thin.map((t) => `${t.name} (${Math.max(0, t.px).toFixed(1)} px)`))}. The ink shell and the pixel-art pass will turn ${thin.length > 1 ? 'them' : 'it'} into a black line`,
    `Make the thin dimension at least ${(rules.read.minFeaturePx / game).toFixed(3)} units (${rules.read.minFeaturePx} px / ${game} px per unit), or set outline: false if it is a decal or light.`,
    thin.map((t) => t.name));
}

/** A rectangle or a near-convex blob is not a silhouette. */
function checkSilhouette(ctx: ReadCtx): void {
  const { spec, rules, sink, stats, raster } = ctx;
  const shape = silhouetteShape(raster.partId, raster.image.width, raster.image.height, raster.filled);
  stats.boxFill = shape.boxFill;
  stats.hullDeficit = shape.hullDeficit;
  const minDeficit = rules.read.minHullDeficit[spec.category];
  if (minDeficit === undefined) return;
  if (stats.boxFill >= rules.read.boxFill) {
    sink.add('warning', 'SILHOUETTE_BOX',
      `the silhouette fills ${pct(stats.boxFill)} of its bounding box: as a black shape it is a rectangle`,
      'Break the outline: horns, limbs, spikes, a tail, a notch, an asymmetric lean. Design the silhouette on the XY plane first.');
  } else if (stats.hullDeficit < minDeficit) {
    sink.add('warning', 'SILHOUETTE_BLOB',
      `the silhouette is almost convex (${pct(stats.hullDeficit)} of its convex hull is empty, want at least ${pct(minDeficit)}): it reads as a blob`,
      'Add parts that stick out of the body with gaps between them (limbs, spikes, antennae, a held object) so the outline has concavities.');
  }
}

/** Visible share per zone, largest first; also recorded in the stats. */
function zoneShares(ctx: ReadCtx): ZoneShare[] {
  const { baked, front, topFilled, stats } = ctx;
  const byZone = new Map<string, number>();
  for (const b of baked) byZone.set(b.part.zone, (byZone.get(b.part.zone) ?? 0) + front[b.index]);
  const shares = [...byZone.entries()].filter(([, px]) => px > 0).map(([zoneId, px]) => ({ zoneId, share: px / topFilled })).sort((a, b) => b.share - a.share);
  for (const s of shares) stats.zoneShare[s.zoneId] = Math.round(s.share * 1000) / 1000;
  return shares;
}

function checkZoneCount(ctx: ReadCtx, shares: ZoneShare[]): void {
  const { spec, rules, sink } = ctx;
  const c = rules.color;
  const counted = [...new Set<string>(spec.parts.map((p) => p.zone))].filter((z) => {
    const def = modelZoneDef(z);
    return !!def && def.family !== 'neutral' && (def.emissive ?? 0) < c.emissiveMin;
  });
  const maxZones = spec.category === 'room' ? c.roomMaxZones : c.maxZones;
  if (counted.length <= maxZones) return;
  const smallest = shares.filter((s) => counted.includes(s.zoneId)).slice(-(counted.length - maxZones)).map((s) => `${s.zoneId} ${pct(s.share)}`);
  sink.add('warning', 'TOO_MANY_ZONES',
    `${counted.length} zones (limit ${maxZones}, not counting ink, paper and lights): ${counted.join(', ')}`,
    `Merge the smallest zones into a neighbour of the same family (smallest: ${smallest.join(', ')}).`);
}

/** 60/30/10: one dominant zone, not one flat zone, not a patchwork. */
function checkDominantZone(ctx: ReadCtx, shares: ZoneShare[]): void {
  const { rules: { color: c }, sink } = ctx;
  const lead = shares[0];
  // A paper-white model (the System Hand, a document) is the page itself: it is allowed to be one flat zone.
  if (lead.share > c.dominantMax && modelZoneDef(lead.zoneId)?.family !== 'neutral') {
    sink.add('warning', 'PALETTE_FLAT',
      `${lead.zoneId} covers ${pct(lead.share)} of the visible model (60/30/10 wants roughly 60, limit ${pct(c.dominantMax)})`,
      'Give a large sub-shape (a panel, a limb group, a lid) a second zone so about 30% of the area contrasts with the body.');
  } else if (lead.share < c.dominantMin) {
    sink.add('warning', 'PALETTE_PATCHWORK',
      `no dominant zone: the largest, ${lead.zoneId}, covers only ${pct(lead.share)} (60/30/10 wants roughly 60, at least ${pct(c.dominantMin)}). Shares: ${shares.slice(0, 5).map((s) => `${s.zoneId} ${pct(s.share)}`).join(', ')}`,
      'Pick one body zone and move the mid-sized parts onto it; keep the other zones for the secondary mass and small accents.');
  }
}

/** The 10 of 60/30/10: a small high-contrast detail. */
function checkAccent(ctx: ReadCtx, shares: ZoneShare[]): void {
  const { rules: { color: c }, sink } = ctx;
  const accent = shares.slice(2).reduce((sum, s) => sum + s.share, 0);
  if (accent >= c.accentMin) return;
  sink.add('warning', 'NO_ACCENT',
    shares.length < 3
      ? `only ${shares.length} zone${shares.length > 1 ? 's are' : ' is'} visible: there is no accent (the 10 of 60/30/10)`
      : `the accent zones cover ${(accent * 100).toFixed(1)}% of the visible model (want at least ${pct(c.accentMin)})`,
    'Add or enlarge a small, high-contrast detail on the −z side: gold contacts, an LED, an eye, a label.');
}

function checkColor(ctx: ReadCtx): void {
  const shares = zoneShares(ctx);
  checkZoneCount(ctx, shares);
  const cat = ctx.spec.category;
  if (cat === 'room' || !shares.length) return;
  checkDominantZone(ctx, shares);
  if (cat !== 'prop' && cat !== 'npc') checkAccent(ctx, shares);
}

/** Emissive share limit, then the category's required light must show enough pixels. */
function checkLight(ctx: ReadCtx): void {
  const { spec, baked, rules: { color: c }, sink, stats, front, topFilled, visible } = ctx;
  const cat = spec.category;
  let glow = 0;
  for (const b of baked) {
    const z = modelZoneDef(b.part.zone);
    if (z && z.family !== 'glass' && (z.emissive ?? 0) >= c.emissiveMin) glow += front[b.index];
  }
  stats.emissiveShare = Math.round((glow / topFilled) * 1000) / 1000;
  if (cat !== 'pickup' && stats.emissiveShare > c.emissiveMaxShare) {
    sink.add('warning', 'TOO_MUCH_GLOW',
      `${pct(stats.emissiveShare)} of the visible model is emissive (limit ${pct(c.emissiveMaxShare)}): when everything glows, nothing does`,
      'Keep emissive zones for the eye/core, LEDs and the lantern. Move large glowing surfaces to a non-emissive zone of the same hue family.');
  }
  const lightPx = (wanted: (zoneId: string) => boolean): number =>
    baked.reduce((sum, b) => sum + (wanted(b.part.zone) ? visible[b.index] : 0), 0);
  const needLight = (label: string, wanted: (zoneId: string) => boolean, skipIf: string[]): void => {
    if (skipIf.some((code) => sink.has(code))) return;
    const px = lightPx(wanted);
    if (px < c.minLightPx) {
      sink.add('error', 'LIGHT_NOT_VISIBLE',
        `the ${label} shows only ${px.toFixed(1)} px from the front at game scale (need at least ${c.minLightPx})`,
        'Move the glowing part to the −z face so nothing covers it, and make it at least 0.05 units across.');
    }
  };
  const family = (zoneId: string): string | undefined => modelZoneDef(zoneId)?.family;
  if (isHostile(cat)) needLight('malwareEye', (z) => z === 'malwareEye', ['MALWARE_NO_EYE']);
  else if (cat === 'pickup') needLight('signal light', (z) => family(z) === 'signal', ['PICKUP_NO_SIGNAL']);
  else if (cat === 'door') needLight('status LED', (z) => family(z) === 'signal', ['DOOR_NO_LED']);
  else if (spec.id === 'vibecoder.dev') needLight('lantern', (z) => z === 'lantern', ['VIBECODER_NO_LANTERN']);
}

/** Rasterize the front view at game scale (smaller for big models) and gather the shared measurements. */
function buildReadCtx(
  spec: ModelSpec, baked: BakedPart[], bounds: ModelBounds, rules: ModelRules, sink: ModelIssueSink, stats: ModelStats, seed: number,
): ReadCtx | null {
  const game = rules.gamePxPerUnit;
  const extent = Math.max(bounds.size[0], bounds.size[1], 1e-3);
  // Big models (rooms) are measured at a smaller magnification so a room does not cost a second.
  const scale = Math.max(1, Math.min(rules.readScale, 1100 / (extent * game)));
  const ppu = game * scale;
  const raster = rasterizeModel(spec, { view: 'front', pxPerUnit: ppu, background: null, marginPx: 2, outlinePx: 0, textures: false, seed }, baked);
  if (!raster.filled) return null;
  const front = topCoverage(baked, bounds, ppu);
  return {
    spec, baked, rules, sink, stats, scale, ppu, toGamePx: 1 / (scale * scale), raster, front,
    topFilled: front.reduce((sum, v) => sum + v, 0) || 1,
    visible: new Float64Array(baked.length),
  };
}

/** The 2D read: what the player actually sees from the front at game scale. */
export function checkModelRead(
  spec: ModelSpec, baked: BakedPart[], bounds: ModelBounds, rules: ModelRules, sink: ModelIssueSink, stats: ModelStats, seed: number,
): void {
  if (spec.category === 'fx' || !baked.length) return;
  const ctx = buildReadCtx(spec, baked, bounds, rules, sink, stats, seed);
  if (!ctx) return;
  checkParts(ctx);
  checkSilhouette(ctx);
  checkColor(ctx);
  checkLight(ctx);
}
