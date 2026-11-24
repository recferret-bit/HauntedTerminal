/**
 * `agent.codec` — CODEC: chunky retro CRT terminal-head bot (`codecSteel` + `codecNavy`) with a
 * clean dark CRT glass screen displaying only a `paper` `>` prompt and blinking `malwareEye` `_`
 * cursor, swinging `{` and `}` curly-brace mechanical claw arms, and syntax-block `jitter`.
 */
import type { AnimTag, PartSpec, Vec2, Vec3 } from '../../core/types.js';
import { chamfer, defineMalware, plate, rect, stroke } from '../malware/parts.js';
import { curlyBrace, facing } from './shapes.js';

defineMalware({
  id: 'agent.codec',
  seedKey: 'malware.agent_codec',
  label: 'Codec (parody agent)',
  lore: 'A chunky retro CRT terminal-head bot with a dark >_ prompt screen and swinging { } claw arms.',
  build: (rng) => {
    // Never mirrored so the `>_` prompt and `{ }` curly braces read left-to-right on screen (world +x is screen-left).
    const head: Vec2 = [0, 0.96];
    const parts: PartSpec[] = [];

    // Compact bot hover-chassis & cooling vent deck under the CRT monitor head.
    parts.push(
      plate('chassis', 'codecNavy', chamfer(0.5, 0.24, 0.05), {
        at: [0, 0.56],
        z: 0,
        depth: 0.22,
        anim: { type: 'breathe', axis: 'y', speed: 0.55, amp: 0.045, pivot: [0, 0.68, 0] },
      }),
      plate('thruster', 'solder', [[-0.18, 0.08], [0.18, 0.08], [0.12, -0.08], [-0.12, -0.08]], { at: [0, 0.4], z: 0, depth: 0.16 }),
      plate('neckCollar', 'solder', rect(0.38, 0.1), { at: [0, 0.68], z: 0, depth: 0.24 }),
    );

    // Chunky retro CRT outer steel shell, top cooling vent hood, and antenna fin.
    parts.push(
      plate('crtShell', 'codecSteel', chamfer(0.78, 0.58, 0.07), { at: head, z: 0, depth: 0.28, bevel: 0.025 }),
      plate('crtTopVent', 'codecNavy', chamfer(0.44, 0.09, 0.025), { at: [head[0], head[1] + 0.31], z: 0.02, depth: 0.2 }),
      plate('antennaStem', 'solder', stroke([[0.18, 1.24], [0.25, 1.41]], 0.055), { z: -0.02, depth: 0.08 }),
    );

    const front = -0.14;
    // Recessed navy bezel + clean dark CRT glass screen with no scrolling code lines.
    parts.push(
      plate('crtBezel', 'codecNavy', chamfer(0.66, 0.46, 0.04), { at: head, onto: front, depth: 0.035 }),
      {
        name: 'screen',
        zone: 'codecNavy',
        shape: { kind: 'box', size: [0.56, 0.36, 0.04] },
        pos: [head[0], head[1] + 0.01, front - 0.045],
        texture: 'tex.crt_code',
        shader: 'crt_code',
      },
    );

    // Bold centered `>_` prompt symbols alone on the dark CRT screen (world +x is screen-left: `>` on left, `_` on right).
    const screenFront = front - 0.065;
    parts.push(
      plate('prompt', 'paper', stroke([[0.19, 0.105], [0.05, 0.005], [0.19, -0.095]], 0.068), {
        at: head,
        onto: screenFront,
        depth: 0.035,
      }),
      plate('cursorEye', 'malwareEye', rect(0.17, 0.068), {
        at: [head[0] - 0.12, head[1] - 0.065],
        onto: screenFront,
        depth: 0.035,
        anim: { type: 'blink', speed: 1.35, amp: 0.26 },
      }),
      plate('powerBadge', 'solder', rect(0.12, 0.045), { at: [head[0] - 0.22, head[1] - 0.23], onto: front - 0.02, depth: 0.025 }),
    );

    // Swinging `{` (screen-left, +x) and `}` (screen-right, -x) mechanical claw arms in counter-phase.
    const pivL: Vec3 = [0.39, 0.82, -0.02];
    const swingL: AnimTag = { type: 'swing', axis: 'z', speed: 0.85, amp: 0.22, phase: 0, pivot: pivL };
    parts.push(
      plate('armBraceL', 'solder', stroke([[0.37, 0.82], [0.58, 0.74]], 0.095), { z: -0.02, depth: 0.12, anim: swingL }),
      plate('clawBraceL', 'codecSteel', curlyBrace(0.42, 'left', 0.075), { at: [0.55, 0.74], z: -0.03, depth: 0.13, anim: swingL }),
    );

    const pivR: Vec3 = [-0.39, 0.82, -0.02];
    const swingR: AnimTag = { type: 'swing', axis: 'z', speed: 0.85, amp: 0.22, phase: 0.5, pivot: pivR };
    parts.push(
      plate('armBraceR', 'solder', stroke([[-0.37, 0.82], [-0.58, 0.74]], 0.095), { z: -0.02, depth: 0.12, anim: swingR }),
      plate('clawBraceR', 'codecSteel', curlyBrace(0.42, 'right', 0.075), { at: [-0.55, 0.74], z: -0.03, depth: 0.13, anim: swingR }),
    );

    // Syntax-shard compression glitch blocks stepping off the upper CRT corner.
    const glitch: AnimTag = { type: 'jitter', amp: 0.028, speed: rng.range(6, 8) };
    parts.push(
      plate('glitchBlock0', 'corruptMagenta', rect(0.1, 0.08), { at: [-0.36, 1.26], z: -0.04, depth: 0.09, anim: glitch }),
      plate('glitchBlock1', 'corruptViolet', rect(0.075, 0.075), { at: [-0.44, 1.34], z: -0.05, depth: 0.07, anim: glitch }),
    );

    return facing(parts, 1, ['hover'], {
      bubble: [0, 1.56, 0],
      eye: [head[0] - 0.12, head[1] - 0.065, screenFront - 0.04],
      fx: [0, head[1] - 0.06, -0.26],
    });
  },
});
