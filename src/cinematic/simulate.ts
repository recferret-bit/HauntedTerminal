import { ANIM_STATE_IDS } from '../procgen/anim/states.js';
import { ZONE_IDS } from '../procgen/core/palette.js';
import { cssHex, resolvePoint, resolveTime } from './expr.js';
import type { ComixPack, PanelBeat, PanelLetter, SceneTrack } from './spec-types.js';
import { activePanelAt, compileTimeline, resolveSkipTarget, type ResolvedTimeline } from './timeline.js';

export interface ComixSimResult {
  ok: boolean;
  id: string;
  frames: number;
  durationSec: number;
  panelCuts: string[];
  snapshots: string[];
  turnsCompleted: number;
  beatsFired: number;
  activeTracksPeak: number;
  skipStops: Array<number | 'end'>;
  errors: string[];
}

function validateBeat(beat: PanelBeat, cues: Record<string, number>, base: number, points: ResolvedTimeline['points'], actors: Set<string>): void {
  if (beat.kind === 'key_clicks') {
    const f = resolveTime(beat.from, cues, base);
    const u = resolveTime(beat.until, cues, base);
    if (!(u > f)) throw new Error('key_clicks until must be > from');
    if (!(beat.hz > 0)) throw new Error('key_clicks hz must be > 0');
    return;
  }
  resolveTime(beat.at, cues, base);
  if (beat.kind === 'lightning' || beat.kind === 'fx' || beat.kind === 'fx_repeat') {
    resolvePoint(beat.point, points);
    if (beat.kind === 'fx_repeat' && (!(beat.count >= 1) || !(beat.step > 0))) {
      throw new Error('fx_repeat requires count >= 1 and step > 0');
    }
  } else if (beat.kind === 'arc') {
    resolvePoint(beat.from, points);
    resolvePoint(beat.to, points);
  } else if (beat.kind === 'look' || beat.kind === 'state') {
    for (const actor of beat.actors) {
      if (!actors.has(actor)) throw new Error(`beat.${beat.kind} references unknown actor "${actor}"`);
    }
    if (beat.kind === 'state' && !(ANIM_STATE_IDS as readonly string[]).includes(beat.state)) {
      throw new Error(`beat.state "${beat.state}" is not a valid AnimState`);
    }
  }
}

function validateLetter(letter: PanelLetter, cues: Record<string, number>, base: number, points: ResolvedTimeline['points'], actors: Set<string>): void {
  switch (letter.kind) {
    case 'caption': {
      const f = resolveTime(letter.from, cues, base);
      if (letter.until !== undefined && !(resolveTime(letter.until, cues, base) > f)) {
        throw new Error('caption until must be > from');
      }
      break;
    }
    case 'banner': {
      const a = resolveTime(letter.at, cues, base);
      if (letter.until !== undefined && !(resolveTime(letter.until, cues, base) > a)) {
        throw new Error('banner until must be > at');
      }
      break;
    }
    case 'sfx':
      resolveTime(letter.at, cues, base);
      cssHex(letter.color);
      if (letter.anchor === 'point') {
        if (letter.point === undefined) throw new Error('sfx with anchor "point" requires point');
        resolvePoint(letter.point, points);
      }
      break;
    case 'sfx_seq':
      resolveTime(letter.from, cues, base);
      cssHex(letter.color);
      resolvePoint(letter.point, points);
      if (letter.words.length === 0 || !(letter.step > 0) || !(letter.dxMod >= 1) || !(letter.dyMod >= 1)) {
        throw new Error('sfx_seq requires non-empty words, step > 0, and dxMod/dyMod >= 1');
      }
      break;
    case 'bubble': {
      const a = resolveTime(letter.at, cues, base);
      if (letter.until !== undefined && !(resolveTime(letter.until, cues, base) > a)) {
        throw new Error('bubble until must be > at');
      }
      if (letter.fill) cssHex(letter.fill);
      if (letter.tailActor && !actors.has(letter.tailActor)) {
        throw new Error(`bubble tailActor "${letter.tailActor}" is not in cast`);
      }
      if (letter.anchor === 'world' && letter.tailPoint === undefined) {
        throw new Error('bubble with anchor "world" requires tailPoint');
      }
      if (letter.tailPoint !== undefined) resolvePoint(letter.tailPoint, points);
      break;
    }
    case 'label_tag': {
      const a = resolveTime(letter.at, cues, base);
      if (letter.until !== undefined && !(resolveTime(letter.until, cues, base) > a)) {
        throw new Error('label_tag until must be > at');
      }
      resolvePoint(letter.point, points);
      break;
    }
    case 'prompt_list':
      resolveTime(letter.from, cues, base);
      if (!(letter.every > 0)) throw new Error('prompt_list every must be > 0');
      break;
    case 'glitch_text':
      resolveTime(letter.from, cues, base);
      if (letter.texts.length === 0 || !(letter.step > 0)) throw new Error('glitch_text requires texts and step > 0');
      break;
    case 'tier_stack':
      resolveTime(letter.from, cues, base);
      if (letter.rows.length === 0 || !(letter.step > 0)) throw new Error('tier_stack requires rows and step > 0');
      break;
    case 'panel_flash':
      resolveTime(letter.at, cues, base);
      if (!(letter.dur >= 0) || !(letter.opacity >= 0 && letter.opacity <= 1)) {
        throw new Error('panel_flash requires dur >= 0 and opacity in 0..1');
      }
      break;
    case 'invert':
      resolveTime(letter.at, cues, base);
      if (!(letter.toOffset > letter.fromOffset)) throw new Error('invert toOffset must be > fromOffset');
      break;
    case 'stats_card':
      resolveTime(letter.at, cues, base);
      resolveTime(letter.keyAt, cues, base);
      cssHex(letter.fallbackBackground);
      break;
  }
}

function validateTrack(track: SceneTrack, cues: Record<string, number>, base: number, points: ResolvedTimeline['points'], actors: Set<string>, fixtures: Set<string>): void {
  switch (track.kind) {
    case 'actor_visibility':
    case 'actor_rig':
      if (!actors.has(track.actor)) throw new Error(`${track.kind} references unknown actor "${track.actor}"`);
      break;
    case 'actor_motion':
      if (!actors.has(track.actor)) throw new Error(`actor_motion references unknown actor "${track.actor}"`);
      resolvePoint(track.fromPos, points);
      if (track.toPos !== undefined) resolvePoint(track.toPos, points);
      if (track.span) {
        const s0 = resolveTime(track.span[0], cues, base);
        const s1 = resolveTime(track.span[1], cues, base);
        if (!(s1 > s0)) throw new Error('actor_motion span[1] must be > span[0]');
      }
      break;
    case 'part_visibility':
      if (track.target !== 'room' && !actors.has(track.target)) {
        throw new Error(`part_visibility target "${track.target}" must be "room" or a cast actor`);
      }
      break;
    case 'material_tint':
      if (track.target !== 'room' && !actors.has(track.target)) {
        throw new Error(`material_tint target "${track.target}" must be "room" or a cast actor`);
      }
      if (!(ZONE_IDS as readonly string[]).includes(track.zone)) {
        throw new Error(`material_tint zone "${track.zone}" is not a palette ZoneId`);
      }
      cssHex(track.color);
      for (const c of track.glitchColors ?? []) cssHex(c);
      break;
    case 'fixture':
      if (!fixtures.has(track.fixture)) throw new Error(`fixture track references unknown fixture "${track.fixture}"`);
      break;
    case 'stage_light':
      resolvePoint(track.anchor, points);
      break;
    case 'camera_shake':
    case 'pixelate':
      break;
  }
}

function validateManifestRefs(pack: ComixPack, points: ResolvedTimeline['points'], errors: string[]): void {
  const propIds = new Set<string>();
  for (const prop of pack.manifest.stage.props ?? []) {
    if (propIds.has(prop.id)) errors.push(`stage.props: duplicate prop id "${prop.id}"`);
    propIds.add(prop.id);
    try { resolvePoint(prop.at, points); } catch (err) { errors.push(`stage.props.${prop.id}: ${err instanceof Error ? err.message : String(err)}`); }
  }
  const fixIds = new Set<string>();
  for (const fix of pack.manifest.stage.fixtures ?? []) {
    if (fixIds.has(fix.id)) errors.push(`stage.fixtures: duplicate fixture id "${fix.id}"`);
    fixIds.add(fix.id);
    try {
      if (fix.kind === 'bolt') {
        resolvePoint(fix.from, points);
        resolvePoint(fix.to, points);
      } else if (fix.kind === 'vortex') {
        resolvePoint(fix.at, points);
      }
    } catch (err) {
      errors.push(`stage.fixtures.${fix.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  const castIds = new Set<string>();
  for (const actor of pack.manifest.cast) {
    if (castIds.has(actor.id)) errors.push(`cast: duplicate actor id "${actor.id}"`);
    castIds.add(actor.id);
    if (actor.at !== undefined) {
      try { resolvePoint(actor.at, points); } catch (err) { errors.push(`cast.${actor.id}: ${err instanceof Error ? err.message : String(err)}`); }
    }
  }
}

function emptySimResult(id: string, durationSec: number, errors: string[]): ComixSimResult {
  return {
    ok: false,
    id,
    frames: 0,
    durationSec,
    panelCuts: [],
    snapshots: [],
    turnsCompleted: 0,
    beatsFired: 0,
    activeTracksPeak: 0,
    skipStops: [],
    errors,
  };
}

function collectTimelineItems(
  pack: ComixPack,
  timeline: ResolvedTimeline,
  errors: string[],
): Array<{ at: number; count: number; step: number }> {
  const actors = new Set(pack.manifest.cast.map((a) => a.id));
  const fixtures = new Set((pack.manifest.stage.fixtures ?? []).map((f) => f.id));
  const resolvedBeats: Array<{ at: number; count: number; step: number }> = [];

  for (const b of timeline.beats) {
    try {
      validateBeat(b.spec, b.cues, b.panelFrom, timeline.points, actors);
      if (b.spec.kind !== 'key_clicks') {
        const at = resolveTime(b.spec.at, b.cues, b.panelFrom);
        const count = b.spec.kind === 'fx_repeat' ? b.spec.count : 1;
        const step = b.spec.kind === 'fx_repeat' ? b.spec.step : 0;
        resolvedBeats.push({ at, count, step });
      }
    } catch (err) {
      errors.push(`${b.panelId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  for (const l of timeline.letters) {
    try {
      validateLetter(l.spec, l.cues, l.panelFrom, timeline.points, actors);
    } catch (err) {
      errors.push(`${l.panelId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  for (const tr of timeline.tracks) {
    try {
      if (tr.until !== undefined && !(tr.until > tr.from)) {
        throw new Error(`track "${tr.spec.kind}" until (${tr.until}) must be > from (${tr.from})`);
      }
      validateTrack(tr.spec, tr.cues, tr.baseTime, timeline.points, actors, fixtures);
    } catch (err) {
      errors.push(`${tr.ownerId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return resolvedBeats;
}

/**
 * Headless 60fps simulation of a `ComixPack` (no DOM or WebGL required).
 * Steps `t` from `0` through `durationSec` (+ `1s` hold window if `holdAtEnd`), verifying every panel cut,
 * snapshot keyframe, page turn, beat trigger, letter cue, track evaluation, and skip rule.
 */
export function simulateComixPack(pack: ComixPack): ComixSimResult {
  const errors: string[] = [];
  let timeline: ResolvedTimeline;
  try {
    timeline = compileTimeline(pack);
  } catch (err) {
    return emptySimResult(
      pack.manifest?.id ?? 'unknown',
      pack.manifest?.durationSec ?? 0,
      [err instanceof Error ? err.message : String(err)],
    );
  }

  validateManifestRefs(pack, timeline.points, errors);
  const resolvedBeats = collectTimelineItems(pack, timeline, errors);
  for (const p of timeline.panels) {
    if (!(p.until > p.from)) errors.push(`${p.id}: panel until (${p.until}) must be > from (${p.from})`);
    if (p.camera.spanFrom !== undefined && p.camera.spanTo !== undefined && !(p.camera.spanTo > p.camera.spanFrom)) {
      errors.push(`${p.id}: camera span end (${p.camera.spanTo}) must be > start (${p.camera.spanFrom})`);
    }
  }
  if (timeline.panels.length === 0) {
    errors.push('timeline has 0 panels');
    return emptySimResult(timeline.id, timeline.durationSec, errors);
  }

  const dt = 1 / 60;
  const totalSec = timeline.durationSec + (timeline.holdAtEnd ? 1.0 : 0);
  const panelCuts: string[] = [timeline.panels[0]!.id];
  const snapshots: string[] = [];
  let beatsFired = 0;
  let activeTracksPeak = 0;
  let prev = 0;
  let currentPanel = timeline.panels[0]!.id;
  let frames = 0;

  for (let step = 1; prev < totalSec - 1e-9; step++) {
    const t = Math.min(totalSec, step * dt);
    frames++;
    for (let i = 1; i < timeline.panels.length; i++) {
      const p = timeline.panels[i]!;
      if (prev < p.from && t >= p.from) {
        currentPanel = p.id;
        panelCuts.push(p.id);
      }
    }
    for (const p of timeline.panels) {
      if (p.snapshotAt !== undefined && prev < p.snapshotAt && t >= p.snapshotAt && currentPanel === p.id) {
        snapshots.push(`${p.id}@${p.snapshotAt.toFixed(2)}s`);
      }
    }
    for (const b of resolvedBeats) {
      for (let k = 0; k < b.count; k++) {
        const triggerAt = b.at + k * b.step;
        if (prev < triggerAt && t >= triggerAt) beatsFired++;
      }
    }
    let activeNow = 0;
    for (const tr of timeline.tracks) {
      if (t >= tr.from && (tr.until === undefined || t < tr.until)) activeNow++;
    }
    if (activeNow > activeTracksPeak) activeTracksPeak = activeNow;
    activePanelAt(timeline, t);
    prev = t;
  }

  if (panelCuts.length !== timeline.panels.length) {
    errors.push(`expected ${timeline.panels.length} panel cuts, observed ${panelCuts.length} (${panelCuts.join(' -> ')})`);
  }

  let turnsCompleted = 0;
  for (const turn of timeline.turns) {
    if (turn.to <= totalSec + 1e-6 && turn.to > turn.from) turnsCompleted++;
    else errors.push(`page ${turn.pageIndex + 1} turn [${turn.from}..${turn.to}] does not complete within ${totalSec.toFixed(2)}s`);
  }

  const skipStops: Array<number | 'end'> = [];
  let cursor = 0.05;
  for (let guard = 0; guard < 16; guard++) {
    const next = resolveSkipTarget(timeline, cursor);
    skipStops.push(next);
    if (next === 'end' || next <= cursor) break;
    cursor = next + 0.05;
  }

  return {
    ok: errors.length === 0,
    id: timeline.id,
    frames,
    durationSec: timeline.durationSec,
    panelCuts,
    snapshots,
    turnsCompleted,
    beatsFired,
    activeTracksPeak,
    skipStops,
    errors,
  };
}
