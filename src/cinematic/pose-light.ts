import type * as THREE from 'three';
import type { ComicMaterial } from '../shaders/comic-material.js';
import type { PoseProgram, ShotTrack } from './spec-types.js';
import { markAt, panelAt, pointAt, type ComixWorld } from './reel.js';
import { easeIn, easeOut, easeOutBack, lerp, span, stepped, type Shot } from './stage.js';

const EASE: Record<string, (k: number) => number> = {
  linear: (k) => k,
  in: easeIn,
  out: easeOut,
  outBack: easeOutBack,
};

function lerpShot(a: Shot, b: Shot, k: number): Shot {
  return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), w: lerp(a.w, b.w, k), h: lerp(a.h, b.h, k) };
}

function trackShot(world: ComixWorld, track: ShotTrack, t: number): Shot {
  if (track.portrait && track.landscape) {
    const { w, h } = world.page.panelSize(track.panel);
    return h > w ? track.portrait : track.landscape;
  }
  if (!track.to || !track.span) return track.from;
  const ease = EASE[track.ease ?? 'linear'] ?? EASE.linear!;
  const k = ease(span(t, markAt(world, track.span[0]), markAt(world, track.span[1])));
  return lerpShot(track.from, track.to, k);
}

/** One shot track for the active panel (the latest whose `at` is <= t). */
export function poseShot(world: ComixWorld, t: number): void {
  const stage = world.stage;
  if (!stage) return;
  const id = panelAt(world, t);
  const track = world.pack.camera.find((shot) => shot.panel === id);
  if (track) stage.shot = trackShot(world, track, t);
}

function setColor(mat: ComicMaterial | undefined, color: string | number): void {
  if (!mat) return;
  const value = mat.uniforms.uColor?.value as THREE.Color | undefined;
  if (!value) return;
  if (typeof color === 'number') value.setHex(color);
  else value.set(color);
}

function poseRain(world: ComixWorld, program: Extract<PoseProgram, { kind: 'rain' }>, t: number): void {
  if (!world.rain) return;
  world.rain.group.visible = t < markAt(world, program.until);
  world.rain.update(t);
}

function poseMonitor(world: ComixWorld, program: Extract<PoseProgram, { kind: 'monitor' }>, t: number): void {
  const hideGlass = markAt(world, program.hideGlassAt);
  const hideCode = markAt(world, program.hideCodeAt);
  const from = markAt(world, program.vortexFrom);
  const until = markAt(world, program.vortexUntil);
  for (const part of world.glassParts) part.visible = t < hideGlass;
  for (const part of world.codeParts) part.visible = t < hideCode;
  const vortex = world.vortex;
  if (vortex && world.monitor) {
    vortex.visible = t >= from && t < until;
    if (vortex.visible) {
      const grow = stepped(easeOut(span(t, from, from + program.grow)), program.steps);
      vortex.scale.set((world.monitor.w - world.vortexInset) * grow, (world.monitor.h - world.vortexInset) * grow, 0.08);
    }
  }
  const glitching = program.glitch.some(([a, b]) => t >= markAt(world, a) && t < markAt(world, b));
  const frame = Math.floor(t * program.glitchHz) % 4;
  const swapped = glitching && frame === 0 ? program.glitchColors[0] : glitching && frame === 2 ? program.glitchColors[1] : undefined;
  setColor(world.glass, swapped ?? world.glassColor);
  setColor(world.amber, t >= markAt(world, program.amberAt) ? program.amberOn : program.amberOff);
}

function poseBolt(world: ComixWorld, program: Extract<PoseProgram, { kind: 'bolt_flicker' }>, t: number): void {
  const bolt = world.bolts.get(program.id);
  if (!bolt) return;
  const k = t - markAt(world, program.at);
  const inWindow = k >= 0 && k < program.dur;
  const settled = program.settleAfter !== undefined && k > program.settleAfter;
  const flicker = Math.floor(k * program.hz) % program.every !== program.skip;
  bolt.visible = inWindow && (settled || flicker);
}

/** `pull` is span(t, suck.from, suck.to). A `pull` rule is `pullGain * pull * pull`. */
function poseFlash(world: ComixWorld, program: Extract<PoseProgram, { kind: 'stage_flash' }>, t: number, pull: number): void {
  const stage = world.stage;
  if (!stage) return;
  stage.flashPos.copy(pointAt(world, program.anchor));
  stage.flash = 0;
  for (const rule of program.rules) {
    const from = markAt(world, rule.from);
    const until = rule.until !== undefined ? markAt(world, rule.until) : undefined;
    const k = t - from;
    const open = t >= from && (until === undefined || t < until);
    if (!open) continue;
    if (rule.pull) {
      stage.flash = (rule.pullGain ?? 0) * pull * pull;
      continue;
    }
    if (rule.hz !== undefined) {
      const blink = (rule.amp ?? 0) * (Math.floor(t * rule.hz) % 2);
      const extra = rule.add !== undefined && rule.dur !== undefined && k < rule.dur ? rule.add : 0;
      stage.flash = blink + extra;
    } else if (rule.dur !== undefined && k < rule.dur) stage.flash = rule.amp ?? 0;
  }
}

function poseBlaze(world: ComixWorld, program: Extract<PoseProgram, { kind: 'screen_blaze' }>, t: number): void {
  const stage = world.stage;
  if (!stage) return;
  for (const part of world.screenParts) part.visible = true;
  stage.flashPos.copy(pointAt(world, program.anchor));
  if (t >= markAt(world, program.until)) {
    stage.flash = 0;
    return;
  }
  const blink = program.blinkBase + (Math.floor(t * program.blinkHz) % 2) * program.blinkAmp;
  stage.flash = t < markAt(world, program.blinkUntil) ? blink : program.calm;
}

function poseShake(world: ComixWorld, program: Extract<PoseProgram, { kind: 'shake' }>, t: number): void {
  const stage = world.stage;
  if (!stage) return;
  let shake = 0;
  for (const window of program.windows) {
    const k = t - markAt(world, window.at);
    if (k >= 0 && k < window.dur) shake = Math.max(shake, window.amp * (1 - k / window.dur));
  }
  const pull = program.pull;
  if (pull) {
    const from = markAt(world, pull.from);
    const until = markAt(world, pull.until);
    if (t > from && t < until) {
      const k = span(t, markAt(world, pull.spanFrom), markAt(world, pull.spanTo));
      shake = Math.max(shake, pull.base + pull.gain * k);
    }
  }
  stage.shake = shake;
}

function posePixel(world: ComixWorld, program: Extract<PoseProgram, { kind: 'pixelate' }>, t: number): void {
  const d = span(t, markAt(world, program.from), markAt(world, program.to));
  world.stage?.setPixelSize(program.base + stepped(easeIn(d), program.steps) * program.gain);
}

export function poseLight(world: ComixWorld, program: PoseProgram, t: number, pull: number): void {
  switch (program.kind) {
    case 'rain':
      poseRain(world, program, t);
      break;
    case 'monitor':
      poseMonitor(world, program, t);
      break;
    case 'bolt_flicker':
      poseBolt(world, program, t);
      break;
    case 'stage_flash':
      poseFlash(world, program, t, pull);
      break;
    case 'screen_blaze':
      poseBlaze(world, program, t);
      break;
    case 'shake':
      poseShake(world, program, t);
      break;
    case 'pixelate':
      posePixel(world, program, t);
      break;
    default:
      break;
  }
}
