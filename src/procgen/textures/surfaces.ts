import { INK, PAPER } from '../core/palette.js';
import { makeRng, type Rng } from '../core/rng.js';
import type { PixelBuffer } from '../core/types.js';
import { texHexByte, texKana, texText, texTextWidth } from './font.js';
import {
  texCellNoise, texColor as C, texCrosshatch, texDisc, texFrame, texGet, texHalftone, texLine, texNew, texNoiseField,
  texPolygon, texRect, texRing, texStripes, type TexEntry,
} from './toolkit.js';

/**
 * Surface textures: tileable on both axes, 64 to 128 px, drawn only with palette colours.
 * They are albedo maps for `PartSpec.texture`; the comic material multiplies them by the cel band,
 * so they carry drawing (lines, pads, glyphs), never lighting.
 */

function surface(id: string, label: string, zones: TexEntry['zones'], purpose: string, build: (rng: Rng, seed: number) => PixelBuffer): TexEntry {
  return { id, label, usage: 'surface', tileable: true, zones, purpose, build: (seed) => build(makeRng(seed), seed) };
}

/** A trace bundle crossing the whole tile with two 45 degree jogs that cancel out, so it wraps. */
function busBundle(buf: PixelBuffer, rng: Rng, y: number, count: number, pitch: number, jog: number, hex: number, t: number): void {
  const w = buf.width;
  const dir = rng.chance(0.5) ? 1 : -1;
  const x1 = 8 * rng.int(1, Math.floor(w / 32));
  const x2 = x1 + jog + 8 * rng.int(2, Math.floor(w / 24));
  const base = dir < 0 ? y + jog : y;
  for (let i = 0; i < count; i++) {
    const y0 = base + i * pitch, y1 = y0 + dir * jog;
    const lead = Math.round(dir * 0.414 * pitch * i);
    texLine(buf, 0, y0, x1 - lead, y0, hex, t);
    texLine(buf, x1 - lead, y0, x1 - lead + jog, y1, hex, t);
    texLine(buf, x1 - lead + jog, y1, x2 + lead, y1, hex, t);
    texLine(buf, x2 + lead, y1, x2 + lead + jog, y0, hex, t);
    texLine(buf, x2 + lead + jog, y0, w, y0, hex, t);
  }
}

function via(buf: PixelBuffer, x: number, y: number): void {
  texDisc(buf, x, y, 5, INK);
  texDisc(buf, x, y, 4, C('gold'));
  texDisc(buf, x, y, 1.5, INK);
}

/** The board both `tex.pcb-traces` and `tex.corruption` start from. 128 px. */
function drawPcb(rng: Rng): PixelBuffer {
  const buf = texNew(128, 128, C('pcb'));
  const refs = ['R12', 'C3', 'U7', 'Q2', 'D5', 'L1', 'J4', 'C40'];
  for (let lane = 0; lane < 2; lane++) {
    const top = lane * 64;
    busBundle(buf, rng, top + 5, rng.int(3, 4), 8, 16, C('pcbDark'), 3);
    // The free strip under each bundle (top + 50 .. top + 69) carries pads, vias and silk-screen.
    const start = 4 + 8 * rng.int(0, 15);
    if (lane === rng.int(0, 1)) {
      const pads = rng.int(4, 6);
      for (let i = 0; i < pads; i++) {
        texRect(buf, start + i * 12 - 1, top + 53, 8, 12, INK);
        texRect(buf, start + i * 12, top + 54, 6, 10, C('solder'));
        texRect(buf, start + i * 12, top + 61, 6, 3, C('solder', 1));
      }
      texText(buf, rng.pick(refs), start + pads * 12 + 6, top + 54, PAPER, 2);
    } else {
      const n = rng.int(3, 4);
      for (let i = 0; i < n; i++) via(buf, start + i * 16 + 6, top + 59);
      texText(buf, rng.pick(refs), start + n * 16 + 6, top + 54, PAPER, 2);
    }
  }
  return buf;
}

const pcbTraces = surface('tex.pcb-traces', 'PCB traces', ['pcb', 'pcbDark', 'gold', 'solder'],
  'Circuit board: routed trace bundles, vias, solder pads, silk-screen refs. Floors, walls, RAM sticks, any `pcb` part.',
  (rng) => drawPcb(rng));

const heatsinkFins = surface('tex.heatsink-fins', 'Heatsink fins', ['heatsink', 'solder'],
  'Vertical cooling fins: ink gap, shaded left face, lit right edge, cut by cross slots. Heatsinks, radiators, organ pipes.',
  (rng) => {
    const buf = texNew(64, 64, C('heatsink'));
    // Per 16 px fin: ink gap, shaded screen-left face, body, lit screen-right edge (light is upper screen-right).
    for (let x = 0; x < 64; x += 16) {
      texRect(buf, x, 0, 2, 64, INK);
      texRect(buf, x + 2, 0, 4, 64, C('heatsink', 1));
      texRect(buf, x + 14, 0, 2, 64, C('solder'));
    }
    const cut = 8 * rng.int(1, 6);
    for (const y of [cut, cut + 8 * rng.int(3, 4)]) {
      texRect(buf, 0, y, 64, 2, INK);
      texRect(buf, 0, y + 2, 64, 2, C('heatsink', 2));
    }
    return buf;
  });

const chipLabel = surface('tex.chip-label', 'Chip label', ['silicon', 'rubber', 'heatsink'],
  'Black silicon package with laser-etched part number, lot code, pin-1 dot and a bar code. Chips, the SSD, the CPU die.',
  (rng) => {
    const buf = texNew(128, 128, C('silicon'));
    const etch = C('heatsink'), dim = C('heatsink', 1);
    texFrame(buf, 6, 6, 116, 116, C('rubber'), 2);
    texRing(buf, 22, 22, 7, dim, 2);
    texPolygon(buf, [[98, 14], [112, 14], [105, 30]], dim);
    const part = `${rng.pick(['HT', 'KX', 'ZN', 'MW'])}${rng.int(1000, 9999)}`;
    texText(buf, part, Math.floor((128 - texTextWidth(part, 3)) / 2), 40, etch, 3);
    const lot = `0X${texHexByte(rng.int(0, 255))}${texHexByte(rng.int(0, 255))}-${rng.pick(['A', 'B', 'C', 'F'])}`;
    texText(buf, lot, Math.floor((128 - texTextWidth(lot, 2)) / 2), 64, dim, 2);
    const date = `${rng.int(10, 52)}${rng.int(70, 99)} ${rng.pick(['TW', 'MY', 'KR', 'JP'])}`;
    texText(buf, date, Math.floor((128 - texTextWidth(date, 2)) / 2), 82, dim, 2);
    for (let x = 20; x < 106;) {
      const w = rng.pick([2, 2, 4, 6]);
      texRect(buf, x, 100, w, 12, etch);
      x += w + rng.pick([2, 2, 4]);
    }
    return buf;
  });

const cautionStripes = surface('tex.caution-stripes', 'Caution stripes', ['powerAmber'],
  'Amber and ink hazard diagonals. Edges of gaps, the furnace, anything that hurts but is not malware.',
  (rng) => {
    const buf = texNew(64, 64, C('powerAmber'));
    const dir = rng.chance(0.5) ? '/' : '\\';
    const offset = 8 * rng.int(0, 3);
    texStripes(buf, C('powerAmber', 1), { period: 32, width: 20, dir, offset });
    texStripes(buf, INK, { period: 32, width: 16, dir, offset });
    return buf;
  });

const paperLines = surface('tex.paper-lines', 'Paper with text lines', ['plastic'],
  'Document paper: a title and ragged ink text lines. Files, scrolls, logs, tombstone inscriptions.',
  (rng) => {
    const buf = texNew(128, 128, PAPER);
    texRect(buf, 10, 0, 2, 128, C('plastic', 1));
    texText(buf, rng.pick(['README', 'LOG', 'NOTES', 'TODO', 'FATAL']), 18, 8, INK, 2);
    texRect(buf, 18, 22, 96, 2, C('plastic'));
    for (let row = 0; row < 6; row++) {
      const y = 32 + row * 16;
      const end = rng.chance(0.3) ? rng.int(48, 80) : 116;
      for (let x = 18; ;) {
        const len = 4 * rng.int(2, 6);
        if (x + len > end) break;
        texRect(buf, x, y, len, 4, INK);
        x += len + 4;
      }
    }
    return buf;
  });

const crosshatch = surface('tex.crosshatch', 'Ink crosshatch', [],
  'Ink shading on paper: single hatch with patches of cross hatch. Shadow sides, stone, old plastic, comic gutters.',
  (_rng, seed) => {
    const buf = texNew(64, 64, PAPER);
    const field = texNoiseField(64, 64, 32, seed);
    texCrosshatch(buf, INK, { spacing: 8, thickness: 2, dirs: '/' });
    texCrosshatch(buf, INK, { spacing: 8, thickness: 2, dirs: '\\', mask: (x, y) => field(x & ~3, y & ~3) > 0.5 });
    return buf;
  });

const halftone = surface('tex.halftone', 'Ben-Day halftone', [],
  'Ben-Day dots in three stepped sizes, ink on paper. Printed-page shading for flat panels and captions.',
  (_rng, seed) => {
    const buf = texNew(64, 64, PAPER);
    const field = texNoiseField(64, 64, 32, seed);
    texHalftone(buf, INK, { cell: 8, radius: (cx, cy) => [2, 2.6, 3.3][Math.min(2, Math.floor(field(cx, cy) * 3))]! });
    return buf;
  });

const glyphRain = surface('tex.glyph-rain', 'Glyph rain', ['phosphor', 'glass', 'pcbDark'],
  'Code rain: columns of katakana-like marks, pale head, phosphor trail fading in cel steps. Screens, portals, the core.',
  (rng) => {
    const buf = texNew(128, 128, C('pcbDark', 2));
    // Streaks hang at any height (writes wrap), 12 px per glyph, so they read as falling columns, not as text rows.
    for (let col = 0; col < 16; col++) {
      if (rng.chance(0.3)) continue;
      const head = 2 * rng.int(0, 63), len = rng.int(4, 8);
      for (let k = 0; k < len; k++) {
        const hex = k === 0 ? C('glass') : k <= 2 ? C('phosphor') : k <= 4 ? C('phosphor', 1) : C('phosphor', 2);
        texKana(buf, rng.int(0, 15), col * 8, head - k * 12, hex, 2);
      }
    }
    return buf;
  });

const hexDump = surface('tex.hex-dump', 'Hex dump', ['phosphor', 'powerAmber', 'dataCyan'],
  'Rows of hex bytes on a dark terminal, a few highlighted. Memory, data crates, terminals, RAM-slot walls.',
  (rng) => {
    const buf = texNew(128, 128, INK);
    const hot = rng.int(0, 7), hotAt = rng.int(0, 3);
    for (let row = 0; row < 8; row++) {
      for (let i = 0; i < 6; i++) {
        const zero = rng.chance(0.2);
        const byte = zero ? 0 : rng.int(1, 255);
        const hex = row === hot && i >= hotAt && i < hotAt + 3 ? C('powerAmber') : zero ? C('phosphor', 2) : rng.chance(0.1) ? C('dataCyan') : C('phosphor', 1);
        texText(buf, texHexByte(byte), 6 + i * 20, 4 + row * 16, hex, 2);
      }
    }
    return buf;
  });

const ribbonCable = surface('tex.ribbon-cable', 'Ribbon cable', ['heatsink', 'solder', 'lockRed'],
  'Flat grey ribbon cable: parallel wires, one red, with a fold. Cobwebs, hanging cables, bridges.',
  (rng) => {
    const buf = texNew(64, 64, C('heatsink'));
    const red = rng.int(0, 7), fold = 8 * rng.int(1, 6);
    for (let wire = 0; wire < 8; wire++) {
      const x = wire * 8;
      texRect(buf, x, 0, 2, 64, C('heatsink', 2));
      // Lit edge on the screen-right of each wire: light is upper screen-right.
      texRect(buf, x + 2, 0, 4, 64, wire === red ? C('lockRed', 1) : C('heatsink'));
      texRect(buf, x + 6, 0, 2, 64, wire === red ? C('lockRed') : C('solder'));
      texRect(buf, x + 2, fold, 6, 4, wire === red ? C('lockRed', 2) : C('heatsink', 1));
    }
    return buf;
  });

const platter = surface('tex.platter', 'Drive platter', ['silicon', 'solder', 'heatsink', 'gold', 'plastic'],
  'One hard-drive platter per tile: grooves, a light wedge, a spindle hub. Disc faces in drive bays and tar crates.',
  (rng) => {
    const buf = texNew(128, 128, C('silicon'));
    const cx = 64, cy = 64;
    texDisc(buf, cx, cy, 60, INK);
    texDisc(buf, cx, cy, 58, C('solder'));
    const a = rng.range(4.8, 5.6); // bright wedge upper-right, toward the light
    texRing(buf, cx, cy, 56, C('plastic'), 32, a, a + 0.5);
    texRing(buf, cx, cy, 56, C('heatsink', 1), 32, a + Math.PI, a + Math.PI + 0.5);
    for (let r = 54 - rng.int(0, 3); r > 26; r -= rng.int(6, 10)) texRing(buf, cx, cy, r, C('heatsink'), 2);
    texDisc(buf, cx, cy, 20, INK);
    texDisc(buf, cx, cy, 18, C('heatsink'));
    texDisc(buf, cx, cy, 9, INK);
    texDisc(buf, cx, cy, 7, C('gold'));
    texDisc(buf, cx, cy, 2.5, INK);
    return buf;
  });

const corruption = surface('tex.corruption', 'Malware corruption', ['pcb', 'pcbDark', 'gold', 'solder', 'corruptMagenta', 'corruptViolet', 'voidPurple', 'toxicGreen'],
  'A PCB being eaten: displaced rows, magenta / violet glitch blocks, void holes. Infected hardware and malware bodies.',
  (rng, seed) => {
    const buf = drawPcb(rng);
    // Torn rows: bands of the board shifted sideways (stays on palette, stays tileable).
    for (let i = 0; i < 4; i++) {
      const y = 4 + 8 * rng.int(0, 15), h = rng.pick([4, 8]), shift = 8 * rng.int(1, 4);
      const rows: number[] = [];
      for (let j = 0; j < h; j++) for (let x = 0; x < 128; x++) rows.push(texGet(buf, x + shift, y + j));
      for (let j = 0; j < h; j++) for (let x = 0; x < 128; x++) texRect(buf, x, y + j, 1, 1, rows[j * 128 + x]!);
    }
    // The infection front: blobs quantized to an 8 px block grid.
    const field = texNoiseField(128, 128, 32, seed + 17, 2);
    for (let by = 0; by < 16; by++) {
      for (let bx = 0; bx < 16; bx++) {
        const v = field(bx * 8 + 4, by * 8 + 4);
        if (v > 0.64) texRect(buf, bx * 8, by * 8, 8, 8, C('voidPurple'));
        else if (v > 0.57) texRect(buf, bx * 8, by * 8, 8, 8, rng.chance(0.5) ? C('corruptMagenta') : C('corruptViolet'));
        else if (v > 0.52) {
          for (let q = 0; q < 4; q++) if (rng.chance(0.45)) texRect(buf, bx * 8 + (q % 2) * 4, by * 8 + (q >> 1) * 4, 4, 4, C('corruptMagenta'));
        }
        if (v > 0.64 && rng.chance(0.12)) texRect(buf, bx * 8 + 2, by * 8 + 2, 4, 4, C('toxicGreen'));
      }
    }
    // Glitch bars.
    for (let i = 0; i < 7; i++) {
      const hex = rng.pick([C('corruptMagenta'), C('corruptViolet'), C('toxicGreen'), C('corruptMagenta')]);
      texRect(buf, 4 * rng.int(0, 31), 4 * rng.int(0, 31), 8 * rng.int(2, 6), rng.pick([2, 4]), hex);
    }
    return buf;
  });

function sparkle(buf: PixelBuffer, x: number, y: number, r: number, hex: number): void {
  texRect(buf, x - r, y - 1, r * 2, 2, hex);
  texRect(buf, x - 1, y - r, 2, r * 2, hex);
}

const ice = surface('tex.ice', 'Ice (SIGSTOP)', ['ice', 'glass'],
  'Frozen process: big pale shards with white fracture lines and sparkles. Skin for anything stopped with SIGSTOP.',
  (rng, seed) => {
    const buf = texNew(128, 128, C('ice'));
    texCellNoise(buf, { points: 7, seed, colors: [C('ice'), C('glass'), C('ice', 1)], weights: [5, 2, 3], edge: PAPER, edgeWidth: 3 });
    for (let i = 0; i < 4; i++) sparkle(buf, rng.int(0, 127), rng.int(0, 127), rng.pick([4, 6]), PAPER);
    return buf;
  });

const stone = surface('tex.stone', 'Stone (chmod -x)', ['heatsink', 'solder'],
  'Petrified executable: grey blocks, ink cracks, hatched shadow faces, pits. The gargoyle after chmod -x, tombstones.',
  (rng, seed) => {
    const buf = texNew(128, 128, C('heatsink'));
    texCellNoise(buf, { points: 16, seed, colors: [C('heatsink'), C('heatsink', 1), C('solder')], weights: [5, 3, 2], edge: INK, edgeWidth: 3 });
    const shade = C('heatsink', 1);
    const shaded = new Uint8Array(128 * 128);
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) shaded[y * 128 + x] = texGet(buf, x, y) === shade ? 1 : 0;
    texCrosshatch(buf, C('heatsink', 2), { spacing: 8, thickness: 2, dirs: '/', mask: (x, y) => shaded[(y & 127) * 128 + (x & 127)] === 1 });
    for (let i = 0; i < 6; i++) texDisc(buf, rng.int(0, 127), rng.int(0, 127), rng.pick([2, 3]), INK);
    return buf;
  });

const grille = surface('tex.grille', 'Port grille', ['heatsink', 'solder'],
  'Punched metal mesh: staggered ink holes with a lit lower-left rim, a few clogged. Speaker faces, firewall grilles, vents.',
  (rng) => {
    const buf = texNew(64, 64, C('heatsink'));
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 4; col++) {
        const cx = col * 16 + (row % 2 ? 12 : 4), cy = row * 8 + 4;
        texDisc(buf, cx - 1, cy + 1, 3, C('solder')); // lit inner wall on the lower-left: light is upper screen-right
        texDisc(buf, cx, cy, 3, rng.chance(0.08) ? C('heatsink', 1) : INK);
      }
    }
    return buf;
  });

const deckPlate = surface('tex.deck-plate', 'Dark deck plate', ['silicon', 'rubber', 'pcbDark'],
  'Dark, low-contrast ground: bolted silicon deck plates with faint buried traces. Squarish dark faces beside actors (plinths, floor tiles, wall blocks); stretched on a long apron box it smears.',
  (rng) => {
    // Everything stays near silicon's luma: the floor must not compete with the feet standing on it.
    const buf = texNew(64, 64, C('silicon'));
    const trace = C('pcbDark', 2);
    const ty = 4 + 8 * rng.int(0, 6);
    texRect(buf, 0, ty, 64, 2, trace);
    texRect(buf, 8 * rng.int(0, 7) + 4, 0, 2, 64, trace);
    for (const x of [0, 32]) texRect(buf, x, 0, 2, 64, C('silicon', 1));
    for (const y of [0, 32]) texRect(buf, 0, y, 64, 2, C('silicon', 1));
    for (const x of [6, 26, 38, 58]) for (const y of [6, 26, 38, 58]) texRect(buf, x - 1, y - 1, 2, 2, C('rubber'));
    return buf;
  });

export const SURFACE_TEXTURES: readonly TexEntry[] = [
  pcbTraces, heatsinkFins, chipLabel, cautionStripes, paperLines, crosshatch, halftone, glyphRain,
  hexDump, ribbonCable, platter, corruption, ice, stone, grille, deckPlate,
];
