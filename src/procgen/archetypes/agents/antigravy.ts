/**
 * `agent.antigravy` — ANTI-GRAVY: recognizable `gravyBlue` ceramic coffee mug with `paper` rim band,
 * visible dark-roast brew + crema driven by the stepped `coffee_heat` shader, rising comic steam curls,
 * and levitating subagent coffee droplets.
 */
import type { PartSpec, Vec2 } from '../../core/types.js';
import { band, deg, defineMalware, eye, plate, stretch } from '../malware/parts.js';
import { coffeeDrop, ellipseOutline, facing, mugCupOutline, pickSide, steamCurl } from './shapes.js';

defineMalware({
  id: 'agent.antigravy',
  seedKey: 'malware.agent_antigravy',
  label: 'Anti-Gravy (parody swarm agent)',
  lore: 'A hot ceramic coffee mug whose dark-roast brew swirls and boils upward into floating subagent droplets.',
  build: (rng) => {
    const side = pickSide(rng);
    const parts: PartSpec[] = [];
    const c: Vec2 = [0, 0.64];
    const at = (x: number, y: number): Vec2 => [c[0] + x, c[1] + y];

    // Ceramic mug body, base foot, bold D-handle, and tilted porcelain top rim.
    parts.push(
      plate('mugBody', 'gravyBlue', mugCupOutline(0.36, 0.3, 0.32), { at: c, z: 0, depth: 0.26, bevel: 0.025 }),
      plate('mugFoot', 'gravyBlue', [[-0.24, 0], [0.24, 0], [0.28, -0.09], [-0.28, -0.09]], { at: at(0, -0.3), z: 0, depth: 0.22 }),
      plate('handle', 'gravyBlue', band(0, 0, 0.11, 0.23, deg(-85), deg(85), 10), { at: at(0.37, 0.02), z: 0, depth: 0.12 }),
      plate('rimLip', 'paper', ellipseOutline(0.38, 0.135, 18), { at: at(0, 0.32), z: -0.02, depth: 0.25 }),
    );

    // Perspective-foreshortened dark-roast brew pool + golden crema swirl sitting inside the open mug rim.
    parts.push(
      plate('brew', 'gravyBrown', ellipseOutline(0.32, 0.1, 18), {
        at: at(0, 0.33),
        z: -0.055,
        depth: 0.21,
        texture: 'tex.coffee_brew',
        shader: 'coffee_heat',
      }),
      plate('cremaSwirl', 'copper', stretch(band(0, 0, 0.11, 0.25, deg(15), deg(225), 10), 1, 0.32), {
        at: at(0, 0.335),
        z: -0.085,
        depth: 0.17,
      }),
    );

    const front = -0.13;
    // Glowing roast-badge focal eye on the front of the ceramic mug.
    const eyeAt = at(-0.02, -0.03);
    const eyeParts = eye(eyeAt, 0.1, { onto: front, shape: 'round', lid: 'voidPurple', anim: { type: 'pulse', speed: 1, amp: 0.08 } });
    parts.push(...eyeParts);

    // Upward-drifting comic steam curls rising out of the hot coffee.
    parts.push(
      plate('floatSteam0', 'paper', steamCurl(0.34, 0.065, 0.062), {
        at: at(-0.13, 0.66),
        z: -0.04,
        depth: 0.06,
        anim: { type: 'bob', axis: 'y', amp: 0.055, speed: 0.9, phase: 0 },
      }),
      plate('floatSteam1', 'paper', steamCurl(0.3, -0.06, 0.058), {
        at: at(0.13, 0.7),
        z: -0.03,
        depth: 0.06,
        anim: { type: 'bob', axis: 'y', amp: 0.05, speed: 0.9, phase: 0.5 },
      }),
    );

    // Levitating subagent coffee droplets orbiting & bobbing above the mug.
    const speed = rng.range(0.45, 0.6);
    parts.push(
      plate('orbitDrop0', 'gravyBrown', coffeeDrop(0.068), {
        at: at(-0.28, 0.58),
        z: -0.06,
        depth: 0.07,
        anim: { type: 'orbit', speed, squash: 0.42, tilt: deg(-10), pivot: [c[0], c[1] + 0.6, -0.06] },
      }),
      plate('orbitDrop1', 'gravyBrown', coffeeDrop(0.058), {
        at: at(0.27, 0.62),
        z: -0.05,
        depth: 0.07,
        anim: { type: 'orbit', speed, phase: 0.5, squash: 0.42, tilt: deg(-10), pivot: [c[0], c[1] + 0.6, -0.05] },
      }),
      plate('floatDrop2', 'gravyBrown', coffeeDrop(0.054), {
        at: at(0, 0.92),
        z: -0.05,
        depth: 0.06,
        anim: { type: 'bob', axis: 'y', amp: 0.042, speed: 1.1, phase: 0.25 },
      }),
    );

    // Corrupted chipped porcelain shard jittering on the mug lip.
    parts.push(
      plate('glitchChip', 'corruptMagenta', [[-0.04, -0.03], [0.09, 0.01], [0.02, 0.1]], {
        at: at(-0.32, 0.35),
        z: -0.09,
        depth: 0.06,
        anim: { type: 'jitter', amp: 0.028, speed: 8 },
      }),
    );

    return facing(parts, side, ['hover', 'detached'], {
      bubble: [0, 1.68, 0],
      eye: [eyeAt[0] * side, eyeAt[1], front - 0.1],
      fx: [0, c[1] + 0.3, -0.22],
    });
  },
});
