/**
 * npc.greybeard_rig: the old bearded enterprise coder hunched at a desk, a Matrix CRT and a server tower.
 * World +x is screen-left (SCREEN_LEFT).
 */
import { makeRng } from '../../core/rng.js';
import type { AnimTag, ModelSpec, PartSpec, Vec2, Vec3 } from '../../core/types.js';
import { kitBox, kitPlate, outlineRoundRect, SCREEN_LEFT as L, SCREEN_RIGHT as R } from '../../kit/greebles.js';

/** A non-outlined emissive box that pulses around its own centre. */
const glowBox = (name: string, size: Vec3, zone: 'dataCyan' | 'phosphor' | 'powerAmber', pos: Vec3, speed: number, amp: number): PartSpec =>
  kitBox(name, size, zone, pos, { outline: false, anim: { type: 'pulse', speed, amp, pivot: pos } });

/** Scalloped multi-lobed comic smoke cloud outline centred on (0, 0). */
function cloudOutline(w: number, h: number): Vec2[] {
  const rx = w / 2;
  const ry = h / 2;
  return [
    [-0.72 * rx, -0.78 * ry],
    [0.0 * rx, -0.96 * ry],
    [0.74 * rx, -0.74 * ry],
    [1.0 * rx, -0.12 * ry],
    [0.84 * rx, 0.52 * ry],
    [0.44 * rx, 0.92 * ry],
    [0.04 * rx, 0.72 * ry],
    [-0.36 * rx, 0.96 * ry],
    [-0.86 * rx, 0.56 * ry],
    [-1.0 * rx, -0.14 * ry],
  ];
}

/** Desk plinth and leg, the under-desk server tower with its bays and LED, and the desk top. */
function deskAndServer(): PartSpec[] {
  return [
    kitBox('desk.plinth', [1.44, 0.1, 0.58], 'silicon', [0, 0.05, 0]),
    kitBox('desk.leg_l', [0.18, 0.74, 0.5], 'silicon', [0.58 * L, 0.44, 0.01]),
    kitBox('server.tower', [0.46, 0.74, 0.52], 'pcbDark', [0.43 * R, 0.44, 0], { texture: 'tex.pcb-traces' }),
    kitBox('server.bay_0', [0.34, 0.12, 0.06], 'solder', [0.43 * R, 0.62, -0.255]),
    kitBox('server.bay_1', [0.34, 0.12, 0.06], 'copper', [0.43 * R, 0.43, -0.255]),
    glowBox('server.led', [0.11, 0.055, 0.025], 'dataCyan', [0.43 * R, 0.24, -0.265], 1.5, 0.18),
    kitBox('desk.top', [1.52, 0.1, 0.62], 'solder', [0, 0.84, -0.01]),
  ];
}

/** Matrix-display CRT on the right of the desk, with three phosphor code columns. */
function matrixMonitor(): PartSpec[] {
  const columns: Array<[number, number, number, number, number, number]> = [
    // x, height, y, speed, amp, index
    [0.26, 0.28, 1.16, 2.2, 0.16, 0],
    [0.38, 0.22, 1.14, 1.8, 0.2, 1],
    [0.5, 0.3, 1.17, 2.5, 0.15, 2],
  ];
  return [
    kitBox('crt.housing', [0.62, 0.56, 0.46], 'silicon', [0.38 * R, 1.15, 0.02]),
    kitBox('crt.bezel', [0.55, 0.47, 0.06], 'solder', [0.38 * R, 1.16, -0.205]),
    kitBox('crt.screen', [0.46, 0.37, 0.03], 'pcbDark', [0.38 * R, 1.16, -0.24], { texture: 'tex.glyph-rain' }),
    ...columns.map(([x, h, y, speed, amp, i]) => glowBox(`crt.matrix_${i}`, [0.066, h, 0.02], 'phosphor', [x * R, y, -0.26], speed, amp)),
    // Mechanical keyboard on the desk.
    kitBox('kbd.deck', [0.5, 0.068, 0.22], 'silicon', [0.02 * L, 0.91, -0.18]),
  ];
}

/** The coder: legs, broad torso, warm human skin head, hair, terminal glasses, and chest-length grey beard. */
function coderBody(): PartSpec[] {
  return [
    kitBox('coder.legs', [0.48, 0.72, 0.38], 'silicon', [0.24 * L, 0.44, 0.02]),
    kitPlate('coder.torso', [[-0.33, -0.34], [0.33, -0.34], [0.38, 0.31], [0, 0.39], [-0.35, 0.31]], 0.42, 'silicon', [0.2 * L, 1.19, 0.01], { bevel: 0.018 }),
    kitPlate('coder.head', outlineRoundRect(0.42, 0.39, 0.09, 3), 0.3, 'skin', [0.18 * L, 1.65, -0.03], { bevel: 0.02 }),
    kitPlate('coder.hair', outlineRoundRect(0.46, 0.14, 0.04, 2), 0.33, 'solder', [0.18 * L, 1.84, -0.035], { bevel: 0.014 }),
    kitBox('coder.glasses', [0.35, 0.092, 0.05], 'silicon', [0.17 * L, 1.69, -0.205]),
    kitBox('coder.lens_l', [0.118, 0.058, 0.02], 'phosphor', [0.25 * L, 1.69, -0.233], { outline: false }),
    kitBox('coder.lens_r', [0.118, 0.058, 0.02], 'phosphor', [0.09 * L, 1.69, -0.233], { outline: false }),
    kitPlate(
      'coder.beard',
      [[-0.21, 0.24], [0.21, 0.24], [0.24, 0.03], [0.19, -0.21], [0.07, -0.34], [-0.07, -0.34], [-0.19, -0.21], [-0.24, 0.03]],
      0.17, 'paper', [0.17 * L, 1.35, -0.16], { bevel: 0.016 },
    ),
    kitBox('coder.mustache', [0.31, 0.076, 0.07], 'solder', [0.17 * L, 1.56, -0.245]),
  ];
}

/** Cigarette with charred ash, glowing red-hot flame tip, rising ember spark, and billowing comic smoke clouds. */
function cigarette(): PartSpec[] {
  const flameOuter: Vec2[] = [
    [-0.054, -0.042], [-0.07, 0.012], [-0.04, 0.078], [-0.014, 0.04],
    [0.012, 0.082], [0.042, 0.024], [0.048, -0.034], [0, -0.048],
  ];
  const flameCore: Vec2[] = [
    [-0.032, -0.026], [-0.044, 0.01], [-0.018, 0.05], [0.008, 0.028], [0.028, 0.014], [0.026, -0.024],
  ];
  return [
    kitBox('cig.filter', [0.075, 0.058, 0.056], 'copper', [0.02 * L, 1.51, -0.275]),
    kitBox('cig.paper', [0.145, 0.056, 0.05], 'paper', [0.075 * R, 1.51, -0.272]),
    kitBox('cig.ash', [0.048, 0.056, 0.052], 'solder', [0.158 * R, 1.51, -0.278]),
    kitPlate('cig.fire', flameOuter, 0.056, 'lockRed', [0.205 * R, 1.532, -0.282], {
      bevel: 0.006,
      anim: { type: 'pulse', speed: 2.6, amp: 0.22, pivot: [0.195 * R, 1.51, -0.282] },
    }),
    kitPlate('cig.heat', flameCore, 0.028, 'powerAmber', [0.205 * R, 1.524, -0.314], {
      outline: false,
      anim: { type: 'pulse', speed: 3.6, amp: 0.28, phase: 0.35, pivot: [0.2 * R, 1.51, -0.314] },
    }),
    kitBox('float.cig_spark', [0.032, 0.032, 0.026], 'powerAmber', [0.265 * R, 1.61, -0.305], {
      outline: false,
      rot: [0, 0, 0.45],
      anim: { type: 'bob', axis: 'y', speed: 2.4, amp: 0.024, phase: 0.15 },
    }),
    kitPlate('float.smoke_0', cloudOutline(0.14, 0.098), 0.05, 'paper', [0.165 * R, 1.69, -0.26], {
      bevel: 0.01,
      anim: { type: 'bob', axis: 'y', speed: 1, amp: 0.024, phase: 0 },
    }),
    kitPlate('float.smoke_1', cloudOutline(0.165, 0.115), 0.05, 'solder', [0.295 * R, 1.77, -0.22], {
      bevel: 0.01,
      anim: { type: 'bob', axis: 'y', speed: 1, amp: 0.028, phase: 0.25 },
    }),
    kitPlate('float.smoke_2', cloudOutline(0.185, 0.125), 0.055, 'paper', [0.155 * R, 1.87, -0.25], {
      bevel: 0.012,
      anim: { type: 'orbit', speed: 0.6, amp: 0.022, phase: 0.4, pivot: [0.155 * R, 1.87, -0.25] },
    }),
    kitPlate('float.smoke_3', cloudOutline(0.21, 0.14), 0.055, 'solder', [0.305 * R, 1.96, -0.21], {
      bevel: 0.012,
      anim: { type: 'bob', axis: 'x', speed: 0.85, amp: 0.026, phase: 0.6 },
    }),
    kitPlate('float.smoke_4', cloudOutline(0.23, 0.15), 0.06, 'paper', [0.195 * R, 2.06, -0.24], {
      bevel: 0.014,
      anim: { type: 'orbit', speed: 0.55, amp: 0.026, phase: 0.75, pivot: [0.195 * R, 2.06, -0.24] },
    }),
  ];
}

/** Bare hands hammering the keyboard; the typing speed is the one seeded value. */
function typingArms(typeSpeed: number): PartSpec[] {
  const hand = (name: string, x: number, phase: number): PartSpec => {
    const anim: AnimTag = { type: 'bob', axis: 'y', speed: typeSpeed, amp: 0.028, phase };
    return kitBox(name, [0.13, 0.086, 0.12], 'skin', [x, 0.985, -0.22], { anim });
  };
  return [
    kitBox('coder.arm_l', [0.15, 0.3, 0.17], 'silicon', [0.14 * L, 1.09, -0.145]),
    kitBox('coder.arm_r', [0.15, 0.3, 0.17], 'silicon', [0.07 * R, 1.09, -0.145]),
    hand('float.hand_l', 0.12 * L, 0),
    hand('float.hand_r', 0.07 * R, 0.5),
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
    sockets: { bubble: [0.12 * L, 2.2, 0], label: [0, 2.18, 0], fx: [0, 1.24, -0.28] },
  };
}
