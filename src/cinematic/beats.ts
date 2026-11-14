import type { AnimState } from '../procgen/anim/states.js';
import { resolveTime } from './expr.js';
import { worldPoint, type ComixWorld } from './reel.js';
import type { PanelBeat } from './spec-types.js';
import type { ResolvedBeat } from './timeline.js';

function playCue(world: ComixWorld, beat: Extract<PanelBeat, { kind: 'audio' }>): void {
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
    case 'distant_thunder':
      sound.distantThunder();
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
  }
}

function fireLightning(world: ComixWorld, beat: Extract<PanelBeat, { kind: 'lightning' }>, live: boolean): void {
  const stage = world.stage;
  if (!stage) return;
  const at = worldPoint(world, beat.point);
  if (beat.power !== 0) stage.lightning.strikeAt(at, beat.power);
  else stage.lightning.flashPos.copy(at);
  stage.lightning.flashStrength = beat.flash;
  if (!live) return;
  if (beat.audio === 'distant') world.sound.distantThunder();
  if (beat.audio === 'thunder') world.sound.thunder();
}

function fireOneBeat(world: ComixWorld, item: ResolvedBeat, t: number, live: boolean): void {
  const stage = world.stage;
  const beat = item.spec;
  switch (beat.kind) {
    case 'lightning':
      fireLightning(world, beat, live);
      break;
    case 'fx':
      if (stage) {
        const at = worldPoint(world, beat.point, beat.offset);
        stage.fire(beat.preset, at, t, { seed: beat.seed ?? 1, scale: beat.scale, text: beat.text });
      }
      break;
    case 'arc':
      if (stage) {
        stage.lightning.spawnGridOverloadArc(worldPoint(world, beat.from), worldPoint(world, beat.to));
        if (beat.flash !== undefined) stage.lightning.flashStrength = beat.flash;
      }
      break;
    case 'look':
      for (const id of beat.actors) world.actors.get(id)?.actor.animator.setLook(beat.x, beat.y);
      break;
    case 'state':
      for (const id of beat.actors) world.actors.get(id)?.actor.animator.setState(beat.state as AnimState);
      break;
    case 'audio':
      if (live) playCue(world, beat);
      break;
    case 'fx_repeat':
    case 'key_clicks':
      break;
  }
}

function stepRepeatBeat(world: ComixWorld, item: ResolvedBeat, t: number, crossed: (at: number) => boolean): void {
  const stage = world.stage;
  if (!stage || item.spec.kind !== 'fx_repeat') return;
  const spec = item.spec;
  const start = resolveTime(spec.at, item.cues, item.panelFrom);
  const count = Math.max(0, Math.min(64, Math.floor(spec.count)));
  const step = Math.max(0, spec.step);
  for (let i = 0; i < count; i++) {
    if (!crossed(start + i * step)) continue;
    const at = worldPoint(world, spec.point, spec.offset);
    stage.fire(spec.preset, at, t, { seed: (spec.seed ?? 1) + i, scale: spec.scale });
  }
}

function stepKeyClicks(world: ComixWorld, item: ResolvedBeat, t: number, live: boolean): void {
  if (!live || item.spec.kind !== 'key_clicks') return;
  const spec = item.spec;
  if (!(spec.hz > 0)) return;
  const from = resolveTime(spec.from, item.cues, item.panelFrom);
  const until = resolveTime(spec.until, item.cues, item.panelFrom);
  if (t <= from || t >= until) return;
  if (Math.floor(t * spec.hz) === Math.floor(world.prev * spec.hz)) return;
  if (Math.random() > 1 - spec.chance) world.sound.key();
}

/** Execute all discrete panel beats crossed between `world.prev` and `t`. */
export function stepBeats(world: ComixWorld, t: number, live: boolean): void {
  const crossed = (at: number): boolean => world.prev < at && t >= at;
  for (const item of world.timeline.beats) {
    if (item.spec.kind === 'key_clicks') stepKeyClicks(world, item, t, live);
    else if (item.spec.kind === 'fx_repeat') stepRepeatBeat(world, item, t, crossed);
    else if (crossed(resolveTime(item.spec.at, item.cues, item.panelFrom))) fireOneBeat(world, item, t, live);
  }
}
