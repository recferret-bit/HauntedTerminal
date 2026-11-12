import * as THREE from 'three';
import { createComicMaterial, type ComicMaterial } from '../../../shaders/comic-material.js';
import type { ZoneDef } from '../../core/palette.js';

/** Everything an emission owns and must dispose, collected while the pieces are built. */
export interface EmitterParts {
  materials: ComicMaterial[];
  geometries: THREE.BufferGeometry[];
  /** Flat keyline materials by colour (`-1` is the word's backing). */
  keylines: Map<number, THREE.MeshBasicMaterial>;
}

export function createParts(): EmitterParts {
  return { materials: [], geometries: [], keylines: new Map() };
}

export function keylineMaterial(parts: EmitterParts, color: number): THREE.MeshBasicMaterial {
  let mat = parts.keylines.get(color);
  if (!mat) {
    mat = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
    parts.keylines.set(color, mat);
  }
  return mat;
}

export function zoneMaterial(zone: ZoneDef, alpha: number): ComicMaterial {
  // Effects are flat pops: no halftone or stripes, they would shimmer on spinning chunks.
  return createComicMaterial(zone.color, { emissive: zone.emissive, opacity: (zone.opacity ?? 1) * alpha, ghost: zone.ghost });
}

export function disposeParts(parts: EmitterParts): void {
  parts.geometries.forEach((g) => g.dispose());
  parts.materials.forEach((m) => m.dispose());
  parts.keylines.forEach((m) => m.dispose());
}
