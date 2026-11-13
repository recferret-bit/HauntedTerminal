import type * as THREE from 'three';
import type { ZoneId } from '../procgen/core/palette.js';
import type { ComicMaterial } from '../shaders/comic-material.js';
import { CineAudio, safeAudio } from './audio.js';
import { stepBeats } from './beats.js';
import { cssHex, resolveMark } from './expr.js';
import { buildLetters, type LetterNodes } from './letters-build.js';
import { drawLetterNodes } from './letters-draw.js';
import { ComicPage, type PanelDef } from './page.js';
import { poseBody } from './pose-body.js';
import { poseLight, poseShot } from './pose-light.js';
import { runCinematic, type CineScript } from './runner.js';
import { markAt, type ComixActor, type ComixStats, type ComixWorld, type DebugOptions, type TimedPanel } from './reel.js';
import { makeBolt, makeComicBolt, makeVortex, partsNamed, Rain, v3 } from './set.js';
import type { ComixPack, PoseProgram } from './spec-types.js';
import { CinematicStage, fitPanelStage, span, type Actor } from './stage.js';

export type { DebugOptions };

function suckPull(world: ComixWorld, t: number): number {
  for (const program of world.pack.poses.programs) {
    if (program.kind === 'suck') return span(t, markAt(world, program.from), markAt(world, program.to));
  }
  return 0;
}

/** Poses are a pure function of t. Body programs move actors; light programs do not. */
export function poseComix(world: ComixWorld, t: number): void {
  const stage = world.stage;
  if (!stage) return;
  stage.shake = 0;
  stage.flash = 0;
  poseShot(world, t);
  const pull = suckPull(world, t);
  for (const program of world.pack.poses.programs) applyProgram(world, program, t, pull);
}

function applyProgram(world: ComixWorld, program: PoseProgram, t: number, pull: number): void {
  if (!poseBody(world, program, t)) poseLight(world, program, t, pull);
}

function buildPage(host: HTMLElement, pack: ComixPack): { page: ComicPage; panels: TimedPanel[] } {
  const defs: PanelDef[] = [];
  const panels: TimedPanel[] = [];
  for (const file of [...pack.pages].sort((a, b) => a.page - b.page)) {
    if (file.page < 0 || file.page >= pack.manifest.pageCount) {
      throw new Error(`comix page ${file.page} is outside pageCount ${pack.manifest.pageCount}`);
    }
    for (const panel of file.panels) {
      if (panels.some((have) => have.id === panel.id)) throw new Error(`duplicate comix panel "${panel.id}"`);
      const def: PanelDef = { id: panel.id, page: file.page, landscape: panel.landscape, portrait: panel.portrait };
      defs.push(def);
      panels.push({ id: panel.id, at: resolveMark(panel.at, pack.marks), def });
    }
  }
  panels.sort((a, b) => a.at - b.at);
  return { page: new ComicPage(host, defs, pack.manifest.pageCount), panels };
}

function buildPoints(pack: ComixPack): Record<string, THREE.Vector3> {
  const points: Record<string, THREE.Vector3> = {};
  for (const [id, point] of Object.entries(pack.set.points)) points[id] = v3(point.x, point.y, point.z);
  return points;
}

function buildCast(stage: CinematicStage, pack: ComixPack, points: Record<string, THREE.Vector3>): { actors: Map<string, ComixActor>; agents: ComixActor[] } {
  const actors = new Map<string, ComixActor>();
  const agents: ComixActor[] = [];
  const flying = new Set(pack.poses.programs.flatMap((program) => (program.kind === 'flight' ? [program.actor] : [])));
  for (const spec of pack.cast.actors) {
    const actor = stage.addModel(spec.model, 1);
    const member: ComixActor = { spec, actor };
    actors.set(spec.id, member);
    if (spec.role === 'agent') agents.push(member);
    if (spec.home) {
      const home = points[spec.home];
      if (!home) throw new Error(`unknown comix point "${spec.home}"`);
      actor.model.group.position.copy(home);
    }
    if (spec.look) actor.animator.setLook(spec.look[0], spec.look[1]);
    actor.model.group.visible = spec.role === 'agent' ? false : !flying.has(spec.id);
  }
  return { actors, agents };
}

function zoneMat(room: Actor, name: string | undefined): ComicMaterial | undefined {
  if (!name) return undefined;
  return room.model.materials.get(name as ZoneId);
}

function buildParts(room: Actor, pack: ComixPack): Pick<ComixWorld, 'glassParts' | 'codeParts' | 'screenParts' | 'glass' | 'glassColor' | 'amber'> {
  const parts = pack.set.parts;
  const glass = zoneMat(room, parts?.glassMaterial);
  const color = glass?.uniforms.uColor?.value as THREE.Color | undefined;
  return {
    glassParts: parts?.glass ? partsNamed(room, parts.glass) : [],
    codeParts: (parts?.code ?? []).flatMap((prefix) => partsNamed(room, prefix)),
    screenParts: parts?.screen ? partsNamed(room, parts.screen) : [],
    glass,
    glassColor: color?.getHex() ?? 0xc8fff4,
    amber: zoneMat(room, parts?.amberMaterial),
  };
}

function buildEffects(stage: CinematicStage, pack: ComixPack, points: Record<string, THREE.Vector3>): Pick<ComixWorld, 'rain' | 'bolts' | 'vortex' | 'vortexInset' | 'monitor'> {
  const set = pack.set;
  const bolts = new Map<string, THREE.Object3D>();
  for (const bolt of set.bolts ?? []) {
    const from = v3(bolt.from.x, bolt.from.y, bolt.from.z);
    const to = v3(bolt.to.x, bolt.to.y, bolt.to.z);
    bolts.set(bolt.id, bolt.style === 'comic' ? makeComicBolt(stage, from, to, bolt.seed ?? 1) : makeBolt(stage, from, to));
  }
  const monitor = set.monitor ?? null;
  let vortex: THREE.Mesh | null = null;
  if (set.vortex && monitor) {
    const at = points[set.vortex.at];
    if (!at) throw new Error(`unknown comix point "${set.vortex.at}"`);
    vortex = makeVortex(stage, v3(at.x, at.y, set.vortex.z), monitor.w - set.vortex.inset, monitor.h - set.vortex.inset);
  }
  return {
    rain: set.rain ? new Rain(stage, set.rain, set.rain.z) : null,
    bolts,
    vortex,
    vortexInset: set.vortex?.inset ?? 0,
    monitor,
  };
}

function addRoom(stage: CinematicStage, pack: ComixPack, points: Record<string, THREE.Vector3>): Actor {
  const room = stage.addModel(pack.manifest.room, 1);
  for (const prop of pack.set.props ?? []) {
    const actor = stage.addModel(prop.model, 1);
    const at = points[prop.at];
    if (!at) throw new Error(`unknown comix point "${prop.at}"`);
    actor.model.group.position.copy(at);
  }
  return room;
}

function blankWorld(pack: ComixPack, page: ComicPage, panels: TimedPanel[], stage: CinematicStage | null, audio: CineAudio, points: Record<string, THREE.Vector3>): ComixWorld {
  return {
    pack, page, stage, audio, sound: safeAudio(audio), points,
    actors: new Map(), agents: [], monitor: pack.set.monitor ?? null, vortexInset: pack.set.vortex?.inset ?? 0,
    glassParts: [], codeParts: [], screenParts: [], glassColor: 0xc8fff4,
    rain: null, bolts: new Map(), vortex: null, panels, current: '', prev: 0, kept: new Set(),
  };
}

function buildWorld(pack: ComixPack, page: ComicPage, panels: TimedPanel[], stage: CinematicStage | null, audio: CineAudio): ComixWorld {
  const points = buildPoints(pack);
  const world = blankWorld(pack, page, panels, stage, audio, points);
  if (!stage) return world;
  stage.setBackground(cssHex(pack.manifest.background));
  const room = addRoom(stage, pack, points);
  const cast = buildCast(stage, pack, points);
  return { ...world, ...cast, ...buildParts(room, pack), ...buildEffects(stage, pack, points) };
}

function cutTo(world: ComixWorld, letters: LetterNodes, to: string, at: number): void {
  const stage = world.stage;
  if (stage && world.current && !world.kept.has(world.current)) {
    const before = at - 1e-3;
    poseComix(world, before);
    stage.render(before);
    drawLetterNodes(world, letters, before);
    world.page.snapshot(world.current, stage.canvas);
  }
  world.page.show(to);
  if (stage) world.page.mount(to, stage.canvas);
  world.current = to;
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
  for (let i = 1; i < world.panels.length; i++) {
    const panel = world.panels[i]!;
    if (world.prev < panel.at && t >= panel.at) cutTo(world, letters, panel.id, panel.at);
  }
  for (const frame of world.pack.manifest.keyframes ?? []) {
    const at = markAt(world, frame.at);
    if (world.prev < at && t >= at && world.current === frame.panel) snapKept(world, letters, frame.panel, t);
  }
  if (world.stage) stepBeats(world, t, live);
  world.stage?.step(dt);
  world.prev = t;
}

function drawWorld(world: ComixWorld, letters: LetterNodes, t: number): void {
  poseComix(world, t);
  world.stage?.render(t);
  drawLetterNodes(world, letters, t);
}

function layoutWorld(world: ComixWorld): void {
  world.page.layout();
  if (world.stage && world.current) fitPanelStage(world.stage, world.page, world.current);
}

function skipPack(world: ComixWorld, t: number): number | 'end' {
  const skip = world.pack.manifest.skip;
  if (skip === 'end') return 'end';
  for (const rule of skip) if (t < markAt(world, rule.before)) return markAt(world, rule.to);
  return t;
}

function makeScript(world: ComixWorld, letters: LetterNodes): CineScript {
  const keyFrom = world.pack.manifest.acceptsKeyFrom;
  return {
    end: markAt(world, world.pack.manifest.end),
    holdAtEnd: world.pack.manifest.holdAtEnd,
    step: (t, dt, live) => stepWorld(world, letters, t, dt, live),
    draw: (t) => drawWorld(world, letters, t),
    layout: () => layoutWorld(world),
    skipTo: (t) => skipPack(world, t),
    acceptsKey: keyFrom ? (t) => t >= markAt(world, keyFrom) : undefined,
    onPause: (paused) => world.audio.setPaused(paused),
  };
}

function openStage(pack: ComixPack): { stage: CinematicStage | null; skip: boolean } {
  try {
    return { stage: new CinematicStage(), skip: false };
  } catch (err) {
    const splash = !!pack.splash;
    console.warn(splash ? '[cinematic] no WebGL, showing the stats without the scene' : '[cinematic] no WebGL, skipping the intro', err);
    return { stage: null, skip: !splash };
  }
}

interface PlayOpts { skippable?: boolean; muted?: boolean }

function runPacked(pack: ComixPack, built: { page: ComicPage; panels: TimedPanel[] }, stage: CinematicStage | null, audio: CineAudio, opts: PlayOpts, debug: DebugOptions, stats?: ComixStats): Promise<void> {
  const world = buildWorld(pack, built.page, built.panels, stage, audio);
  const letters = buildLetters(world, stats);
  const first = world.panels[0];
  if (!first) throw new Error(`comix pack "${pack.id}" has no panels`);
  cutTo(world, letters, first.id, first.at);
  const cleanup = (): void => {
    world.stage?.dispose();
    world.audio.dispose();
    world.page.dispose();
  };
  return runCinematic(world.page.root, makeScript(world, letters), {
    skippable: opts.skippable !== false,
    freezeAt: debug.freezeAt,
    inputGraceMs: pack.manifest.inputGraceMs ?? 400,
  }, cleanup).done;
}

/** Play one assembled pack. Intro bails when WebGL is missing; a splash pack still shows its card. */
export function startComix(host: HTMLElement, pack: ComixPack, opts: PlayOpts = {}, debug: DebugOptions = {}, stats?: ComixStats): Promise<void> {
  const built = buildPage(host, pack);
  const opened = openStage(pack);
  if (opened.skip) {
    built.page.dispose();
    return Promise.resolve();
  }
  const audio = new CineAudio(!!opts.muted || debug.freezeAt !== undefined);
  try {
    return runPacked(pack, built, opened.stage, audio, opts, debug, stats);
  } catch (err) {
    opened.stage?.dispose();
    audio.dispose();
    built.page.dispose();
    throw err;
  }
}
