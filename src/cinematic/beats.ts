import type { AnimState } from '../procgen/anim/states.js';
import type { Beat } from './spec-types.js';
import { v3 } from './set.js';
import { markAt, pointAt, type ComixWorld } from './reel.js';

function playCue(world: ComixWorld, beat: Extract<Beat, { kind: 'audio' }>): void {
  const sound = world.sound;
  switch (beat.cue) {
    case 'rain_on':
      sound.rain(true);
      break;
    case 'rain_off':
      sound.rain(false);
      break;
    case 'thunder':
      sound.thunder();
      break;
    case 'burst':
      sound.burst();
      break;
    case 'shatter':
      sound.shatter();
      break;
    case 'zap':
      sound.zap(beat.seconds ?? 0.6, !!beat.reverse);
      break;
    default:
      break;
  }
}

function beatLightning(world: ComixWorld, beat: Extract<Beat, { kind: 'lightning' }>, live: boolean): void {
  const stage = world.stage;
  if (!stage) return;
  const at = typeof beat.point === 'string' ? pointAt(world, beat.point).clone() : v3(beat.point.x, beat.point.y, beat.point.z);
  if (beat.power !== 0) stage.lightning.strikeAt(at, beat.power);
  else stage.lightning.flashPos.copy(at);
  stage.lightning.flashStrength = beat.flash;
  if (!live) return;
  if (beat.audio === 'distant') world.sound.distantThunder();
  if (beat.audio === 'thunder') world.sound.thunder();
}

function fireFx(world: ComixWorld, preset: string, point: string, t: number, z: number | undefined, dy: number | undefined, seed: number, scale: number | undefined, text?: string): void {
  const stage = world.stage;
  if (!stage) return;
  const at = pointAt(world, point).clone();
  if (z !== undefined) at.z = z;
  if (dy !== undefined) at.y += dy;
  stage.fire(preset, at, t, { seed, scale, text });
}

function beatLook(world: ComixWorld, beat: Extract<Beat, { kind: 'look' }>): void {
  const targets = beat.actor
    ? [world.actors.get(beat.actor)].filter((member) => !!member)
    : [...world.actors.values()].filter((member) => member.spec.role === beat.role);
  for (const member of targets) member.actor.animator.setLook(beat.x, beat.y);
}

function beatState(world: ComixWorld, beat: Extract<Beat, { kind: 'state' }>): void {
  world.actors.get(beat.actor)?.actor.animator.setState(beat.state as AnimState);
}

function beatRepeat(world: ComixWorld, beat: Extract<Beat, { kind: 'fx_repeat' }>, t: number, crossed: (at: number) => boolean): void {
  const start = markAt(world, beat.at);
  for (let i = 0; i < beat.count; i++) {
    if (!crossed(start + i * beat.step)) continue;
    fireFx(world, beat.preset, beat.point, t, beat.z, undefined, beat.seed + i, beat.scale);
  }
}

/** Consecutive agents in cast order, not the `order` field. */
function beatArcs(world: ComixWorld, beat: Extract<Beat, { kind: 'arcs' }>, crossed: (at: number) => boolean): void {
  const stage = world.stage;
  if (!stage) return;
  const screen = pointAt(world, 'screen');
  const inScreen = pointAt(world, 'inScreen');
  const start = markAt(world, beat.at);
  for (let i = 0; i < beat.count; i++) {
    if (!crossed(start + i * beat.step)) continue;
    const a = world.agents[i];
    const b = world.agents[i + 1];
    if (!a || !b) continue;
    stage.lightning.spawnGridOverloadArc(
      v3(screen.x + (a.spec.inX ?? 0), inScreen.y + beat.y, beat.z),
      v3(screen.x + (b.spec.inX ?? 0), inScreen.y + beat.y, beat.z),
    );
    stage.lightning.flashStrength = beat.flash;
  }
}

/** One roll per new `hz` tick. `chance` 0.7 is the old `Math.random() > 0.3`. */
function beatKeys(world: ComixWorld, beat: Extract<Beat, { kind: 'keys' }>, t: number, live: boolean): void {
  if (!live) return;
  const from = markAt(world, beat.from);
  const until = markAt(world, beat.until);
  if (t <= from || t >= until) return;
  if (Math.floor(t * beat.hz) === Math.floor(world.prev * beat.hz)) return;
  if (Math.random() > 1 - beat.chance) world.sound.key();
}

/** Death at the scripted fling point, not the live group (a fast-forward may not have posed it). */
function beatShatter(world: ComixWorld, beat: Extract<Beat, { kind: 'shatter_cast' }>, t: number): void {
  const stage = world.stage;
  if (!stage) return;
  world.agents.forEach((member, i) => {
    if (!member.spec.fling) return;
    member.actor.animator.setState('death');
    const at = pointAt(world, member.spec.fling).clone();
    at.y += beat.lift;
    at.z = beat.z;
    stage.fire(i === 0 ? beat.fxFirst : beat.fxRest, at, t, { seed: beat.seed + i, scale: beat.scale });
  });
}

function fireOnce(world: ComixWorld, beat: Beat, t: number, live: boolean): void {
  switch (beat.kind) {
    case 'lightning':
      beatLightning(world, beat, live);
      break;
    case 'fx':
      fireFx(world, beat.preset, beat.point, t, beat.z, beat.dy, beat.seed, beat.scale, beat.text);
      break;
    case 'look':
      beatLook(world, beat);
      break;
    case 'audio':
      if (live) playCue(world, beat);
      break;
    case 'state':
      beatState(world, beat);
      break;
    case 'shatter_cast':
      beatShatter(world, beat, t);
      break;
    default:
      break;
  }
}

/** One-shot beats (and each repeat). `live` false skips audio. Call after cuts and keyframes. */
export function stepBeats(world: ComixWorld, t: number, live: boolean): void {
  const crossed = (at: number): boolean => world.prev < at && t >= at;
  for (const beat of world.pack.beats) {
    if (beat.kind === 'keys') beatKeys(world, beat, t, live);
    else if (beat.kind === 'fx_repeat') beatRepeat(world, beat, t, crossed);
    else if (beat.kind === 'arcs') beatArcs(world, beat, crossed);
    else if ('at' in beat && crossed(markAt(world, beat.at))) fireOnce(world, beat, t, live);
  }
}
