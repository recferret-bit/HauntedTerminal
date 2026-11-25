import * as THREE from 'three';
import { createComicMaterial, type ComicMaterial } from '../../../shaders/comic-material.js';
import { INK, type ZoneDef } from '../../core/palette.js';
import { FX_ROLE_EMISSIVE_FLOOR } from '../../fx/simulate.js';
import type { FxRole } from '../../fx/types.js';

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

export function zoneMaterial(zone: ZoneDef, alpha: number, role?: FxRole): ComicMaterial {
  // Effects are self-lit comic pops: keep non-ink layers luminous in dark rooms while preserving ink silhouettes.
  const floor = role && zone.color !== INK ? FX_ROLE_EMISSIVE_FLOOR[role] : 0;
  const emissive = zone.color === INK ? 0 : Math.max(zone.emissive ?? 0, floor);
  return createComicMaterial(zone.color, { emissive, opacity: (zone.opacity ?? 1) * alpha, ghost: zone.ghost });
}

export function disposeParts(parts: EmitterParts): void {
  parts.geometries.forEach((g) => g.dispose());
  parts.materials.forEach((m) => m.dispose());
  parts.keylines.forEach((m) => m.dispose());
}
