/**
 * `agent.gork` — GORK: event-horizon black-hole planet head (`gorkBlack` core) surrounded by a
 * clearly separated seamless tilted `accretion_halo` planetary ring, wearing high-contrast comic
 * goggles (`O-O` dark lenses) and an upturned `paper` grin, with orbiting shards & quasar core.
 */
import type { AnimTag, PartSpec, Vec2 } from '../../core/types.js';
import { deg, defineMalware, ngon, plate, rect } from '../malware/parts.js';
import { comicSmile, diskPoint, facing } from './shapes.js';

defineMalware({
  id: 'agent.gork',
  seedKey: 'malware.agent_gork',
  label: 'Gork (parody agent)',
  lore: 'An event-horizon black-hole planet head in chunky comic goggles and a wide grin, framed by separated planetary ring circles.',
  build: (rng) => {
    const c: Vec2 = [0, 0.92];
    const r = 0.312;
    const tilt = deg(14);
    const parts: PartSpec[] = [];

    // Seamless tilted 3D planetary ring with wide 360-degree negative-space gap around the planet body (`r = 0.312` vs inner `[0.63, 0.45]`).
    parts.push(
      {
        name: 'haloRing',
        shape: { kind: 'torus', radius: 0.725, tube: 0.095 },
        zone: 'corruptMagenta',
        pos: [c[0], c[1], 0],
        rot: [0.339, 0.083, 0.23],
        scale: [1, 0.76, 0.24],
        texture: 'tex.accretion_halo',
        shader: 'accretion_halo',
        anim: { type: 'bob', axis: 'y', speed: 0.6, amp: 0.006 },
      },
      { name: 'coreHead', shape: { kind: 'sphere', radius: r }, zone: 'gorkBlack', pos: [c[0], c[1], 0], scale: [1, 1, 0.72] },
    );

    const goggleY = c[1] + 0.095;
    const cupX = 0.154;
    const goggleFront = -0.25;
    // High-contrast 2-layer comic goggles (`O-O`): bright frames + bridge over deep dark lenses so both cups read crisply under 3.5px quantization.
    parts.push(
      plate('goggleStrapL', 'corruptViolet', rect(0.065, 0.066), { at: [c[0] + 0.28, goggleY], z: -0.09, depth: 0.14 }),
      plate('goggleStrapR', 'corruptViolet', rect(0.065, 0.066), { at: [c[0] - 0.28, goggleY], z: -0.09, depth: 0.14 }),
      plate('goggleBridge', 'paper', rect(0.12, 0.054), { at: [c[0], goggleY + 0.006], z: -0.14, depth: 0.18, ink: false }),
      plate('goggleFrameL', 'paper', ngon(12, 0.124, deg(15)), { at: [c[0] + cupX, goggleY], z: -0.15, depth: 0.2, ink: false }),
      plate('goggleFrameR', 'paper', ngon(12, 0.124, deg(15)), { at: [c[0] - cupX, goggleY], z: -0.15, depth: 0.2, ink: false }),
      plate('goggleLensL', 'ink', ngon(12, 0.069, deg(15)), {
        at: [c[0] + cupX, goggleY],
        onto: goggleFront,
        depth: 0.028,
        ink: false,
      }),
      plate('goggleLensR', 'ink', ngon(12, 0.069, deg(15)), {
        at: [c[0] - cupX, goggleY],
        onto: goggleFront,
        depth: 0.028,
        ink: false,
      }),
    );

    // Wide upturned U-curved `paper` comic smile separated by >1.2 macro-pixels below the goggles at every grid phase.
    parts.push(
      plate('smile', 'paper', comicSmile(0.155, 0.085, 0.06), {
        at: [c[0], c[1] - 0.165],
        z: -0.18,
        depth: 0.13,
        ink: false,
      }),
    );

    // Orbiting asteroid shards & blazing `malwareEye` quasar star riding along the separated ring track.
    const orbitR: Vec2 = [0.725, 0.515];
    const squash = orbitR[1] / orbitR[0];
    const sway = 0.19;
    const zc = -0.06;
    const speed = rng.range(0.28, 0.36);
    const start = rng.range(0, 0.45);
    const orbitAnim: AnimTag = { type: 'orbit', speed, squash, tilt, sway, pivot: [c[0], c[1], zc] };
    [2.35, 4.45].forEach((a0, i) => {
      const t = a0 + start;
      parts.push(
        plate(`orbitShard${i}`, i === 0 ? 'solder' : 'corruptViolet', ngon(5 + i, 0.058, t), {
          at: diskPoint(c, orbitR, tilt, t),
          z: zc + sway * Math.sin(t),
          depth: 0.05,
          anim: orbitAnim,
        }),
      );
    });
    const quasarT = 0.42;
    const quasarAt = diskPoint(c, orbitR, tilt, quasarT);
    parts.push(
      plate('quasarCore', 'malwareEye', ngon(4, 0.082), {
        at: quasarAt,
        z: -0.14,
        depth: 0.055,
        anim: { type: 'spin', axis: 'z', speed: 1.2 },
      }),
    );

    // Compact Hawking-glitch macroblock on the outer goggle strap (stays inside body bounds so the 360-degree ring gap stays open).
    parts.push(
      plate('glitchFlare', 'corruptViolet', rect(0.068, 0.052), {
        at: [c[0] - 0.295, goggleY + 0.052],
        z: -0.08,
        depth: 0.11,
        anim: { type: 'jitter', amp: 0.022, speed: 9 },
      }),
    );

    return facing(parts, 1, ['hover', 'detached'], {
      bubble: [0, 1.62, 0],
      eye: [quasarAt[0], quasarAt[1], -0.18],
      fx: [0, c[1], -0.28],
    });
  },
});
