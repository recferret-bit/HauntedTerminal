import type * as THREE from 'three';
import type { ZoneId } from '../procgen/core/palette.js';
import type { ComicMaterial } from '../shaders/comic-material.js';
import { DEFAULT_PIXEL_PARAMS } from '../shaders/pixel-art.js';
import { resolveTime } from './expr.js';
import { panelAt, worldPoint, type ComixWorld } from './reel.js';
import { applyActorRig, partsNamed } from './set.js';
import type { EaseName, SceneTrack } from './spec-types.js';
import { easeIn, easeOut, easeOutBack, lerp, span, stepped, type Actor, type Shot } from './stage.js';
import type { ResolvedCamera, ResolvedTrack } from './timeline.js';

const EASE: Record<EaseName, (k: number) => number> = {
  linear: (k) => k,
  in: easeIn,
  out: easeOut,
  outBack: easeOutBack,
};

function lerpShot(a: Shot, b: Shot, k: number): Shot {
  return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), w: lerp(a.w, b.w, k), h: lerp(a.h, b.h, k) };
}

function evalCamera(world: ComixWorld, panelId: string, cam: ResolvedCamera, t: number): Shot {
  if (cam.portrait) {
    const { w, h } = world.page.panelSize(panelId);
    if (h > w) return cam.portrait;
  }
  if (!cam.to || cam.spanFrom === undefined || cam.spanTo === undefined) return cam.from;
  const k = EASE[cam.ease](span(t, cam.spanFrom, cam.spanTo));
  return lerpShot(cam.from, cam.to, k);
}

function setMatColor(mat: ComicMaterial | undefined, color: string | number): void {
  const value = mat?.uniforms.uColor?.value as THREE.Color | undefined;
  if (!value) return;
  if (typeof color === 'number') value.setHex(color);
  else value.set(color);
}

function targetActor(world: ComixWorld, target: string): Actor | null {
  if (target === 'room') return world.room;
  return world.actors.get(target)?.actor ?? null;
}

function resetBaseline(world: ComixWorld): void {
  const stage = world.stage;
  if (!stage) return;
  stage.shake = 0;
  stage.flash = 0;
  stage.setPixelSize(DEFAULT_PIXEL_PARAMS.pixelSize);
  for (const member of world.actors.values()) {
    const g = member.actor.model.group;
    g.position.copy(member.basePos);
    g.scale.setScalar(member.baseScale);
    g.rotation.z = member.baseRotZ;
    g.visible = member.baseVisible;
    for (const mesh of member.actor.model.parts.values()) mesh.visible = true;
  }
  for (const pb of world.partBases) pb.mesh.visible = pb.visible;
  for (const zb of world.zoneBases.values()) setMatColor(zb.material, zb.hex);
  for (const fx of world.fixtures.values()) {
    if (fx.kind === 'rain') fx.rain.group.visible = false;
    else if (fx.kind === 'bolt') fx.node.visible = false;
    else fx.mesh.visible = false;
  }
}

function applyMotion(world: ComixWorld, tr: ResolvedTrack, spec: Extract<SceneTrack, { kind: 'actor_motion' }>, t: number): void {
  const member = world.actors.get(spec.actor);
  if (!member) return;
  const g = member.actor.model.group;
  if (spec.hideWhenDead && member.actor.animator.deathProgress >= 0.999) {
    g.visible = false;
    return;
  }
  const from = worldPoint(world, spec.fromPos);
  const to = spec.toPos ? worldPoint(world, spec.toPos) : from;
  const s0 = spec.span ? resolveTime(spec.span[0], tr.cues, tr.baseTime) : tr.from;
  const s1 = spec.span ? resolveTime(spec.span[1], tr.cues, tr.baseTime) : (tr.until ?? tr.from);
  const raw = spec.toPos ? span(t, s0, s1) : 0;
  const eased = EASE[spec.ease ?? 'linear'](raw);
  const k = spec.steps ? stepped(eased, spec.steps) : eased;

  if (spec.deform === 'stretch_to_target') {
    const dx = to.x - from.x;
    const dy = to.y - (from.y + 0.8);
    const len = Math.max(1e-5, Math.hypot(dx, dy));
    const ux = dx / len;
    const uy = dy / len;
    const sy = lerp(1, 1.65, Math.min(1, k * 1.6)) * lerp(1, 0.08, span(k, 0.55, 1));
    const sx = lerp(1, 0.32, k) * lerp(1, 0.2, span(k, 0.55, 1));
    const reach = 1.25 * sy;
    g.position.set(lerp(from.x, to.x - ux * reach, k), lerp(from.y, to.y - uy * reach, k), lerp(from.z, 0.3, k));
    g.rotation.z = -(Math.PI / 2 - Math.atan2(uy, ux)) * Math.min(1, k * 2.2);
    g.scale.set(sx, sy, 1);
    return;
  }

  if (spec.deform === 'squash_land' && raw >= 1) {
    const land = t - s1;
    const squash = land < 0.08 ? 0.82 : land < 0.16 ? 1.06 : 1;
    g.position.copy(to);
    g.scale.set(2 - squash, squash, 1);
    g.rotation.z = spec.rotZTo ?? 0;
    return;
  }

  const arcLift = spec.arc ? Math.sin(Math.min(1, Math.max(0, k)) * Math.PI) * spec.arc : 0;
  g.position.set(lerp(from.x, to.x, k), lerp(from.y, to.y, k) + arcLift, lerp(from.z, to.z, Math.min(1, Math.max(0, k))));
  if (spec.stretchFrom && spec.stretchTo) {
    g.scale.set(lerp(spec.stretchFrom[0], spec.stretchTo[0], k), lerp(spec.stretchFrom[1], spec.stretchTo[1], k), 1);
  } else {
    const sc0 = spec.scaleFrom ?? member.baseScale;
    const sc1 = spec.scaleTo ?? sc0;
    g.scale.setScalar(lerp(sc0, sc1, Math.min(1.06, Math.max(0, k))));
  }
  const rz0 = spec.rotZFrom ?? member.baseRotZ;
  const rz1 = spec.rotZTo ?? rz0;
  g.rotation.z = lerp(rz0, rz1, Math.min(1, Math.max(0, k)));
}

function applyFixture(world: ComixWorld, tr: ResolvedTrack, spec: Extract<SceneTrack, { kind: 'fixture' }>, t: number): void {
  const fx = world.fixtures.get(spec.fixture);
  if (!fx) return;
  if (fx.kind === 'rain') {
    fx.rain.group.visible = true;
    fx.rain.update(t);
    return;
  }
  if (fx.kind === 'vortex') {
    fx.mesh.visible = true;
    const grow = spec.growDur ? easeOut(span(t, tr.from, tr.from + spec.growDur)) : 1;
    const snapped = spec.steps ? stepped(grow, spec.steps) : grow;
    fx.mesh.scale.set(fx.w * snapped, fx.h * snapped, 0.08);
    return;
  }
  const k = t - tr.from;
  const settled = spec.settleAfter !== undefined && k > spec.settleAfter;
  const flicker = spec.flickerHz
    ? Math.floor(k * spec.flickerHz) % (spec.flickerEvery ?? 4) !== (spec.flickerSkip ?? 3)
    : true;
  fx.node.visible = settled || flicker;
}

function applyTrack(world: ComixWorld, tr: ResolvedTrack, t: number): void {
  const spec = tr.spec;
  const stage = world.stage;
  if (!stage) return;
  switch (spec.kind) {
    case 'actor_visibility': {
      const member = world.actors.get(spec.actor);
      if (!member) return;
      const alive = !spec.hideWhenDead || member.actor.animator.deathProgress < 0.999;
      member.actor.model.group.visible = spec.visible && alive;
      return;
    }
    case 'actor_motion':
      applyMotion(world, tr, spec, t);
      return;
    case 'actor_rig': {
      const member = world.actors.get(spec.actor);
      if (member) applyActorRig(member.actor, t, spec.typing ?? 0, !!spec.restRightArm, spec.hideParts ?? []);
      return;
    }
    case 'part_visibility': {
      const actor = targetActor(world, spec.target);
      if (!actor) return;
      for (const prefix of spec.parts) {
        for (const mesh of partsNamed(actor, prefix)) mesh.visible = spec.visible;
      }
      return;
    }
    case 'material_tint': {
      const actor = targetActor(world, spec.target);
      const mat = actor?.model.materials.get(spec.zone as ZoneId);
      if (!mat) return;
      let color = spec.color;
      if (spec.glitchColors && spec.glitchColors.length > 0) {
        const frame = Math.floor(t * (spec.glitchHz ?? 12)) % 4;
        if (frame === 0 && spec.glitchColors[0]) color = spec.glitchColors[0];
        else if (frame === 2 && spec.glitchColors[1]) color = spec.glitchColors[1];
      }
      setMatColor(mat, color);
      return;
    }
    case 'fixture':
      applyFixture(world, tr, spec, t);
      return;
    case 'stage_light': {
      const until = tr.until ?? world.timeline.durationSec;
      const raw = span(t, tr.from, until);
      const eased = spec.ease === 'quad' ? raw * raw : spec.ease === 'in' ? easeIn(raw) : spec.ease === 'out' ? easeOut(raw) : raw;
      const base = lerp(spec.intensity, spec.intensityTo ?? spec.intensity, eased);
      const blink = spec.blinkHz !== undefined ? (spec.blinkAmp ?? 0) * (Math.floor(t * spec.blinkHz) % 2) : 0;
      const val = base + blink;
      if (val > 0) stage.flashPos.copy(worldPoint(world, spec.anchor));
      stage.flash += val;
      return;
    }
    case 'camera_shake': {
      const until = tr.until ?? world.timeline.durationSec;
      const k = span(t, tr.from, until);
      stage.shake = Math.max(stage.shake, lerp(spec.amp, spec.ampTo ?? 0, k));
      return;
    }
    case 'pixelate': {
      const until = tr.until ?? world.timeline.durationSec;
      const eased = EASE[spec.ease ?? 'linear'](span(t, tr.from, until));
      const k = spec.steps ? stepped(eased, spec.steps) : eased;
      stage.setPixelSize(lerp(spec.sizeFrom, spec.sizeTo, k));
      return;
    }
  }
}

/** Pure deterministic evaluation of the active panel shot and all active `SceneTrack`s at time `t`. */
export function poseComix(world: ComixWorld, t: number): void {
  const stage = world.stage;
  if (!stage) return;
  resetBaseline(world);
  const id = panelAt(world, t);
  const activePanel = world.timeline.panels.find((p) => p.id === id);
  if (activePanel) stage.shot = evalCamera(world, id, activePanel.camera, t);
  for (const tr of world.timeline.tracks) {
    if (t >= tr.from && (tr.until === undefined || t < tr.until)) applyTrack(world, tr, t);
  }
}
