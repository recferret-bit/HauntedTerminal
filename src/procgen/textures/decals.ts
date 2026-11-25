import { INK, PAPER } from '../core/palette.js';
import { makeRng } from '../core/rng.js';
import { texText } from './font.js';
import {
  texCellNoise, texColor as C, texDisc, texInkOutline, texNew, texNewDecal, texPolygon, texRect, texRing, type TexEntry,
} from './toolkit.js';

/**
 * Decals: cut-out stickers with hard alpha (0 or 255) and a 2 px ink outline. Not tileable.
 * Put them on a thin part with `outline: false`.
 */

const pidTag: TexEntry = {
  id: 'tex.decal.pid-tag', label: 'PID tag', usage: 'decal', tileable: false, zones: ['lockRed'],
  purpose: 'A paper luggage tag reading PID and a process number (the seed picks it). Chest of zombie processes and daemons.',
  build: (seed) => {
    const buf = texNewDecal(64, 32);
    const rng = makeRng(seed);
    texPolygon(buf, [[9, 3], [61, 3], [61, 29], [9, 29], [3, 23], [3, 9]], PAPER);
    texRect(buf, 9, 25, 52, 4, C('lockRed'));
    texDisc(buf, 8, 14, 2, INK);
    texText(buf, 'PID', 13, 10, INK, 2);
    texText(buf, String(rng.int(100, 999)), 38, 10, INK, 2);
    texInkOutline(buf, 2);
    return buf;
  },
};

const rwxLock: TexEntry = {
  id: 'tex.decal.rwx-lock', label: 'rwx padlock', usage: 'decal', tileable: false, zones: ['gold', 'solder', 'lockRed', 'phosphor'],
  purpose: 'A padlock stamped RWX with three permission lamps (red denied, green granted; the seed picks them). Locked doors and files.',
  build: (seed) => {
    const buf = texNewDecal(64, 64);
    const rng = makeRng(seed);
    texRing(buf, 32, 22, 15, C('solder'), 6);
    texRing(buf, 32, 22, 15, C('solder', 1), 2, Math.PI, Math.PI * 1.5); // shaded on the screen-left: light is upper screen-right
    texRect(buf, 9, 24, 46, 36, C('gold'));
    texRect(buf, 9, 24, 46, 2, INK);
    texRect(buf, 9, 54, 46, 6, C('gold', 1));
    // R and X from the font; W drawn 5 wide, because a 3 px W reads as an H.
    texText(buf, 'R', 12, 29, INK, 3);
    ['10001', '10001', '10101', '10101', '01010'].forEach((bits, r) => {
      for (let c = 0; c < 5; c++) if (bits[c] === '1') texRect(buf, 24 + c * 3, 29 + r * 3, 3, 3, INK);
    });
    texText(buf, 'X', 42, 29, INK, 3);
    for (let i = 0; i < 3; i++) {
      texRect(buf, 15 + i * 12, 46, 10, 6, INK);
      texRect(buf, 17 + i * 12, 48, 6, 2, rng.chance(0.25) ? C('phosphor') : C('lockRed'));
    }
    texInkOutline(buf, 2);
    return buf;
  },
};

const bolt: TexEntry = {
  id: 'tex.decal.bolt', label: 'Lightning bolt', usage: 'decal', tileable: false, zones: ['powerAmber'],
  purpose: 'The power mark: an amber zigzag bolt (the seed nudges the zigzag). Energy cells, fuse boxes, high-voltage warnings.',
  build: (seed) => {
    const buf = texNewDecal(64, 64);
    const rng = makeRng(seed);
    const j = (): number => rng.int(-2, 2);
    const ax = 15 + j(), bx = 49 + j(), tip = 22 + j();
    texPolygon(buf, [[36, 3], [ax, 35], [28, 35], [tip, 61], [bx, 25], [35, 25], [47, 3]], C('powerAmber'));
    // Light is upper screen-right: shade along the lower limb's left edge, a paper glint inside the upper limb's right edge.
    texPolygon(buf, [[28, 35], [tip, 61], [34, 35]], C('powerAmber', 1));
    texPolygon(buf, [[41, 6], [45, 6], [35, 24], [32, 24]], PAPER);
    texInkOutline(buf, 2);
    return buf;
  },
};

const clayCracks: TexEntry = {
  id: 'tex.clay_cracks', label: 'Molten clay cracks', usage: 'surface', tileable: true,
  zones: ['clayOrange', 'copper', 'corruptMagenta', 'malwareEye'],
  purpose: 'Cracked terracotta golem skin with stepped diagonal magenta/yellow fissure seams. CPU/albedo base for agent.clod.',
  build: (seed) => {
    const buf = texNew(64, 64, C('clayOrange'));
    const rng = makeRng(seed);
    texCellNoise(buf, {
      points: 5, seed,
      colors: [C('clayOrange'), C('clayOrange'), C('copper')],
      weights: [6, 3, 2],
      edge: INK, edgeWidth: 3,
    });
    const shift = 4 * rng.int(0, 3);
    for (let s = 0; s < 4; s++) {
      const lx = (8 + s * 4 + shift) % 64;
      const ly = (8 + s * 6) % 64;
      texRect(buf, lx, ly, 4, 8, C('corruptMagenta'));
      if (s === 1) texRect(buf, lx, ly + 2, 4, 4, C('malwareEye'));
      const rx = (48 - s * 4 + shift + 64) % 64;
      const ry = (34 + s * 6) % 64;
      texRect(buf, rx, ry, 4, 8, C('corruptMagenta'));
      if (s === 2) texRect(buf, rx, ry + 2, 4, 4, C('malwareEye'));
    }
    return buf;
  },
};

const coffeeBrew: TexEntry = {
  id: 'tex.coffee_brew', label: 'Dark-roast coffee & crema', usage: 'surface', tileable: true,
  zones: ['gravyBrown', 'copper'],
  purpose: 'Dark-roast espresso well ringed by golden crema and paper steam highlights. CPU/albedo base for agent.antigravy.',
  build: (seed) => {
    const buf = texNew(64, 64, C('gravyBrown', 2));
    const rng = makeRng(seed);
    const a0 = rng.range(0.4, 1.8);
    for (const [cx, cy, r] of [[0, 0, 20], [32, 32, 20]] as const) {
      texDisc(buf, cx, cy, r + 2, INK);
      texDisc(buf, cx, cy, r, C('copper'));
      texDisc(buf, cx, cy, r - 6, C('gravyBrown', 2));
      texRing(buf, cx, cy, r - 2, PAPER, 4, a0, a0 + 1.4);
      texDisc(buf, cx, cy, 5, INK);
    }
    return buf;
  },
};

const accretionHalo: TexEntry = {
  id: 'tex.accretion_halo', label: 'Accretion vortex halo', usage: 'surface', tileable: true,
  zones: ['corruptMagenta', 'corruptViolet', 'voidPurple', 'malwareEye'],
  purpose: 'Concentric relativistic planetary ring bands around an event-horizon core. CPU/albedo base for agent.gork.',
  build: (seed) => {
    const buf = texNew(64, 64, C('corruptViolet'));
    const rng = makeRng(seed);
    const shift = 4 * rng.int(0, 7);
    texRect(buf, 0, 14, 64, 36, C('voidPurple'));
    texRect(buf, 0, 18, 64, 28, C('corruptMagenta'));
    texRect(buf, 0, 24, 64, 16, PAPER);
    for (let i = 0; i < 2; i++) {
      const x = (shift + i * 32) % 64;
      const w = 16;
      const span = Math.min(w, 64 - x);
      texRect(buf, x, 26, span, 12, C('malwareEye'));
      if (span < w) texRect(buf, 0, 26, w - span, 12, C('malwareEye'));
    }
    return buf;
  },
};

const crtCode: TexEntry = {
  id: 'tex.crt_code', label: 'CRT dark screen', usage: 'surface', tileable: true, staticLayout: true,
  zones: ['codecNavy', 'codecSteel'],
  purpose: 'Clean dark recessed CRT monitor glass framing the >_ prompt symbols without code lines. CPU/albedo base for agent.codec.',
  build: () => {
    const buf = texNew(64, 64, C('codecNavy', 1));
    texRect(buf, 4, 4, 56, 56, C('codecNavy', 2));
    texRect(buf, 8, 8, 48, 48, INK);
    return buf;
  },
};

export const DECAL_TEXTURES: readonly TexEntry[] = [
  pidTag, rwxLock, bolt, clayCracks, coffeeBrew, accretionHalo, crtCode,
];
