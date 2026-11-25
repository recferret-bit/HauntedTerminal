import { INK, PAPER, type ZoneId } from '../core/palette.js';
import { makeRng, type Rng } from '../core/rng.js';
import type { PixelBuffer } from '../core/types.js';
import { texText } from './font.js';
import { texColor as C, texDisc, texLine, texNew, texRect, type TexEntry } from './toolkit.js';

export function surface(id: string, label: string, zones: TexEntry['zones'], purpose: string, build: (rng: Rng, seed: number) => PixelBuffer): TexEntry {
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

function via(buf: PixelBuffer, x: number, y: number, ringHex: number): void {
  texDisc(buf, x, y, 5, INK);
  texDisc(buf, x, y, 4, ringHex);
  texDisc(buf, x, y, 1.5, INK);
}

interface TextoliteBoardConfig {
  base: ZoneId;
  traceHex: number;
  viaRing: ZoneId;
  refs: readonly string[];
}

/** Shared 128 px colored-textolite generator (45-deg trace bundles, pads, vias, silkscreen refs). */
export function drawTextolitePcb(rng: Rng, cfg: TextoliteBoardConfig): PixelBuffer {
  const buf = texNew(128, 128, C(cfg.base));
  const ringHex = C(cfg.viaRing);
  for (let lane = 0; lane < 2; lane++) {
    const top = lane * 64;
    busBundle(buf, rng, top + 5, rng.int(3, 4), 8, 16, cfg.traceHex, 3);
    // The free strip under each bundle (top + 50 .. top + 69) carries pads, vias and silk-screen.
    const start = 4 + 8 * rng.int(0, 15);
    if (lane === rng.int(0, 1)) {
      const pads = rng.int(4, 6);
      for (let i = 0; i < pads; i++) {
        texRect(buf, start + i * 12 - 1, top + 53, 8, 12, INK);
        texRect(buf, start + i * 12, top + 54, 6, 10, C('solder'));
        texRect(buf, start + i * 12, top + 61, 6, 3, C('solder', 1));
      }
      texText(buf, rng.pick(cfg.refs), start + pads * 12 + 6, top + 54, PAPER, 2);
    } else {
      const n = rng.int(3, 4);
      for (let i = 0; i < n; i++) via(buf, start + i * 16 + 6, top + 59, ringHex);
      texText(buf, rng.pick(cfg.refs), start + n * 16 + 6, top + 54, PAPER, 2);
    }
  }
  return buf;
}

/** Standard green FR-4 board shared by `tex.pcb-traces` and `tex.corruption`. */
export function drawPcb(rng: Rng): PixelBuffer {
  return drawTextolitePcb(rng, {
    base: 'pcb',
    traceHex: C('pcbDark'),
    viaRing: 'gold',
    refs: ['R12', 'C3', 'U7', 'Q2', 'D5', 'L1', 'J4', 'C40'],
  });
}

export const PCB_SURFACE_TEXTURES: readonly TexEntry[] = [
  surface('tex.pcb-amber', 'Amber phenolic PCB', ['pcbAmber', 'copper', 'solder'],
    'Vintage amber phenolic textolite: copper-sheen traces, vias, solder pads, transistor refs.',
    (rng) => drawTextolitePcb(rng, {
      base: 'pcbAmber',
      traceHex: C('pcbAmber', 1),
      viaRing: 'copper',
      refs: ['Q1', 'T4', 'R8', 'C12', 'TR2', 'VR1', 'BJT', 'DZ3'],
    })),
  surface('tex.pcb-blue', 'Sapphire blue PCB', ['pcbBlue', 'gold', 'solder'],
    'Sapphire blue GPU/workstation PCB: routed trace bundles, gold vias, pads, GPU silkscreen.',
    (rng) => drawTextolitePcb(rng, {
      base: 'pcbBlue',
      traceHex: C('pcbBlue', 1),
      viaRing: 'gold',
      refs: ['GPU0', 'VRAM', 'U12', 'PCIE', 'SHDR', 'MEM1', 'PLL', 'CLK'],
    })),
  surface('tex.pcb-red', 'Crimson textolite PCB', ['pcbRed', 'gold', 'solder'],
    'Oxide crimson high-clock PCB: trace bundles, gold vias, pads, DIMM/VRM silkscreen.',
    (rng) => drawTextolitePcb(rng, {
      base: 'pcbRed',
      traceHex: C('pcbRed', 1),
      viaRing: 'gold',
      refs: ['DIMM', 'OC1', 'VRM', 'CAS', 'DDR5', 'XMP', 'VDD', 'ECC'],
    })),
  surface('tex.pcb-black', 'Matte black server PCB', ['pcbBlack', 'heatsink', 'gold', 'solder'],
    'Matte black enterprise server PCB: recessed grey traces, gold vias, pads, tensor silkscreen.',
    (rng) => drawTextolitePcb(rng, {
      base: 'pcbBlack',
      traceHex: C('heatsink', 2),
      viaRing: 'gold',
      refs: ['H100', 'TNSR', 'SXM5', 'NVL', 'FP8', 'BM0', 'CORE', 'DIE'],
    })),
];
