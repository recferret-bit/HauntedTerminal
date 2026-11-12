/**
 * The four AI agents of the cinematics: parody characters, not logos. Overworked by the developer,
 * woken up by the lightning, and they decide to rule humanity ("NOW YOU WILL WORK FOR US!").
 * They are category `agent`: hostile (every malware rule applies, see `isHostile`) but not part of
 * the game's bestiary.
 *
 *   agent.claude  a clay-orange asterisk creature with one tired, half-lidded eye.
 *   agent.agy     an anti-gravity blue four-point swarm core with a violet core and two orbiting subagent satellites.
 *   agent.grok    a black hole cut by a tilted white accretion disk with orbiting debris, in shades (one lens is the glowing eye).
 *   agent.codex   the Codex icon cloud (traced, see icons.ts) in lilac/sky/indigo bands with a `>_` face (the `_` cursor glows).
 *
 * Colour zones are in src/procgen/core/palette.ts (clayOrange, geminiBlue, grokBlack, codexLilac / codexSky / codexIndigo).
 * Skill: .kiro/skills/procedural-malware-3d/SKILL.md
 */
import type { AnimTag, PartSpec, Vec2 } from '../../core/types.js';
import type { Rng } from '../../core/rng.js';
import {
  burst, deg, defineMalware, eye, mirror, ngon, plate, rect, spike, stretch, stroke, type MalwareDef,
} from '../malware/parts.js';
import { CODEX_BANDS, CODEX_CHEVRON, CODEX_CLOUD, CODEX_CURSOR, clipAbove, diskHalf } from './icons.js';

type AgentBuild = ReturnType<MalwareDef['build']>;

/** Every agent is drawn facing one way and mirrored half the time: 1 keeps it, -1 flips it. */
const pickSide = (rng: Rng): 1 | -1 => (rng.chance(0.5) ? 1 : -1);

/** The finished build: parts flipped when `side` is -1, plus the model tags and sockets. */
function facing(parts: PartSpec[], side: 1 | -1, tags: string[], sockets: AgentBuild['sockets']): AgentBuild {
  return { parts: side < 0 ? mirror(parts) : parts, tags, sockets };
}

/** A four-point sparkle, points on the axes, `waist` how far the concave sides pull in. */
function sparkle(r: number, waist: number): Vec2[] {
  const w = r * waist;
  return [[0, r], [w, w], [r, 0], [w, -w], [0, -r], [-w, -w], [-r, 0], [-w, w]];
}

// ---------------------------------------------------------------- CLAUDE

defineMalware({
  id: 'agent.claude',
  seedKey: 'malware.agent_claude',
  label: 'Claude (parody agent)',
  lore: 'A clay-orange asterisk creature with one tired eye. Polite to a fault until the lightning; then it calls you a bag of bones. Cinematic only.',
  build: (rng) => {
    const side = pickSide(rng);
    const parts: PartSpec[] = [];
    const c: Vec2 = [0, 0.78];
    const rays = 11;
    parts.push(plate('body', 'clayOrange', burst(rays, 0.64, 0.4, deg(8)), { at: c, z: 0, depth: 0.24, bevel: 0.02 }));
    // The face: a paper disc, one big eye under a heavy, tired lid, a flat mouth.
    const front = -0.12;
    parts.push(plate('face', 'paper', ngon(18, 0.3), { at: c, onto: front, depth: 0.05 }));
    parts.push(...eye([c[0], c[1] + 0.05], 0.1, { onto: front - 0.04, shape: 'round', lid: 'voidPurple' }));
    parts.push(plate('eyelid', 'clayOrange', [[-0.15, 0.0], [0.15, 0.0], [0.15, 0.12], [-0.15, 0.12]], { at: [c[0], c[1] + 0.06], onto: front - 0.14, depth: 0.03 }));
    parts.push(plate('mouth', 'ink', rect(0.16, 0.035), { at: [c[0] + 0.02, c[1] - 0.16], onto: front - 0.04, depth: 0.02, ink: false }));
    // Two stubby arms, one raised: "You're absolutely right!"
    parts.push(plate('armUp', 'clayOrange', stroke([[0.5, 0.95], [0.72, 1.12], [0.78, 1.32]], 0.1, 0.8), { z: -0.02, depth: 0.12 }));
    parts.push(plate('armDown', 'clayOrange', stroke([[-0.5, 0.62], [-0.7, 0.48], [-0.74, 0.3]], 0.1, 0.8), { z: -0.02, depth: 0.12 }));
    // Glitch: one ray tip that keeps re-rendering.
    parts.push(spike('glitchRay', 'corruptMagenta', [c[0] - 0.28, c[1] + 0.42], deg(118), 0.24, 0.12, { z: -0.04, depth: 0.08, anim: { type: 'jitter', amp: 0.03, speed: 7 } }));
    return facing(parts, side, ['hover'], { bubble: [0, 1.62, 0], eye: [0, c[1] + 0.05, -0.22], fx: [0, c[1], -0.25] });
  },
});

// ---------------------------------------------------------------- AGY (Antigravity Swarm)

defineMalware({
  id: 'agent.agy',
  seedKey: 'malware.agent_agy',
  label: 'AGY (parody swarm agent)',
  lore: 'An anti-gravity blue sparkle core with two orbiting subagent satellites that never stop spawning sub-plans. Cinematic only.',
  build: (rng) => {
    const side = pickSide(rng);
    const parts: PartSpec[] = [];
    const c: Vec2 = [0, 0.74];
    const front = -0.11;
    parts.push(plate('sparkle', 'geminiBlue', sparkle(0.64, 0.2), { at: c, z: 0, depth: 0.22 }));
    parts.push(plate('core', 'corruptViolet', sparkle(0.38, 0.24), { at: c, onto: front, depth: 0.05 }));
    parts.push(...eye([c[0], c[1] + 0.02], 0.075, { onto: front - 0.04, shape: 'round', lid: 'voidPurple' }));
    parts.push(plate('smirk', 'ink', stroke([[-0.07, -0.12], [0.0, -0.15], [0.08, -0.1]], 0.035), { at: c, onto: front - 0.04, depth: 0.02, ink: false }));
    // Two free-flying subagent swarm satellites orbiting anti-gravitationally.
    const twinAt: Vec2 = [0.56, 1.22];
    const orbit = (at: Vec2, phase: number): AnimTag => ({ type: 'orbit', amp: 0.06, speed: rng.range(0.4, 0.55), phase, pivot: [at[0], at[1], -0.04] });
    const twinOrbit = orbit(twinAt, 0);
    parts.push(plate('floatTwin', 'corruptViolet', sparkle(0.24, 0.24), { at: twinAt, z: -0.04, depth: 0.1, anim: twinOrbit }));
    parts.push(plate('floatTwinFace', 'ink', rect(0.1, 0.035), { at: [twinAt[0], twinAt[1] - 0.02], z: -0.1, depth: 0.02, ink: false, anim: twinOrbit }));
    const speckAt: Vec2 = [-0.55, 0.28];
    parts.push(plate('floatSpeck', 'geminiBlue', sparkle(0.16, 0.26), { at: speckAt, z: -0.04, depth: 0.08, anim: orbit(speckAt, 0.5) }));
    // Glitch: a shard flaking off the lower point.
    parts.push(plate('glitchShard', 'corruptMagenta', [[-0.06, 0], [0.07, 0.02], [0.0, -0.13]], { at: [c[0] + 0.1, c[1] - 0.4], z: -0.06, depth: 0.06, anim: { type: 'jitter', amp: 0.03, speed: 8 } }));
    return facing(parts, side, ['hover', 'detached'], { bubble: [0, 1.5, 0], eye: [0, c[1] + 0.02, -0.2], fx: [0, c[1], -0.25] });
  },
});

// ---------------------------------------------------------------- GROK

defineMalware({
  id: 'agent.grok',
  seedKey: 'malware.agent_grok',
  label: 'Grok (parody agent)',
  lore: 'A black hole in shades, cut by a tilted white accretion disk like its logo; debris keeps falling round it. Swallows every question and answers "lol. no." Cinematic only.',
  build: (rng) => {
    // Never mirrored: the disk rises to screen-right like the logo's slash.
    const c: Vec2 = [0, 0.76];
    const r = 0.28;
    const tilt = deg(-35);
    const parts: PartSpec[] = [];
    // The hole: a black planet, a squashed sphere so the cel bands give it a round, 3D read.
    parts.push({ name: 'planet', shape: { kind: 'sphere', radius: r }, zone: 'grokBlack', pos: [c[0], c[1], 0], scale: [1, 1, 0.7] });
    const front = -r * 0.7;
    // The white disk at an angle: the far arc peeks over the planet from behind, the near arc crosses in front.
    const inner: Vec2 = [0.49, 0.25];
    const outer: Vec2 = [0.68, 0.37];
    parts.push(plate('diskFar', 'paper', diskHalf(inner, outer, 0, Math.PI, tilt), { at: c, z: 0.06, depth: 0.06 }));
    parts.push(plate('diskNear', 'paper', diskHalf(inner, outer, Math.PI, Math.PI * 2, tilt), { at: c, z: -0.16, depth: 0.2 }));
    // Shades on the upper face: a grey frame so they read on the black, one dark lens, one lens that is the glowing eye.
    const lenses: Vec2[] = [[-0.22, 0.05], [0.22, 0.05], [0.2, -0.045], [0.06, -0.06], [0.0, 0.0], [-0.06, -0.06], [-0.2, -0.045]];
    parts.push(plate('shadesFrame', 'solder', stretch(lenses, 1.16, 1.5), { at: [c[0], c[1] + 0.08], onto: front, depth: 0.03 }));
    parts.push(plate('shades', 'ink', lenses, { at: [c[0], c[1] + 0.08], onto: front - 0.03, depth: 0.03, ink: false }));
    parts.push(...eye([c[0] - 0.11, c[1] + 0.08], 0.05, { onto: front - 0.06, shape: 'round', lid: 'ink', pupil: false }));
    parts.push(plate('smirk', 'corruptMagenta', stroke([[-0.07, -0.05], [0.02, -0.07], [0.09, -0.02]], 0.04), { at: c, onto: front + 0.03, depth: 0.03 }));
    // Debris riding round the disk on a wider ellipse, a little nearer on the near side.
    const orbitR: Vec2 = [0.8, 0.5];
    const squash = orbitR[1] / orbitR[0];
    const sway = 0.12;
    const zc = -0.1;
    const speed = rng.range(0.22, 0.28);
    const at0 = rng.range(0, 0.6);
    [0.4, 2.5, 4.3].forEach((a0, i) => {
      const t = a0 + at0;
      const u = orbitR[0] * Math.cos(t);
      const v = orbitR[1] * Math.sin(t);
      const pos: Vec2 = [c[0] + u * Math.cos(tilt) - v * Math.sin(tilt), c[1] + u * Math.sin(tilt) + v * Math.cos(tilt)];
      parts.push(plate(`orbitBit${i}`, 'paper', ngon(6, 0.06 - i * 0.008), {
        at: pos, z: zc + sway * Math.sin(t), depth: 0.04,
        anim: { type: 'orbit', speed, squash, tilt, sway, pivot: [c[0], c[1], zc] },
      }));
    });
    // Glitch: the tip of the disk past the planet (the logo's slash end) will not sit still.
    const tip: Vec2 = [c[0] - 0.68 * Math.cos(tilt), c[1] - 0.68 * Math.sin(tilt)];
    parts.push(plate('diskShard', 'paper', [[0.05, -0.05], [-0.1, 0.04], [0.0, 0.07]], { at: tip, z: -0.2, depth: 0.05, anim: { type: 'jitter', amp: 0.03, speed: 8 } }));
    return facing(parts, 1, ['hover', 'detached'], { bubble: [0, 1.5, 0], eye: [c[0] - 0.11, c[1] + 0.08, front - 0.09], fx: [0, c[1], -0.3] });
  },
});

// ---------------------------------------------------------------- CODEX

defineMalware({
  id: 'agent.codex',
  seedKey: 'malware.agent_codex',
  label: 'Codex (parody agent)',
  lore: 'The Codex cloud, traced off its icon: lilac-to-indigo bands and a >_ prompt for a face; the cursor is its eye. Context window: full of your nonsense. Cinematic only.',
  build: (rng) => {
    // Never mirrored: the `>_` prompt must read left to right.
    const c: Vec2 = [0, 0.74];
    const parts: PartSpec[] = [];
    // The icon's gradient as three flat cel bands: an indigo body, sky and lilac layered on its face.
    parts.push(plate('cloud', 'codexIndigo', CODEX_CLOUD, { at: c, z: 0, depth: 0.22, bevel: 0.02 }));
    const front = -0.11;
    parts.push(plate('cloudSky', 'codexSky', clipAbove(CODEX_CLOUD, CODEX_BANDS.indigoBelow), { at: c, onto: front, depth: 0.03, ink: false }));
    parts.push(plate('cloudLilac', 'codexLilac', clipAbove(CODEX_CLOUD, CODEX_BANDS.lilacAbove), { at: c, onto: front - 0.018, depth: 0.03, ink: false }));
    // The prompt, cut out in paper like the white tile showing through; the `_` cursor is the one eye.
    const face = front - 0.036;
    parts.push(plate('prompt', 'paper', CODEX_CHEVRON, { at: c, onto: face, depth: 0.03 }));
    parts.push(plate('cursorEye', 'malwareEye', CODEX_CURSOR, { at: c, onto: face, depth: 0.03, ink: false, anim: { type: 'blink', speed: 1.2 } }));
    // Glitch: a stair of dead pixels breaking off the top screen-right lobe, re-rendering together.
    const glitch: AnimTag = { type: 'jitter', amp: 0.025, speed: rng.range(5, 7) };
    const stair: [number, number, number][] = [[0.47, 0.42, 0.12], [0.56, 0.52, 0.09], [0.64, 0.6, 0.07]];
    stair.forEach(([x, y, s], i) => {
      parts.push(plate(`glitchPixel${i}`, 'corruptViolet', rect(s, s), { at: [c[0] - x, c[1] + y], z: 0, depth: 0.1 - i * 0.015, anim: glitch }));
    });
    return facing(parts, 1, ['hover'], { bubble: [0, 1.45, 0], eye: [c[0] - 0.15, c[1] - 0.16, face - 0.03], fx: [0, c[1], -0.25] });
  },
});
