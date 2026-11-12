/**
 * The two human things in the machine: the developer and the System Hand.
 * They are the only models allowed to use the `human` palette family and the only round, soft shapes.
 * Briefs: .kiro/skills/haunted-art-direction/references/world-lexicon.md
 */
import { ModelCatalog } from '../core/catalog.js';
import type { AnimTag, ModelSpec, PartSpec, Vec2, Vec3 } from '../core/types.js';
import {
  kitDisc, kitPlate, kitRing, outlineEllipse, outlineRoundRect, outlineStroke, outlineSymmetric, outlineTransform,
  SCREEN_LEFT, SCREEN_RIGHT,
} from '../kit/greebles.js';

// ---------------------------------------------------------------- vibecoder.dev

function buildDev(_seed: number): ModelSpec {
  const parts: PartSpec[] = [];
  const HIP_Y = 0.62;
  const SHOULDER_Y = 1.04;

  // Legs and sneakers: one rigid limb per side, so both parts of a leg share pivot and phase.
  for (const [side, sx, phase] of [['l', SCREEN_LEFT, 0], ['r', SCREEN_RIGHT, 0.5]] as const) {
    const x = 0.115 * sx;
    const walk: AnimTag = { type: 'legWalk', axis: 'x', amp: 0.45, phase, pivot: [x, HIP_Y, 0] };
    parts.push(
      kitPlate(`leg.${side}`, outlineSymmetric([[0.065, -0.29], [0.075, -0.1], [0.09, 0.2], [0.085, 0.29]]), 0.18, 'denim', [x, 0.36, 0], { bevel: 0.02, anim: walk }),
      kitPlate(`sneaker.${side}`, outlineTransform(outlineRoundRect(0.2, 0.11, 0.05, 3), { move: [0.025 * sx, 0] }), 0.24, 'paper', [x, 0.071, -0.03], { bevel: 0.015, anim: walk }),
    );
  }

  // Idle life: the torso breathes and the head rides it, on the same slow beat.
  const breath: AnimTag = { type: 'breathe', speed: 0.3, amp: 0.035, pivot: [0, 0.56, 0] };
  const nod: AnimTag = { type: 'bob', axis: 'y', speed: 0.3, amp: 0.014, phase: 0.08 };

  // Torso: a soft bell, widest at the shoulders, with the kangaroo pocket and two drawstrings as relief.
  parts.push(
    kitPlate('torso', outlineSymmetric([[0.19, 0], [0.245, 0.03], [0.255, 0.14], [0.25, 0.3], [0.27, 0.42], [0.25, 0.5], [0.17, 0.555], [0.06, 0.57]]), 0.28, 'hoodie', [0, 0.56, 0], { bevel: 0.03, anim: breath }),
    kitPlate('pocket', outlineSymmetric([[0.15, -0.07], [0.165, -0.03], [0.1, 0.07]]), 0.04, 'hoodie', [0, 0.74, -0.15], { bevel: 0.008 }),
    kitPlate('string.l', outlineRoundRect(0.036, 0.17, 0.018, 2), 0.03, 'paper', [0.06, 0.985, -0.15], { rot: [0, 0, -0.1], outline: false }),
    kitPlate('string.r', outlineRoundRect(0.036, 0.13, 0.018, 2), 0.03, 'paper', [-0.06, 1.0, -0.15], { rot: [0, 0, 0.12], outline: false }),
  );

  // Free arm on the screen-left, swinging against the legs.
  const swing: AnimTag = { type: 'armSwing', axis: 'x', amp: 0.35, phase: 0, pivot: [0.3 * SCREEN_LEFT, SHOULDER_Y, 0] };
  parts.push(
    kitPlate('arm.l', outlineRoundRect(0.15, 0.5, 0.07, 3), 0.17, 'hoodie', [0.33 * SCREEN_LEFT, 0.82, -0.05], { rot: [0, 0, 0.14 * SCREEN_LEFT], bevel: 0.02, anim: swing }),
    kitDisc('hand.l', 0.07, 0.12, 'skin', [0.37 * SCREEN_LEFT, 0.56, -0.05], { anim: swing }),
  );

  // Lantern arm on the screen-right, held out. Arm, hand and lantern move as one piece.
  const R = SCREEN_RIGHT;
  const hold: AnimTag = { type: 'armSwing', axis: 'x', amp: 0.08, phase: 0.5, pivot: [0.28 * R, SHOULDER_Y, 0] };
  const armPath: Vec2[] = [[0.2 * R, 1.01], [0.36 * R, 0.93], [0.52 * R, 0.9]];
  const lx = 0.57 * R;
  parts.push(
    kitPlate('arm.r', outlineStroke(armPath, 0.15), 0.17, 'hoodie', [0, 0, -0.05], { bevel: 0.02, anim: hold }),
    kitRing('lantern.handle', 0.075, 0.045, 0.04, 'hair', [lx, 0.84, -0.07], { sides: 12, anim: hold }),
    kitDisc('hand.r', 0.075, 0.14, 'skin', [0.55 * R, 0.9, -0.08], { anim: hold }),
    kitPlate('lantern.cap', outlineSymmetric([[0.085, 0], [0.085, 0.025], [0.035, 0.07]]), 0.14, 'hair', [lx, 0.735, -0.07], { anim: hold }),
    kitPlate('lantern.glass', outlineRoundRect(0.15, 0.2, 0.04, 2), 0.12, 'lantern', [lx, 0.645, -0.07], { anim: hold }),
    kitPlate('lantern.foot', outlineRoundRect(0.19, 0.05, 0.02, 1), 0.14, 'hair', [lx, 0.535, -0.07], { anim: hold }),
  );

  // Head: the hood is up, so the head silhouette is the hood and the face sits inside it.
  parts.push(
    kitPlate('hood', outlineSymmetric([[0.1, -0.3], [0.25, -0.2], [0.315, 0], [0.28, 0.19], [0.16, 0.3], [0.05, 0.325]]), 0.3, 'hoodie', [0, 1.245, 0.02], { bevel: 0.03, anim: nod }),
    kitPlate('face', outlineEllipse(0.2, 0.215, 18), 0.08, 'skin', [0, 1.215, -0.155], { bevel: 0.01, anim: nod }),
    kitPlate('hair', [[-0.2, 0.0], [-0.14, -0.05], [-0.1, 0.0], [-0.04, -0.07], [0.01, -0.01], [0.07, -0.06], [0.11, 0.0], [0.16, -0.035], [0.195, 0.02], [0.15, 0.115], [0.05, 0.16], [-0.06, 0.16], [-0.155, 0.11]], 0.035, 'hair', [0, 1.325, -0.2], { anim: nod }),
    kitPlate('eye.l', outlineEllipse(0.03, 0.042, 8), 0.02, 'ink', [0.085, 1.205, -0.2], { outline: false, anim: nod }),
    kitPlate('eye.r', outlineEllipse(0.03, 0.042, 8), 0.02, 'ink', [-0.085, 1.205, -0.2], { outline: false, anim: nod }),
  );

  const sockets: Record<string, Vec3> = {
    bubble: [0, 1.72, 0],
    fx: [0, 0.85, -0.2],
    hand: [0.55 * R, 0.9, -0.1],
    lantern: [lx, 0.645, -0.14],
    eye: [0, 1.205, -0.21],
  };
  return { id: 'vibecoder.dev', category: 'vibecoder', label: 'The developer', parts, sockets };
}

// ---------------------------------------------------------------- vibecoder.hand

function buildHand(_seed: number): ModelSpec {
  const parts: PartSpec[] = [];
  const L = SCREEN_LEFT;
  const finger = (name: string, x: number, length: number, z = -0.02): PartSpec =>
    kitPlate(name, outlineRoundRect(0.085, length + 0.08, 0.042, 3), 0.11, 'paper', [x, 0.44 - length / 2, z], { bevel: 0.015 });

  parts.push(
    // The sleeve runs up and out of the panel.
    kitPlate('wrist', outlineSymmetric([[0.13, -0.2], [0.15, 0.2]]), 0.12, 'paper', [0, 0.92, 0.01], { bevel: 0.015, texture: 'tex.crosshatch' }),
    kitPlate('cuff', outlineRoundRect(0.34, 0.09, 0.03, 2), 0.15, 'paper', [0, 0.775, 0], { bevel: 0.015 }),
    kitPlate('palm', outlineRoundRect(0.4, 0.37, 0.11, 4), 0.13, 'paper', [0, 0.565, 0], { bevel: 0.02 }),
    finger('finger.pinky', -0.15, 0.17),
    finger('finger.ring', -0.055, 0.25),
    finger('finger.middle', 0.04, 0.27),
    finger('finger.index', 0.135, 0.2),
    // The artist's pencil: point at y = 0, which is where the hand draws.
    kitPlate('stylus.point', [[-0.012, 0.045], [0, 0], [0.012, 0.045]], 0.03, 'ink', [0.215 * L, 0, -0.1], { outline: false }),
    kitPlate('stylus.wood', [[-0.034, 0.12], [-0.01, 0.03], [0.01, 0.03], [0.034, 0.12]], 0.05, 'skin', [0.215 * L, 0, -0.1]),
    kitPlate('stylus', outlineRoundRect(0.068, 0.5, 0.01, 1), 0.06, 'lantern', [0.215 * L, 0.36, -0.1]),
    kitPlate('stylus.band', outlineRoundRect(0.076, 0.05, 0.01, 1), 0.066, 'hair', [0.215 * L, 0.6, -0.1]),
    // Thumb closes over the pencil.
    kitPlate('thumb', outlineRoundRect(0.1, 0.25, 0.05, 3), 0.1, 'paper', [0.215 * L, 0.42, -0.15], { rot: [0, 0, -0.5 * L], bevel: 0.015 }),
  );

  return {
    id: 'vibecoder.hand', category: 'vibecoder', label: 'The System Hand', parts,
    sockets: { tip: [0.215 * L, 0, -0.1], wrist: [0, 1.12, 0], fx: [0.215 * L, 0.04, -0.14] },
    tags: ['hover'],
  };
}

ModelCatalog.register({
  id: 'vibecoder.dev', category: 'vibecoder', label: 'The developer', gameKey: 'vibecoder',
  lore: 'The only human in the machine: a tired developer in an orange hoodie, carrying a lantern. The player.',
  build: buildDev,
});

ModelCatalog.register({
  id: 'vibecoder.hand', category: 'vibecoder', label: 'The System Hand', gameKey: 'system_hand',
  lore: 'The artist / the OS reaching in from above the panel with a pencil. It draws enemies in and writes system events.',
  build: buildHand,
});
