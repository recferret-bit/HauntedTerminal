/**
 * Pickups: energy cell, RAM stick, SSD. Small (0.3 to 0.5 units), hovering around y = 0.5, one
 * `signal` zone each, always moving: the body bobs as one piece and the light pulses.
 * Briefs: .kiro/skills/haunted-art-direction/references/world-lexicon.md
 */
import { ModelCatalog } from '../core/catalog.js';
import { makeRng } from '../core/rng.js';
import type { AnimTag, ModelSpec, PartSpec, Vec2 } from '../core/types.js';
import {
  animateParts, greebleContactTeeth, greebleLabelPlate, greebleLed, kitBox, kitPlate, outlineBolt, outlineRoundRect,
  SCREEN_LEFT, SCREEN_RIGHT, tiltParts,
} from '../kit/greebles.js';

const HOVER_Y = 0.5;
const BOB: AnimTag = { type: 'bob', axis: 'y', amp: 0.04, speed: 0.8 };
const pulse = (pivot: [number, number, number], amp = 0.14): AnimTag => ({ type: 'pulse', amp, speed: 1.6, pivot });

// ---------------------------------------------------------------- pickup.energy

function buildEnergy(_seed: number): ModelSpec {
  const y = HOVER_Y;
  const parts: PartSpec[] = [
    kitPlate('terminal', outlineRoundRect(0.11, 0.07, 0.02, 1), 0.1, 'gold', [0, y + 0.225, 0]),
    kitPlate('shell', outlineRoundRect(0.27, 0.3, 0.03, 2), 0.16, 'silicon', [0, y, 0], { bevel: 0.012 }),
    kitPlate('cap.top', outlineRoundRect(0.3, 0.075, 0.025, 2), 0.19, 'gold', [0, y + 0.16, 0], { bevel: 0.012 }),
    kitPlate('cap.bottom', outlineRoundRect(0.3, 0.075, 0.025, 2), 0.19, 'gold', [0, y - 0.16, 0], { bevel: 0.012 }),
    // The cut-out: the amber core shows through the shell as a bolt.
    kitPlate('core', outlineBolt(0.17, 0.23), 0.03, 'powerAmber', [0, y, -0.09], { outline: false, anim: pulse([0, y, -0.09]) }),
  ];
  return {
    id: 'pickup.energy', category: 'pickup', label: 'Energy cell', parts: animateParts(parts, BOB),
    sockets: { fx: [0, y, -0.12], label: [0, y + 0.36, 0] }, tags: ['hover'],
  };
}

// ---------------------------------------------------------------- pickup.ram

function buildRam(seed: number): ModelSpec {
  const rng = makeRng(seed);
  const y = HOVER_Y + 0.02;
  const chips = rng.int(3, 4);
  const W = 0.46, H = 0.19;
  const board: Vec2[] = [
    [-W / 2, -H / 2], [W / 2, -H / 2], [W / 2, -0.02], [W / 2 - 0.025, -0.02], [W / 2 - 0.025, 0.03], [W / 2, 0.03], [W / 2, H / 2],
    [-W / 2, H / 2], [-W / 2, 0.03], [-W / 2 + 0.025, 0.03], [-W / 2 + 0.025, -0.02], [-W / 2, -0.02],
  ];
  let parts: PartSpec[] = [kitPlate('board', board, 0.05, 'pcb', [0, y, 0], { texture: 'tex.pcb-traces' })];
  const span = 0.39;
  const pitch = span / chips;
  for (let i = 0; i < chips; i++) {
    parts.push(kitPlate(`chip${i}`, outlineRoundRect(pitch * 0.72, 0.11, 0.008, 1), 0.035, 'silicon', [-span / 2 + pitch * (i + 0.5), y + 0.02, -0.04], { outline: false }));
  }
  // Gold edge connector, split by the key notch. The notch is where the light lives.
  const edgeY = y - H / 2 - 0.02;
  const keyX = 0.06 * SCREEN_RIGHT;
  parts.push(
    ...greebleContactTeeth({ name: 'edge.a', pos: [keyX + 0.03 + 0.12, edgeY, 0.02], width: 0.24, count: 4, toothLength: 0.07, bar: 0.03, depth: 0.03 }),
    ...greebleContactTeeth({ name: 'edge.b', pos: [keyX - 0.03 - 0.05, edgeY, 0.02], width: 0.1, count: 2, toothLength: 0.07, bar: 0.03, depth: 0.03 }),
    kitBox('notch', [0.055, 0.075, 0.04], 'dataCyan', [keyX, edgeY, 0], { outline: false, anim: pulse([keyX, edgeY, 0], 0.25) }),
  );
  parts = tiltParts(animateParts(parts, BOB), 0.16 * SCREEN_LEFT, [0, y]);
  return {
    id: 'pickup.ram', category: 'pickup', label: 'RAM stick', parts,
    sockets: { fx: [0, y, -0.08], label: [0, y + 0.3, 0] }, tags: ['hover'],
  };
}

// ---------------------------------------------------------------- pickup.ssd

function buildSsd(seed: number): ModelSpec {
  const rng = makeRng(seed);
  const y = HOVER_Y;
  const W = 0.34, H = 0.4;
  const ledX = (W / 2 - 0.05) * SCREEN_RIGHT;
  const ledY = y + H / 2 - 0.05;
  let parts: PartSpec[] = [
    // SATA edge: the short data key and the long power key.
    ...greebleContactTeeth({ name: 'sata.data', pos: [0.105, y - H / 2 - 0.02, 0.015], width: 0.085, count: 2, toothLength: 0.075, bar: 0.035, depth: 0.03 }),
    ...greebleContactTeeth({ name: 'sata.power', pos: [-0.04, y - H / 2 - 0.02, 0.015], width: 0.17, count: 4, toothLength: 0.075, bar: 0.035, depth: 0.03 }),
    kitPlate('shell', outlineRoundRect(W, H, 0.03, 2), 0.07, 'silicon', [0, y, 0], { bevel: 0.012 }),
    ...greebleLabelPlate({ name: 'label', pos: [0, y - 0.035, -0.035], width: 0.26, height: 0.23, lines: rng.int(2, 3), zone: 'plastic' }),
    ...greebleLed({ name: 'led', pos: [ledX, ledY, -0.035], radius: 0.026, zone: 'phosphor', bezelZone: null, anim: pulse([ledX, ledY, -0.04], 0.3) }),
  ];
  parts = tiltParts(animateParts(parts, BOB), 0.14 * SCREEN_RIGHT, [0, y]);
  return {
    id: 'pickup.ssd', category: 'pickup', label: 'SSD drive', parts,
    sockets: { fx: [0, y, -0.08], label: [0, y + 0.34, 0] }, tags: ['hover'],
  };
}

ModelCatalog.register({
  id: 'pickup.energy', category: 'pickup', label: 'Energy cell',
  lore: 'A battery cell with a lightning-bolt cut-out. Heals the vibecoder ("power").',
  build: buildEnergy,
});

ModelCatalog.register({
  id: 'pickup.ram', category: 'pickup', label: 'RAM stick',
  lore: 'A stick of memory. Picking it up adds gigabytes of RAM.',
  build: buildRam,
});

ModelCatalog.register({
  id: 'pickup.ssd', category: 'pickup', label: 'SSD drive',
  lore: 'A 2.5 inch solid-state drive. Picking it up adds gigabytes of storage.',
  build: buildSsd,
});
