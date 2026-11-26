/**
 * npc.kiro_ghost: the loyal self-hosted .gguf companion, modeled after the iconic Kiro sheet ghost.
 * Pure `paper`-white silhouette leaning gently toward screen-right (-x) with a trailing tail flare
 * on screen-left (+x), two plush rounded bottom hem lobes, and two crisp `ink` vertical oval eyes.
 * World +x is screen-left and world -x is screen-right (`SCREEN_RIGHT = -1`).
 */
import { hashSeed, makeRng } from '../../core/rng.js';
import type { ModelSpec, PartSpec, Vec2 } from '../../core/types.js';
import { animateParts, kitPlate, outlineEllipse, SCREEN_RIGHT } from '../../kit/greebles.js';

/** Body centre height; kept above y = 0 including the bevel and downward hover bob. */
const CY = 0.38;

/**
 * 35-vertex CCW Kiro ghost silhouette in model XY (+x = screen-left trailing tail, -x = screen-right front).
 * Sized to ~0.64 x 0.714 beveled (h/w ~ 1.11 < 1.20) so `drawPortrait` renders the full ghost and both
 * the sweeping tail notch and twin eyes survive the game's 3.5 px pixel-art quantizer.
 */
const KIRO_GHOST_OUTLINE: Vec2[] = [
  [-0.3028, 0.0432], [-0.3025, -0.041], [-0.2891, -0.117], [-0.2647, -0.1859],
  [-0.2314, -0.2485], [-0.1929, -0.2925], [-0.1399, -0.3295], [-0.0819, -0.345],
  [-0.0426, -0.3321], [-0.0182, -0.290], [0.0149, -0.315], [0.0595, -0.3355],
  [0.1157, -0.345], [0.1641, -0.3367], [0.1964, -0.3123], [0.2096, -0.2723],
  [0.2033, -0.2281], [0.180, -0.175], [0.258, -0.192], [0.320, -0.158],
  [0.312, -0.115], [0.292, -0.082], [0.270, -0.050], [0.2552, -0.0126],
  [0.2476, 0.0422], [0.2422, 0.09], [0.2337, 0.131], [0.2044, 0.217],
  [0.15, 0.2847], [0.0747, 0.3291], [-0.031, 0.345], [-0.1492, 0.3173],
  [-0.2298, 0.2535], [-0.2781, 0.1696], [-0.2993, 0.0816],
];

const EYE_OUTLINE: Vec2[] = outlineEllipse(0.040, 0.062, 12);

export function buildKiroGhost(seed: number): ModelSpec {
  const rng = makeRng(hashSeed('npc.kiro_ghost', seed));
  const speed = rng.range(0.75, 0.9);
  const rawParts: PartSpec[] = [
    kitPlate('body.sheet', KIRO_GHOST_OUTLINE, 0.17, 'paper', [0, CY, 0], { bevel: 0.012 }),
    kitPlate('eye.l', EYE_OUTLINE, 0.032, 'ink', [0.024 * SCREEN_RIGHT, CY + 0.096, -0.083], { outline: false }),
    kitPlate('eye.r', EYE_OUTLINE, 0.032, 'ink', [0.166 * SCREEN_RIGHT, CY + 0.096, -0.083], { outline: false }),
  ];
  const parts = animateParts(rawParts, { type: 'bob', axis: 'y', speed, amp: 0.018, phase: 0 });
  return {
    id: 'npc.kiro_ghost',
    category: 'npc',
    label: 'Kiro.d (local .gguf Unix daemon)',
    tags: ['hover'],
    parts,
    sockets: {
      bubble: [0, CY + 0.41, 0],
      label: [0, CY + 0.39, 0],
      eye: [0.095 * SCREEN_RIGHT, CY + 0.096, -0.105],
      fx: [0, CY, -0.11],
    },
  };
}
