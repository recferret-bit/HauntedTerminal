import type * as THREE from 'three';
import type { ZoneId } from '../procgen/core/palette.js';
import { CineAudio, safeAudio } from './audio.js';
import { stepBeats } from './beats.js';
import { resolvePoint } from './expr.js';
import { buildLetters, resetLetterNodes, type LetterNodes } from './letters-build.js';
import { drawLetterNodes } from './letters-draw.js';
import { ComicPage, type PanelDef } from './page.js';
import type { ComixActor, ComixFixture, ComixProp, ComixStats, ComixWorld, DebugOptions, TrackedPartBase, TrackedZoneBase } from './reel.js';
import { runCinematic, type CineScript } from './runner.js';
import { makeBolt, makeComicBolt, makeVortex, partsNamed, Rain, v3 } from './set.js';
import type { ComixPack } from './spec-types.js';
import { CinematicStage, fitPanelStage, type Actor } from './stage.js';
import { compileTimeline, resolveSkipTarget, type ResolvedTimeline } from './timeline.js';
import { poseComix } from './tracks.js';

export type { DebugOptions };

function buildPageDom(host: HTMLElement, timeline: ResolvedTimeline): ComicPage {
  const defs: PanelDef[] = timeline.panels.map((p) => ({
    id: p.id,
    page: p.pageIndex,
    landscape: p.landscape,
    portrait: p.portrait,
  }));
  return new ComicPage(host, defs, timeline.pageCount);
}

function buildCast(stage: CinematicStage, pack: ComixPack, timeline: ResolvedTimeline): Map<string, ComixActor> {
  const actors = new Map<string, ComixActor>();
  for (const spec of pack.manifest.cast) {
    const actor = stage.addModel(spec.model, 1);
    const pos = spec.at ? resolvePoint(spec.at, timeline.points) : { x: 0, y: 0, z: 0 };
    const basePos = v3(pos.x, pos.y, pos.z);
    const baseScale = spec.scale ?? 1;
    const baseRotZ = spec.rotationZ ?? 0;
    const baseVisible = spec.visible !== false;
    actor.model.group.position.copy(basePos);
    actor.model.group.scale.setScalar(baseScale);
    actor.model.group.rotation.z = baseRotZ;
    actor.model.group.visible = baseVisible;
    if (spec.look) actor.animator.setLook(spec.look[0], spec.look[1]);
    actors.set(spec.id, { spec, actor, basePos, baseScale, baseRotZ, baseVisible });
  }
  return actors;
}

function buildFixtures(stage: CinematicStage, pack: ComixPack, timeline: ResolvedTimeline): Map<string, ComixFixture> {
  const fixtures = new Map<string, ComixFixture>();
  for (const spec of pack.manifest.stage.fixtures ?? []) {
    if (spec.kind === 'rain') {
      fixtures.set(spec.id, {
        kind: 'rain',
        id: spec.id,
        rain: new Rain(stage, { x: spec.x, y: spec.y, w: spec.w, h: spec.h }, spec.z, spec.drops ?? 26),
      });
    } else if (spec.kind === 'bolt') {
      const from = resolvePoint(spec.from, timeline.points);
      const to = resolvePoint(spec.to, timeline.points);
      const node = spec.style === 'comic'
        ? makeComicBolt(stage, v3(from.x, from.y, from.z), v3(to.x, to.y, to.z), spec.seed ?? 1)
        : makeBolt(stage, v3(from.x, from.y, from.z), v3(to.x, to.y, to.z));
      fixtures.set(spec.id, { kind: 'bolt', id: spec.id, node });
    } else {
      const at = resolvePoint(spec.at, timeline.points);
      const mesh = makeVortex(stage, v3(at.x, at.y, spec.z), spec.w, spec.h);
      fixtures.set(spec.id, { kind: 'vortex', id: spec.id, mesh, w: spec.w, h: spec.h });
    }
  }
  return fixtures;
}

function collectTrackBases(room: Actor, actors: Map<string, ComixActor>, timeline: ResolvedTimeline): {
  partBases: TrackedPartBase[];
  zoneBases: Map<string, TrackedZoneBase>;
} {
  const seenParts = new Set<THREE.Mesh>();
  const partBases: TrackedPartBase[] = [];
  const zoneBases = new Map<string, TrackedZoneBase>();

  for (const tr of timeline.tracks) {
    const spec = tr.spec;
    if (spec.kind === 'part_visibility') {
      const target = spec.target === 'room' ? room : actors.get(spec.target)?.actor;
      if (!target) continue;
      for (const prefix of spec.parts) {
        for (const mesh of partsNamed(target, prefix)) {
          if (seenParts.has(mesh)) continue;
          seenParts.add(mesh);
          partBases.push({ mesh, visible: mesh.visible });
        }
      }
    } else if (spec.kind === 'material_tint') {
      const key = `${spec.target}:${spec.zone}`;
      if (zoneBases.has(key)) continue;
      const target = spec.target === 'room' ? room : actors.get(spec.target)?.actor;
      const material = target?.model.materials.get(spec.zone as ZoneId);
      const color = material?.uniforms.uColor?.value as THREE.Color | undefined;
      if (material && color) zoneBases.set(key, { material, hex: color.getHex() });
    }
  }
  return { partBases, zoneBases };
}

function buildWorld(pack: ComixPack, timeline: ResolvedTimeline, page: ComicPage, stage: CinematicStage | null, audio: CineAudio): ComixWorld {
  const base: ComixWorld = {
    pack,
    timeline,
    page,
    stage,
    room: null,
    audio,
    sound: safeAudio(audio),
    actors: new Map(),
    props: new Map(),
    fixtures: new Map(),
    partBases: [],
    zoneBases: new Map(),
    current: '',
    prev: 0,
    kept: new Set(),
  };
  if (!stage) return base;
  stage.clampToRoom = timeline.clampToRoom;
  stage.setBackground(timeline.backgroundHex);
  const room = stage.addModel(pack.manifest.stage.room, 1);
  const props = new Map<string, ComixProp>();
  (pack.manifest.stage.props ?? []).forEach((prop, index) => {
    const placed = stage.addModel(prop.model, 1);
    const pos = resolvePoint(prop.at, timeline.points);
    placed.model.group.position.set(pos.x, pos.y, pos.z);
    if (prop.scale !== undefined) placed.model.group.scale.setScalar(prop.scale);
    props.set(prop.id, { spec: prop, actor: placed, index });
  });
  const actors = buildCast(stage, pack, timeline);
  const fixtures = buildFixtures(stage, pack, timeline);
  const { partBases, zoneBases } = collectTrackBases(room, actors, timeline);
  return { ...base, room, actors, props, fixtures, partBases, zoneBases };
}

function cutTo(world: ComixWorld, letters: LetterNodes, to: string, at: number): void {
  const stage = world.stage;
  if (stage && world.current && !world.kept.has(world.current)) {
    const before = Math.max(0, at - 1e-3);
    poseComix(world, before);
    stage.render(before);
    drawLetterNodes(world, letters, before);
    world.page.snapshot(world.current, stage.canvas);
  }
  world.page.show(to);
  if (stage) world.page.mount(to, stage.canvas);
  world.current = to;
  world.page.root.dataset.activePanel = to;
  if (stage && world.current) fitPanelStage(stage, world.page, world.current);
}

function snapKept(world: ComixWorld, letters: LetterNodes, id: string, t: number): void {
  const stage = world.stage;
  if (!stage || world.current !== id) return;
  poseComix(world, t);
  stage.render(t);
  drawLetterNodes(world, letters, t);
  world.page.snapshot(id, stage.canvas);
  world.kept.add(id);
}

function stepWorld(world: ComixWorld, letters: LetterNodes, t: number, dt: number, live: boolean): void {
  const panels = world.timeline.panels;
  for (let i = 1; i < panels.length; i++) {
    const panel = panels[i]!;
    if (world.prev < panel.from && t >= panel.from) cutTo(world, letters, panel.id, panel.from);
  }
  for (const panel of panels) {
    if (panel.snapshotAt !== undefined && world.prev < panel.snapshotAt && t >= panel.snapshotAt && world.current === panel.id) {
      snapKept(world, letters, panel.id, t);
    }
  }
  if (world.stage) stepBeats(world, t, live);
  world.stage?.step(dt);
  world.prev = t;
}

function resetWorld(world: ComixWorld, letters: LetterNodes): void {
  world.kept.clear();
  world.prev = 0;
  world.current = '';
  world.page.reset();
  world.stage?.clearEffects();
  resetLetterNodes(letters);
  for (const member of world.actors.values()) {
    member.actor.animator.setState('idle');
    member.actor.animator.setLook(member.spec.look?.[0] ?? 0, member.spec.look?.[1] ?? 0);
    member.actor.animator.update(0);
  }
  const first = world.timeline.panels[0]!;
  cutTo(world, letters, first.id, first.from);
}

function makeScript(world: ComixWorld, letters: LetterNodes, onDraw?: (world: ComixWorld, t: number) => void): CineScript {
  const { timeline } = world;
  return {
    end: timeline.durationSec,
    holdAtEnd: timeline.holdAtEnd,
    step: (t, dt, live) => stepWorld(world, letters, t, dt, live),
    draw: (t) => {
      poseComix(world, t);
      world.stage?.render(t);
      drawLetterNodes(world, letters, t);
      onDraw?.(world, t);
    },
    layout: () => {
      world.page.layout();
      if (world.stage && world.current) fitPanelStage(world.stage, world.page, world.current);
    },
    skipTo: (t) => resolveSkipTarget(timeline, t),
    acceptsKey: timeline.acceptsKeyFrom !== undefined ? (t) => t >= timeline.acceptsKeyFrom! : undefined,
    onPause: (paused) => world.audio.setPaused(paused),
    reset: () => resetWorld(world, letters),
  };
}

function openStage(timeline: ResolvedTimeline): { stage: CinematicStage | null; skip: boolean } {
  try {
    return { stage: new CinematicStage(), skip: false };
  } catch (err) {
    const hasStatsCard = timeline.letters.some((l) => l.spec.kind === 'stats_card');
    console.warn(
      hasStatsCard ? '[cinematic] no WebGL, showing stats card without 3D stage' : `[cinematic] no WebGL, skipping comix "${timeline.id}"`,
      err,
    );
    return { stage: null, skip: !hasStatsCard };
  }
}

export interface PlayOpts {
  skippable?: boolean;
  muted?: boolean;
}

export interface ComixPlayResult {
  completed: boolean;
  finalTime: number;
  showedOverlay: boolean;
}

/** Play any declarative `ComixPack` on `host`. */
export function startComix(
  host: HTMLElement,
  pack: ComixPack,
  opts: PlayOpts = {},
  debug: DebugOptions = {},
  stats?: ComixStats,
): Promise<ComixPlayResult> {
  const timeline = compileTimeline(pack);
  const page = buildPageDom(host, timeline);
  const opened = openStage(timeline);
  if (opened.skip) {
    page.dispose();
    return Promise.resolve({ completed: false, finalTime: 0, showedOverlay: false });
  }
  const audio = new CineAudio(!!opts.muted || debug.freezeAt !== undefined);
  try {
    const world = buildWorld(pack, timeline, page, opened.stage, audio);
    const letters = buildLetters(world, stats);
    const first = timeline.panels[0]!;
    cutTo(world, letters, first.id, first.from);
    const cleanup = (): void => {
      world.stage?.dispose();
      world.audio.dispose();
      world.page.dispose();
    };
    const runner = runCinematic(world.page.root, makeScript(world, letters, debug.onDraw), {
      skippable: opts.skippable !== false,
      freezeAt: debug.freezeAt,
      inputGraceMs: timeline.inputGraceMs,
      editor: debug.editor,
    }, cleanup);
    debug.onRunner?.(runner);
    debug.onWorld?.(world);
    if (debug.onDraw) debug.onDraw(world, runner.time);
    return runner.done.then(() => {
      const finalTime = runner.time;
      const showedOverlay = timeline.overlays.some((ov) => finalTime >= ov.at + 0.1);
      return { completed: finalTime >= timeline.durationSec - 1e-3, finalTime, showedOverlay };
    });
  } catch (err) {
    opened.stage?.dispose();
    audio.dispose();
    page.dispose();
    throw err;
  }
}
