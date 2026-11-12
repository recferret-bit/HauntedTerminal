/**
 * Material slots: the animator writes `uEmissive` / `uOpacity` as `base * multiplier` and never loses
 * the base. A value somebody else wrote in between (a stage fade, a lantern reveal) becomes the new base.
 */
import type * as THREE from 'three';
import type { BuiltModel } from '../build.js';

export interface MatSlot {
  mat: THREE.Material;
  emissive: { value: number } | null;
  opacity: { value: number } | null;
  baseEmissive: number;
  baseOpacity: number;
  baseTransparent: boolean;
  /** What the animator last wrote. A different value now means someone else wrote: that becomes the new base. */
  lastEmissive: number;
  lastOpacity: number;
  /** The animator switched `transparent` on for a fade and owes switching it back. */
  forcedTransparent: boolean;
  /** A `blink` part on a zone that does not glow: lit means ANIM_BLINK_GLOW, shut means dark. */
  blinkGlow: boolean;
  /** Ink shell (MeshBasicMaterial): opacity is a property, not a uniform. */
  ink: boolean;
}

export interface MatTable {
  readonly mats: MatSlot[];
  /** Slot index of a material, adding the slot on first sight. `ownOpacity` false: its opacity is not driven. */
  add(mat: THREE.Material, ink: boolean, ownOpacity?: boolean): number;
  clear(): void;
}

/** A table holding every comic material of the model; ink shells and clones are added as parts are met. */
export function createMatTable(model: BuiltModel): MatTable {
  const mats: MatSlot[] = [];
  const index = new Map<THREE.Material, number>();
  const add = (mat: THREE.Material, ink: boolean, ownOpacity = true): number => {
    let i = index.get(mat);
    if (i !== undefined) return i;
    const uniforms = (mat as THREE.ShaderMaterial).uniforms as Record<string, { value: number }> | undefined;
    const emissive = !ink && uniforms?.uEmissive ? uniforms.uEmissive : null;
    const opacity = !ink && ownOpacity && uniforms?.uOpacity ? uniforms.uOpacity : null;
    i = mats.length;
    const baseEmissive = emissive ? emissive.value : 0;
    const baseOpacity = ink ? mat.opacity : opacity ? opacity.value : 1;
    mats.push({
      mat, emissive, opacity, ink, baseEmissive, baseOpacity,
      baseTransparent: mat.transparent,
      lastEmissive: baseEmissive,
      lastOpacity: baseOpacity,
      forcedTransparent: false,
      blinkGlow: false,
    });
    index.set(mat, i);
    return i;
  };
  model.allMaterials.forEach((m) => add(m, false));
  return {
    mats,
    add,
    clear(): void {
      mats.length = 0;
      index.clear();
    },
  };
}

/**
 * uEmissive = base * emissiveMul + emissiveAdd, uOpacity = base * opacityMul. If the value found is not
 * the one written last time, the stage changed it: adopt it as the base.
 */
export function writeMat(m: MatSlot, emissiveMul: number, emissiveAdd: number, opacityMul: number): void {
  if (m.emissive) {
    if (m.emissive.value !== m.lastEmissive) m.baseEmissive = m.emissive.value;
    m.lastEmissive = m.emissive.value = m.baseEmissive * emissiveMul + emissiveAdd;
  }
  if (m.opacity) {
    if (m.opacity.value !== m.lastOpacity) m.baseOpacity = m.opacity.value;
    m.lastOpacity = m.opacity.value = m.baseOpacity * opacityMul;
  } else if (m.ink) {
    if (m.mat.opacity !== m.lastOpacity) m.baseOpacity = m.mat.opacity;
    m.lastOpacity = m.mat.opacity = m.baseOpacity * opacityMul;
  }
  if (opacityMul < 0.999) {
    if (!m.mat.transparent) {
      m.mat.transparent = true;
      m.forcedTransparent = true;
    }
  } else if (m.forcedTransparent) {
    m.mat.transparent = m.baseTransparent;
    m.forcedTransparent = false;
  }
}

/** Put every material back to its base (multipliers 1, nothing added). */
export function restoreMats(mats: readonly MatSlot[]): void {
  for (const m of mats) writeMat(m, 1, 0, 1);
}
