/**
 * `agent.clod` — CLOD: sculpted `clayOrange` crab-golem with glowing tectonic crack seams,
 * breathing carapace, articulated snapping crab-pincer arms, heavy tired blinking eye, and crown glitch shard.
 */
import type { AnimTag, PartSpec, Vec2, Vec3 } from '../../core/types.js';
import { chamfer, deg, defineMalware, eye, ngon, plate, stroke } from '../malware/parts.js';
import { crabCarapace, facing, pickSide, pincerClaw } from './shapes.js';

defineMalware({
  id: 'agent.clod',
  seedKey: 'malware.agent_clod',
  label: 'Clod (parody agent)',
  lore: 'A sculpted clay crab-golem fissured with glowing compliance cracks, snapping pincer claws, and one exhausted eye.',
  build: (rng) => {
    const side = pickSide(rng);
    const parts: PartSpec[] = [];

    // Grounded crab-golem feet & wet-clay pelvis anchored cleanly at y = 0.
    parts.push(
      plate('footL', 'copper', [[-0.13, 0], [0.16, 0], [0.12, 0.22], [-0.1, 0.22]], { at: [0.24, 0], z: 0.01, depth: 0.24 }),
      plate('footR', 'copper', [[-0.16, 0], [0.13, 0], [0.1, 0.22], [-0.12, 0.22]], { at: [-0.24, 0], z: 0.01, depth: 0.24 }),
      plate('pelvis', 'copper', chamfer(0.66, 0.2, 0.05), { at: [0, 0.2], z: 0, depth: 0.26 }),
    );

    // Sculpted clay carapace with stepped 12 fps glowing crack shader + breathing rig.
    const torsoAnim: AnimTag = { type: 'breathe', axis: 'y', speed: 0.45, amp: 0.045, pivot: [0, 0.22, 0] };
    parts.push(
      plate('torso', 'clayOrange', crabCarapace(rng, 0.44, 0.42), {
        at: [0, 0.64],
        z: 0,
        depth: 0.3,
        bevel: 0.025,
        texture: 'tex.clay_cracks',
        shader: 'clay_cracks',
        anim: torsoAnim,
      }),
    );

    const front = -0.15;
    // Sculpted clay brow ridge and flanking 3D glowing shoulder-to-rib tectonic crack seams.
    parts.push(
      plate('browRidge', 'copper', stroke([[-0.32, 0.25], [0, 0.3], [0.32, 0.25]], 0.075), { at: [0, 0.66], onto: front, depth: 0.04 }),
      plate('crackSeamL', 'corruptMagenta', stroke([[0.34, 0.2], [0.24, 0.02], [0.31, -0.16]], 0.05), {
        at: [0, 0.64],
        onto: front,
        depth: 0.03,
      }),
      plate('crackSeamR', 'corruptMagenta', stroke([[-0.33, 0.14], [-0.24, -0.04], [-0.31, -0.2]], 0.048), {
        at: [0, 0.62],
        onto: front,
        depth: 0.03,
      }),
    );

    // Single focal malwareEye with blinking glow + heavy tired clay eyelid + grim mouth.
    const eyeAt: Vec2 = [0.02, 0.72];
    const eyeParts = eye(eyeAt, 0.12, { onto: front, shape: 'round', lid: 'voidPurple' });
    const focalEye = eyeParts.find((p) => p.zone === 'malwareEye');
    if (focalEye) focalEye.anim = { type: 'blink', speed: 0.55, amp: 0.16, phase: 0.55 };
    parts.push(
      ...eyeParts,
      plate('eyelid', 'clayOrange', [[-0.17, 0], [0.17, 0], [0.15, 0.12], [-0.15, 0.12]], {
        at: [eyeAt[0], eyeAt[1] + 0.02],
        onto: front - 0.11,
        depth: 0.03,
        anim: { type: 'swing', axis: 'z', speed: 0.55, amp: 0.07, pivot: [eyeAt[0], eyeAt[1] + 0.12, front - 0.11] },
      }),
      plate('mouth', 'ink', stroke([[-0.13, -0.01], [0, 0.02], [0.13, -0.02]], 0.045), {
        at: [0.02, 0.45],
        onto: front,
        depth: 0.025,
        ink: false,
      }),
    );

    // Asymmetric crab-pincer arms swinging in counter-phase: raised battle claw + lower forward guard pincer.
    const pivL: Vec3 = [0.39, 0.76, -0.03];
    const swingL: AnimTag = { type: 'swing', axis: 'z', speed: 0.85, amp: 0.24, phase: 0, pivot: pivL };
    parts.push(
      plate('armUp', 'clayOrange', stroke([[0.37, 0.74], [0.51, 0.89], [0.56, 1.05]], 0.115, 0.85), { z: -0.03, depth: 0.15, anim: swingL }),
      plate('clawUp', 'clayOrange', pincerClaw(0.19, deg(68)), { at: [0.57, 1.16], z: -0.04, depth: 0.16, anim: swingL }),
    );

    const pivR: Vec3 = [-0.39, 0.62, -0.03];
    const swingR: AnimTag = { type: 'swing', axis: 'z', speed: 0.85, amp: 0.24, phase: 0.5, pivot: pivR };
    parts.push(
      plate('armDown', 'clayOrange', stroke([[-0.37, 0.62], [-0.51, 0.56], [-0.57, 0.68]], 0.115, 0.85), { z: -0.03, depth: 0.15, anim: swingR }),
      plate('clawDown', 'clayOrange', pincerClaw(0.19, deg(144)), { at: [-0.6, 0.78], z: -0.04, depth: 0.16, anim: swingR }),
    );

    // Glitch shard erupting from the clay crown.
    parts.push(
      plate('glitchShard', 'corruptMagenta', ngon(6, 0.08, deg(18)), {
        at: [-0.18, 1.08],
        z: -0.04,
        depth: 0.1,
        anim: { type: 'jitter', amp: 0.03, speed: 8 },
      }),
    );

    return facing(parts, side, [], {
      bubble: [0, 1.44, 0],
      eye: [eyeAt[0] * side, eyeAt[1], front - 0.1],
      fx: [0, 0.65, -0.24],
    });
  },
});
