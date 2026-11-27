import type * as THREE from 'three';
import type { BuiltModel } from '../../procgen/runtime/build.js';
import type { ModelSpec, Vec3 } from '../../procgen/core/types.js';
import type { FxPreset } from '../../procgen/fx/types.js';
import type { ComicFxLight, ComicMaterial } from '../../shaders/comic-material.js';
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

export interface FxSubjectLayerInfo {
  name: string;
  role: 'primary' | 'secondary' | 'accent';
  zone: string;
  count: number;
  emit: string;
}

export interface FxSubjectInfo {
  id: string;
  label: string;
  family: string;
  event: string;
  moment: string;
  when: string;
  anchor: string;
  durationMs: number;
  totalMs: number;
  stepFps: number;
  loop: boolean;
  fullPanel: boolean;
  shake: number;
  flash: number;
  light: { zone: string; radius: number; power: number };
  word: { text: string; style: string; zone: string; holdMs: number } | null;
  layers: FxSubjectLayerInfo[];
  metrics: {
    layers: number;
    instances: number;
    triangles: number;
    share: { primary: number; secondary: number; accent: number };
    deltaE: number | null;
    minParticlePx: number;
    bounds: { width: number; height: number };
    lastParticleMs: number;
  };
  pass: boolean;
  errors: number;
  warnings: number;
  issues: Array<{ code: string; severity: string; layer?: string; message: string }>;
}

export interface FxControlState {
  tMs: number;
  totalMs: number;
  stepFps: number;
  hiddenLayers: string[];
  wordText: string;
  baseWord: string;
}

export interface FxSubjectControl {
  readonly preset: FxPreset;
  getState(): FxControlState;
  setHiddenLayers(names: readonly string[]): void;
  toggleLayer(name: string): string[];
  setWord(text: string | null): void;
  cycleDurationMs(): number;
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
  /** Structured validator & preset telemetry for `kind: 'fx'`. */
  fxInfo?: FxSubjectInfo | null;
  /** Live playback / layer / lettering workbench hooks for `kind: 'fx'`. */
  fxControl?: FxSubjectControl | null;
  /** Optional live comic light source emitted by an FX subject. */
  fxLight?: () => ComicFxLight | null;
  dispose(): void;
}

export interface SubjectOptions {
  seed: number;
  ink: boolean;
  tex: boolean;
}
