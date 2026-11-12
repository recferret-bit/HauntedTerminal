/**
 * npc.greybeard_rig: the old bearded enterprise coder hunched at a desk, a Matrix CRT and a server tower.
 * World +x is screen-left (SCREEN_LEFT).
 */
import { makeRng } from '../../core/rng.js';
import type { AnimTag, ModelSpec, PartSpec, Vec3 } from '../../core/types.js';
import { kitBox, kitPlate, SCREEN_LEFT as L, SCREEN_RIGHT as R } from '../../kit/greebles.js';

/** A non-outlined emissive box that pulses around its own centre. */
const glowBox = (name: string, size: Vec3, zone: 'dataCyan' | 'phosphor' | 'powerAmber', pos: Vec3, speed: number, amp: number): PartSpec =>
  kitBox(name, size, zone, pos, { outline: false, anim: { type: 'pulse', speed, amp, pivot: pos } });

/** Desk plinth and leg, the under-desk server tower with its bays and LED, and the desk top. */
function deskAndServer(): PartSpec[] {
  return [
    kitBox('desk.plinth', [1.08, 0.08, 0.48], 'silicon', [0, 0.04, 0]),
    kitBox('desk.leg_l', [0.14, 0.62, 0.42], 'silicon', [0.44 * L, 0.35, 0.01]),
    kitBox('server.tower', [0.36, 0.62, 0.44], 'pcbDark', [0.32 * R, 0.35, 0], { texture: 'tex.pcb-traces' }),
    kitBox('server.bay_0', [0.26, 0.1, 0.05], 'solder', [0.32 * R, 0.5, -0.215]),
    kitBox('server.bay_1', [0.26, 0.1, 0.05], 'copper', [0.32 * R, 0.34, -0.215]),
    glowBox('server.led', [0.09, 0.045, 0.02], 'dataCyan', [0.32 * R, 0.19, -0.228], 1.5, 0.18),
    kitBox('desk.top', [1.14, 0.08, 0.52], 'solder', [0, 0.68, -0.01]),
  ];
}

/** Matrix-display CRT on the right of the desk, with three phosphor code columns. */
function matrixMonitor(): PartSpec[] {
  const columns: Array<[number, number, number, number, number, number]> = [
    // x, height, y, speed, amp, index
    [0.15, 0.23, 0.95, 2.2, 0.16, 0],
    [0.25, 0.18, 0.93, 1.8, 0.2, 1],
    [0.35, 0.25, 0.96, 2.5, 0.15, 2],
  ];
  return [
    kitBox('crt.housing', [0.5, 0.46, 0.38], 'silicon', [0.25 * R, 0.94, 0.02]),
    kitBox('crt.bezel', [0.44, 0.38, 0.05], 'solder', [0.25 * R, 0.95, -0.175]),
    kitBox('crt.screen', [0.37, 0.3, 0.025], 'pcbDark', [0.25 * R, 0.95, -0.205], { texture: 'tex.glyph-rain' }),
    ...columns.map(([x, h, y, speed, amp, i]) => glowBox(`crt.matrix_${i}`, [0.055, h, 0.015], 'phosphor', [x * R, y, -0.22], speed, amp)),
    // Mechanical keyboard on the desk.
    kitBox('kbd.deck', [0.38, 0.055, 0.18], 'silicon', [0.02 * L, 0.74, -0.14]),
  ];
}

/** The coder: legs, torso, head, hair, dark terminal glasses, and the long grey beard. */
function coderBody(): PartSpec[] {
  return [
    kitBox('coder.legs', [0.34, 0.56, 0.32], 'silicon', [0.22 * L, 0.32, 0.02]),
    kitPlate('coder.torso', [[-0.22, -0.26], [0.22, -0.26], [0.25, 0.24], [0, 0.29], [-0.24, 0.24]], 0.34, 'silicon', [0.2 * L, 0.96, 0.01], { bevel: 0.014 }),
    kitBox('coder.head', [0.26, 0.26, 0.26], 'plastic', [0.18 * L, 1.32, -0.02]),
    kitBox('coder.hair', [0.29, 0.09, 0.29], 'solder', [0.19 * L, 1.45, -0.025]),
    kitBox('coder.glasses', [0.22, 0.065, 0.04], 'silicon', [0.17 * L, 1.35, -0.155]),
    kitBox('coder.lens_l', [0.075, 0.042, 0.018], 'phosphor', [0.22 * L, 1.35, -0.178], { outline: false }),
    kitBox('coder.lens_r', [0.075, 0.042, 0.018], 'phosphor', [0.12 * L, 1.35, -0.178], { outline: false }),
    kitPlate(
      'coder.beard',
      [[-0.145, 0.18], [0.145, 0.18], [0.17, 0.02], [0.13, -0.16], [0.05, -0.25], [-0.05, -0.25], [-0.13, -0.16], [-0.17, 0.02]],
      0.14, 'paper', [0.17 * L, 1.09, -0.13], { bevel: 0.012 },
    ),
    kitBox('coder.mustache', [0.2, 0.055, 0.06], 'solder', [0.17 * L, 1.25, -0.185]),
  ];
}

/** Lit cigarette (filter, paper, pulsing ember) and the smoke rising from it. */
function cigarette(): PartSpec[] {
  return [
    kitBox('cig.filter', [0.055, 0.042, 0.042], 'copper', [0.05 * L, 1.22, -0.21]),
    kitBox('cig.paper', [0.11, 0.04, 0.04], 'paper', [0.03 * R, 1.22, -0.21]),
    glowBox('cig.ember', [0.045, 0.044, 0.044], 'powerAmber', [0.1 * R, 1.22, -0.21], 2.0, 0.22),
    kitPlate('float.smoke_0', [[-0.045, -0.032], [0.048, -0.032], [0.056, 0.028], [-0.038, 0.038]], 0.05, 'paper', [0.12 * R, 1.34, -0.2],
      { bevel: 0.006, anim: { type: 'bob', axis: 'y', speed: 1.1, amp: 0.025, phase: 0 } }),
    kitPlate('float.smoke_1', [[-0.055, -0.036], [0.055, -0.036], [0.064, 0.034], [-0.048, 0.042]], 0.05, 'paper', [0.16 * R, 1.47, -0.2],
      { bevel: 0.006, anim: { type: 'bob', axis: 'y', speed: 1.1, amp: 0.03, phase: 0.45 } }),
  ];
}

/** Bare hands hammering the keyboard; the typing speed is the one seeded value. */
function typingArms(typeSpeed: number): PartSpec[] {
  const hand = (name: string, x: number, phase: number): PartSpec => {
    const anim: AnimTag = { type: 'bob', axis: 'y', speed: typeSpeed, amp: 0.022, phase };
    return kitBox(name, [0.095, 0.065, 0.095], 'plastic', [x, 0.79, -0.18], { anim });
  };
  return [
    kitBox('coder.arm_l', [0.11, 0.24, 0.14], 'silicon', [0.12 * L, 0.89, -0.14]),
    kitBox('coder.arm_r', [0.11, 0.24, 0.14], 'silicon', [0.05 * R, 0.89, -0.14]),
    hand('float.hand_l', 0.1 * L, 0),
    hand('float.hand_r', 0.05 * R, 0.5),
  ];
}

export function buildGreybeardRig(seed: number): ModelSpec {
  const rng = makeRng(seed);
  const typeSpeed = rng.range(3.2, 3.8);
  const parts = [...deskAndServer(), ...matrixMonitor(), ...coderBody(), ...cigarette(), ...typingArms(typeSpeed)];
  return {
    id: 'npc.greybeard_rig',
    category: 'npc',
    label: 'Old Bearded Coder & Matrix Server Rig',
    tags: ['detached'],
    parts,
    sockets: { bubble: [0.1 * L, 1.62, 0], label: [0, 1.6, 0], fx: [0, 0.95, -0.22] },
  };
}
