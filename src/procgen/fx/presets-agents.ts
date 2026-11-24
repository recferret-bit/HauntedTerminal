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
    durationMs: 560,
    stepFps: 12,
    layers: [
      {
        name: 'splat', role: 'primary', zone: 'clayOrange', shape: fxSplat(0.3), count: 2, emit: 'burst',
        spawn: { radius: [0, 0.14] }, rotation: [0, 360], lifeMs: [260, 390],
        scale: [[0, 1.2], [0.36, 1], [0.72, 0.65]],
      },
      {
        name: 'kiln', role: 'secondary', zone: 'gravyBrown', shape: fxShard(0.28, 0.15), count: 6, emit: 'cone',
        angle: [25, 155], spawn: { radius: [0.12, 0.24] }, speed: [1.8, 2.8], gravity: 7, drag: 2.5,
        spin: [-280, 280], rotation: [0, 360], lifeMs: [280, 440], size: [0.85, 1.15],
        scale: [[0, 1], [0.54, 0.76], [0.8, 0.5]],
      },
      {
        name: 'fissure', role: 'accent', zone: 'malwareEye', shape: fxSpark(0.26, 0.09), count: 4, emit: 'ring',
        spawn: { radius: [0.22, 0.34] }, speed: [1.4, 2.1], drag: 5, align: true, delayMs: [0, 70],
        lifeMs: [190, 300], scale: [[0, 1.15], [0.52, 0.7]],
      },
    ],
    onomatopoeia: { text: 'CLACK!', zone: 'clayOrange', style: 'burst', holdMs: 480, offset: [0, 0.88] },
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
    durationMs: 720,
    stepFps: 12,
    layers: [
      {
        name: 'steam', role: 'primary', zone: 'paper', shape: fxPuff(0.24), count: 5, emit: 'line',
        spawn: { width: 0.56, height: 0.14 }, angle: [76, 104], speed: [0.95, 1.5], gravity: -1.6, drag: 1.8,
        delayMs: [0, 120], lifeMs: [360, 500], size: [0.86, 1.16],
        scale: [[0, 0.95], [0.35, 1.24], [0.75, 0.8]],
      },
      {
        name: 'roast', role: 'secondary', zone: 'gravyBrown', shape: fxDrop(0.27, 0.15), count: 7, emit: 'cone',
        angle: [46, 134], spawn: { radius: [0.08, 0.22] }, speed: [1.6, 2.6], gravity: 4.4, drag: 2.2,
        align: true, delayMs: [0, 80], lifeMs: [300, 460], size: [0.85, 1.15],
        scale: [[0, 1.1], [0.5, 0.84], [0.82, 0.55]],
      },
      {
        name: 'crema', role: 'accent', zone: 'malwareEye', shape: fxSparkle(0.14), count: 4, emit: 'ring',
        spawn: { radius: [0.22, 0.36] }, angle: [35, 145], speed: [0.6, 1.15], gravity: -1.1,
        delayMs: [40, 130], lifeMs: [220, 350], scale: [[0, 1.15], [0.46, 0.72], [0.76, 1]],
      },
    ],
    onomatopoeia: { text: 'HISS!', zone: 'paper', style: 'whisper', holdMs: 520, offset: [0, 0.95] },
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
    durationMs: 620,
    stepFps: 12,
    layers: [
      {
        name: 'vortex', role: 'primary', zone: 'corruptMagenta', shape: fxStarburst(7, 0.36, 0.16, 0.24), count: 2,
        emit: 'burst', spawn: { radius: [0, 0.1] }, spin: [-180, 180], rotation: [0, 180], lifeMs: [260, 380],
        scale: [[0, 1.24], [0.36, 0.96], [0.72, 0.65]],
      },
      {
        name: 'debris', role: 'secondary', zone: 'solder', shape: fxShard(0.26, 0.14), count: 7, emit: 'ring',
        spawn: { radius: [0.26, 0.44] }, speed: [1.3, 2.2], drag: 4, spin: [-310, 310], rotation: [0, 360],
        delayMs: [0, 80], lifeMs: [280, 420], size: [0.85, 1.15],
        scale: [[0, 1], [0.55, 0.78], [0.82, 0.5]],
      },
      {
        name: 'corona', role: 'accent', zone: 'paper', shape: fxSpeedLine(0.36, 0.08), count: 5, emit: 'implode',
        spawn: { radius: [0.66, 0.88] }, swirl: 95, align: true, delayMs: [0, 100], lifeMs: [240, 360],
        scale: [[0, 1], [0.6, 0.65]],
      },
    ],
    onomatopoeia: { text: 'WARP!', zone: 'corruptMagenta', style: 'jagged', holdMs: 500, offset: [0, 0.9] },
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
    durationMs: 580,
    stepFps: 12,
    layers: [
      {
        name: 'syntax', role: 'primary', zone: 'codecSteel', shape: fxGlyph('bracket', 0.3),
        shapes: [fxGlyph('bracket', 0.3), fxGlyph('chevron', 0.3)], glyphSwapSteps: 2,
        count: 7, emit: 'burst', spawn: { radius: [0.14, 0.3] }, speed: [1.4, 2.3], drag: 4.5,
        delayMs: [0, 70], lifeMs: [280, 410], size: [0.88, 1.14],
        scale: [[0, 1.15], [0.45, 0.9], [0.78, 0.6]],
      },
      {
        name: 'macroblock', role: 'secondary', zone: 'corruptViolet', shape: fxBlock(0.21, 0.11), count: 6,
        emit: 'line', spawn: { width: 0.62, height: 0.5 }, angle: [-12, 12], speed: [1.2, 2.1], drag: 6,
        delayMs: [0, 90], lifeMs: [220, 350], size: [0.85, 1.15],
        scale: [[0, 1], [0.55, 0.72]],
      },
      {
        name: 'cursor', role: 'accent', zone: 'toxicGreen', shape: fxGlyph('minus', 0.22), count: 4,
        emit: 'cone', angle: [35, 145], speed: [1.5, 2.4], drag: 5, delayMs: [35, 100], lifeMs: [200, 320],
        scale: [[0, 1.2], [0.5, 0.75]],
      },
    ],
    onomatopoeia: { text: 'PARSE!', zone: 'toxicGreen', style: 'glitch', holdMs: 480, offset: [0, 0.88] },
  },
];
