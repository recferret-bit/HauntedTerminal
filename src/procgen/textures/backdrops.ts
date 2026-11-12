import { INK, type FloorId, type ZoneId } from '../core/palette.js';
import { makeRng, type Rng } from '../core/rng.js';
import type { PixelBuffer } from '../core/types.js';
import {
  TEX_BACKDROP_QUIET_FROM, texColor as C, texDisc, texFloorColor, texFrame, texHalftone, texLine, texNew, texPolygon, texPolyline,
  texRect, texRing, type TexEntry,
} from './toolkit.js';

/**
 * Backdrops: one wide wall per floor, 256 x 128, tiling horizontally. Mansion architecture built from
 * hardware, drawn in the floor's `FLOOR_THEMES` bg, its two cel shades and x0.4 hardware colours, so
 * the wall stays dark and actors pop.
 *
 * Two zones, split at row QUIET (= TEX_BACKDROP_QUIET_FROM * H = 64):
 *   rows 0..63    upper wall: the motif (trusses, arches, fins, the die) and every accent light.
 *   rows 64..127  quiet wall: what sits behind the actors (ACTOR_BAND in src/procgen/archetypes/rooms/frame.ts,
 *                 y 0..2.4 of a 5 unit wall). Only the floor bg and its x0.68 shade, in large calm shapes.
 *                 No accent, no ink, no x0.4 holes. The validator's BACKDROP_BAND check enforces it.
 * The room models draw their own floor and skirting, so the backdrop has no floor line.
 */
const W = 256, H = 128;
const QUIET = Math.round(TEX_BACKDROP_QUIET_FROM * H);

function backdrop(floor: FloorId, label: string, zones: readonly ZoneId[], purpose: string, draw: (buf: PixelBuffer, rng: Rng, c: Tones) => void): TexEntry {
  return {
    id: `tex.backdrop.floor${floor}`, label, usage: 'backdrop', tileable: true, zones, floor, purpose,
    build: (seed) => {
      const tones: Tones = {
        bg: texFloorColor(floor, 'bg'), dark: texFloorColor(floor, 'bg', 1), pit: texFloorColor(floor, 'bg', 2),
        glow: texFloorColor(floor, 'accent', 2), spark: texFloorColor(floor, 'accent', 1),
      };
      const buf = texNew(W, H, tones.bg);
      draw(buf, makeRng(seed), tones);
      return buf;
    },
  };
}

interface Tones {
  /** Wall. */ bg: number;
  /** Recess, x0.68. The only other colour allowed in the quiet half. */ dark: number;
  /** Hole or deep shadow, x0.4. Upper half only. */ pit: number;
  /** Accent x0.4: thin lines and small lights. Upper half only. */ glow: number;
  /** Accent x0.68: a handful of pixels, never an area. Upper half only. */ spark: number;
}

/** The line between the motif and the quiet wall: a moulding in the dark shade. */
function cornice(buf: PixelBuffer, c: Tones, y = QUIET - 4): void {
  texRect(buf, 0, y, W, 4, c.dark);
}

/** Recessed wall panels in the quiet half: `n` per tile, the dark shade only. */
function wainscot(buf: PixelBuffer, c: Tones, n: number, top = QUIET + 8, bottom = H - 8): void {
  const pitch = W / n;
  for (let i = 0; i < n; i++) texFrame(buf, i * pitch + 6, top, pitch - 12, bottom - top, c.dark, 2);
}

const floor1 = backdrop(1, 'Storage attic wall', ['rubber', 'heatsink', 'silicon'],
  'Floor 1 attic: roof trusses over a row of drive bays with platters and activity lights, ribbon-cable cobwebs; plain panelled wall below.',
  (buf, rng, c) => {
    // Roof space with rafters.
    texRect(buf, 0, 0, W, 26, c.dark);
    for (let x = 0; x < W; x += 128) {
      texLine(buf, x, 26, x + 64, 4, c.pit, 6);
      texLine(buf, x + 64, 4, x + 128, 26, c.pit, 6);
      texRect(buf, x + 61, 4, 6, 22, c.pit);
    }
    texRect(buf, 0, 26, W, 4, c.pit);
    texRect(buf, 0, 30, W, 2, INK);
    // One row of drive bays under the tie beam.
    for (let col = 0; col < 4; col++) {
      const x = col * 64 + 4, y = 36;
      texRect(buf, x, y, 56, 20, c.dark);
      texFrame(buf, x, y, 56, 20, C('rubber'), 2);
      const kind = rng.int(0, 3);
      if (kind === 0) texRect(buf, x + 2, y + 2, 52, 16, c.pit);
      else if (kind === 1) {
        texRing(buf, x + 16, y + 10, 7, C('heatsink', 2), 2);
        texRing(buf, x + 34, y + 10, 7, C('heatsink', 2), 2);
        texRect(buf, x + 46, y + 8, 4, 4, c.glow);
      } else {
        texRect(buf, x + 6, y + 9, 32, 2, c.pit);
        texRect(buf, x + 46, y + 8, 4, 4, rng.chance(0.25) ? c.spark : c.glow);
      }
    }
    // Ribbon-cable cobwebs sagging between the rafters, above the bays.
    for (let i = 0; i < 3; i++) {
      const x0 = rng.int(0, W), span = rng.int(40, 90), sag = rng.int(4, 8);
      const pts: [number, number][] = [];
      for (let k = 0; k <= 8; k++) {
        const t = k / 8;
        pts.push([x0 + t * span, 22 + sag * 4 * t * (1 - t)]);
      }
      texPolyline(buf, pts, C('silicon'), 2);
    }
    cornice(buf, c);
    wainscot(buf, c, 4);
  });

const floor2 = backdrop(2, 'Firewall crypt wall', ['heatsink', 'rubber'],
  'Floor 2 crypt: a row of pointed arches barred with firewall grilles, one broken open, over a plain brick wall.',
  (buf, rng, c) => {
    const open = rng.int(0, 3);
    for (let i = 0; i < 4; i++) {
      const cx = i * 64 + 32;
      const arch: [number, number][] = [[cx - 18, 56], [cx - 18, 30], [cx - 14, 20], [cx - 7, 12], [cx, 8], [cx + 7, 12], [cx + 14, 20], [cx + 18, 30], [cx + 18, 56]];
      texPolygon(buf, arch, c.pit);
      if (i !== open) {
        for (let x = cx - 13; x <= cx + 11; x += 6) texRect(buf, x, 14 + Math.abs(x + 1 - cx) * 0.6, 2, 44, C('heatsink', 2));
        texRect(buf, cx - 18, 36, 36, 2, C('heatsink', 2));
      } else {
        texLine(buf, cx - 13, 56, cx - 9, 42, C('heatsink', 2), 2);
        texLine(buf, cx + 11, 56, cx + 8, 38, C('heatsink', 2), 2);
      }
      texPolyline(buf, arch, C('rubber'), 2);
      texRect(buf, cx - 2, 2, 4, 4, i === open ? c.spark : c.glow);
      // Capacitor pilaster between arches.
      texRect(buf, i * 64 - 4, 16, 8, 44, c.dark);
      texRect(buf, i * 64 - 6, 12, 12, 4, C('rubber'));
    }
    cornice(buf, c, QUIET - 4);
    // Brick courses below, in the dark shade only; a few bricks missing (filled, not holes).
    for (let y = QUIET; y < H; y += 16) {
      texRect(buf, 0, y, W, 2, c.dark);
      for (let x = (y / 16) % 2 ? 16 : 0; x < W; x += 32) texRect(buf, x, y, 2, 16, c.dark);
    }
    for (let i = 0; i < 4; i++) {
      const row = rng.int(0, 3);
      texRect(buf, 32 * rng.int(0, 7) + (row % 2 ? 18 : 2), QUIET + row * 16 + 2, 30, 14, c.dark);
    }
  });

const floor3 = backdrop(3, 'Bus maze wall', ['rubber', 'heatsink'],
  'Floor 3 hall of mirrors: a bus bundle and its mirror image around a corridor of RAM slots and loopback rings; quiet trace ghosts below.',
  (buf, rng, c) => {
    const lit = rng.int(0, 3);
    const x1 = 16 * rng.int(1, 5), x2 = x1 + 16 * rng.int(3, 6);
    // One bundle drawn twice, mirrored about row 30, the slot corridor between.
    for (const mirror of [false, true]) {
      const flip = (y: number): number => (mirror ? 60 - y : y);
      for (let i = 0; i < 3; i++) {
        const hex = i === lit ? c.glow : C('rubber');
        const y0 = 2 + i * 5, y1 = y0 + 6, lead = Math.round(0.414 * 5 * i);
        texLine(buf, 0, flip(y0), x1 - lead, flip(y0), hex, 2);
        texLine(buf, x1 - lead, flip(y0), x1 - lead + 6, flip(y1), hex, 2);
        texLine(buf, x1 - lead + 6, flip(y1), x2 + lead, flip(y1), hex, 2);
        texLine(buf, x2 + lead, flip(y1), x2 + lead + 6, flip(y0), hex, 2);
        texLine(buf, x2 + lead + 6, flip(y0), W, flip(y0), hex, 2);
      }
    }
    const ring = rng.int(0, 3);
    for (let i = 0; i < 8; i++) {
      const cx = i * 32 + 16;
      if (i % 4 === ring) {
        texRing(buf, cx, 30, 8, c.glow, 2);
        texRect(buf, cx - 1, 28, 2, 4, c.spark);
        continue;
      }
      texRect(buf, cx - 6, 22, 12, 16, C('heatsink', 2));
      texRect(buf, cx - 4, 24, 8, 12, c.pit);
    }
    cornice(buf, c);
    // Below: the same bundle again as a faint reflection, dark shade only.
    for (let i = 0; i < 3; i++) {
      const y0 = QUIET + 14 + i * 12, y1 = y0 + 12, lead = 5 * i;
      texLine(buf, 0, y0, x1 - lead, y0, c.dark, 2);
      texLine(buf, x1 - lead, y0, x1 - lead + 12, y1, c.dark, 2);
      texLine(buf, x1 - lead + 12, y1, x2 + lead, y1, c.dark, 2);
      texLine(buf, x2 + lead, y1, x2 + lead + 12, y0, c.dark, 2);
      texLine(buf, x2 + lead + 12, y0, W, y0, c.dark, 2);
    }
  });

const floor4 = backdrop(4, 'Cooling furnace wall', ['heatsink', 'copper', 'rubber'],
  'Floor 4 boiler room: a copper heat pipe feeding heatsink fins like organ pipes, a fan; a plain riveted boiler wall below.',
  (buf, rng, c) => {
    texRect(buf, 0, 4, W, 8, C('copper', 2));
    texRect(buf, 0, 12, W, 2, c.pit);
    for (let half = 0; half < 2; half++) {
      const ox = half * 128;
      const fins = 8, base = 58;
      for (let i = 0; i < fins; i++) {
        const t = (i + 0.5) / fins - 0.5;
        const top = Math.round((22 + Math.abs(t) * 2 * rng.int(10, 18)) / 2) * 2;
        texRect(buf, ox + 8 + i * 10, top, 6, base - top, C('heatsink', 2));
        texRect(buf, ox + 8 + i * 10, top, 2, base - top, c.pit); // shade on the screen-left side: light is upper screen-right
      }
      texRect(buf, ox + 44, 14, 8, 8, C('copper', 2));
      // Fan.
      const fx = ox + 108, fy = 34;
      texDisc(buf, fx, fy, 16, c.dark);
      texRing(buf, fx, fy, 16, C('rubber'), 3);
      const a = rng.range(0, Math.PI / 2);
      for (let k = 0; k < 4; k++) {
        const b = a + (k * Math.PI) / 2;
        texLine(buf, fx, fy, fx + Math.cos(b) * 10, fy + Math.sin(b) * 10, C('rubber'), 4);
      }
      texDisc(buf, fx, fy, 3, c.glow);
    }
    // Embers glowing through the fin roots.
    for (let x = 10; x < W; x += 20) if (rng.chance(0.6)) texRect(buf, x, 54, 4, 2, rng.chance(0.25) ? c.spark : c.glow);
    cornice(buf, c);
    // Boiler plates below: riveted seams in the dark shade.
    for (let x = 0; x < W; x += 64) texRect(buf, x, QUIET, 2, H - QUIET, c.dark);
    for (let y = QUIET + 30; y < H; y += 32) texRect(buf, 0, y, W, 2, c.dark);
    for (let x = 8; x < W; x += 16) for (const y of [QUIET + 6, H - 8]) texRect(buf, x, y, 2, 2, c.dark);
  });

const floor5 = backdrop(5, 'Kernel core wall', ['rubber', 'voidPurple'],
  'Floor 5 cellar: a cracked CPU die in a pin field with storm bolts either side, the pin grid fading into a dark wall below.',
  (buf, rng, c) => {
    const cx = 128, cy = 30;
    texHalftone(buf, C('rubber'), { cell: 16, radius: 2.2, mask: (_x, y) => y < QUIET - 8 });
    texRect(buf, cx - 30, cy - 28, 60, 56, c.pit);
    texFrame(buf, cx - 30, cy - 28, 60, 56, C('rubber'), 2);
    texRect(buf, cx - 18, cy - 16, 36, 32, c.dark);
    texFrame(buf, cx - 18, cy - 16, 36, 32, C('voidPurple'), 2);
    texRect(buf, cx - 8, cy - 8, 16, 16, C('voidPurple', 1));
    texFrame(buf, cx - 8, cy - 8, 16, 16, c.glow, 2);
    for (const sx of [rng.int(16, 60), rng.int(196, 240)]) {
      const pts: [number, number][] = [[sx, 2]]; // starts inside the tile: the brush must not wrap into the quiet rows
      for (let y = 12; y <= 48; y += 12) pts.push([sx + rng.int(-10, 10), y]);
      texPolyline(buf, pts, c.pit, 4);
    }
    // Cracks from the core, kept inside the upper wall.
    for (let i = 0; i < 4; i++) {
      let a = (i / 4) * Math.PI * 2 + rng.range(0.2, 1.2), x = cx + Math.cos(a) * 8, y = cy + Math.sin(a) * 8;
      const pts: [number, number][] = [[x, y]];
      for (let k = 0; k < rng.int(3, 5); k++) {
        a += rng.range(-0.7, 0.7);
        x += Math.cos(a) * 12;
        y = Math.min(QUIET - 10, Math.max(4, y + Math.sin(a) * 12));
        pts.push([x, y]);
      }
      texPolyline(buf, pts, c.spark, 2);
    }
    texRect(buf, cx - 2, cy - 2, 4, 4, c.spark);
    cornice(buf, c);
    // Below: the pin field continues as sparse dark sockets only.
    texHalftone(buf, c.dark, { cell: 16, radius: 2.2, mask: (_x, y) => y >= QUIET });
  });

export const BACKDROP_TEXTURES: readonly TexEntry[] = [floor1, floor2, floor3, floor4, floor5];
