/**
 * Per-enemy acting, as data: how each piece of malware travels, how often it attacks, and the keyed
 * poses of its own attack and death. The shared language (glitch jitter, stepped travel, dropped
 * frames, a tracking eye) comes from the tags and the animator; a sheet only says what is different.
 * One game tick = 1 s (ANIM_TICK_MS). Skill: .kiro/skills/procedural-malware-animation/SKILL.md
 */
import type { AnimState, AnimStateOverrides } from './states.js';

/** The part of the animator options a per-model acting sheet may set. */
export interface AnimActingOptions {
  /** Poses per second. Default 12 ("on twos"). */
  fps?: number;
  /** Per-model acting: replaces fields of the shared states. */
  states?: AnimStateOverrides;
}

export const ANIM_TICK_MS = 1000;

export type AnimTravel =
  | 'drift'    // floats a short step at a time
  | 'burrow'   // sinks, travels flat, pops up
  | 'perch'    // does not travel
  | 'scuttle'  // short fast steps in changing directions, with pauses
  | 'lunge'    // still, then one long straight move
  | 'hover'    // bobs in the air, slides sideways
  | 'fade'     // disappears here, reappears there
  | 'shuffle'  // slow dragging walk
  | 'anchor';  // planted; only its limbs move

export interface AnimActingPhase {
  name: string;
  /** The looping state the boss rests in during this phase. */
  state: AnimState;
  attackEveryTicks: number;
  note: string;
}

export interface AnimActingSheet {
  /** Model id in ModelCatalog. */
  id: string;
  /** The one motion that identifies this enemy with the colour switched off. */
  signature: string;
  travel: AnimTravel;
  /** Poses per second. Lower = more dropped frames = more broken. The vibecoder runs at 12. */
  fps: number;
  /** Stage-level travel: the Group jumps `stepUnits` every `stepEveryMs`, never slides. 0 = stays put. */
  stepUnits: number;
  stepEveryMs: number;
  /** Ticks between attacks on the vibecoder. 0 = it never damages the vibecoder by itself. */
  attackEveryTicks: number;
  /** The tell: how long before the damage tick the wind-up cue starts, and what it is. */
  telegraphMs: number;
  telegraph: string;
  /** What the attack looks like. Its poses are in `states.attack`. */
  attack: string;
  /** What dying looks like, and what the FX layer adds on which beat. */
  death: string;
  /** Overrides of the shared states for this model. Pass to `createAnimator(model, { states })`. */
  states: AnimStateOverrides;
  /** Bosses only. */
  phases?: AnimActingPhase[];
}

const sheet = (s: AnimActingSheet): AnimActingSheet => s;

export const ANIM_MALWARE_ACTING: Record<string, AnimActingSheet> = {
  'malware.virus': sheet({
    id: 'malware.virus',
    signature: 'Buds: the small copy on its side swells out of step with the core, and the spikes ripple round the capsid.',
    travel: 'drift', fps: 10, stepUnits: 0.12, stepEveryMs: 500,
    attackEveryTicks: 2, telegraphMs: 500, telegraph: 'spikes pull in tight (whole body 0.9)',
    attack: 'Spike burst: shrinks, then snaps to 1.25 for two poses. It does not travel; the spikes reach.',
    death: 'Splits: on `impact` it flashes, on `collapse` two half-size copies pop out left and right (`revealed`), the original shatters.',
    states: {
      attack: { duration: 0.6, keys: [
        { at: 0, beat: 'anticipation', scaleX: 0.88, scaleY: 0.88 },
        { at: 0.25, beat: 'strike', scaleX: 1.25, scaleY: 1.25, forward: 0.1, emissiveAdd: 0.5 },
        { at: 0.42, beat: 'recover', scaleX: 1.06, scaleY: 1.06 },
        { at: 0.6, ease: 'ease' },
      ] },
    },
  }),
  'malware.worm': sheet({
    id: 'malware.worm',
    signature: 'An S that travels down the chain: each segment sways a beat after the one in front, the drill head never stops turning.',
    travel: 'burrow', fps: 8, stepUnits: 0.5, stepEveryMs: 900,
    attackEveryTicks: 3, telegraphMs: 700, telegraph: 'sinks into its port until only the drill shows',
    attack: 'Burrow strike: flattens to the floor, crosses flat, erupts tall under the vibecoder.',
    death: 'Unthreads: segments drop back to front (scatter), the drill head falls last. Ink ash on `gone`.',
    states: {
      attack: { duration: 0.85, keys: [
        { at: 0, beat: 'anticipation', scaleX: 1.15, scaleY: 0.25 },
        { at: 0.3, forward: 0.55, scaleX: 1.3, scaleY: 0.18 },
        { at: 0.5, beat: 'strike', forward: 0.6, scaleX: 0.85, scaleY: 1.3, emissiveAdd: 0.4 },
        { at: 0.62, beat: 'recover', forward: 0.6, scaleX: 1, scaleY: 1 },
        { at: 0.85, ease: 'ease' },
      ] },
      death: { duration: 0.9, keys: [
        { at: 0, beat: 'impact', emissiveAdd: 1, scaleX: 1.08, scaleY: 0.94 },
        { at: 0.12, beat: 'hold', emissiveAdd: 0.3 },
        { at: 0.3, beat: 'collapse', emissiveAdd: 0.3 },
        { at: 0.75, ease: 'ease', scaleY: 0.3, scatter: 0.5, opacity: 0.7 },
        { at: 0.9, beat: 'gone', ease: 'ease', scaleY: 0.1, scatter: 0.7, opacity: 0 },
      ] },
    },
  }),
  'malware.trojan': sheet({
    id: 'malware.trojan',
    signature: 'Stillness. A gift box that does not move for three seconds, then bites.',
    travel: 'perch', fps: 12, stepUnits: 0, stepEveryMs: 0,
    attackEveryTicks: 3, telegraphMs: 1000, telegraph: 'the lid rattles (jitter x2) and the eye opens for the whole tick before the bite',
    attack: 'Bite: rears back and up, snaps forward and down with a deep lean, holds the bite two poses.',
    death: 'chmod -x petrifies it instead (stone, no death). kill -9 or rm: the box bursts, the gargoyle shatters; shards on `collapse`.',
    states: {
      attack: { duration: 0.7, keys: [
        { at: 0, beat: 'anticipation', forward: -0.15, up: 0.1, lean: -0.28, scaleX: 0.95, scaleY: 1.08 },
        { at: 0.33, beat: 'strike', forward: 0.32, up: -0.02, lean: 0.38, scaleX: 1.14, scaleY: 0.9, emissiveAdd: 0.4 },
        { at: 0.5, beat: 'recover', forward: 0.2, lean: 0.15 },
        { at: 0.7, ease: 'ease' },
      ] },
    },
  }),
  'malware.bug': sheet({
    id: 'malware.bug',
    signature: 'Scuttle and stop: three or four quick steps, a dead-still pause, a new direction. Antennae never rest.',
    travel: 'scuttle', fps: 12, stepUnits: 0.18, stepEveryMs: 170,
    attackEveryTicks: 1, telegraphMs: 170, telegraph: 'one still pose facing the vibecoder',
    attack: 'Nip: tiny and fast, done in a third of a second. Many small bites, not one big one.',
    death: 'Flips on its back (lean past 3 rad), legs twitch at double jitter, then crumples.',
    states: {
      walk: { locomotion: 1, timeScale: 1.5 },
      attack: { duration: 0.34, keys: [
        { at: 0, beat: 'anticipation', forward: -0.06, scaleX: 0.94 },
        { at: 0.09, beat: 'strike', forward: 0.2, scaleX: 1.12, scaleY: 0.94, emissiveAdd: 0.3 },
        { at: 0.18, beat: 'recover', forward: 0.1 },
        { at: 0.34, ease: 'ease' },
      ] },
      death: { duration: 0.8, jitterMul: 3, keys: [
        { at: 0, beat: 'impact', up: 0.12, lean: 1.5, emissiveAdd: 1 },
        { at: 0.12, beat: 'hold', up: 0.05, lean: 3.1, emissiveAdd: 0.3 },
        { at: 0.5, beat: 'collapse', lean: 3.1 },
        { at: 0.7, ease: 'ease', lean: 3.1, scaleY: 0.3, scatter: 0.25, opacity: 0.7 },
        { at: 0.8, beat: 'gone', ease: 'ease', lean: 3.1, scaleY: 0.1, scatter: 0.4, opacity: 0 },
      ] },
    },
  }),
  'malware.exploit': sheet({
    id: 'malware.exploit',
    signature: 'A long held wind-up, then it is somewhere else: one straight line, no in-betweens.',
    travel: 'lunge', fps: 12, stepUnits: 0, stepEveryMs: 0,
    attackEveryTicks: 4, telegraphMs: 1000, telegraph: 'the payload sac swells past its frame for a full tick (pulse amp x2)',
    attack: 'Overflow lunge: half a second pulled back and compressed, then a 1.1-unit snap with a smear stretch, held.',
    death: 'The sac pops: one over-scaled pose, then everything scatters. Toxic droplets on `collapse`.',
    states: {
      attack: { duration: 0.95, keys: [
        { at: 0, beat: 'anticipation', forward: -0.3, scaleX: 0.78, scaleY: 1.14 },
        { at: 0.5, beat: 'strike', forward: 1.1, scaleX: 1.55, scaleY: 0.72, emissiveAdd: 0.6 },
        { at: 0.66, beat: 'recover', forward: 1.0, scaleX: 1.1, scaleY: 0.95 },
        { at: 0.95, ease: 'ease' },
      ] },
      death: { duration: 0.6, keys: [
        { at: 0, beat: 'impact', scaleX: 1.35, scaleY: 1.35, emissiveAdd: 1.2 },
        { at: 0.12, beat: 'collapse', scaleX: 1.45, scaleY: 1.45, emissiveAdd: 0.4 },
        { at: 0.45, ease: 'ease', scatter: 0.7, opacity: 0.6 },
        { at: 0.6, beat: 'gone', ease: 'ease', scatter: 0.9, opacity: 0 },
      ] },
    },
  }),
  'malware.crack': sheet({
    id: 'malware.crack',
    signature: 'Picks: three quick stabs of the key teeth, in rhythm with its equaliser spine.',
    travel: 'shuffle', fps: 12, stepUnits: 0.2, stepEveryMs: 400,
    attackEveryTicks: 0, telegraphMs: 400, telegraph: 'turns side-on to the lock, spine bars jump to full',
    attack: 'Lock pick (on a door, every 2 ticks, not on the vibecoder): stab, stab, twist. The door LED flips on `strike`.',
    death: 'Snaps: the key breaks at the neck, bow and blade fall apart (scatter along x).',
    states: {
      attack: { duration: 0.8, keys: [
        { at: 0, beat: 'anticipation', forward: -0.06 },
        { at: 0.12, forward: 0.14 },
        { at: 0.22, forward: -0.04 },
        { at: 0.34, forward: 0.14 },
        { at: 0.44, forward: -0.04 },
        { at: 0.56, beat: 'strike', forward: 0.2, lean: 0.3, emissiveAdd: 0.4 },
        { at: 0.68, beat: 'recover', forward: 0.1, lean: 0.1 },
        { at: 0.8, ease: 'ease' },
      ] },
    },
  }),
  'malware.ransomware': sheet({
    id: 'malware.ransomware',
    signature: 'Weight. It hops once and lands like a safe; chains keep swinging after the body has stopped.',
    travel: 'anchor', fps: 8, stepUnits: 0, stepEveryMs: 0,
    attackEveryTicks: 0, telegraphMs: 600, telegraph: 'shackle horns rise, jaw opens',
    attack: 'Clamp (on a pickup, when one appears): rises, slams shut flat and wide. Shake 0.9 on `strike`; the pickup stops bobbing.',
    death: 'Unlocks: the shackle springs up one pose, the body drops open, its pickups play `revealed` on `gone`.',
    states: {
      attack: { duration: 0.8, keys: [
        { at: 0, beat: 'anticipation', up: 0.25, scaleX: 0.94, scaleY: 1.1 },
        { at: 0.4, beat: 'strike', up: 0, scaleX: 1.22, scaleY: 0.78, emissiveAdd: 0.4 },
        { at: 0.55, beat: 'recover', scaleX: 1.06, scaleY: 0.95 },
        { at: 0.8, ease: 'ease' },
      ] },
      death: { duration: 0.8, keys: [
        { at: 0, beat: 'impact', up: 0.12, scaleY: 1.3, scaleX: 0.9, emissiveAdd: 1 },
        { at: 0.15, beat: 'hold', up: 0.12, scaleY: 1.3, scaleX: 0.9, emissiveAdd: 0.3 },
        { at: 0.3, beat: 'collapse', scaleY: 0.7, scaleX: 1.25 },
        { at: 0.65, ease: 'ease', scaleY: 0.15, scaleX: 1.5, scatter: 0.3, opacity: 0.7 },
        { at: 0.8, beat: 'gone', ease: 'ease', scaleY: 0.05, scaleX: 1.6, scatter: 0.4, opacity: 0 },
      ] },
    },
  }),
  'malware.spyware': sheet({
    id: 'malware.spyware',
    signature: 'Hovers level and scans: the lens sweeps left, holds, sweeps right, holds. When it finds the vibecoder it stops sweeping.',
    travel: 'hover', fps: 12, stepUnits: 0.25, stepEveryMs: 800,
    attackEveryTicks: 2, telegraphMs: 500, telegraph: 'lens locks on the vibecoder, three fast blinks',
    attack: 'Flash: no lunge. The iris narrows, then one white frame; the vibecoder is revealed (marked) on `strike`.',
    death: 'Crashes: tilts, drops to the floor in two poses, breaks on landing.',
    states: {
      attack: { duration: 0.5, keys: [
        { at: 0, beat: 'anticipation', scaleX: 0.9, scaleY: 0.9 },
        { at: 0.25, beat: 'strike', scaleX: 1.1, scaleY: 1.1, emissiveAdd: 1.4 },
        { at: 0.33, beat: 'recover', emissiveAdd: 0.3 },
        { at: 0.5, ease: 'ease' },
      ] },
      death: { duration: 0.75, keys: [
        { at: 0, beat: 'impact', lean: 0.5, emissiveAdd: 1 },
        { at: 0.15, beat: 'hold', lean: 0.9, up: -0.15, emissiveAdd: 0.3 },
        { at: 0.3, beat: 'collapse', lean: 1.3, up: -0.4 },
        { at: 0.6, ease: 'ease', lean: 1.5, up: -0.45, scaleY: 0.4, scatter: 0.35, opacity: 0.7 },
        { at: 0.75, beat: 'gone', ease: 'ease', lean: 1.5, up: -0.45, scaleY: 0.2, scatter: 0.5, opacity: 0 },
      ] },
    },
  }),
  'malware.rootkit': sheet({
    id: 'malware.rootkit',
    signature: 'Fades: it is never fully there. Opacity steps down and up, and it is in a different place when it comes back.',
    travel: 'fade', fps: 8, stepUnits: 0.4, stepEveryMs: 2500,
    attackEveryTicks: 0, telegraphMs: 300, telegraph: 'the padlock on its chain swings out toward the door',
    attack: 'Holds the door (no damage): rattles its chain when the door is tried. Use `hit` on the door and this on the ghost.',
    death: 'Exorcised: stretches thin and tall, and fades upward. No shards: wisps on `collapse`.',
    states: {
      idle: { opacityMul: 0.75 },
      attack: { duration: 0.5, keys: [
        { at: 0, beat: 'anticipation', lean: -0.15 },
        { at: 0.12, beat: 'strike', lean: 0.2, forward: 0.1, emissiveAdd: 0.3 },
        { at: 0.24, lean: -0.15 },
        { at: 0.36, beat: 'recover', lean: 0.1 },
        { at: 0.5, ease: 'ease' },
      ] },
      death: { duration: 0.9, keys: [
        { at: 0, beat: 'impact', emissiveAdd: 1 },
        { at: 0.15, beat: 'collapse', emissiveAdd: 0.3 },
        { at: 0.7, ease: 'ease', up: 0.5, scaleX: 0.45, scaleY: 1.7, opacity: 0.4 },
        { at: 0.9, beat: 'gone', ease: 'ease', up: 0.8, scaleX: 0.3, scaleY: 1.9, opacity: 0 },
      ] },
    },
  }),
  'malware.zombie': sheet({
    id: 'malware.zombie',
    signature: 'Shuffles on sixes: half the frame rate of everything else, one arm dragging, the cut cable twitching.',
    travel: 'shuffle', fps: 6, stepUnits: 0.08, stepEveryMs: 500,
    attackEveryTicks: 2, telegraphMs: 500, telegraph: 'stops, head nods up',
    attack: 'Swipe: a slow lean back, then the one arm comes over. Weak and late; they are dangerous in numbers.',
    death: 'Drops fast (0.45 s): no hit-stop of its own. When the boss dies they all fall 120 ms after it.',
    states: {
      walk: { locomotion: 0.6, timeScale: 0.6 },
      attack: { duration: 0.85, keys: [
        { at: 0, beat: 'anticipation', forward: -0.08, lean: -0.22 },
        { at: 0.45, beat: 'strike', forward: 0.2, lean: 0.32, emissiveAdd: 0.25 },
        { at: 0.62, beat: 'recover', forward: 0.12, lean: 0.15 },
        { at: 0.85, ease: 'ease' },
      ] },
      death: { duration: 0.45, keys: [
        { at: 0, beat: 'impact', emissiveAdd: 0.8, lean: -0.3 },
        { at: 0.08, beat: 'collapse', lean: -0.6 },
        { at: 0.35, ease: 'ease', lean: -1.2, scaleY: 0.3, scatter: 0.2, opacity: 0.6 },
        { at: 0.45, beat: 'gone', ease: 'ease', lean: -1.3, scaleY: 0.15, scatter: 0.3, opacity: 0 },
      ] },
    },
  }),
  'boss.forkbomb': sheet({
    id: 'boss.forkbomb',
    signature: 'Many arms, never in step: each fork arm swings on its own phase round a body that only breathes.',
    travel: 'anchor', fps: 10, stepUnits: 0, stepEveryMs: 0,
    attackEveryTicks: 4, telegraphMs: 1000, telegraph: 'furnace core brightens for a full tick, all arms rise together (the only time they agree)',
    attack: 'fork(): arms up, then flung wide. On `strike` the System Hand comes in and draws a zombie (SYSTEM_HAND_SPAWN).',
    death: 'kill -9 only (it traps SIGTERM and goes `enraged`). Three flashes, a long hold, collapse; every zombie falls on its `collapse` beat. Shake 1.6.',
    states: {
      attack: { duration: 0.9, keys: [
        { at: 0, beat: 'anticipation', up: 0.1, scaleX: 0.92, scaleY: 1.12 },
        { at: 0.4, beat: 'strike', scaleX: 1.28, scaleY: 0.94, emissiveAdd: 0.7 },
        { at: 0.6, beat: 'recover', scaleX: 1.08, scaleY: 0.98, emissiveAdd: 0.2 },
        { at: 0.9, ease: 'ease' },
      ] },
      death: { duration: 1.4, jitterMul: 3, keys: [
        { at: 0, beat: 'impact', emissiveAdd: 1.2, scaleX: 1.1, scaleY: 0.92 },
        { at: 0.1, emissiveAdd: 0.2 },
        { at: 0.2, emissiveAdd: 1.2 },
        { at: 0.3, emissiveAdd: 0.2 },
        { at: 0.4, beat: 'hold', emissiveAdd: 1.2 },
        { at: 0.7, beat: 'collapse', emissiveAdd: 0.4 },
        { at: 1.2, ease: 'ease', scaleX: 1.5, scaleY: 0.12, scatter: 0.6, opacity: 0.7 },
        { at: 1.4, beat: 'gone', ease: 'ease', scaleX: 1.6, scaleY: 0.05, scatter: 0.9, opacity: 0 },
      ] },
    },
    phases: [
      { name: 'forking', state: 'idle', attackEveryTicks: 4, note: 'Forks a zombie every 4 s.' },
      { name: 'frozen', state: 'frozen', attackEveryTicks: 0, note: 'kill -STOP: no forks, no damage. The opening to kill -9.' },
      { name: 'enraged', state: 'enraged', attackEveryTicks: 4, note: 'kill -15 was trapped: same cadence, louder.' },
    ],
  }),
  'boss.kernel': sheet({
    id: 'boss.kernel',
    signature: 'One eye that changes its mind: half-lidded and slow, then wide and tracking, then shaking the page.',
    travel: 'hover', fps: 12, stepUnits: 0, stepEveryMs: 0,
    attackEveryTicks: 3, telegraphMs: 1000, telegraph: 'the iris contracts to a point for a full tick',
    attack: 'Eye beam: iris contracts, then one over-bright, over-scaled pose. The beam itself is FX from the `eye` socket.',
    death: 'Panic: crack flash, a half-second freeze-frame (the longest hold in the game), then the die scatters across the panel. Page-wide flash on `gone`.',
    states: {
      idle: { timeScale: 0.7 },
      attack: { duration: 0.9, keys: [
        { at: 0, beat: 'anticipation', scaleX: 0.86, scaleY: 0.86 },
        { at: 0.5, beat: 'strike', scaleX: 1.2, scaleY: 1.2, emissiveAdd: 1.5 },
        { at: 0.66, beat: 'recover', scaleX: 1.05, scaleY: 1.05, emissiveAdd: 0.4 },
        { at: 0.9, ease: 'ease' },
      ] },
      death: { duration: 2, jitterMul: 4, keys: [
        { at: 0, beat: 'impact', emissiveAdd: 1.5, scaleX: 1.12, scaleY: 1.12 },
        { at: 0.16, beat: 'hold', emissiveAdd: 0.4, scaleX: 1.05, scaleY: 1.05 },
        { at: 0.7, beat: 'collapse', emissiveAdd: 1.2 },
        { at: 1.6, ease: 'ease', scatter: 1.2, opacity: 0.8, emissiveAdd: 0.6 },
        { at: 2, beat: 'gone', ease: 'ease', scatter: 1.8, opacity: 0, emissiveAdd: 1.5 },
      ] },
    },
    phases: [
      { name: 'shielded', state: 'idle', attackEveryTicks: 3, note: 'Shield ring up, eye half-lidded, everything at 0.7 speed (`states.idle.timeScale`).' },
      { name: 'exposed', state: 'walk', attackEveryTicks: 2, note: 'Shield down, tentacles out and reaching (locomotion 1 drives them), eye wide and tracking.' },
      { name: 'panic', state: 'enraged', attackEveryTicks: 1, note: 'Cracked. Enraged for the rest of the fight, a 0.4 shake on every tick.' },
    ],
  }),
};

/** Animator options for an enemy: its frame rate and its state overrides. `{}` for ids without a sheet. */
export function animActingOptions(id: string): AnimActingOptions {
  const s = ANIM_MALWARE_ACTING[id];
  return s ? { fps: s.fps, states: s.states } : {};
}

/**
 * Malware travel: progress 0..1 of a move, cut into `steps` jumps with nothing in between
 * (a teleport per step, not a slide). Use it in place of an easing in the stage's Group tween.
 */
export function animSteppedTravel(t01: number, steps = 4): number {
  const t = Math.min(1, Math.max(0, t01));
  return t >= 1 ? 1 : Math.floor(t * Math.max(1, steps) + 1e-6) / Math.max(1, steps);
}
