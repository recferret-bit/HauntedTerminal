import type * as THREE from 'three';
import type { ComicMaterial } from '../shaders/comic-material.js';
import type { CineAudio } from './audio.js';
import { resolvePoint } from './expr.js';
import type { ComicPage } from './page.js';
import type { Runner } from './runner.js';
import type { Rain } from './set.js';
import { v3 } from './set.js';
import type { ComixActorSpec, ComixPack, PointRef, StagePropSpec, Vec3 } from './spec-types.js';
import type { Actor, CinematicStage } from './stage.js';
import { activePanelAt, type ResolvedTimeline } from './timeline.js';

export interface ComixActor {
  spec: ComixActorSpec;
  actor: Actor;
  basePos: THREE.Vector3;
  baseScale: number;
  baseRotZ: number;
  baseVisible: boolean;
}

export interface ComixProp {
  spec: StagePropSpec;
  actor: Actor;
  index: number;
}

export type ComixFixture =
  | { kind: 'rain'; id: string; rain: Rain }
  | { kind: 'bolt'; id: string; node: THREE.Object3D }
  | { kind: 'vortex'; id: string; mesh: THREE.Mesh; w: number; h: number };

export interface TrackedPartBase {
  mesh: THREE.Mesh;
  visible: boolean;
}

export interface TrackedZoneBase {
  material: ComicMaterial;
  hex: number;
}

/** Live runtime state for any declarative `ComixPack`. */
export interface ComixWorld {
  pack: ComixPack;
  timeline: ResolvedTimeline;
  page: ComicPage;
  stage: CinematicStage | null;
  room: Actor | null;
  audio: CineAudio;
  sound: CineAudio;
  actors: Map<string, ComixActor>;
  props: Map<string, ComixProp>;
  fixtures: Map<string, ComixFixture>;
  partBases: TrackedPartBase[];
  zoneBases: Map<string, TrackedZoneBase>;
  current: string;
  prev: number;
  kept: Set<string>;
}

export interface DebugOptions {
  freezeAt?: number;
  /** Play `localStorage['ht-comix-draft']` when it holds a draft of this comix. */
  draft?: boolean;
  /** Embedded `/comix-editor` mode: hide in-page transport overlay and hold at `durationSec` instead of disposing WebGL. */
  editor?: boolean;
  /** Receives the live `Runner` handle for in-place seeking / replay in `/cinematic.html` and `/comix-editor`. */
  onRunner?: (runner: Runner) => void;
  /** Receives the live `ComixWorld` handle for editor camera inspection. */
  onWorld?: (world: ComixWorld) => void;
  /** Runs after every frame render so embedded editor selection overlays stay aligned with animated targets. */
  onDraw?: (world: ComixWorld, t: number) => void;
}

/** Run stats consumed by any `stats_card` panel letter. */
export interface ComixStats {
  rank: string;
  timeSec: number;
  commands: number;
  shortcuts: string[];
}

export function worldPoint(world: ComixWorld, ref: PointRef, offset?: Vec3): THREE.Vector3 {
  const p = resolvePoint(ref, world.timeline.points, offset);
  return v3(p.x, p.y, p.z);
}

export function panelAt(world: ComixWorld, t: number): string {
  return activePanelAt(world.timeline, t).id;
}
