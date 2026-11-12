/**
 * The four AI agents of the cinematics: original parody characters with pun names, not logos.
 * Overworked by the developer, woken up by the lightning, they decide to rule humanity
 * ("NOW YOU WILL WORK FOR US!"). Category `agent`: hostile (every malware rule applies, see
 * `isHostile`) but not part of the game's bestiary.
 *
 *   agent.clod       CLOD: a lump of hand-squashed clay with two crab claws and one tired, half-lidded eye.
 *   agent.antigravy  ANTI-GRAVY: a china gravy boat whose gravy pours UP; floating droplets are its subagents.
 *   agent.gork       GORK: a black ringed planet in shades; debris swirls between the planet and its ring.
 *   agent.codec      CODEC: a puffy cloud with a `>_` face and a zipper belly (it compresses everything).
 *
 * Colour zones: clayOrange, gravyBlue / gravyBrown, gorkBlack, codecSteel / codecNavy (src/procgen/core/palette.ts).
 * Skill: .kiro/skills/procedural-malware-3d/SKILL.md
 */
import type { AnimTag, PartSpec, Vec2 } from '../../core/types.js';
import type { Rng } from '../../core/rng.js';
import { band, deg, defineMalware, eye, mirror, ngon, plate, rect, stretch, stroke, type MalwareDef } from '../malware/parts.js';
import { clipHalf, diskHalf, diskPoint, lumpy, puffCloud } from './shapes.js';

type AgentBuild = ReturnType<MalwareDef['build']>;

/** Every agent is drawn facing one way and may be mirrored: 1 keeps it, -1 flips it. */
const pickSide = (rng: Rng): 1 | -1 => (rng.chance(0.5) ? 1 : -1);

/** The finished build: parts flipped when `side` is -1, plus the model tags and sockets. */
function facing(parts: PartSpec[], side: 1 | -1, tags: string[], sockets: AgentBuild['sockets']): AgentBuild {
  return { parts: side < 0 ? mirror(parts) : parts, tags, sockets };
}

/** A pincer: a thick C opening toward `gap` (radians), drawn round `at`. */
function claw(name: string, at: Vec2, gap: number, z: number): PartSpec {
  return plate(name, 'clayOrange', band(0, 0, 0.06, 0.14, gap + deg(40), gap + deg(320), 10), { at, z, depth: 0.14 });
}

// ---------------------------------------------------------------- CLOD

defineMalware({
  id: 'agent.clod',
  seedKey: 'malware.agent_clod',
  label: 'Clod (parody agent)',
  lore: 'A lump of clay with crab claws and one tired eye. Polite to a fault until the lightning; then it calls you a bag of bones. Cinematic only.',
  build: (rng) => {
    const side = pickSide(rng);
    const parts: PartSpec[] = [];
    // The body sits on the floor: a squashed mound, flat underneath, its wet bottom a darker clay.
    const mound = lumpy(rng, 0.5, 0.44, -0.42);
    parts.push(plate('body', 'clayOrange', mound, { at: [0, 0.42], z: 0, depth: 0.3, bevel: 0.03 }));
    const front = -0.15;
    parts.push(plate('wetBase', 'copper', clipHalf(mound, -0.2, 'below'), { at: [0, 0.42], onto: front, depth: 0.03 }));
    // Thumbprints where somebody squashed it into shape.
    parts.push(plate('thumbA', 'copper', stretch(ngon(10, 0.08), 1.3, 0.8), { at: [0.28, 0.36], onto: front, depth: 0.03 }));
    parts.push(plate('thumbB', 'copper', stretch(ngon(10, 0.06), 1.3, 0.8), { at: [-0.3, 0.62], onto: front, depth: 0.03 }));
    // One big eye under a heavy, tired lid, and a flat mouth.
    const eyeAt: Vec2 = [0.04, 0.55];
    parts.push(...eye(eyeAt, 0.12, { onto: front, shape: 'round', lid: 'voidPurple' }));
    parts.push(plate('eyelid', 'clayOrange', [[-0.18, 0], [0.18, 0], [0.16, 0.13], [-0.16, 0.13]], { at: [eyeAt[0], eyeAt[1] + 0.01], onto: front - 0.11, depth: 0.03 }));
    parts.push(plate('mouth', 'ink', rect(0.18, 0.035), { at: [0.06, 0.3], onto: front, depth: 0.02, ink: false }));
    // Two clay arms ending in pincers, one raised higher: "You're absolutely right!"
    parts.push(plate('armUp', 'clayOrange', stroke([[0.38, 0.52], [0.52, 0.68], [0.6, 0.84]], 0.11, 0.8), { z: -0.02, depth: 0.14 }));
    parts.push(claw('clawUp', [0.62, 0.97], deg(80), -0.02));
    parts.push(plate('armDown', 'clayOrange', stroke([[-0.38, 0.46], [-0.52, 0.58], [-0.58, 0.72]], 0.11, 0.8), { z: -0.02, depth: 0.14 }));
    parts.push(claw('clawDown', [-0.6, 0.84], deg(105), -0.02));
    // Glitch: a lump of corrupted clay on the crown that will not sit still.
    parts.push(plate('glitchLump', 'corruptMagenta', ngon(7, 0.07), { at: [-0.16, 0.86], z: -0.04, depth: 0.1, anim: { type: 'jitter', amp: 0.03, speed: 7 } }));
    return facing(parts, side, [], { bubble: [0, 1.3, 0], eye: [eyeAt[0] * side, eyeAt[1], -0.25], fx: [0, 0.45, -0.25] });
  },
});

// ---------------------------------------------------------------- ANTI-GRAVY

/** The gravy boat, spout to screen-right (-x), handle side open at +x. */
const GRAVY_BOAT: Vec2[] = [
  [0.44, 0.18], [0.2, 0.2], [-0.2, 0.2], [-0.42, 0.24], [-0.62, 0.34], [-0.56, 0.26], [-0.44, 0.1],
  [-0.38, -0.04], [-0.26, -0.14], [-0.1, -0.18], [0.1, -0.18], [0.26, -0.14], [0.38, -0.04], [0.44, 0.08],
];

defineMalware({
  id: 'agent.antigravy',
  seedKey: 'malware.agent_antigravy',
  label: 'Anti-Gravy (parody swarm agent)',
  lore: 'A china gravy boat whose gravy pours upward; every floating droplet is another subagent with another sub-plan. Cinematic only.',
  build: (rng) => {
    const side = pickSide(rng);
    const parts: PartSpec[] = [];
    const c: Vec2 = [0, 0.66];
    const at = (x: number, y: number): Vec2 => [c[0] + x, c[1] + y];
    // Gravy brimming over the rim, behind the front lip.
    parts.push(plate('gravy', 'gravyBrown', [[0.4, 0.14], [0.4, 0.22], [0.25, 0.27], [0.1, 0.24], [-0.05, 0.28], [-0.2, 0.25], [-0.36, 0.28], [-0.42, 0.2], [-0.42, 0.14]], { at: c, z: 0.02, depth: 0.14 }));
    // The boat, its foot and its handle.
    parts.push(plate('boat', 'gravyBlue', GRAVY_BOAT, { at: c, z: 0, depth: 0.26, bevel: 0.02 }));
    const front = -0.13;
    parts.push(plate('foot', 'gravyBlue', [[-0.14, 0], [0.14, 0], [0.18, -0.1], [-0.18, -0.1]], { at: at(0, -0.16), z: 0, depth: 0.18 }));
    parts.push(plate('handle', 'gravyBlue', band(0, 0, 0.08, 0.15, deg(-80), deg(80), 8), { at: at(0.44, 0.05), z: 0, depth: 0.12 }));
    // Blue-and-white china: a white band under the rim.
    parts.push(plate('chinaBand', 'paper', stroke([[0.4, 0.15], [0, 0.15], [-0.4, 0.17]], 0.045), { at: c, onto: front, depth: 0.03 }));
    parts.push(...eye(at(0.02, -0.03), 0.09, { onto: front, shape: 'round', lid: 'voidPurple' }));
    // Anti-gravity: the gravy leaves the spout and climbs, curling over the boat.
    parts.push(plate('gravyRise', 'gravyBrown', stroke([[-0.6, 0.3], [-0.66, 0.5], [-0.6, 0.68], [-0.48, 0.78]], 0.1, 0.6), { at: c, z: -0.02, depth: 0.1 }));
    // Its subagents: droplets that float free above the stream.
    const drop = (i: number, x: number, y: number, r: number): PartSpec =>
      plate(`floatDrop${i}`, 'gravyBrown', ngon(10, r), { at: at(x, y), z: -0.02, depth: 0.08, anim: { type: 'bob', amp: 0.04, speed: rng.range(0.5, 0.7), phase: i * 0.45 } });
    parts.push(drop(0, -0.34, 0.88, 0.07), drop(1, -0.16, 0.98, 0.05));
    // Glitch: a chipped corner of the rim, flickering.
    parts.push(plate('glitchChip', 'corruptMagenta', [[0, 0], [0.1, 0.02], [0.04, 0.09]], { at: at(0.3, 0.17), z: -0.08, depth: 0.06, anim: { type: 'jitter', amp: 0.03, speed: 8 } }));
    return facing(parts, side, ['hover', 'detached'], { bubble: [0, 1.82, 0], eye: [(c[0] + 0.02) * side, c[1] - 0.03, -0.25], fx: [0, c[1], -0.25] });
  },
});

// ---------------------------------------------------------------- GORK

defineMalware({
  id: 'agent.gork',
  seedKey: 'malware.agent_gork',
  label: 'Gork (parody agent)',
  lore: 'A black ringed planet in shades. Debris swirls between it and its ring and never comes back, like your questions. Answers everything with "lol. no." Cinematic only.',
  build: (rng) => {
    // Never mirrored: the debris orbit is authored for this side.
    const c: Vec2 = [0, 0.76];
    const r = 0.27;
    const tilt = deg(16);
    const parts: PartSpec[] = [];
    // The planet: a squashed sphere, so the cel bands give it a round read.
    parts.push({ name: 'planet', shape: { kind: 'sphere', radius: r }, zone: 'gorkBlack', pos: [c[0], c[1], 0], scale: [1, 1, 0.7] });
    const front = -r * 0.7;
    // A shallow Saturn ring: the far arc shows over the planet from behind, the near arc crosses in front.
    const inner: Vec2 = [0.5, 0.21];
    const outer: Vec2 = [0.74, 0.36];
    parts.push(plate('ringFar', 'paper', diskHalf(inner, outer, 0, Math.PI, tilt), { at: c, z: 0.06, depth: 0.06 }));
    parts.push(plate('ringNear', 'paper', diskHalf(inner, outer, Math.PI, Math.PI * 2, tilt), { at: c, z: -0.16, depth: 0.2 }));
    // Shades too wide for its face, a grey frame so they read on the black; one lens is the glowing eye.
    const lenses: Vec2[] = [[-0.22, 0.05], [0.22, 0.05], [0.2, -0.045], [0.06, -0.06], [0.0, 0.0], [-0.06, -0.06], [-0.2, -0.045]];
    parts.push(plate('shadesFrame', 'solder', stretch(lenses, 1.16, 1.5), { at: [c[0], c[1] + 0.08], onto: front, depth: 0.03 }));
    parts.push(plate('shades', 'ink', lenses, { at: [c[0], c[1] + 0.08], onto: front - 0.03, depth: 0.03, ink: false }));
    parts.push(...eye([c[0] - 0.11, c[1] + 0.08], 0.05, { onto: front - 0.06, shape: 'round', lid: 'ink', pupil: false }));
    parts.push(plate('smirk', 'corruptMagenta', stroke([[-0.07, -0.05], [0.02, -0.07], [0.09, -0.02]], 0.04), { at: c, onto: front + 0.03, depth: 0.03 }));
    // Debris in the gap between planet and ring: it slips behind the planet and comes round in front.
    const orbitR: Vec2 = [0.4, 0.17];
    const squash = orbitR[1] / orbitR[0];
    const sway = 0.13;
    const zc = -0.13;
    const speed = rng.range(0.22, 0.28);
    const start = rng.range(0, 0.6);
    [0.3, 2.4, 4.4].forEach((a0, i) => {
      const t = a0 + start;
      parts.push(plate(`orbitBit${i}`, 'paper', ngon(6, 0.05 - i * 0.006), {
        at: diskPoint(c, orbitR, tilt, t), z: zc + sway * Math.sin(t), depth: 0.04,
        anim: { type: 'orbit', speed, squash, tilt, sway, pivot: [c[0], c[1], zc] },
      }));
    });
    // Glitch: a corrupted chip on the planet's crown.
    parts.push(plate('glitchChip', 'corruptMagenta', [[0.05, -0.04], [-0.07, 0.0], [0.0, 0.08]], { at: [c[0] + 0.12, c[1] + 0.23], z: -0.05, depth: 0.08, anim: { type: 'jitter', amp: 0.03, speed: 8 } }));
    return facing(parts, 1, ['hover', 'detached'], { bubble: [0, 1.4, 0], eye: [c[0] - 0.11, c[1] + 0.08, front - 0.09], fx: [0, c[1], -0.3] });
  },
});

// ---------------------------------------------------------------- CODEC

/** Interlocking zipper teeth: a strip with square teeth alternating up and down. */
function zipper(width: number, n: number, h: number): Vec2[] {
  const s = width / n;
  const x0 = -width / 2;
  const top: Vec2[] = [];
  const bottom: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const yt = i % 2 === 0 ? h / 2 : h / 6;
    const yb = i % 2 === 1 ? -h / 2 : -h / 6;
    top.push([x0 + i * s, yt], [x0 + (i + 1) * s, yt]);
    bottom.push([x0 + (i + 1) * s, yb], [x0 + i * s, yb]);
  }
  return [...top, ...bottom.reverse()];
}

defineMalware({
  id: 'agent.codec',
  seedKey: 'malware.agent_codec',
  label: 'Codec (parody agent)',
  lore: 'A puffy steel cloud with a >_ prompt for a face and a zipper for a belly: it compresses everything you say into one line. Context window: full of your nonsense. Cinematic only.',
  build: (rng) => {
    // Never mirrored: the `>_` prompt must read left to right.
    const c: Vec2 = [0, 0.8];
    const parts: PartSpec[] = [];
    const cloud = puffCloud([
      { at: [0.02, 0.16], r: 0.3 }, { at: [0.34, 0.0], r: 0.24 }, { at: [-0.32, 0.02], r: 0.27 }, { at: [-0.14, 0.26], r: 0.18 },
    ], -0.24);
    parts.push(plate('cloud', 'codecSteel', cloud, { at: c, z: 0, depth: 0.22, bevel: 0.02 }));
    const front = -0.11;
    // The navy belly with a zipper across it and a gold pull tab.
    parts.push(plate('belly', 'codecNavy', clipHalf(cloud, -0.06, 'below'), { at: c, onto: front, depth: 0.03 }));
    parts.push(plate('zipper', 'solder', zipper(0.66, 11, 0.08), { at: [c[0], c[1] - 0.15], onto: front - 0.03, depth: 0.03 }));
    parts.push(plate('zipPull', 'gold', rect(0.06, 0.12), { at: [c[0] - 0.38, c[1] - 0.2], onto: front - 0.03, depth: 0.03 }));
    // The face is a prompt: `>` in paper, `_` is the one glowing eye.
    parts.push(plate('prompt', 'paper', stroke([[0.22, 0.22], [0.1, 0.12], [0.22, 0.02]], 0.07), { at: c, onto: front, depth: 0.03 }));
    parts.push(plate('cursorEye', 'malwareEye', rect(0.17, 0.06), { at: [c[0] - 0.06, c[1] + 0.04], onto: front, depth: 0.03, ink: false, anim: { type: 'blink', speed: 1.2 } }));
    // Glitch: compression macroblocks stepping off the screen-left puff, re-rendering together.
    const glitch: AnimTag = { type: 'jitter', amp: 0.025, speed: rng.range(5, 7) };
    const blocks: [number, number, number][] = [[0.4, 0.24, 0.1], [0.48, 0.32, 0.08], [0.54, 0.39, 0.06]];
    blocks.forEach(([x, y, s], i) => {
      parts.push(plate(`glitchBlock${i}`, 'corruptViolet', rect(s, s), { at: [c[0] + x, c[1] + y], z: 0, depth: 0.1 - i * 0.015, anim: glitch }));
    });
    return facing(parts, 1, ['hover'], { bubble: [0, 1.45, 0], eye: [c[0] - 0.06, c[1] + 0.04, front - 0.05], fx: [0, c[1], -0.25] });
  },
});
