import { makeRng } from '../../core/rng.js';
import type { ModelSpec, PartSpec } from '../../core/types.js';
import {
  greebleCable, greebleContactTeeth, greebleHeatsinkFins, greebleLed, greebleRibbonCable,
  kitBox, kitDisc, kitPlate, outlineChamferRect, outlineRoundRect, outlineStroke, SCREEN_LEFT, SCREEN_RIGHT,
} from '../../kit/greebles.js';
import { makeFanUnit, makeRamStick, pickBoardTheme } from './shared.js';

// ---------------------------------------------------------------- prop.wire_loom

export function buildWireLoom(seed: number): ModelSpec {
  const rng = makeRng(seed);
  const sleeve = pickBoardTheme(seed, rng, 'pcbRed').zone;
  const sag1 = rng.range(0.14, 0.24);
  const parts: PartSpec[] = [
    kitBox('base', [0.8, 0.14, 0.28], 'rubber', [0, 0.07, 0.02]),
    kitBox('comb', [0.72, 0.11, 0.22], 'rubber', [0, 0.78, 0]),
    ...greebleCable({ name: 'cable.a', from: [0.24, 0.1, 0.02], to: [0.22, 0.78, 0], sag: -0.06, radius: 0.036, zone: 'copper' }),
    ...greebleCable({ name: 'cable.b', from: [0, 0.1, 0.04], to: [-0.02, 0.78, 0.02], sag: -0.04, radius: 0.042, zone: sleeve }),
    ...greebleCable({ name: 'cable.c', from: [-0.24, 0.1, 0.02], to: [-0.22, 0.78, 0], sag: -0.07, radius: 0.038, zone: 'rubber' }),
    ...greebleRibbonCable({ name: 'ribbon', from: [0.28, 0.76], to: [-0.28, 0.14], z: -0.03, width: 0.13, sag: sag1, zone: 'solder', markZone: 'copper' }),
  ];
  const dangle = (id: string, x: number, drop: number, phase: number): PartSpec[] => {
    const pivot: [number, number, number] = [x, 0.75, -0.04];
    const anim = { type: 'swing' as const, axis: 'z' as const, amp: 0.11, speed: 0.4, phase, pivot };
    return [
      kitPlate(`${id}.cord`, outlineStroke([[0, 0], [0.02 * Math.sign(x || 1), -drop]], 0.048), 0.035, 'rubber', pivot, { anim }),
      kitBox(`${id}.plug`, [0.08, 0.1, 0.06], 'gold', [x + 0.02 * Math.sign(x || 1), 0.75 - drop - 0.03, -0.04], { anim }),
    ];
  };
  parts.push(...dangle('lead.l', 0.26 * SCREEN_LEFT, rng.range(0.32, 0.44), 0.1));
  parts.push(...dangle('lead.r', 0.26 * SCREEN_RIGHT, rng.range(0.24, 0.36), 0.55));
  return { id: 'prop.wire_loom', category: 'prop', label: 'Wire loom', parts, sockets: { label: [0, 0.98, 0], fx: [0, 0.45, -0.14] } };
}

// ---------------------------------------------------------------- prop.gpu_card

export function buildGpuCard(seed: number): ModelSpec {
  const rng = makeRng(seed);
  const board = pickBoardTheme(seed, rng, 'pcbBlue');
  const cy = 0.43;
  const fans = seed % 2 === 0 ? 3 : 2;
  const shroudW = 0.94;
  const parts: PartSpec[] = [
    kitBox('riser', [0.88, 0.12, 0.26], 'silicon', [0, 0.06, 0.02]),
    ...greebleContactTeeth({ name: 'pcie', pos: [0.04 * SCREEN_LEFT, 0.13, 0.01], width: 0.54, count: 6, toothLength: 0.075, bar: 0.03, depth: 0.04, zone: 'gold' }),
    kitPlate('pcb', outlineRoundRect(1.02, 0.58, 0.03, 2), 0.07, board.zone, [0, cy, 0.04], { texture: board.texture }),
    kitPlate('shroud', outlineChamferRect(shroudW, 0.46, 0.06), 0.12, 'silicon', [0.01 * SCREEN_LEFT, cy - 0.01, -0.03]),
    kitPlate('pipe.top', outlineStroke([[-0.32, 0], [0, 0.07], [0.32, 0]], 0.055), 0.07, 'copper', [0, cy + 0.26, 0.01]),
    kitBox('pwr8pin', [0.16, 0.1, 0.1], 'gold', [0.32 * SCREEN_RIGHT, cy + 0.27, -0.01]),
  ];
  const span = 0.66;
  const r = fans === 3 ? 0.11 : 0.155;
  for (let i = 0; i < fans; i++) {
    const fx = -span / 2 + (span / Math.max(1, fans - 1)) * i;
    parts.push(...makeFanUnit({
      name: `fan${i}`,
      pos: [fx, cy - 0.01, -0.095],
      radius: r,
      blades: 5,
      speed: i % 2 === 0 ? 1.4 : -1.4,
      ringZone: 'silicon',
    }));
  }
  return { id: 'prop.gpu_card', category: 'prop', label: 'Discrete GPU', parts, sockets: { label: [0, 0.85, 0], fx: [0, cy, -0.18] } };
}

// ---------------------------------------------------------------- prop.gpu_server

export function buildGpuServer(seed: number): ModelSpec {
  const rng = makeRng(seed);
  const board = pickBoardTheme(seed, rng, 'pcbBlack');
  const ledZone = rng.chance(0.5) ? 'dataCyan' : 'phosphor';
  const cy = 0.43;
  const parts: PartSpec[] = [
    kitBox('tray', [0.96, 0.15, 0.3], 'silicon', [0, 0.075, 0.02]),
    kitPlate('sxm_pcb', outlineRoundRect(1.02, 0.64, 0.03, 2), 0.08, board.zone, [0, cy, 0.04], { texture: board.texture }),
    kitBox('coldplate', [0.84, 0.46, 0.08], 'silicon', [0, cy - 0.02, -0.02]),
    ...greebleHeatsinkFins({
      name: 'vapor',
      pos: [0, cy + 0.01, -0.04],
      width: 0.78,
      height: 0.38,
      depth: 0.12,
      fins: 8,
      base: 0.08,
      zone: 'heatsink',
      texture: 'tex.heatsink-fins',
    }),
    kitBox('pipe.cap', [0.76, 0.06, 0.09], 'copper', [0, cy + 0.24, -0.01]),
    kitBox('bus.l', [0.09, 0.48, 0.06], 'gold', [0.43 * SCREEN_LEFT, cy, -0.01]),
    kitBox('bus.r', [0.09, 0.48, 0.06], 'gold', [0.43 * SCREEN_RIGHT, cy, -0.01]),
    ...greebleLed({ name: 'led', pos: [0.36 * SCREEN_LEFT, cy + 0.24, -0.02], radius: 0.032, zone: ledZone, bezelZone: 'silicon', blink: 0.7 }),
  ];
  return { id: 'prop.gpu_server', category: 'prop', label: 'Tensor GPU sled', parts, sockets: { label: [0, 0.88, 0], fx: [0, cy, -0.18] } };
}

// ---------------------------------------------------------------- prop.ram_bank

export function buildRamBank(seed: number): ModelSpec {
  const rng = makeRng(seed);
  const t0 = pickBoardTheme(seed, rng, 'pcbRed');
  const parts: PartSpec[] = [
    kitBox('dock', [0.88, 0.14, 0.34], 'silicon', [0, 0.07, 0]),
    kitBox('latch.l', [0.1, 0.2, 0.24], 'plastic', [0.38 * SCREEN_LEFT, 0.13, -0.01]),
    kitBox('latch.r', [0.1, 0.2, 0.24], 'plastic', [0.38 * SCREEN_RIGHT, 0.13, -0.01]),
    ...makeRamStick({ name: 'dimm0', x: 0.22 * SCREEN_LEFT, baseY: 0.1, z: 0.08, width: 0.22, height: 0.76, zone: t0.zone, texture: t0.texture }),
    ...makeRamStick({ name: 'dimm1', x: 0, baseY: 0.1, z: 0, width: 0.22, height: 0.84, zone: t0.zone, texture: t0.texture }),
    ...makeRamStick({ name: 'dimm2', x: 0.22 * SCREEN_RIGHT, baseY: 0.1, z: -0.07, width: 0.22, height: 0.72, zone: t0.zone, texture: t0.texture, spreader: true }),
  ];
  return { id: 'prop.ram_bank', category: 'prop', label: 'DIMM memory bank', parts, sockets: { label: [0, 1.05, 0], fx: [0, 0.5, -0.15] } };
}

// ---------------------------------------------------------------- prop.transistor

export function buildTransistor(seed: number): ModelSpec {
  const rng = makeRng(seed);
  const board = pickBoardTheme(seed, rng, 'pcbAmber');
  const parts: PartSpec[] = [
    kitBox('board', [0.78, 0.09, 0.32], board.zone, [0, 0.045, 0], { texture: board.texture }),
    // TO-220 power MOSFET (screen-left).
    kitBox('mos.legs', [0.22, 0.2, 0.05], 'solder', [0.18 * SCREEN_LEFT, 0.17, 0]),
    kitBox('mos.body', [0.3, 0.3, 0.12], 'silicon', [0.18 * SCREEN_LEFT, 0.36, -0.01]),
    kitBox('mos.tab', [0.28, 0.18, 0.05], 'heatsink', [0.18 * SCREEN_LEFT, 0.55, 0.02]),
    kitDisc('mos.hole', 0.036, 0.015, 'ink', [0.18 * SCREEN_LEFT, 0.56, -0.01], { outline: false, sides: 10 }),
    // Pair of classic D-package TO-92 transistors + copper coil on screen-right.
    kitBox('bjt1.legs', [0.14, 0.18, 0.04], 'solder', [0.12 * SCREEN_RIGHT, 0.16, 0]),
    kitPlate('bjt1.cap', outlineRoundRect(0.2, 0.21, 0.06, 2), 0.1, 'silicon', [0.12 * SCREEN_RIGHT, 0.31, -0.01]),
    kitBox('bjt2.legs', [0.12, 0.14, 0.04], 'solder', [0.29 * SCREEN_RIGHT, 0.14, 0.03]),
    kitPlate('bjt2.cap', outlineRoundRect(0.16, 0.18, 0.05, 2), 0.09, 'silicon', [0.29 * SCREEN_RIGHT, 0.27, 0.02]),
    kitDisc('choke', 0.095, 0.08, 'copper', [0.02 * SCREEN_LEFT, 0.16, -0.08], { sides: 12 }),
  ];
  return { id: 'prop.transistor', category: 'prop', label: 'Transistor cluster', parts, sockets: { label: [0, 0.78, 0], fx: [0, 0.34, -0.14] } };
}
