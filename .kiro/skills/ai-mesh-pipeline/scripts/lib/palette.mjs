// Reads the game's palette straight out of src/procgen/core/palette.ts, so these scripts can never drift from it.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');

/** [{ id, color: 0xrrggbb, rgb: [r, g, b], family, emissive }] in declaration order. */
export function loadZones(root = projectRoot) {
  const src = readFileSync(resolve(root, 'src/procgen/core/palette.ts'), 'utf8');
  const consts = {};
  for (const m of src.matchAll(/export const (\w+) = (0x[0-9a-fA-F]{6});/g)) consts[m[1]] = Number(m[2]);
  const zones = [];
  for (const m of src.matchAll(/^\s+(\w+): \{ color: (\w+), family: '(\w+)'([^}]*)\}/gm)) {
    const color = m[2].startsWith('0x') ? Number(m[2]) : consts[m[2]];
    if (color === undefined) throw new Error(`palette.ts: cannot resolve colour "${m[2]}" of zone "${m[1]}"`);
    const emissive = /emissive: ([\d.]+)/.exec(m[4]);
    zones.push({ id: m[1], color, rgb: [(color >> 16) & 255, (color >> 8) & 255, color & 255], family: m[3], emissive: emissive ? Number(emissive[1]) : 0 });
  }
  if (zones.length < 10) throw new Error('palette.ts: could not parse ZONES (did its format change?)');
  return zones;
}

/** The three cel bands of src/shaders/comic-material.ts. */
export const CEL_BANDS = [1, 0.68, 0.4];

/** "Redmean" colour distance on 0..255 sRGB: cheap and close enough to perception for palette snapping. */
export function colorDistance(a, b) {
  const rm = (a[0] + b[0]) / 2;
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
  return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db);
}

/**
 * Nearest zone to an sRGB colour. A colour that looks like a zone's mid or shadow cel band is matched to
 * that zone (baked shading should not turn a hoodie into copper), with a small penalty per band.
 */
export function nearestZone(rgb, zones) {
  let best = null;
  let bestD = Infinity;
  for (const z of zones) {
    for (let k = 0; k < CEL_BANDS.length; k++) {
      const band = CEL_BANDS[k];
      const d = colorDistance(rgb, [z.rgb[0] * band, z.rgb[1] * band, z.rgb[2] * band]) + k * 14;
      if (d < bestD) { bestD = d; best = z; }
    }
  }
  return { zone: best, distance: bestD };
}

export function hex(color) {
  return `#${color.toString(16).padStart(6, '0')}`;
}
