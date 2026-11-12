import * as THREE from 'three';
import type { BuiltModel } from '../build.js';
import type { AnimTintHook } from './types.js';

/**
 * A ready-made `onTint` hook: lerps every comic material's `uColor` toward the tint and puts the
 * authored colours back on `null`. Pass it as `createAnimator(model, { onTint: createAnimMaterialTint(model) })`,
 * or write your own hook (swap a texture, add an ice shell) when a colour lerp is not enough.
 */
export function createAnimMaterialTint(model: BuiltModel): AnimTintHook {
  // Keyed by the Color object: per-part clones made by the animator share it with their zone material.
  const baseColors = new Map<THREE.Color, THREE.Color>();
  const target = new THREE.Color();
  return (tint) => {
    const done = new Set<THREE.Color>();
    for (const m of model.allMaterials) {
      const color = m.uniforms.uColor?.value as THREE.Color | undefined;
      if (!color || done.has(color)) continue;
      done.add(color);
      let base = baseColors.get(color);
      if (!base) baseColors.set(color, (base = color.clone()));
      color.copy(base);
      if (tint) color.lerp(target.setHex(tint.color), Math.min(1, Math.max(0, tint.amount)));
    }
  };
}
