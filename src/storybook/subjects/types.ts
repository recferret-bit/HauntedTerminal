import type * as THREE from 'three';
import type { BuiltModel } from '../../procgen/runtime/build.js';
import type { ModelSpec, Vec3 } from '../../procgen/core/types.js';
import type { ComicMaterial } from '../../shaders/comic-material.js';
import type { Bounds } from '../domain/framing.js';
import type { PartAnimator } from './part-animator.js';

export interface SubjectInfo {
  parts: number;
  /** Fill triangles (the ink shells roughly double what the GPU draws). */
  triangles: number;
  size: Vec3;
  minY: number;
  /** Depth over the wider of width and height. The art bible caps it at about 0.6. */
  depthRatio: number;
  /** Share of the visible front silhouette per zone, 0..1, largest first. Empty if the raster failed. */
  zones: { zone: string; family: string; parts: number; share: number }[];
  anim: { part: string; type: string }[];
  sockets: string[];
  tags: string[];
  textures: string[];
}

/** One thing the stage can draw: a procgen model, a texture on a quad, or an FX preset. */
export interface Subject {
  kind: 'model' | 'texture' | 'fx';
  id: string;
  label: string;
  category: string;
  lore: string;
  object: THREE.Object3D;
  materials: ComicMaterial[];
  /** Model-space bounds of the rest pose. */
  bounds: Bounds;
  /** Meshes that are light sources (zone emissive >= 0.3): they stay lit in lantern-dark mode. */
  glow: THREE.Mesh[];
  built: BuiltModel | null;
  spec: ModelSpec | null;
  animator: PartAnimator | null;
  sockets: Record<string, Vec3>;
  info: SubjectInfo | null;
  dispose(): void;
}

export interface SubjectOptions {
  seed: number;
  ink: boolean;
  tex: boolean;
}
