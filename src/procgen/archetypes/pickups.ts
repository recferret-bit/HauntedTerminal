/**
 * Pickups: energy cell, RAM stick, SSD. Small (0.3 to 0.5 units), hovering around y = 0.5, one
 * `signal` zone each, always moving: the body bobs as one piece and the light pulses.
 * Briefs: .kiro/skills/credits-art-direction/references/world-lexicon.md
 */
import { ModelCatalog } from '../core/catalog.js';
import { PCB_BOARD_THEMES } from '../core/palette.js';
import { hashSeed, makeRng } from '../core/rng.js';
import type { AnimTag, ModelSpec, PartSpec, Vec2 } from '../core/types.js';
import {
  animateParts, greebleContactTeeth, greebleLabelPlate, greebleLed, kitBox, kitDisc, kitPlate, outlineBolt,
  outlineChamferRect, outlineRoundRect, SCREEN_LEFT, SCREEN_RIGHT, tiltParts,
} from '../kit/greebles.js';

const HOVER_Y = 0.5;
const round3 = (v: number): number => Math.round(v * 1000) / 1000;

interface FlightProfile {
  bobSpeed: number;
  bobAmp: number;
  bobPhase: number;
  pulseSpeed: number;
  pulsePhase: number;
}

/** Per-pickup and per-seed flight rhythm so consumables never hover or pulse in lockstep. */
function flightRhythm(id: string, seed: number, base: FlightProfile): {
  bob: AnimTag;
  pulse: (pivot: [number, number, number], amp?: number) => AnimTag;
} {
  const r = makeRng(hashSeed(`${id}:flight`, seed));
  const phaseBump = seed === 1 ? 0 : r.next();
  const pulseBump = seed === 1 ? 0 : r.next();
  const bob: AnimTag = {
    type: 'bob',
    axis: 'y',
    speed: round3(base.bobSpeed * r.range(0.92, 1.09)),
    amp: round3(base.bobAmp * r.range(0.9, 1.12)),
    phase: round3((base.bobPhase + phaseBump) % 1),
  };
  const pulseSpeed = round3(base.pulseSpeed * r.range(0.92, 1.09));
  const pulsePhase = round3((base.pulsePhase + pulseBump) % 1);
  return {
    bob,
    pulse: (pivot, amp = 0.14) => ({ type: 'pulse', amp, speed: pulseSpeed, phase: pulsePhase, pivot }),
  };
}

// ---------------------------------------------------------------- pickup.energy

function buildEnergy(seed: number): ModelSpec {
  const y = HOVER_Y;
  const { bob, pulse } = flightRhythm('pickup.energy', seed, { bobSpeed: 1.05, bobAmp: 0.046, bobPhase: 0.0, pulseSpeed: 2.1, pulsePhase: 0.12 });
  const parts: PartSpec[] = [
    kitPlate('terminal', outlineRoundRect(0.11, 0.07, 0.02, 1), 0.1, 'gold', [0, y + 0.225, 0]),
    kitPlate('shell', outlineRoundRect(0.27, 0.3, 0.03, 2), 0.16, 'silicon', [0, y, 0], { bevel: 0.012 }),
    kitPlate('cap.top', outlineRoundRect(0.3, 0.075, 0.025, 2), 0.19, 'gold', [0, y + 0.16, 0], { bevel: 0.012 }),
    kitPlate('cap.bottom', outlineRoundRect(0.3, 0.075, 0.025, 2), 0.19, 'gold', [0, y - 0.16, 0], { bevel: 0.012 }),
    // The cut-out: the amber core shows through the shell as a bolt.
    kitPlate('core', outlineBolt(0.17, 0.23), 0.03, 'powerAmber', [0, y, -0.09], { outline: false, anim: pulse([0, y, -0.09]) }),
  ];
  return {
    id: 'pickup.energy', category: 'pickup', label: 'Energy cell', parts: animateParts(parts, bob),
    sockets: { fx: [0, y, -0.12], label: [0, y + 0.36, 0] }, tags: ['hover'],
  };
}

// ---------------------------------------------------------------- pickup.ram

function buildRam(seed: number): ModelSpec {
  const rng = makeRng(seed);
  const { bob, pulse } = flightRhythm('pickup.ram', seed, { bobSpeed: 0.83, bobAmp: 0.04, bobPhase: 0.27, pulseSpeed: 1.55, pulsePhase: 0.35 });
  const y = HOVER_Y + 0.02;
  const chips = rng.int(3, 4);
  const boardTheme = seed === 1 ? PCB_BOARD_THEMES[0]! : rng.pick(PCB_BOARD_THEMES);
  const W = 0.46, H = 0.19;
  const board: Vec2[] = [
    [-W / 2, -H / 2], [W / 2, -H / 2], [W / 2, -0.02], [W / 2 - 0.025, -0.02], [W / 2 - 0.025, 0.03], [W / 2, 0.03], [W / 2, H / 2],
    [-W / 2, H / 2], [-W / 2, 0.03], [-W / 2 + 0.025, 0.03], [-W / 2 + 0.025, -0.02], [-W / 2, -0.02],
  ];
  let parts: PartSpec[] = [kitPlate('board', board, 0.05, boardTheme.zone, [0, y, 0], { texture: boardTheme.texture })];
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
  parts = tiltParts(animateParts(parts, bob), 0.16 * SCREEN_LEFT, [0, y]);
  return {
    id: 'pickup.ram', category: 'pickup', label: 'RAM stick', parts,
    sockets: { fx: [0, y, -0.08], label: [0, y + 0.3, 0] }, tags: ['hover'],
  };
}

// ---------------------------------------------------------------- pickup.ssd

function buildSsd(seed: number): ModelSpec {
  const rng = makeRng(seed);
  const { bob, pulse } = flightRhythm('pickup.ssd', seed, { bobSpeed: 0.56, bobAmp: 0.035, bobPhase: 0.53, pulseSpeed: 1.15, pulsePhase: 0.62 });
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
  parts = tiltParts(animateParts(parts, bob), 0.14 * SCREEN_RIGHT, [0, y]);
  return {
    id: 'pickup.ssd', category: 'pickup', label: 'SSD drive', parts,
    sockets: { fx: [0, y, -0.08], label: [0, y + 0.34, 0] }, tags: ['hover'],
  };
}

// ---------------------------------------------------------------- pickup.gpu

function buildGpu(seed: number): ModelSpec {
  const rng = makeRng(seed);
  const { bob, pulse } = flightRhythm('pickup.gpu', seed, { bobSpeed: 0.69, bobAmp: 0.042, bobPhase: 0.79, pulseSpeed: 1.38, pulsePhase: 0.84 });
  const y = HOVER_Y + 0.01;
  const boardTheme = seed === 1 ? PCB_BOARD_THEMES[4]! : rng.pick(PCB_BOARD_THEMES);
  const glowZone = seed % 2 === 0 ? 'dataCyan' : 'phosphor';
  const W = 0.45, H = 0.25;
  let parts: PartSpec[] = [
    ...greebleContactTeeth({ name: 'pcie', pos: [0.02 * SCREEN_LEFT, y - H / 2 - 0.015, 0.01], width: 0.28, count: 5, toothLength: 0.075, bar: 0.03, depth: 0.03, zone: 'gold' }),
    kitPlate('board', outlineRoundRect(W, H, 0.02, 1), 0.055, boardTheme.zone, [0, y, 0.01], { texture: boardTheme.texture }),
    kitPlate('shroud', outlineChamferRect(0.36, 0.21, 0.03), 0.045, 'heatsink', [0.01 * SCREEN_LEFT, y - 0.005, -0.03]),
    kitBox('heatpipe', [0.3, 0.055, 0.05], 'copper', [0, y + H / 2 + 0.015, -0.005]),
    kitDisc('core', 0.075, 0.025, glowZone, [0.01 * SCREEN_LEFT, y - 0.005, -0.06], { outline: false, sides: 8, anim: pulse([0.01 * SCREEN_LEFT, y - 0.005, -0.06], 0.22) }),
  ];
  parts = tiltParts(animateParts(parts, bob), 0.14 * SCREEN_LEFT, [0, y]);
  return {
    id: 'pickup.gpu', category: 'pickup', label: 'GPU tensor module', parts,
    sockets: { fx: [0, y, -0.09], label: [0, y + 0.34, 0] }, tags: ['hover'],
  };
}

ModelCatalog.register({
  id: 'pickup.energy', category: 'pickup', label: 'Energy cell',
  lore: 'A battery cell with a lightning-bolt cut-out. Heals the vibecoder ("power").',
  build: buildEnergy,
});

ModelCatalog.register({
  id: 'pickup.ram', category: 'pickup', label: 'RAM stick',
  lore: 'A stick of memory on colored textolite. Picking it up adds gigabytes of RAM.',
  build: buildRam,
});

ModelCatalog.register({
  id: 'pickup.ssd', category: 'pickup', label: 'SSD drive',
  lore: 'A 2.5 inch solid-state drive. Picking it up adds gigabytes of storage.',
  build: buildSsd,
});

ModelCatalog.register({
  id: 'pickup.gpu', category: 'pickup', label: 'GPU tensor module',
  lore: 'A salvaged GPU shader/tensor card on colored textolite. Picking it up boosts local open-weights storage.',
  build: buildGpu,
});
