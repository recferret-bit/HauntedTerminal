import { makeRng } from '../../core/rng.js';
import type { ModelSpec, PartSpec } from '../../core/types.js';
import {
  greebleCable, greebleHeatsinkFins, greebleLed, kitBox, kitDisc, kitPlate, outlineChamferRect, outlineStroke,
  SCREEN_LEFT, SCREEN_RIGHT,
} from '../../kit/greebles.js';
import { makeFanUnit } from './shared.js';

// ---------------------------------------------------------------- prop.indicator

export function buildIndicator(seed: number): ModelSpec {
  const rng = makeRng(seed);
  const parts: PartSpec[] = [
    kitBox('foot', [0.68, 0.1, 0.28], 'rubber', [0, 0.05, 0.02]),
    kitPlate('housing', outlineChamferRect(0.62, 0.78, 0.05), 0.18, 'silicon', [0, 0.47, 0]),
    // Recessed 7-segment POST code bay at top.
    kitBox('post.bay', [0.46, 0.22, 0.04], 'ink', [0, 0.67, -0.09], { outline: false }),
    kitBox('seg.a', [0.11, 0.032, 0.015], 'powerAmber', [0.11 * SCREEN_LEFT, 0.72, -0.112], { outline: false, anim: { type: 'blink', speed: 0.7, amp: 0.25 } }),
    kitBox('seg.b', [0.032, 0.11, 0.015], 'powerAmber', [0.06 * SCREEN_LEFT, 0.66, -0.112], { outline: false, anim: { type: 'blink', speed: 0.7, amp: 0.25, phase: 0.2 } }),
    kitBox('seg.c', [0.11, 0.032, 0.015], 'powerAmber', [0.11 * SCREEN_RIGHT, 0.61, -0.112], { outline: false, anim: { type: 'blink', speed: 1.1, amp: 0.4, phase: 0.5 } }),
    kitBox('seg.d', [0.032, 0.11, 0.015], 'powerAmber', [0.15 * SCREEN_RIGHT, 0.67, -0.112], { outline: false }),
    // Analog VU dial on lower screen-left.
    kitDisc('dial.face', 0.14, 0.04, 'plastic', [0.12 * SCREEN_LEFT, 0.34, -0.095], { sides: 14 }),
    kitBox('dial.needle', [0.036, 0.1, 0.015], 'ink', [0.12 * SCREEN_LEFT, 0.36, -0.118], {
      outline: false,
      anim: { type: 'swing', axis: 'z', speed: 0.8, amp: 0.65, phase: rng.next(), pivot: [0.12 * SCREEN_LEFT, 0.31, -0.118] },
    }),
  ];
  // 4-step LED load bar on lower screen-right.
  const barZones = ['phosphor', 'phosphor', 'powerAmber', 'lockRed'] as const;
  for (let i = 0; i < 4; i++) {
    parts.push(...greebleLed({
      name: `bar${i}`,
      pos: [0.16 * SCREEN_RIGHT, 0.23 + i * 0.085, -0.09],
      radius: 0.028,
      square: true,
      zone: barZones[i],
      bezelZone: 'rubber',
      anim: { type: 'blink', speed: 0.9 + i * 0.2, amp: 0.2 + i * 0.15, phase: i * 0.18 },
    }));
  }
  return { id: 'prop.indicator', category: 'prop', label: 'POST & telemetry indicator', parts, sockets: { label: [0, 0.98, 0], fx: [0, 0.5, -0.16] } };
}

// ---------------------------------------------------------------- prop.cooler_tower

export function buildCoolerTower(seed: number): ModelSpec {
  const rng = makeRng(seed);
  const cy = 0.5;
  const parts: PartSpec[] = [
    kitBox('coldplate', [0.54, 0.1, 0.3], 'copper', [0, 0.05, 0]),
    kitBox('pipe.l1', [0.06, 0.78, 0.08], 'copper', [0.22 * SCREEN_LEFT, 0.47, 0.02]),
    kitBox('pipe.l2', [0.06, 0.78, 0.08], 'copper', [0.09 * SCREEN_LEFT, 0.47, 0.02]),
    kitBox('pipe.r1', [0.06, 0.78, 0.08], 'copper', [0.09 * SCREEN_RIGHT, 0.47, 0.02]),
    kitBox('pipe.r2', [0.06, 0.78, 0.08], 'copper', [0.22 * SCREEN_RIGHT, 0.47, 0.02]),
    ...greebleHeatsinkFins({
      name: 'stack',
      pos: [0, cy, 0.01],
      width: 0.74,
      height: 0.62,
      depth: 0.26,
      fins: 7,
      base: 0.1,
      zone: 'heatsink',
      texture: 'tex.heatsink-fins',
    }),
    kitBox('topcap', [0.76, 0.08, 0.28], 'silicon', [0, 0.79, 0.01]),
    ...makeFanUnit({ name: 'blower', pos: [0, cy - 0.02, -0.14], radius: 0.21, blades: rng.pick([5, 7]), speed: 1.8 }),
  ];
  return { id: 'prop.cooler_tower', category: 'prop', label: 'Tower heatsink cooler', parts, sockets: { label: [0, 0.98, 0], fx: [0, cy, -0.2] } };
}

// ---------------------------------------------------------------- prop.cooler_aio

export function buildCoolerAio(seed: number): ModelSpec {
  const rng = makeRng(seed);
  const radX = 0.22 * SCREEN_LEFT;
  const pumpX = 0.26 * SCREEN_RIGHT;
  const parts: PartSpec[] = [
    kitBox('rad.base', [0.54, 0.08, 0.26], 'silicon', [radX, 0.04, 0.02]),
    kitBox('rad.frame', [0.5, 0.88, 0.22], 'silicon', [radX, 0.48, 0.02]),
    ...greebleHeatsinkFins({
      name: 'rad',
      pos: [radX, 0.48, -0.02],
      width: 0.42,
      height: 0.76,
      depth: 0.14,
      fins: 6,
      base: 0.08,
      zone: 'heatsink',
      texture: 'tex.heatsink-fins',
    }),
    kitBox('rad.cap', [0.52, 0.1, 0.24], 'copper', [radX, 0.91, 0.02]),
    ...makeFanUnit({ name: 'fan.hi', pos: [radX, 0.68, -0.1], radius: 0.14, blades: 5, speed: 1.6, ringZone: 'silicon' }),
    ...makeFanUnit({ name: 'fan.lo', pos: [radX, 0.3, -0.1], radius: 0.14, blades: 5, speed: 1.4, ringZone: 'silicon' }),
    // Rigid mounting rail + CPU pump block + braided coolant hoses connecting to radiator.
    kitBox('rail', [0.56, 0.06, 0.22], 'silicon', [(radX + pumpX) / 2, 0.03, 0.015]),
    kitBox('pump.plate', [0.36, 0.08, 0.28], 'copper', [pumpX, 0.04, 0.01]),
    kitBox('pump.body', [0.32, 0.24, 0.22], 'silicon', [pumpX, 0.18, 0]),
    ...greebleLed({ name: 'pump.ring', pos: [pumpX, 0.18, -0.11], radius: 0.05, zone: 'dataCyan', bezelZone: 'silicon', anim: { type: 'pulse', speed: 1.2, amp: 0.18 } }),
    ...greebleCable({ name: 'hose.a', from: [radX - 0.15, 0.82, -0.02], to: [pumpX + 0.08, 0.24, -0.02], sag: -0.14, radius: 0.036, zone: 'rubber' }),
    ...greebleCable({ name: 'hose.b', from: [radX - 0.15, 0.64, 0.02], to: [pumpX + 0.04, 0.18, 0.02], sag: rng.range(0.08, 0.14), radius: 0.036, zone: 'rubber' }),
  ];
  return { id: 'prop.cooler_aio', category: 'prop', label: 'AIO liquid cooler', parts, sockets: { label: [0, 1.08, 0], fx: [0, 0.45, -0.16] } };
}

// ---------------------------------------------------------------- prop.water_pipe

export function buildWaterPipe(seed: number): ModelSpec {
  const rng = makeRng(seed);
  const resX = 0.14 * SCREEN_LEFT;
  const pipeX = 0.2 * SCREEN_RIGHT;
  const spinSlow = { type: 'spin' as const, axis: 'z' as const, speed: 0.25, pivot: [pipeX, 0.56, -0.08] as [number, number, number] };
  const parts: PartSpec[] = [
    kitBox('plinth', [0.78, 0.13, 0.28], 'silicon', [0, 0.065, 0]),
    kitBox('cradle', [0.38, 0.78, 0.12], 'silicon', [resX, 0.48, 0.08]),
    { name: 'res.glass', shape: { kind: 'cylinder', rTop: 0.12, rBottom: 0.12, height: 0.62, sides: 14 }, zone: 'glass', pos: [resX, 0.48, -0.02] },
    {
      name: 'res.coolant',
      shape: { kind: 'cylinder', rTop: 0.085, rBottom: 0.085, height: 0.48, sides: 12 },
      zone: 'dataCyan',
      pos: [resX, 0.45, -0.02],
      outline: false,
      anim: { type: 'bob', axis: 'y', speed: 0.7, amp: 0.03 },
    },
    kitBox('res.cap.bot', [0.3, 0.09, 0.26], 'silicon', [resX, 0.14, 0]),
    kitBox('res.cap.top', [0.3, 0.1, 0.26], 'silicon', [resX, 0.82, 0]),
    // Copper standpipe + cross pipe + valve wheel.
    { name: 'pipe.vert', shape: { kind: 'cylinder', rTop: 0.075, rBottom: 0.075, height: 0.82, sides: 10 }, zone: 'copper', pos: [pipeX, 0.48, 0] },
    kitBox('pipe.cross', [0.46, 0.09, 0.12], 'copper', [0, 0.76, 0.01]),
    kitBox('flange.top', [0.22, 0.08, 0.2], 'silicon', [pipeX, 0.86, 0]),
    kitPlate('valve.ring', outlineStroke([[-0.12, 0], [0, 0.12], [0.12, 0], [0, -0.12], [-0.12, 0]], 0.048), 0.04, 'lockRed', [pipeX, 0.56, -0.08], { anim: spinSlow }),
    kitDisc('valve.hub', 0.045, 0.05, 'solder', [pipeX, 0.56, -0.09], { rot: [Math.PI / 2, 0, rng.range(0, 1)], sides: 8 }),
  ];
  return { id: 'prop.water_pipe', category: 'prop', label: 'Coolant water pipe', parts, sockets: { label: [0, 1.02, 0], fx: [0, 0.5, -0.15] } };
}
