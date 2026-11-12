/**
 * Set-dressing hardware that furnishes rooms: chip, capacitor, heatsink, fan, cable cobweb, dead CRT.
 * Props do not glow: light is reserved for things the player should look at.
 * Briefs: .kiro/skills/haunted-art-direction/references/world-lexicon.md
 */
import { makeRng } from '../../core/rng.js';
import type { ModelSpec, PartSpec, Vec2 } from '../../core/types.js';
import {
  greebleCable, greebleDipChip, greebleHeatsinkFins, greebleRibbonCable, greebleScrew, greebleVentGrille, kitBox, kitDisc,
  kitPlate, outlineRoundRect, outlineStroke, outlineSymmetric, SCREEN_LEFT, SCREEN_RIGHT,
} from '../../kit/greebles.js';

// ---------------------------------------------------------------- prop.chip

export function buildChip(seed: number): ModelSpec {
  const rng = makeRng(seed);
  const legs = rng.int(5, 7);
  const H = 0.2, LEG = 0.1;
  const parts = greebleDipChip({
    name: 'dip', pos: [0, LEG + H / 2, 0.07], width: 0.56, height: H, depth: 0.14, legs, legLength: LEG,
    legSides: 'bottom', marks: 2, texture: 'tex.chip-label',
  });
  return { id: 'prop.chip', category: 'prop', label: 'DIP chip', parts, sockets: { label: [0, 0.46, 0], fx: [0, 0.2, -0.1] } };
}

// ---------------------------------------------------------------- prop.capacitor

export function buildCapacitor(seed: number): ModelSpec {
  const rng = makeRng(seed);
  const r = 0.17;
  const canH = rng.range(0.52, 0.74);
  const base = 0.05;
  const stripeX = 0.05 * SCREEN_RIGHT;
  const parts: PartSpec[] = [
    { name: 'base', shape: { kind: 'cylinder', rTop: r + 0.015, rBottom: r + 0.015, height: base, sides: 14 }, zone: 'silicon', pos: [0, base / 2, 0] },
    { name: 'can', shape: { kind: 'cylinder', rTop: r, rBottom: r, height: canH, sides: 14 }, zone: 'rubber', pos: [0, base + canH / 2, 0] },
    { name: 'top', shape: { kind: 'cylinder', rTop: r - 0.03, rBottom: r + 0.005, height: 0.05, sides: 14 }, zone: 'solder', pos: [0, base + canH + 0.025, 0] },
    // The polarity stripe with its minus signs.
    kitBox('stripe', [0.12, canH * 0.92, 0.02], 'plastic', [stripeX, base + canH / 2, -r + 0.004]),
  ];
  const minus = Math.max(2, Math.floor(canH / 0.2));
  for (let i = 0; i < minus; i++) {
    const y = base + canH * 0.5 + (i - (minus - 1) / 2) * 0.18;
    parts.push(kitBox(`minus${i}`, [0.07, 0.034, 0.01], 'ink', [stripeX, y, -r - 0.008], { outline: false }));
  }
  return { id: 'prop.capacitor', category: 'prop', label: 'Capacitor', parts, sockets: { label: [0, base + canH + 0.2, 0], fx: [0, canH / 2, -0.2] } };
}

// ---------------------------------------------------------------- prop.heatsink

export function buildHeatsink(seed: number): ModelSpec {
  const rng = makeRng(seed);
  const fins = 7;
  // Either a plain radiator or a pipe-organ profile.
  const organ = rng.chance(0.5);
  const heights = Array.from({ length: fins }, (_, i) => (organ ? 0.55 + 0.45 * Math.sin(((i + 0.5) / fins) * Math.PI) : 1));
  const plate = 0.07;
  const H = 0.5;
  const parts: PartSpec[] = [
    kitBox('coldplate', [0.84, plate, 0.4], 'copper', [0, plate / 2, 0], { bevel: 0.01 }),
    ...greebleHeatsinkFins({ name: 'sink', pos: [0, plate + H / 2 - 0.01, 0.17], width: 0.74, height: H, depth: 0.34, fins, base: 0.09, heights }),
    ...greebleScrew({ name: 'screw.l', pos: [0.37, plate / 2, -0.2], radius: 0.026, zone: 'solder', angle: 0.4 }),
    ...greebleScrew({ name: 'screw.r', pos: [-0.37, plate / 2, -0.2], radius: 0.026, zone: 'solder', angle: 1.3 }),
  ];
  return { id: 'prop.heatsink', category: 'prop', label: 'Heatsink', parts, sockets: { label: [0, plate + H + 0.14, 0], fx: [0, 0.3, -0.2] } };
}

// ---------------------------------------------------------------- prop.fan

export function buildFan(seed: number): ModelSpec {
  const rng = makeRng(seed);
  const blades = rng.pick([5, 7]);
  const S = 0.72;
  const cy = S / 2 + 0.012;
  const R = 0.29, hub = 0.1;
  // One pinwheel outline: each blade leans into the spin.
  const wheel: Vec2[] = [];
  const step = (Math.PI * 2) / blades;
  const polar = (a: number, r: number): Vec2 => [Math.cos(a) * r, Math.sin(a) * r];
  for (let i = 0; i < blades; i++) {
    const a = i * step;
    wheel.push(polar(a, hub * 0.9), polar(a + step * 0.12, R * 0.98), polar(a + step * 0.5, R), polar(a + step * 0.86, R * 0.92), polar(a + step * 0.62, hub * 0.9));
  }
  const parts: PartSpec[] = [
    kitPlate('frame', outlineRoundRect(S, S, 0.09, 3), 0.2, 'rubber', [0, cy, 0], { bevel: 0.012 }),
    kitDisc('duct', 0.315, 0.02, 'ink', [0, cy, -0.1], { outline: false, sides: 24 }),
    kitPlate('blades', wheel, 0.03, 'heatsink', [0, cy, -0.115], { anim: { type: 'spin', axis: 'z', speed: 1.4, pivot: [0, cy, -0.115] } }),
    kitDisc('hub', hub, 0.05, 'silicon', [0, cy, -0.13], { sides: 12 }),
    kitDisc('sticker', 0.05, 0.012, 'gold', [0, cy, -0.16], { outline: false, sides: 10 }),
  ];
  let k = 0;
  for (const sx of [1, -1]) {
    for (const sy of [1, -1]) {
      parts.push(kitDisc(`mount${k++}`, 0.032, 0.012, 'ink', [sx * (S / 2 - 0.07), cy + sy * (S / 2 - 0.07), -0.105], { outline: false, sides: 8 }));
    }
  }
  return { id: 'prop.fan', category: 'prop', label: 'Case fan', parts, sockets: { label: [0, S + 0.16, 0], fx: [0, cy, -0.2] } };
}

// ---------------------------------------------------------------- prop.cables

export function buildCables(seed: number): ModelSpec {
  const rng = makeRng(seed);
  const TOP = 1.0;
  const ax = 0.56, bx = -0.56;
  const parts: PartSpec[] = [
    kitBox('anchor.l', [0.16, 0.12, 0.12], 'silicon', [ax, TOP - 0.06, 0.02]),
    kitBox('anchor.r', [0.16, 0.12, 0.12], 'silicon', [bx, TOP - 0.06, 0.02]),
    // Three ribbons draped between the anchors, each hanging lower: a cobweb made of IDE cable.
    ...greebleRibbonCable({ name: 'ribbon.low', from: [ax, TOP - 0.08], to: [bx, TOP - 0.08], z: 0.04, width: 0.13, sag: rng.range(0.74, 0.82), zone: 'solder' }),
    ...greebleRibbonCable({ name: 'ribbon.mid', from: [ax, TOP - 0.07], to: [bx * 0.4, TOP - 0.02], z: 0, width: 0.11, sag: rng.range(0.42, 0.5), zone: 'plastic' }),
    ...greebleRibbonCable({ name: 'ribbon.high', from: [ax * 0.3, TOP - 0.02], to: [bx, TOP - 0.07], z: -0.04, width: 0.1, sag: rng.range(0.18, 0.26), zone: 'solder' }),
    kitBox('clip.a', [0.14, 0.07, 0.1], 'silicon', [bx * 0.4, TOP - 0.035, 0]),
    kitBox('clip.b', [0.14, 0.07, 0.1], 'silicon', [ax * 0.3, TOP - 0.035, -0.03]),
  ];
  // Two loose leads that sway.
  const lead = (name: string, x: number, drop: number, lean: number, phase: number): PartSpec[] => {
    const anim = { type: 'swing' as const, axis: 'z' as const, amp: 0.12, speed: 0.35, phase, pivot: [x, TOP - 0.1, -0.02] as [number, number, number] };
    return [
      ...greebleCable({ name, from: [x, TOP - 0.1, -0.02], to: [x + lean, TOP - 0.1 - drop, -0.02], sag: -0.05, radius: 0.028 }).map((p) => ({ ...p, anim })),
      kitBox(`${name}.plug`, [0.085, 0.11, 0.07], 'copper', [x + lean, TOP - 0.1 - drop - 0.04, -0.02], { anim }),
    ];
  };
  parts.push(...lead('lead.l', ax - 0.02, rng.range(0.42, 0.56), -0.06, 0), ...lead('lead.r', bx + 0.03, rng.range(0.24, 0.36), 0.05, 0.4));
  return { id: 'prop.cables', category: 'prop', label: 'Cable cobweb', parts, sockets: { label: [0, TOP + 0.1, 0], fx: [0, 0.5, -0.1] }, tags: ['hover', 'wall'] };
}

// ---------------------------------------------------------------- prop.crt

export function buildCrt(seed: number): ModelSpec {
  const rng = makeRng(seed);
  const L = SCREEN_LEFT, R = SCREEN_RIGHT;
  const caseY = 0.45;
  const screenX = 0.075 * L;
  const crack: Vec2[] = [[0.2, 0.15], [0.09, 0.06 + rng.range(-0.02, 0.02)], [0.12, -0.02], [0.0, -0.1 + rng.range(-0.02, 0.02)], [-0.08, -0.07]];
  const parts: PartSpec[] = [
    kitPlate('foot', outlineSymmetric([[0.26, 0], [0.26, 0.04], [0.18, 0.13]]), 0.3, 'rubber', [0, 0.012, 0.02], { bevel: 0.012 }),
    kitPlate('case', outlineSymmetric([[0.4, -0.31], [0.43, -0.2], [0.43, 0.24], [0.39, 0.32]]), 0.42, 'plastic', [0, caseY, 0], { bevel: 0.03 }),
    kitPlate('bezel', outlineRoundRect(0.62, 0.5, 0.07, 3), 0.04, 'rubber', [screenX, caseY + 0.01, -0.215]),
    // Dead: the tube is dark, and the glass only shows as a reflection and a crack.
    kitPlate('screen', outlineRoundRect(0.52, 0.4, 0.06, 3), 0.02, 'silicon', [screenX, caseY + 0.01, -0.24]),
    kitPlate('glint', [[-0.2, 0.02], [-0.11, 0.15], [-0.04, 0.15], [-0.13, 0.02]], 0.01, 'glass', [screenX, caseY + 0.01, -0.255]),
    kitPlate('glint.b', [[-0.1, 0.02], [-0.01, 0.15], [0.03, 0.15], [-0.06, 0.02]], 0.01, 'glass', [screenX, caseY + 0.01, -0.255], { outline: false }),
    kitPlate('crack', outlineStroke(crack, 0.036), 0.01, 'glass', [screenX, caseY + 0.01, -0.256], { outline: false }),
    // Controls down the screen-right edge: two dead knobs and a vent.
    kitDisc('knob.a', 0.036, 0.04, 'solder', [0.355 * R, caseY + 0.17, -0.2], { sides: 8 }),
    kitDisc('knob.b', 0.036, 0.04, 'solder', [0.355 * R, caseY + 0.06, -0.2], { sides: 8 }),
    ...greebleVentGrille({ name: 'vent', pos: [0.355 * R, caseY - 0.12, -0.21], width: 0.075, height: 0.16, slats: 3, plate: false }),
  ];
  return { id: 'prop.crt', category: 'prop', label: 'Dead CRT', parts, sockets: { label: [0, 0.95, 0], fx: [screenX, caseY, -0.28] } };
}
