import type * as THREE from 'three';
import type { ComicMaterial } from '../shaders/comic-material.js';
import type { CineAudio } from './audio.js';
import type { ComicPage, PanelDef } from './page.js';
import type { Rain } from './set.js';
import type { CastActor, ComixPack } from './spec-types.js';
import { resolveMark } from './expr.js';
import type { Actor, CinematicStage } from './stage.js';

/** One catalog model placed by the pack's cast. */
export interface ComixActor {
  spec: CastActor;
  actor: Actor;
}

export interface TimedPanel {
  id: string;
  at: number;
  def: PanelDef;
}

/**
 * Live comix: the packed specs plus the stage, page and actors they built.
 * Poses and letters read this; they do not store their own timings.
 */
export interface ComixWorld {
  pack: ComixPack;
  page: ComicPage;
  stage: CinematicStage | null;
  audio: CineAudio;
  sound: CineAudio;
  actors: Map<string, ComixActor>;
  agents: ComixActor[];
  points: Record<string, THREE.Vector3>;
  monitor: { x: number; y: number; w: number; h: number } | null;
  vortexInset: number;
  glassParts: THREE.Mesh[];
  codeParts: THREE.Mesh[];
  screenParts: THREE.Mesh[];
  glass?: ComicMaterial;
  glassColor: number;
  amber?: ComicMaterial;
  rain: Rain | null;
  bolts: Map<string, THREE.Object3D>;
  vortex: THREE.Mesh | null;
  panels: TimedPanel[];
  current: string;
  prev: number;
  kept: Set<string>;
}

/** Freeze-frame and comix-editor draft flags. Signatures of startIntro / startOutro stay the same. */
export interface DebugOptions {
  freezeAt?: number;
  /** Play `localStorage['ht-comix-draft']` when it is a draft of this comix. */
  draft?: boolean;
}

/** Run stats the outro splash reads. Structural match for `OutroStats`. */
export interface ComixStats {
  rank: string;
  timeSec: number;
  commands: number;
  shortcuts: string[];
}

export function markAt(world: ComixWorld, expr: string): number {
  return resolveMark(expr, world.pack.marks);
}

export function pointAt(world: ComixWorld, id: string): THREE.Vector3 {
  const point = world.points[id];
  if (!point) throw new Error(`unknown comix point "${id}"`);
  return point;
}

/** Latest panel whose `at` is <= t. Same rule as the old hardcoded `panelAt`. */
export function panelAt(world: ComixWorld, t: number): string {
  let id = world.panels[0]?.id ?? '';
  for (const panel of world.panels) if (t >= panel.at) id = panel.id;
  return id;
}
