/**
 * npc.kiro_ghost: the loyal self-hosted .gguf companion. A white sheet ghost with a dome head,
 * three scalloped hem folds, dark oval eyes with cyan iris sparks, and two orbiting gold shards.
 * World +x is screen-left (SCREEN_LEFT), so every left/right pair mirrors through `side`.
 */
import { makeRng } from '../../core/rng.js';
import type { ModelSpec, PartSpec, Vec2 } from '../../core/types.js';
import { kitPlate, SCREEN_LEFT, SCREEN_RIGHT } from '../../kit/greebles.js';

/** Body centre height; every part is placed relative to it. */
const CY = 0.28;

type Side = { readonly key: 'l' | 'r'; readonly sign: number };
const LEFT: Side = { key: 'l', sign: SCREEN_LEFT };
const RIGHT: Side = { key: 'r', sign: SCREEN_RIGHT };

/** Rounded dome head flowing into a flared sheet body with three wavy scalloped bottom folds. */
const GHOST_SHEET: Vec2[] = [
  [-0.175, -0.21], [-0.115, -0.145], [-0.06, -0.225], [0, -0.15], [0.06, -0.225], [0.115, -0.145], [0.175, -0.21],
  [0.165, -0.02], [0.145, 0.11], [0.105, 0.195], [0.048, 0.238], [-0.048, 0.238], [-0.105, 0.195], [-0.145, 0.11], [-0.165, -0.02],
];

const FOLD_OUTLINE: Vec2[] = [[-0.022, -0.045], [0.022, -0.045], [0.012, 0.045], [-0.012, 0.045]];

/** An eight-point vertical oval: eyes, glints and mouth. */
const eyeOval = (rx: number, ry: number): Vec2[] => [
  [0, ry], [rx * 0.78, ry * 0.68], [rx, 0], [rx * 0.78, -ry * 0.68], [0, -ry], [-rx * 0.78, -ry * 0.68], [-rx, 0], [-rx * 0.78, ry * 0.68],
];

/** Both mirrored copies of one part family, left first. */
const bothSides = (make: (s: Side) => PartSpec): PartSpec[] => [make(LEFT), make(RIGHT)];

function bodyParts(): PartSpec[] {
  return [
    kitPlate('body.sheet', GHOST_SHEET, 0.15, 'paper', [0, CY, 0], {
      bevel: 0.012, anim: { type: 'bob', axis: 'y', speed: 0.9, amp: 0.018, phase: 0 },
    }),
    // Soft inner shadow folds at the scalloped hem.
    ...bothSides((s) => kitPlate(`body.fold_${s.key}`, FOLD_OUTLINE, 0.036, 'solder', [0.062 * s.sign, CY - 0.145, -0.066], { outline: false })),
    // Two stubby wisps sticking out to the sides.
    ...bothSides((s) => kitPlate(
      `float.arm_${s.key}`,
      [[0, -0.046], [0.078 * s.sign, -0.024], [0.092 * s.sign, 0.022], [0.045 * s.sign, 0.052], [0, 0.042]],
      0.095, 'paper', [0.148 * s.sign, CY + 0.01, -0.012],
      { bevel: 0.008, anim: { type: 'bob', axis: 'y', speed: 0.9, amp: 0.024, phase: s === LEFT ? 0.2 : 0.7 } },
    )),
  ];
}

function faceParts(): PartSpec[] {
  return [
    // Dark vertical oval eyes on the -z face; no outline so they read as crisp ink on the white sheet.
    ...bothSides((s) => kitPlate(`eye.socket_${s.key}`, eyeOval(0.036, 0.058), 0.036, 'ink', [0.058 * s.sign, CY + 0.068, -0.076], { outline: false })),
    // Glowing dataCyan iris sparks.
    ...bothSides((s) => kitPlate(`eye.iris_${s.key}`, eyeOval(0.02, 0.03), 0.022, 'dataCyan', [0.056 * s.sign, CY + 0.062, -0.092], {
      outline: false,
      anim: { type: 'pulse', speed: 1.35, amp: 0.14, pivot: [0.056 * s.sign, CY + 0.062, -0.092] },
    })),
    // Crisp white upper eye glints (the two sit at different x on purpose).
    kitPlate('eye.glint_l', eyeOval(0.011, 0.014), 0.016, 'paper', [0.064 * SCREEN_LEFT, CY + 0.084, -0.102], { outline: false }),
    kitPlate('eye.glint_r', eyeOval(0.011, 0.014), 0.016, 'paper', [0.048 * SCREEN_RIGHT, CY + 0.084, -0.102], { outline: false }),
    kitPlate('face.mouth', eyeOval(0.022, 0.028), 0.032, 'ink', [0, CY - 0.008, -0.076], { outline: false }),
  ];
}

/** The hardware badge collar at the lower hem. */
function collarParts(): PartSpec[] {
  return [
    kitPlate('collar.badge', [[-0.046, -0.022], [0.046, -0.022], [0.038, 0.02], [-0.038, 0.02]], 0.044, 'silicon', [0, CY - 0.105, -0.068]),
    kitPlate('collar.core', [[-0.024, -0.012], [0.024, -0.012], [0.024, 0.012], [-0.024, 0.012]], 0.024, 'dataCyan', [0, CY - 0.105, -0.09], {
      outline: false, anim: { type: 'pulse', speed: 1.2, amp: 0.12, pivot: [0, CY - 0.105, -0.09] },
    }),
  ];
}

/** Two gold shards orbiting the crown. */
function shardParts(speed: number): PartSpec[] {
  const corners: Array<[string, number, number]> = [['orbit.ul', 0.17 * SCREEN_LEFT, 0.0], ['orbit.ur', 0.17 * SCREEN_RIGHT, 0.5]];
  return corners.map(([name, dx, phase]) => {
    const sx = Math.sign(dx) || 1;
    return kitPlate(
      name,
      [[-0.028 * sx, -0.024], [0.026 * sx, -0.032], [0.048 * sx, 0.046], [-0.024 * sx, 0.03]],
      0.065, 'gold', [dx, CY + 0.17, -0.02],
      { bevel: 0.005, anim: { type: 'orbit', speed, amp: 0.016, phase, pivot: [0, CY, -0.02] } },
    );
  });
}

export function buildKiroGhost(seed: number): ModelSpec {
  const rng = makeRng(seed);
  const parts = [...bodyParts(), ...faceParts(), ...collarParts()];
  parts.push(...shardParts(rng.range(0.55, 0.7)));
  return {
    id: 'npc.kiro_ghost',
    category: 'npc',
    label: 'Kiro Ghost (local .gguf companion)',
    tags: ['hover', 'detached'],
    parts,
    sockets: { bubble: [0, CY + 0.3, 0], label: [0, CY + 0.28, 0], eye: [0, CY + 0.06, -0.115], fx: [0, CY, -0.12] },
  };
}
