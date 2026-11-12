import { FxCatalog } from './catalog.js';
import {
  fxBlock, fxBolt, fxCrystal, fxDisc, fxDrop, fxGlyph, fxPuff, fxRing, fxShard, fxSpark, fxSparkle, fxSpeedLine,
  fxSplat, fxStarburst, fxTornStrip,
} from './shapes.js';
import type { FxKey, FxPreset } from './types.js';

/**
 * The shipped comic effects, one per game moment (FX_MOMENT_WORDS in catalog.ts).
 * Catalogue with intent per preset: .kiro/skills/procedural-particles-3d/references/preset-catalog.md
 *
 * Reading a preset: page space, +x screen-right, angles in degrees counter-clockwise from
 * screen-right. A hit is built the same way every time:
 *   1. one big shape that pops on the first frame (the flash),
 *   2. a handful of chunks thrown from it (the debris),
 *   3. a few bright marks (the accent),
 *   4. the word.
 */

/** Pop oversized on the first frame, settle, shrink in one step before cutting off. */
const POP: FxKey[] = [[0, 1.3], [0.34, 1], [0.67, 0.7]];
/** Thrown debris: full size, then two steps down. */
const CHUNK: FxKey[] = [[0, 1], [0.55, 0.75], [0.8, 0.45]];
/** A dust cloud: swells once, then thins. */
const PUFF: FxKey[] = [[0, 1], [0.3, 1.25], [0.7, 0.8]];
/** A shock ring: three drawn sizes. */
const RING: FxKey[] = [[0, 1], [0.34, 1.35], [0.67, 1.7]];
/** A glint: on, dim, on, off. */
const TWINKLE: FxKey[] = [[0, 1.2], [0.3, 0.7], [0.55, 1.1], [0.8, 0.5]];

const presets: FxPreset[] = [
  {
    id: 'fx.hop',
    label: 'Gutter hop',
    family: 'system',
    trigger: { event: 'ROOM_TRANSITION', moment: 'hop', when: 'upwardPanelsSmashed < 3 && !viaSymlinkLoop: the vibecoder jumps the gutter into the next panel' },
    anchor: 'feet',
    durationMs: 380,
    layers: [
      { name: 'puff', role: 'primary', zone: 'paper', shape: fxPuff(0.27), count: 4, emit: 'cone', angle: [0, 180], spawn: { radius: [0.1, 0.25] }, speed: [1.2, 1.9], drag: 6, lifeMs: [280, 370], size: [0.85, 1.15], scale: PUFF },
      { name: 'grit', role: 'secondary', zone: 'solder', shape: fxShard(0.26, 0.15), count: 6, emit: 'cone', angle: [30, 150], speed: [2, 3], gravity: 10, spin: [-360, 360], rotation: [0, 360], lifeMs: [220, 330], size: [0.8, 1.2], scale: CHUNK },
      { name: 'whoosh', role: 'accent', zone: 'phosphor', shape: fxSpeedLine(0.5, 0.08), count: 3, emit: 'line', spawn: { width: 0.6 }, origin: [0, 0.3], angle: [90, 90], speed: [1.8, 2.6], align: true, lifeMs: [170, 250], scale: [[0, 1], [0.6, 0.6]] },
    ],
    onomatopoeia: { text: 'HOP!', zone: 'phosphor', style: 'burst', holdMs: 420, offset: [0.75, 0.75] },
  },
  {
    id: 'fx.panel-smash',
    label: 'Panel smash',
    family: 'system',
    trigger: { event: 'ROOM_TRANSITION', moment: 'panel-smash', when: 'upwardPanelsSmashed >= 3: the vibecoder punches up through three panel frames' },
    anchor: 'center',
    durationMs: 720,
    shake: 1.5,
    layers: [
      { name: 'gutter', role: 'primary', zone: 'paper', shape: fxShard(0.62, 0.34), count: 8, emit: 'cone', angle: [25, 155], spawn: { radius: [0.2, 0.35] }, speed: [2.6, 3.8], gravity: 6, drag: 2.2, spin: [-300, 300], rotation: [0, 360], lifeMs: [480, 700], size: [0.8, 1.2], scale: [[0, 1.15], [0.12, 1], [0.75, 0.7]] },
      { name: 'frame', role: 'secondary', zone: 'ink', shape: fxShard(0.46, 0.24), count: 8, emit: 'cone', angle: [10, 170], spawn: { radius: [0.2, 0.3] }, speed: [2, 3.2], gravity: 7, drag: 2, spin: [-420, 420], rotation: [0, 360], lifeMs: [420, 640], size: [0.8, 1.2], scale: CHUNK },
      { name: 'punch', role: 'accent', zone: 'powerAmber', shape: fxStarburst(8, 0.5, 0.24), count: 1, emit: 'burst', lifeMs: [250, 250], scale: POP },
    ],
    onomatopoeia: { text: 'PANEL SMASH x3!', zone: 'powerAmber', style: 'jagged', holdMs: 720, offset: [0, -0.8], size: 0.32 },
  },
  {
    id: 'fx.permission-denied',
    label: 'Permission denied',
    family: 'system',
    trigger: { event: 'PERMISSION_DENIED_RATTLE', moment: 'permission-denied', when: 'always: the lock rattles and spits sparks' },
    anchor: 'center',
    durationMs: 420,
    shake: 0.8,
    layers: [
      { name: 'clash', role: 'primary', zone: 'lockRed', shape: fxStarburst(7, 0.36, 0.17), count: 1, emit: 'burst', lifeMs: [250, 250], scale: POP },
      { name: 'spark', role: 'secondary', zone: 'gold', shape: fxSpark(0.34, 0.1), count: 8, emit: 'burst', spawn: { radius: [0.15, 0.25] }, speed: [2, 3.2], drag: 6, align: true, lifeMs: [220, 340], size: [0.8, 1.2], scale: [[0, 1], [0.6, 0.6]] },
      { name: 'rattle', role: 'accent', zone: 'paper', shape: fxSpeedLine(0.2, 0.05), count: 4, emit: 'ring', spawn: { radius: [0.5, 0.56] }, angle: [20, 380], align: true, delayMs: [80, 170], lifeMs: [160, 240], scale: [[0, 1], [0.5, 0.7]] },
    ],
    onomatopoeia: { text: 'PERMISSION DENIED!', zone: 'lockRed', style: 'jagged', holdMs: 640, offset: [0, 0.85], size: 0.24 },
  },
  {
    id: 'fx.gate-open',
    label: 'Gate lifts',
    family: 'system',
    trigger: { event: 'INODE_MODE_CHANGED', moment: 'gate-open', when: '(newMode & 0o111) !== 0: chmod +rx lifts the firewall grille until it hits its stop' },
    anchor: 'center',
    durationMs: 520,
    layers: [
      { name: 'clang', role: 'primary', zone: 'paper', shape: fxSpeedLine(0.42, 0.11), count: 7, emit: 'cone', origin: [0, 0.75], spawn: { radius: [0.18, 0.24] }, angle: [10, 170], speed: [1.4, 2.2], drag: 7, align: true, lifeMs: [220, 300], size: [0.8, 1.2], scale: [[0, 1.2], [0.3, 1], [0.7, 0.6]] },
      { name: 'rust', role: 'secondary', zone: 'solder', shape: fxShard(0.2, 0.11), count: 8, emit: 'rain', spawn: { width: 0.9, height: 0.7 }, speed: [0.2, 0.8], gravity: 10, spin: [-240, 240], rotation: [0, 360], delayMs: [60, 180], lifeMs: [260, 340], size: [0.8, 1.2], scale: CHUNK },
      { name: 'open', role: 'accent', zone: 'phosphor', shape: fxSparkle(0.14), count: 3, emit: 'ring', spawn: { radius: [0.45, 0.6] }, angle: [200, 340], delayMs: [120, 260], lifeMs: [170, 250], scale: TWINKLE },
    ],
    onomatopoeia: { text: 'CLANK!', zone: 'phosphor', style: 'burst', holdMs: 520, offset: [0.6, 1.12] },
  },
  {
    id: 'fx.reveal',
    label: 'Lantern reveal',
    family: 'vibecoder',
    trigger: { event: 'LANTERN_REVEAL', moment: 'reveal', when: 'always: ls -a lights the lantern cone and a dotfile shows itself' },
    anchor: 'center',
    durationMs: 640,
    layers: [
      { name: 'glint', role: 'primary', zone: 'lantern', shape: fxSparkle(0.3), count: 6, emit: 'ring', spawn: { radius: [0.45, 0.85] }, speed: [0.1, 0.35], delayMs: [0, 200], lifeMs: [300, 430], size: [0.75, 1.25], scale: TWINKLE },
      { name: 'mote', role: 'secondary', zone: 'paper', shape: fxSparkle(0.13, 0.5), count: 9, emit: 'burst', spawn: { radius: [0.2, 0.55] }, speed: [0.6, 1.2], drag: 4, rotation: [0, 90], delayMs: [0, 120], lifeMs: [300, 500], size: [0.8, 1.2], scale: CHUNK },
      { name: 'sweep', role: 'accent', zone: 'dataCyan', shape: fxRing(0.3, 0.026), count: 1, emit: 'burst', lifeMs: [250, 250], scale: [[0, 1], [0.5, 1.3]] },
    ],
    onomatopoeia: { text: 'REVEAL!', zone: 'lantern', style: 'burst', holdMs: 600, offset: [0, 1.1] },
  },
  {
    id: 'fx.rm-ash',
    label: 'rm: burn to ink ash',
    family: 'system',
    trigger: { event: 'COMMAND', moment: 'rm-ash', when: 'rm removes an obstacle or trap: it flares, then drifts off as flakes of ink' },
    anchor: 'center',
    durationMs: 760,
    layers: [
      { name: 'ash', role: 'primary', zone: 'ink', shape: fxShard(0.3, 0.18), count: 13, emit: 'burst', spawn: { radius: [0.1, 0.45] }, speed: [0.5, 1.3], gravity: -1.4, drag: 2, spin: [-200, 200], rotation: [0, 360], delayMs: [80, 260], lifeMs: [360, 500], size: [0.75, 1.25], scale: CHUNK },
      { name: 'flame', role: 'secondary', zone: 'lockRed', shape: fxDrop(0.46, 0.22), count: 4, emit: 'line', spawn: { width: 0.8, height: 0.2 }, angle: [78, 102], speed: [1.4, 2.4], drag: 5, align: true, lifeMs: [180, 260], size: [0.8, 1.2], scale: [[0, 1.2], [0.4, 0.9], [0.75, 0.5]] },
      { name: 'ember', role: 'accent', zone: 'powerAmber', shape: fxBlock(0.09), count: 7, emit: 'cone', angle: [50, 130], speed: [1.5, 2.6], gravity: -2, drag: 3, delayMs: [0, 120], lifeMs: [300, 520], scale: [[0, 1], [0.6, 0.6]] },
    ],
  },
  {
    id: 'fx.touch-materialize',
    label: 'touch: glyphs assemble',
    family: 'system',
    trigger: { event: 'COMMAND', moment: 'touch-materialize', when: 'touch creates a file: loose glyphs are pulled together and snap into the object' },
    anchor: 'center',
    durationMs: 560,
    layers: [
      { name: 'plus', role: 'primary', zone: 'phosphor', shape: fxGlyph('plus', 0.32), count: 6, emit: 'implode', spawn: { radius: [0.75, 1.05] }, swirl: 70, lifeMs: [320, 400], scale: [[0, 1], [0.6, 0.8], [0.85, 0.5]] },
      { name: 'bit', role: 'primary', zone: 'phosphor', shape: fxGlyph('one', 0.32), count: 5, emit: 'implode', spawn: { radius: [0.55, 0.85] }, angle: [40, 400], swirl: 70, delayMs: [40, 120], lifeMs: [300, 380], scale: [[0, 1], [0.6, 0.8], [0.85, 0.5]] },
      { name: 'bracket', role: 'secondary', zone: 'dataCyan', shape: fxGlyph('bracket', 0.32), count: 5, emit: 'implode', spawn: { radius: [0.6, 0.9] }, angle: [20, 380], swirl: -50, delayMs: [0, 100], lifeMs: [320, 420], scale: [[0, 1], [0.6, 0.8], [0.85, 0.5]] },
      { name: 'snap', role: 'accent', zone: 'paper', shape: fxSparkle(0.36), count: 1, emit: 'burst', delayMs: [334, 334], lifeMs: [220, 220], scale: [[0, 1.15], [0.4, 0.8]] },
    ],
  },
  {
    id: 'fx.mv-dust',
    label: 'mv: drag dust',
    family: 'system',
    trigger: { event: 'OBJECT_MOVED', moment: 'mv-dust', when: '!suckedIntoNull: an object is shoved across the floor. Authored for motion toward screen-right; mirror the emitter group for the other way' },
    anchor: 'feet',
    durationMs: 440,
    layers: [
      { name: 'dust', role: 'primary', zone: 'paper', shape: fxPuff(0.27), count: 4, emit: 'cone', angle: [150, 185], spawn: { radius: [0.1, 0.6] }, speed: [0.8, 1.6], drag: 4, lifeMs: [300, 420], size: [0.8, 1.2], scale: PUFF },
      { name: 'grit', role: 'secondary', zone: 'solder', shape: fxShard(0.26, 0.15), count: 6, emit: 'cone', angle: [110, 170], speed: [1.8, 2.8], gravity: 9, spin: [-300, 300], rotation: [0, 360], lifeMs: [220, 330], size: [0.8, 1.2], scale: CHUNK },
      { name: 'streak', role: 'accent', zone: 'powerAmber', shape: fxSpeedLine(0.8, 0.07), count: 3, emit: 'line', origin: [-0.5, 0.4], spawn: { height: 0.6 }, angle: [180, 180], speed: [0.8, 1.4], align: true, lifeMs: [170, 250], scale: [[0, 1], [0.6, 0.6]] },
    ],
  },
  {
    id: 'fx.sigkill',
    label: 'SIGKILL',
    family: 'system',
    trigger: { event: 'PROC_SIGNALED', moment: 'sigkill', when: "outcome === 'KILLED': kill -9 blows the process into pixels" },
    anchor: 'center',
    durationMs: 640,
    shake: 1.6,
    flash: 2.5,
    layers: [
      { name: 'blast', role: 'primary', zone: 'powerAmber', shape: fxStarburst(10, 0.62, 0.3), count: 1, emit: 'burst', lifeMs: [250, 250], scale: POP },
      { name: 'pixel', role: 'secondary', zone: 'lockRed', shape: fxBlock(0.16), count: 14, emit: 'burst', spawn: { radius: [0.15, 0.35] }, speed: [2.4, 4.2], drag: 4.5, lifeMs: [380, 620], size: [0.7, 1.3], scale: CHUNK },
      { name: 'core', role: 'accent', zone: 'paper', shape: fxStarburst(6, 0.27, 0.11), count: 1, emit: 'burst', lifeMs: [170, 170], scale: [[0, 1.2], [0.5, 0.8]] },
      { name: 'bit', role: 'accent', zone: 'paper', shape: fxBlock(0.08), count: 6, emit: 'burst', angle: [30, 390], speed: [3.4, 5], drag: 4, lifeMs: [300, 480], scale: [[0, 1], [0.6, 0.6]] },
    ],
    onomatopoeia: { text: 'SIGKILL!', zone: 'paper', style: 'jagged', holdMs: 640, offset: [0, 1.05], size: 0.34 },
  },
  {
    id: 'fx.sigstop-ice',
    label: 'SIGSTOP ice',
    family: 'system',
    trigger: { event: 'PROC_SIGNALED', moment: 'sigstop-ice', when: "outcome === 'FROZEN': kill -STOP snaps a shell of ice crystals onto the process" },
    anchor: 'center',
    durationMs: 560,
    layers: [
      { name: 'crystal', role: 'primary', zone: 'ice', shape: fxCrystal(0.56, 0.2), count: 8, emit: 'ring', spawn: { radius: [0.34, 0.44] }, align: true, delayMs: [0, 90], lifeMs: [400, 460], size: [0.75, 1.25], scale: [[0, 1.25], [0.2, 1]] },
      { name: 'chip', role: 'secondary', zone: 'paper', shape: fxShard(0.24, 0.13), count: 8, emit: 'burst', angle: [22, 382], spawn: { radius: [0.3, 0.4] }, speed: [1.4, 2.4], drag: 6, spin: [-200, 200], rotation: [0, 360], lifeMs: [220, 330], size: [0.8, 1.2], scale: CHUNK },
      { name: 'glint', role: 'accent', zone: 'phosphor', shape: fxSparkle(0.17), count: 4, emit: 'ring', spawn: { radius: [0.65, 0.85] }, angle: [45, 405], delayMs: [120, 260], lifeMs: [150, 220], scale: TWINKLE },
    ],
    onomatopoeia: { text: 'FROZEN!', zone: 'dataCyan', style: 'burst', holdMs: 560, offset: [0, 1.15] },
  },
  {
    id: 'fx.sigterm-rage',
    label: 'SIGTERM ignored',
    family: 'malware',
    trigger: { event: 'PROC_SIGNALED', moment: 'sigterm-rage', when: "outcome === 'TRAPPED_ENRAGED': the boss traps a polite kill and flares red" },
    anchor: 'center',
    durationMs: 600,
    shake: 1.3,
    layers: [
      { name: 'rage', role: 'primary', zone: 'corruptMagenta', shape: fxStarburst(9, 0.6, 0.3, 0.3), count: 1, emit: 'burst', lifeMs: [330, 330], scale: [[0, 1.3], [0.25, 1], [0.5, 1.15], [0.75, 0.8]] },
      { name: 'spike', role: 'secondary', zone: 'corruptViolet', shape: fxSpark(0.56, 0.17), count: 9, emit: 'ring', spawn: { radius: [0.5, 0.6] }, speed: [1.3, 2], drag: 6, align: true, lifeMs: [300, 460], size: [0.8, 1.2], scale: [[0, 1], [0.6, 0.7]] },
      { name: 'ember', role: 'accent', zone: 'malwareEye', shape: fxBlock(0.1), count: 8, emit: 'burst', angle: [20, 380], speed: [2.2, 3.4], drag: 5, lifeMs: [300, 560], scale: [[0, 1], [0.6, 0.6]] },
    ],
    onomatopoeia: { text: 'SIGTERM IGNORED!', zone: 'malwareEye', style: 'jagged', holdMs: 700, offset: [0, 1.2], size: 0.26 },
  },
  {
    id: 'fx.fork-spawn',
    label: 'System Hand ink splash',
    family: 'system',
    trigger: { event: 'SYSTEM_HAND_SPAWN', moment: 'fork-spawn', when: 'always: ink splashes where the stylus touches down (boss_fork and cron_restore)' },
    anchor: 'center',
    durationMs: 620,
    layers: [
      { name: 'blot', role: 'primary', zone: 'ink', shape: fxSplat(0.36), count: 1, emit: 'burst', lifeMs: [330, 330], scale: [[0, 1.2], [0.25, 1], [0.75, 0.8]] },
      { name: 'drop', role: 'primary', zone: 'ink', shape: fxDrop(0.28, 0.14), count: 8, emit: 'burst', spawn: { radius: [0.2, 0.3] }, speed: [1.6, 2.8], drag: 5, gravity: 4, align: true, lifeMs: [300, 480], size: [0.75, 1.25], scale: CHUNK },
      { name: 'fleck', role: 'secondary', zone: 'paper', shape: fxDisc(0.085, 6), count: 9, emit: 'burst', angle: [20, 380], speed: [2, 3.4], drag: 4, gravity: 5, lifeMs: [280, 520], size: [0.7, 1.3], scale: CHUNK },
      { name: 'stroke', role: 'accent', zone: 'dataCyan', shape: fxSpeedLine(0.3, 0.05), count: 4, emit: 'ring', spawn: { radius: [0.6, 0.7] }, angle: [45, 405], align: true, delayMs: [160, 250], lifeMs: [160, 240], scale: [[0, 1], [0.5, 0.7]] },
    ],
    onomatopoeia: { text: 'FORK()!', zone: 'paper', style: 'glitch', holdMs: 600, offset: [0, 1.05] },
  },
  {
    id: 'fx.pickup-energy',
    label: 'Energy cell collected',
    family: 'system',
    trigger: { event: 'GAME_TICK', moment: 'pickup-energy', when: 'the vibecoder touches an energy cell. Pass the amount: createFxEmitter(preset, { text: `+${hp}HP` })' },
    anchor: 'center',
    durationMs: 520,
    layers: [
      { name: 'flash', role: 'primary', zone: 'powerAmber', shape: fxStarburst(8, 0.34, 0.16), count: 1, emit: 'burst', lifeMs: [250, 250], scale: POP },
      { name: 'plus', role: 'primary', zone: 'powerAmber', shape: fxGlyph('plus', 0.2), count: 3, emit: 'line', spawn: { width: 0.7 }, origin: [0, 0.1], angle: [90, 90], speed: [1.2, 1.6], drag: 2, delayMs: [80, 170], lifeMs: [300, 350], scale: [[0, 1.2], [0.2, 1], [0.8, 0.6]] },
      { name: 'arc', role: 'secondary', zone: 'copper', shape: fxSpark(0.3, 0.1), count: 7, emit: 'burst', spawn: { radius: [0.2, 0.3] }, speed: [1.8, 2.8], drag: 6, align: true, lifeMs: [220, 330], size: [0.8, 1.2], scale: [[0, 1], [0.6, 0.6]] },
      { name: 'glint', role: 'accent', zone: 'paper', shape: fxSparkle(0.12), count: 4, emit: 'ring', spawn: { radius: [0.5, 0.65] }, angle: [45, 405], delayMs: [100, 220], lifeMs: [150, 220], scale: TWINKLE },
    ],
    onomatopoeia: { text: '+25HP', zone: 'powerAmber', style: 'burst', holdMs: 520, offset: [0, 1.05] },
  },
  {
    id: 'fx.pickup-ram',
    label: 'RAM stick collected',
    family: 'system',
    trigger: { event: 'GAME_TICK', moment: 'pickup-ram', when: 'the vibecoder touches a RAM stick. Pass the amount: { text: `+${gb}GB` }' },
    anchor: 'center',
    durationMs: 520,
    layers: [
      { name: 'ring', role: 'primary', zone: 'dataCyan', shape: fxRing(0.26, 0.05), count: 1, emit: 'burst', lifeMs: [250, 250], scale: RING },
      { name: 'one', role: 'primary', zone: 'dataCyan', shape: fxGlyph('one', 0.22), count: 3, emit: 'line', spawn: { width: 0.8 }, origin: [0, 0.1], angle: [90, 90], speed: [1.2, 1.6], drag: 2, delayMs: [60, 170], lifeMs: [300, 350], scale: [[0, 1.2], [0.2, 1], [0.8, 0.6]] },
      { name: 'zero', role: 'primary', zone: 'dataCyan', shape: fxGlyph('zero', 0.2), count: 2, emit: 'line', spawn: { width: 0.5 }, origin: [0, 0.25], angle: [90, 90], speed: [1.2, 1.6], drag: 2, delayMs: [100, 170], lifeMs: [300, 350], scale: [[0, 1.2], [0.2, 1], [0.8, 0.6]] },
      { name: 'board', role: 'secondary', zone: 'pcb', shape: fxShard(0.24, 0.13), count: 6, emit: 'burst', spawn: { radius: [0.15, 0.25] }, speed: [1.8, 2.8], drag: 6, spin: [-240, 240], rotation: [0, 360], lifeMs: [220, 330], size: [0.8, 1.2], scale: CHUNK },
      { name: 'pin', role: 'accent', zone: 'gold', shape: fxSparkle(0.12), count: 4, emit: 'ring', spawn: { radius: [0.5, 0.65] }, angle: [45, 405], delayMs: [100, 220], lifeMs: [150, 220], scale: TWINKLE },
    ],
    onomatopoeia: { text: '+16GB', zone: 'dataCyan', style: 'burst', holdMs: 520, offset: [0, 1.05] },
  },
  {
    id: 'fx.pickup-ssd',
    label: 'SSD collected',
    family: 'system',
    trigger: { event: 'GAME_TICK', moment: 'pickup-ssd', when: 'the vibecoder touches an SSD. Pass the amount: { text: `+${gb}GB` }' },
    anchor: 'center',
    durationMs: 520,
    layers: [
      { name: 'slab', role: 'primary', zone: 'phosphor', shape: fxBlock(0.4, 0.3), count: 1, emit: 'burst', rotation: [8, 8], lifeMs: [250, 250], scale: POP },
      { name: 'hash', role: 'primary', zone: 'phosphor', shape: fxGlyph('hash', 0.2), count: 4, emit: 'line', spawn: { width: 0.9 }, origin: [0, 0.1], angle: [90, 90], speed: [1.2, 1.6], drag: 2, delayMs: [60, 170], lifeMs: [300, 350], scale: [[0, 1.2], [0.2, 1], [0.8, 0.6]] },
      { name: 'shell', role: 'secondary', zone: 'solder', shape: fxBlock(0.15, 0.09), count: 8, emit: 'burst', spawn: { radius: [0.15, 0.25] }, speed: [1.8, 2.8], drag: 6, lifeMs: [220, 330], size: [0.8, 1.2], scale: CHUNK },
      { name: 'led', role: 'accent', zone: 'paper', shape: fxSparkle(0.12), count: 4, emit: 'ring', spawn: { radius: [0.5, 0.65] }, angle: [45, 405], delayMs: [100, 220], lifeMs: [150, 220], scale: TWINKLE },
    ],
    onomatopoeia: { text: '+256GB', zone: 'phosphor', style: 'burst', holdMs: 520, offset: [0, 1.05] },
  },
  {
    id: 'fx.hit-vibecoder',
    seedKey: 'fx.hit-hero',
    label: 'Vibecoder takes damage',
    family: 'vibecoder',
    trigger: { event: 'PLAYER_DAMAGED', moment: 'hit-vibecoder', when: 'always. Pass the amount: { text: `-${amount}HP` }' },
    anchor: 'center',
    durationMs: 360,
    shake: 1.1,
    layers: [
      { name: 'impact', role: 'primary', zone: 'paper', shape: fxStarburst(7, 0.5, 0.22, 0.3), count: 1, emit: 'burst', lifeMs: [250, 250], scale: POP },
      { name: 'thread', role: 'secondary', zone: 'hoodie', shape: fxShard(0.3, 0.16), count: 6, emit: 'burst', spawn: { radius: [0.38, 0.48] }, speed: [2, 3.2], drag: 6, spin: [-300, 300], rotation: [0, 360], lifeMs: [220, 340], size: [0.8, 1.2], scale: CHUNK },
      { name: 'pain', role: 'accent', zone: 'lockRed', shape: fxSpark(0.24, 0.08), count: 5, emit: 'ring', spawn: { radius: [0.55, 0.62] }, angle: [36, 396], speed: [1, 1.6], drag: 5, align: true, lifeMs: [170, 250], scale: [[0, 1], [0.6, 0.6]] },
    ],
    onomatopoeia: { text: '-10HP', zone: 'lockRed', style: 'jagged', holdMs: 520, offset: [0, 1.0] },
  },
  {
    id: 'fx.malware-hit',
    label: 'Malware takes a hit',
    family: 'malware',
    trigger: { event: 'GAME_TICK', moment: 'malware-hit', when: 'a command damages an enemy without killing it: the corruption slips sideways for two frames' },
    anchor: 'center',
    durationMs: 330,
    layers: [
      { name: 'impact', role: 'primary', zone: 'corruptMagenta', shape: fxStarburst(6, 0.4, 0.18, 0.3), count: 1, emit: 'burst', lifeMs: [250, 250], scale: POP },
      { name: 'slip', role: 'secondary', zone: 'corruptViolet', shape: fxBlock(0.26, 0.09), count: 7, emit: 'line', spawn: { width: 0.5, height: 1.0 }, angle: [0, 0], speed: [1.4, 3], drag: 9, lifeMs: [170, 320], size: [0.7, 1.3], scale: [[0, 1], [0.6, 0.6]] },
      { name: 'bile', role: 'accent', zone: 'toxicGreen', shape: fxSpark(0.22, 0.08), count: 5, emit: 'burst', angle: [18, 378], spawn: { radius: [0.3, 0.4] }, speed: [1.6, 2.6], drag: 6, align: true, lifeMs: [170, 280], scale: [[0, 1], [0.6, 0.6]] },
    ],
  },
  {
    id: 'fx.malware-death',
    label: 'Malware dies',
    family: 'malware',
    trigger: { event: 'GAME_TICK', moment: 'malware-death', when: 'an enemy is removed: the corruption shatters into glitch blocks, its code dissolves upward' },
    anchor: 'center',
    durationMs: 820,
    shake: 0.8,
    layers: [
      { name: 'block', role: 'primary', zone: 'corruptViolet', shape: fxBlock(0.22), count: 13, emit: 'burst', spawn: { radius: [0.1, 0.55] }, speed: [0.8, 2.2], drag: 5, delayMs: [0, 160], lifeMs: [380, 640], size: [0.6, 1.4], scale: [[0, 1], [0.4, 0.75], [0.7, 0.5], [0.9, 0.25]] },
      { name: 'code', role: 'secondary', zone: 'corruptMagenta', shape: fxGlyph('slash', 0.26), count: 8, emit: 'line', spawn: { width: 1.1, height: 0.9 }, angle: [90, 90], speed: [0.7, 1.3], gravity: -1, delayMs: [150, 340], lifeMs: [320, 460], size: [0.8, 1.2], scale: [[0, 1], [0.7, 0.7]], alpha: [[0, 1], [0.6, 0.5]] },
      { name: 'eye', role: 'accent', zone: 'malwareEye', shape: fxStarburst(6, 0.26, 0.1), count: 1, emit: 'burst', lifeMs: [250, 250], scale: POP },
      { name: 'bile', role: 'accent', zone: 'toxicGreen', shape: fxGlyph('hash', 0.16), count: 4, emit: 'burst', angle: [45, 405], speed: [1.8, 2.8], drag: 4, delayMs: [80, 160], lifeMs: [300, 460], scale: [[0, 1], [0.6, 0.6]] },
    ],
    onomatopoeia: { text: 'SEGFAULT!', zone: 'toxicGreen', style: 'glitch', holdMs: 760, offset: [0, 1.15] },
  },
  {
    id: 'fx.devnull-suck',
    label: '/dev/null pulls it in',
    family: 'system',
    trigger: { event: 'OBJECT_MOVED', moment: 'devnull-suck', when: 'suckedIntoNull: whatever was moved or redirected is stretched into the drain. Origin on the vortex centre' },
    anchor: 'center',
    durationMs: 640,
    layers: [
      { name: 'streak', role: 'primary', zone: 'paper', shape: fxSpeedLine(0.62, 0.13), count: 12, emit: 'implode', spawn: { radius: [0.8, 1.1] }, swirl: 80, align: true, delayMs: [0, 220], lifeMs: [300, 400], scale: [[0, 1], [0.6, 0.7], [0.85, 0.4]] },
      { name: 'byte', role: 'secondary', zone: 'dataCyan', shape: fxBlock(0.16), count: 10, emit: 'implode', spawn: { radius: [0.6, 1.05] }, angle: [18, 378], swirl: 120, delayMs: [0, 200], lifeMs: [320, 420], size: [0.7, 1.3], scale: [[0, 1], [0.6, 0.7], [0.85, 0.4]] },
      { name: 'rim', role: 'accent', zone: 'glass', shape: fxRing(0.36, 0.024), count: 2, emit: 'burst', delayMs: [0, 200], lifeMs: [420, 420], scale: [[0, 1], [0.34, 0.7], [0.67, 0.4]] },
    ],
  },
  {
    id: 'fx.lightning-strike',
    label: 'Lightning strike',
    family: 'system',
    trigger: { event: 'INTRO', moment: 'lightning-strike', when: 'ComicStage.triggerLightningIntro(), storm strikes and the SIGKILL bolt. Origin on the ground where it lands' },
    anchor: 'feet',
    durationMs: 460,
    fullPanel: true,
    shake: 1.6,
    flash: 5.5,
    layers: [
      { name: 'bolt', role: 'primary', zone: 'dataCyan', shape: fxBolt(4.0, 0.8), count: 1, emit: 'burst', origin: [0.15, 2.0], lifeMs: [250, 250], scale: [[0, 1], [0.34, 1.06], [0.67, 0.94]] },
      { name: 'core', role: 'secondary', zone: 'paper', shape: fxBolt(3.8, 0.36), count: 1, emit: 'burst', origin: [0.15, 2.0], lifeMs: [170, 170], scale: [[0, 1]] },
      { name: 'strike', role: 'secondary', zone: 'paper', shape: fxStarburst(9, 0.6, 0.26, 0.3), count: 1, emit: 'burst', lifeMs: [250, 250], scale: POP },
      { name: 'spark', role: 'accent', zone: 'powerAmber', shape: fxSpark(0.42, 0.13), count: 10, emit: 'cone', angle: [12, 168], speed: [3, 5.5], gravity: 9, drag: 2, align: true, delayMs: [84, 84], lifeMs: [240, 370], size: [0.8, 1.2], scale: [[0, 1], [0.6, 0.6]] },
    ],
    onomatopoeia: { text: 'KRAKOOM!', zone: 'paper', style: 'jagged', holdMs: 700, offset: [-1.25, 2.7], size: 0.42 },
  },
  {
    id: 'fx.flood-splash',
    label: 'Flood splash',
    family: 'system',
    trigger: { event: 'ROOM_TRANSITION', moment: 'flood-splash', when: 'viaSymlinkLoop: the data flood rises 18% and slaps the panel. Also when the vibecoder lands in flooded rooms. Origin on the water line' },
    anchor: 'feet',
    durationMs: 620,
    layers: [
      { name: 'drop', role: 'primary', zone: 'dataCyan', shape: fxDrop(0.3, 0.16), count: 9, emit: 'cone', angle: [50, 130], speed: [2.6, 3.8], gravity: 11, align: true, lifeMs: [400, 600], size: [0.75, 1.25], scale: [[0, 1.15], [0.2, 1], [0.8, 0.6]] },
      { name: 'foam', role: 'secondary', zone: 'glass', shape: fxPuff(0.16), count: 4, emit: 'line', spawn: { width: 1.0 }, angle: [90, 90], speed: [0.2, 0.5], lifeMs: [250, 370], size: [0.8, 1.2], scale: PUFF },
      { name: 'fleck', role: 'accent', zone: 'paper', shape: fxDisc(0.055, 6), count: 7, emit: 'cone', angle: [30, 150], speed: [3, 4.4], gravity: 11, lifeMs: [300, 520], scale: [[0, 1], [0.6, 0.7]] },
    ],
    onomatopoeia: { text: 'SPLASH!', zone: 'dataCyan', style: 'burst', holdMs: 520, offset: [0.2, 1.25] },
  },
  {
    id: 'fx.door-unlock',
    label: 'Socket unlocks',
    family: 'system',
    trigger: { event: 'PUZZLE_DOOR_RESOLVED', moment: 'door-unlock', when: 'always: the right answer was written to the socket and its LED turns green. Origin on the door `lock` socket' },
    anchor: 'center',
    durationMs: 560,
    layers: [
      { name: 'ok', role: 'primary', zone: 'phosphor', shape: fxRing(0.26, 0.05), count: 1, emit: 'burst', lifeMs: [250, 250], scale: RING },
      { name: 'echo', role: 'primary', zone: 'phosphor', shape: fxRing(0.26, 0.035), count: 1, emit: 'burst', delayMs: [170, 170], lifeMs: [250, 250], scale: RING },
      { name: 'contact', role: 'secondary', zone: 'gold', shape: fxSpark(0.44, 0.16), count: 7, emit: 'burst', spawn: { radius: [0.2, 0.26] }, speed: [1.8, 2.8], drag: 6, align: true, lifeMs: [220, 340], size: [0.8, 1.2], scale: [[0, 1], [0.6, 0.6]] },
      { name: 'glint', role: 'accent', zone: 'paper', shape: fxSparkle(0.17), count: 3, emit: 'ring', spawn: { radius: [0.7, 0.85] }, angle: [30, 390], delayMs: [150, 300], lifeMs: [150, 220], scale: TWINKLE },
    ],
    onomatopoeia: { text: 'UNLOCKED!', zone: 'phosphor', style: 'burst', holdMs: 600, offset: [0, 1.1] },
  },
  {
    id: 'fx.coredump',
    label: 'Kernel coredump page tear',
    family: 'system',
    trigger: { event: 'GAME_TICK', moment: 'coredump', when: 'KERNEL_OVERLORD breaks (floor 5, phase 3) or the vibecoder dies: the page itself tears down the middle' },
    anchor: 'center',
    durationMs: 1100,
    fullPanel: true,
    shake: 2,
    flash: 3,
    layers: [
      { name: 'page-left', role: 'primary', zone: 'paper', shape: fxTornStrip(1.9, 0.56), count: 3, emit: 'line', origin: [-0.7, 0], spawn: { height: 2.2 }, angle: [172, 188], speed: [1.2, 2.2], drag: 3, rotation: [-14, 14], spin: [-20, 20], delayMs: [84, 170], lifeMs: [700, 920], scale: [[0, 1], [0.6, 0.9], [0.85, 0.6]] },
      { name: 'page-right', role: 'primary', zone: 'paper', shape: fxTornStrip(1.9, 0.56), count: 3, emit: 'line', origin: [0.7, 0], spawn: { height: 2.2 }, angle: [-8, 8], speed: [1.2, 2.2], drag: 3, rotation: [-14, 14], spin: [-20, 20], delayMs: [84, 170], lifeMs: [700, 920], scale: [[0, 1], [0.6, 0.9], [0.85, 0.6]] },
      { name: 'tear', role: 'secondary', zone: 'ink', shape: fxBolt(4.2, 0.6), count: 1, emit: 'burst', lifeMs: [1000, 1000], scale: [[0, 1], [0.17, 1.12], [0.5, 1.25]] },
      { name: 'glitch', role: 'accent', zone: 'lockRed', shape: fxBlock(0.3, 0.09), count: 10, emit: 'line', spawn: { width: 2.6, height: 3 }, angle: [0, 0], speed: [0.5, 2], drag: 6, delayMs: [0, 600], lifeMs: [170, 330], size: [0.7, 1.4], scale: [[0, 1], [0.5, 0.6]] },
    ],
    onomatopoeia: { text: 'COREDUMP!', zone: 'lockRed', style: 'glitch', holdMs: 1000, offset: [-1.45, 2.3], size: 0.4 },
  },
];

// Guarded so a hot reload of this module does not throw on re-registration.
for (const preset of presets) if (!FxCatalog.has(preset.id)) FxCatalog.register(preset);
