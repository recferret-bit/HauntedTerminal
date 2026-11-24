/**
 * `agent.gork` — GORK: event-horizon black-hole planet head (`gorkBlack` core) separated by a wide
 * open gap from its tilted `accretion_halo` planetary rings, wearing chunky silver-rimmed comic
 * goggles (`malwareEye` lenses) and a wide high-contrast `paper` grin, with orbiting ring shards
 * and Hawking-flare `jitter`.
 */
import type { AnimTag, PartSpec, Vec2 } from '../../core/types.js';
import { deg, defineMalware, ngon, plate, rect } from '../malware/parts.js';
import { comicSmile, diskHalf, diskPoint, facing } from './shapes.js';

defineMalware({
  id: 'agent.gork',
  seedKey: 'malware.agent_gork',
  label: 'Gork (parody agent)',
  lore: 'An event-horizon black-hole planet head in chunky glowing goggles and a wide grin, surrounded by separated accretion rings.',
  build: (rng) => {
    const c: Vec2 = [0, 0.92];
    const r = 0.37;
    const tilt = deg(16);
    const parts: PartSpec[] = [];

    // Separated planetary ring circles with a wide readable gap outside the black-hole body (`r = 0.37` vs `inner = [0.59, 0.33]`).
    const inner: Vec2 = [0.59, 0.33];
    const outer: Vec2 = [0.82, 0.45];
    const ringBob: AnimTag = { type: 'bob', axis: 'y', speed: 0.75, amp: 0.02 };
    parts.push(
      plate('haloFar', 'corruptMagenta', diskHalf(inner, outer, -0.08, Math.PI + 0.08, tilt, 18), {
        at: c,
        z: 0.1,
        depth: 0.07,
        texture: 'tex.accretion_halo',
        shader: 'accretion_halo',
        anim: ringBob,
      }),
      { name: 'coreHead', shape: { kind: 'sphere', radius: r }, zone: 'gorkBlack', pos: [c[0], c[1], 0], scale: [1, 1, 0.64] },
      plate('haloNear', 'corruptMagenta', diskHalf(inner, outer, Math.PI, Math.PI * 2, tilt, 18), {
        at: c,
        z: -0.32,
        depth: 0.09,
        texture: 'tex.accretion_halo',
        shader: 'accretion_halo',
        anim: ringBob,
      }),
    );

    const goggleY = c[1] + 0.13;
    const cupX = 0.195;
    const goggleFront = -0.265;
    const eyePulse: AnimTag = { type: 'pulse', speed: 1.1, amp: 0.08 };
    // Chunky comic goggles: dark violet strap & bridge separating two bright silver rims, dark lens wells, and glowing cores.
    parts.push(
      plate('goggleStrapL', 'corruptViolet', rect(0.13, 0.085), { at: [c[0] + 0.36, goggleY], z: -0.1, depth: 0.15 }),
      plate('goggleStrapR', 'corruptViolet', rect(0.13, 0.085), { at: [c[0] - 0.36, goggleY], z: -0.1, depth: 0.15 }),
      plate('goggleBridge', 'corruptViolet', rect(0.14, 0.068), { at: [c[0], goggleY + 0.008], z: -0.13, depth: 0.19 }),
      plate('goggleFrameL', 'solder', ngon(12, 0.16, deg(15)), { at: [c[0] + cupX, goggleY], z: -0.16, depth: 0.21 }),
      plate('goggleFrameR', 'solder', ngon(12, 0.16, deg(15)), { at: [c[0] - cupX, goggleY], z: -0.16, depth: 0.21 }),
      plate('goggleLensL', 'ink', ngon(12, 0.118, deg(15)), {
        at: [c[0] + cupX, goggleY],
        onto: goggleFront,
        depth: 0.026,
        ink: false,
      }),
      plate('goggleLensR', 'ink', ngon(12, 0.118, deg(15)), {
        at: [c[0] - cupX, goggleY],
        onto: goggleFront,
        depth: 0.026,
        ink: false,
      }),
      plate('goggleCoreL', 'malwareEye', ngon(12, 0.1, deg(15)), {
        at: [c[0] + cupX, goggleY],
        onto: goggleFront - 0.018,
        depth: 0.03,
        ink: false,
        anim: eyePulse,
      }),
      plate('goggleCoreR', 'malwareEye', ngon(12, 0.1, deg(15)), {
        at: [c[0] - cupX, goggleY],
        onto: goggleFront - 0.018,
        depth: 0.03,
        ink: false,
        anim: eyePulse,
      }),
    );

    // Wide upturned paper-white comic smile clearly separated below the goggles on the dark face.
    parts.push(
      plate('smile', 'paper', comicSmile(0.195, 0.056, 0.078), {
        at: [c[0], c[1] - 0.175],
        z: -0.205,
        depth: 0.12,
        ink: false,
      }),
    );

    // Orbiting & spinning asteroid shards riding along the outer ring track so the body-ring gap stays clean.
    const orbitR: Vec2 = [0.71, 0.38];
    const squash = orbitR[1] / orbitR[0];
    const sway = 0.14;
    const zc = -0.1;
    const speed = rng.range(0.28, 0.36);
    const start = rng.range(0, 0.5);
    [0.35, 2.45, 4.55].forEach((a0, i) => {
      const t = a0 + start;
      parts.push(
        plate(`orbitShard${i}`, i === 1 ? 'corruptViolet' : 'solder', ngon(5 + (i % 2), 0.06 - i * 0.005, t), {
          at: diskPoint(c, orbitR, tilt, t),
          z: zc + sway * Math.sin(t),
          depth: 0.05,
          anim: { type: 'orbit', speed, squash, tilt, sway, pivot: [c[0], c[1], zc] },
        }),
      );
    });
    parts.push(
      plate('satelliteQuasar', 'solder', ngon(4, 0.062), {
        at: [c[0] + 0.6, c[1] + 0.41],
        z: -0.08,
        depth: 0.05,
        anim: { type: 'spin', axis: 'z', speed: 1.2 },
      }),
    );

    // Hawking-radiation glitch flare erupting from the top pole of the black-hole head.
    parts.push(
      plate('glitchFlare', 'corruptViolet', [[-0.075, -0.04], [0.075, -0.04], [0.105, 0.12], [-0.01, 0.21], [-0.095, 0.09]], {
        at: [c[0] - 0.07, c[1] + 0.39],
        z: -0.04,
        depth: 0.08,
        anim: { type: 'jitter', amp: 0.03, speed: 9 },
      }),
    );

    return facing(parts, 1, ['hover', 'detached'], {
      bubble: [0, 1.66, 0],
      eye: [c[0] - cupX, goggleY, goggleFront - 0.04],
      fx: [0, c[1], -0.34],
    });
  },
});
