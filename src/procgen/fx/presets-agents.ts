import {
  fxBlock, fxDrop, fxGlyph, fxPuff, fxShard, fxSpark, fxSparkle, fxSpeedLine, fxSplat, fxStarburst,
} from './shapes.js';
import type { FxPreset } from './types.js';

/**
 * Signature comic particle presets for the four parody AI-agent villains (`agent.clod`,
 * `agent.antigravy`, `agent.gork`, `agent.codec`), stepped on twos (`12 fps`) in the `malware`
 * palette family. Fired on `AGENT_TAUNT`, live stage actors, and 3D comix beats.
 */
export const AGENT_FX_PRESETS: readonly FxPreset[] = [
  {
    id: 'fx.agent-clod',
    label: 'Clod clay splat',
    family: 'malware',
    trigger: {
      event: 'AGENT_TAUNT',
      moment: 'agent-clod',
      when: 'agent === "clod": clay splat and terracotta shards burst with tectonic crack sparks',
    },
    anchor: 'center',
    durationMs: 580,
    stepFps: 12,
    light: { zone: 'clayOrange', radius: 3.1, power: 1.25, envelope: [[0, 1.15], [0.35, 0.85], [0.7, 0.4]] },
    layers: [
      {
        name: 'splat', role: 'primary', zone: 'clayOrange', shape: fxSplat(0.38), count: 2, emit: 'burst',
        spawn: { radius: [0, 0.16] }, rotation: [0, 360], lifeMs: [280, 410],
        scale: [[0, 1.24], [0.36, 1], [0.72, 0.65]],
      },
      {
        name: 'kiln', role: 'secondary', zone: 'gravyBrown', shape: fxShard(0.33, 0.17), count: 7, emit: 'cone',
        angle: [22, 158], spawn: { radius: [0.14, 0.28] }, speed: [2.0, 3.1], gravity: 7, drag: 2.4,
        spin: [-300, 300], rotation: [0, 360], lifeMs: [300, 460], size: [0.85, 1.18],
        scale: [[0, 1.05], [0.54, 0.78], [0.8, 0.5]],
      },
      {
        name: 'fissure', role: 'accent', zone: 'malwareEye', shape: fxSpark(0.32, 0.11), count: 5, emit: 'ring',
        spawn: { radius: [0.28, 0.42] }, speed: [1.6, 2.3], drag: 5, align: true, delayMs: [0, 70],
        lifeMs: [210, 330], scale: [[0, 1.2], [0.52, 0.72]],
      },
    ],
    onomatopoeia: { text: 'CLACK!', zone: 'clayOrange', style: 'burst', holdMs: 500, offset: [0, 0.96] },
  },
  {
    id: 'fx.agent-coffee',
    label: 'Anti-Gravy hot roast & steam',
    family: 'malware',
    trigger: {
      event: 'AGENT_TAUNT',
      moment: 'agent-coffee',
      when: 'agent === "antigravy": rising comic steam puffs and hot dark-roast droplets boil upward',
    },
    anchor: 'top',
    durationMs: 740,
    stepFps: 12,
    light: { zone: 'malwareEye', radius: 2.9, power: 1.1, offset: [0, 0.45] },
    layers: [
      {
        name: 'steam', role: 'primary', zone: 'paper', shape: fxPuff(0.3), count: 5, emit: 'line',
        spawn: { width: 0.68, height: 0.16 }, angle: [74, 106], speed: [1.05, 1.65], gravity: -1.6, drag: 1.8,
        delayMs: [0, 120], lifeMs: [380, 520], size: [0.88, 1.18],
        scale: [[0, 1.0], [0.35, 1.28], [0.75, 0.82]],
      },
      {
        name: 'roast', role: 'secondary', zone: 'gravyBrown', shape: fxDrop(0.32, 0.17), count: 7, emit: 'cone',
        angle: [44, 136], spawn: { radius: [0.1, 0.26] }, speed: [1.8, 2.8], gravity: 4.4, drag: 2.2,
        align: true, delayMs: [0, 80], lifeMs: [320, 480], size: [0.85, 1.18],
        scale: [[0, 1.12], [0.5, 0.85], [0.82, 0.55]],
      },
      {
        name: 'crema', role: 'accent', zone: 'malwareEye', shape: fxSparkle(0.18), count: 5, emit: 'ring',
        spawn: { radius: [0.28, 0.44] }, angle: [35, 145], speed: [0.7, 1.3], gravity: -1.1,
        delayMs: [35, 130], lifeMs: [240, 380], scale: [[0, 1.2], [0.46, 0.75], [0.76, 1.05]],
      },
    ],
    onomatopoeia: { text: 'HISS!', zone: 'paper', style: 'whisper', holdMs: 540, offset: [0, 1.05] },
  },
  {
    id: 'fx.agent-gork',
    label: 'Gork accretion flare',
    family: 'malware',
    trigger: {
      event: 'AGENT_TAUNT',
      moment: 'agent-gork',
      when: 'agent === "gork": accretion streaks, asteroid shards, and Hawking starbursts whip around the event horizon',
    },
    anchor: 'center',
    durationMs: 640,
    stepFps: 12,
    light: { zone: 'corruptMagenta', radius: 3.5, power: 1.4, envelope: [[0, 1.2], [0.35, 0.9], [0.7, 0.45]] },
    layers: [
      {
        name: 'vortex', role: 'primary', zone: 'corruptMagenta', shape: fxStarburst(8, 0.44, 0.19, 0.26), count: 2,
        emit: 'burst', spawn: { radius: [0, 0.12] }, spin: [-190, 190], rotation: [0, 180], lifeMs: [280, 400],
        scale: [[0, 1.26], [0.36, 0.98], [0.72, 0.68]],
      },
      {
        name: 'debris', role: 'secondary', zone: 'solder', shape: fxShard(0.31, 0.16), count: 7, emit: 'ring',
        spawn: { radius: [0.3, 0.48] }, speed: [1.5, 2.4], drag: 3.8, spin: [-320, 320], rotation: [0, 360],
        delayMs: [0, 80], lifeMs: [300, 440], size: [0.85, 1.18],
        scale: [[0, 1.05], [0.55, 0.8], [0.82, 0.5]],
      },
      {
        name: 'corona', role: 'accent', zone: 'paper', shape: fxSpeedLine(0.44, 0.1), count: 6, emit: 'implode',
        spawn: { radius: [0.72, 0.96] }, swirl: 105, align: true, delayMs: [0, 100], lifeMs: [260, 380],
        scale: [[0, 1.05], [0.6, 0.68]],
      },
    ],
    onomatopoeia: { text: 'WARP!', zone: 'corruptMagenta', style: 'jagged', holdMs: 520, offset: [0, 0.98] },
  },
  {
    id: 'fx.agent-codec',
    label: 'Codec syntax burst',
    family: 'malware',
    trigger: {
      event: 'AGENT_TAUNT',
      moment: 'agent-codec',
      when: 'agent === "codec": bracket and chevron glyphs pop out with CRT syntax macroblocks',
    },
    anchor: 'center',
    durationMs: 600,
    stepFps: 12,
    light: { zone: 'toxicGreen', radius: 3.2, power: 1.35, envelope: [[0, 1.2], [0.35, 0.85], [0.7, 0.4]] },
    layers: [
      {
        name: 'syntax', role: 'primary', zone: 'codecSteel', shape: fxGlyph('bracket', 0.35),
        shapes: [fxGlyph('bracket', 0.35), fxGlyph('chevron', 0.35)], glyphSwapSteps: 2,
        count: 7, emit: 'burst', spawn: { radius: [0.16, 0.34] }, speed: [1.6, 2.5], drag: 4.4,
        delayMs: [0, 70], lifeMs: [300, 430], size: [0.9, 1.16],
        scale: [[0, 1.18], [0.45, 0.92], [0.78, 0.62]],
      },
      {
        name: 'macroblock', role: 'secondary', zone: 'corruptViolet', shape: fxBlock(0.25, 0.13), count: 6,
        emit: 'line', spawn: { width: 0.72, height: 0.56 }, angle: [-12, 12], speed: [1.4, 2.3], drag: 5.5,
        delayMs: [0, 90], lifeMs: [240, 380], size: [0.85, 1.18],
        scale: [[0, 1.05], [0.55, 0.74]],
      },
      {
        name: 'cursor', role: 'accent', zone: 'toxicGreen', shape: fxGlyph('minus', 0.27), count: 5,
        emit: 'cone', angle: [32, 148], speed: [1.7, 2.6], drag: 4.8, delayMs: [30, 100], lifeMs: [220, 340],
        scale: [[0, 1.22], [0.5, 0.78]],
      },
    ],
    onomatopoeia: { text: 'PARSE!', zone: 'toxicGreen', style: 'glitch', holdMs: 500, offset: [0, 0.96] },
  },
];
