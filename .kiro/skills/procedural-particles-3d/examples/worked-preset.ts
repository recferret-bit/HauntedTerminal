/**
 * Worked example: a new effect from nothing, with the reason for every number.
 * The moment: `chmod -x stone_gargoyle.bin` turns the trojan to stone (INODE_MODE_CHANGED with
 * (newMode & 0o111) === 0; the stage currently only tints it grey and says CHMOD -X // PETRIFIED!).
 *
 * This file is an example and is not imported by the game. To ship it:
 *   1. add 'petrify' to FxMoment (src/procgen/fx/types.ts) and to FX_MOMENT_WORDS (catalog.ts),
 *   2. move the preset into src/procgen/fx/presets.ts,
 *   3. npm run procgen:fx, look at the filmstrip, npm run procgen:selftest.
 */
import {
  createFxEmitter, formatFxReport, fxShard, fxSimulate, fxSpeedLine, fxStarburst, validateFxPreset,
  type FxMoment, type FxPreset,
} from '../../../../src/procgen/index.js';

export const fxPetrifyExample: FxPreset = {
  id: 'fx.petrify',
  label: 'chmod -x: turned to stone',
  // The shell did this, so it is a system effect even though the target is malware:
  // no magenta, no violet. Grey stone, white dust, one signal colour.
  family: 'system',
  trigger: {
    event: 'INODE_MODE_CHANGED',
    // Stand-in so the example type-checks; the real preset gets its own moment, 'petrify'.
    moment: 'rm-ash' satisfies FxMoment,
    when: '(newMode & 0o111) === 0: the trojan stops mid-lunge and turns to grey stone',
  },
  // Origin at the middle of the gargoyle (its `fx` socket).
  anchor: 'center',
  // Three beats at 12 fps: crack (0..250), chips fly (0..400), dust settles (to 480).
  durationMs: 480,
  layers: [
    {
      // 1. The big shape. One grey star that IS the "turned to stone" read. `heatsink` is the stone
      //    grey the petrified gargoyle is tinted with, so the flash and the result match.
      name: 'crack', role: 'primary', zone: 'heatsink',
      shape: fxStarburst(7, 0.5, 0.26, 0.3), // 7 uneven points, about 58 px across: readable at game scale
      count: 1, emit: 'burst',
      lifeMs: [250, 250],                    // exactly 3 drawn frames
      scale: [[0, 1.3], [0.34, 1], [0.67, 0.7]], // oversized on frame 1, settle, shrink, gone
    },
    {
      // 2. The material that broke off: white stone chips. paper vs heatsink is far beyond ΔE 15.
      name: 'chip', role: 'secondary', zone: 'paper',
      shape: fxShard(0.24, 0.13),
      count: 7, emit: 'burst',               // 7 chunks you can count, evenly fanned
      spawn: { radius: [0.3, 0.4] },         // start at the star's rim so frame 1 is not a pile
      speed: [1.6, 2.6], drag: 6,            // thrown hard, stopped within a third of a second
      gravity: 6,                            // stone is heavy: they drop
      spin: [-300, 300], rotation: [0, 360],
      lifeMs: [260, 400],
      size: [0.8, 1.2],                      // hand-drawn unevenness
      scale: [[0, 1], [0.55, 0.75], [0.8, 0.45]],
    },
    {
      // 3. The accent: the lock colour, because execute permission was just taken away.
      name: 'lock', role: 'accent', zone: 'lockRed',
      shape: fxSpeedLine(0.22, 0.06),
      count: 4, emit: 'ring',
      spawn: { radius: [0.62, 0.7] }, angle: [45, 405], // four marks on the diagonals
      align: true,                           // each mark points away from the centre
      delayMs: [84, 84],                     // one frame after the hit, so the eye gets the star first
      lifeMs: [170, 250],
      scale: [[0, 1], [0.5, 0.7]],
    },
  ],
  // Short, upper-case, the meaning colour, above the shape and clear of it.
  onomatopoeia: { text: 'PETRIFIED!', zone: 'paper', style: 'burst', holdMs: 600, offset: [0, 1.0] },
  shake: 0.6, // a thud, not an explosion
};

/** What the validator says about it (clean: 0 errors, 0 warnings). */
export function fxPetrifyReport(): string {
  return formatFxReport(validateFxPreset(fxPetrifyExample));
}

/** The first frame already holds the whole pose: 1 star + 7 chips. The red marks arrive on frame 2. */
export function fxPetrifyFirstFrameCount(): number {
  return fxSimulate(fxPetrifyExample, 1, 0).length; // 8
}

/** And the scene objects, ready to add to a stage. */
export function fxPetrifyEmitter(seed: number) {
  return createFxEmitter(fxPetrifyExample, { seed });
}
