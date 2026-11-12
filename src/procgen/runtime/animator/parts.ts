/**
 * Part slots: for every part mesh its authored base transform, tag, look/hover flags and death-scatter
 * direction, plus the split-emissive material clones that let one LED blink alone.
 */
import * as THREE from 'three';
import type { BuiltModel } from '../build.js';
import { hashSeed } from '../../core/rng.js';
import type { AnimTag } from '../../core/types.js';
import { animHash01, type AnimBase, type AnimContext } from '../../anim/tags.js';
import { carriesBodyBob } from './hover.js';
import type { MatTable } from './materials.js';
import type { AnimatorOptions } from './types.js';

export interface PartSlot {
  mesh: THREE.Mesh;
  tag: AnimTag | undefined;
  base: AnimBase;
  ctx: AnimContext;
  looks: boolean;
  /** Gets the hover offset (false for parts that already carry the body bob). */
  hovers: boolean;
  /** Unit XY direction for the death scatter. */
  dirX: number;
  dirY: number;
  /** Index into the material table when this part's tag drives emissive, else -1. */
  emissiveMat: number;
}

/** A per-part material made by split-emissive, to be swapped back on dispose. */
export interface MaterialClone {
  mesh: THREE.Mesh;
  original: THREE.Material;
  clone: THREE.ShaderMaterial;
}

export interface PartRig {
  slots: PartSlot[];
  clones: MaterialClone[];
  /** Centre the whole-body pose pivots on (x always, y only for hover models). */
  pivotX: number;
  pivotY: number;
  modelSeed: number;
}

const DRIVES_EMISSIVE = new Set(['blink', 'pulse', 'jitter']);

export function readBase(mesh: THREE.Mesh): AnimBase {
  const b = mesh.userData.base as AnimBase | undefined;
  if (b) return { pos: [...b.pos], rot: [...b.rot], scale: [...b.scale] };
  return {
    pos: [mesh.position.x, mesh.position.y, mesh.position.z],
    rot: [mesh.rotation.x, mesh.rotation.y, mesh.rotation.z],
    scale: [mesh.scale.x, mesh.scale.y, mesh.scale.z],
  };
}

/** Centre of the part bases in the XY plane (0, 0 for a model without parts). */
function partsCentre(model: BuiltModel): { cx: number; cy: number } {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const mesh of model.parts.values()) {
    const p = readBase(mesh).pos;
    minX = Math.min(minX, p[0]);
    maxX = Math.max(maxX, p[0]);
    minY = Math.min(minY, p[1]);
    maxY = Math.max(maxY, p[1]);
  }
  return {
    cx: model.parts.size ? (minX + maxX) / 2 : 0,
    cy: model.parts.size ? (minY + maxY) / 2 : 0,
  };
}

/** How many parts use each (single) material. */
function countMaterialUsers(model: BuiltModel): Map<THREE.Material, number> {
  const users = new Map<THREE.Material, number>();
  for (const mesh of model.parts.values()) {
    if (!Array.isArray(mesh.material)) users.set(mesh.material, (users.get(mesh.material) ?? 0) + 1);
  }
  return users;
}

/**
 * Clone a shared zone material for one part. The clone shares every uniform with the original except
 * `uEmissive`, so zone-wide tint, fade, uTime and uFlash still reach it.
 */
function cloneForPart(model: BuiltModel, mesh: THREE.Mesh, shared: THREE.ShaderMaterial): MaterialClone {
  const own = shared.clone();
  for (const key of Object.keys(shared.uniforms)) {
    if (key !== 'uEmissive') own.uniforms[key] = shared.uniforms[key]!;
  }
  own.userData.comic = true;
  mesh.material = own;
  model.allMaterials.push(own);
  return { mesh, original: shared, clone: own };
}

/** Put the shared materials back and drop the clones from the model. */
export function releaseClones(model: BuiltModel, clones: MaterialClone[]): void {
  for (const c of clones) {
    c.mesh.material = c.original;
    const i = model.allMaterials.indexOf(c.clone);
    if (i >= 0) model.allMaterials.splice(i, 1);
    c.clone.dispose();
  }
  clones.length = 0;
}

/** Unit-ish XY direction a part flies in when the model scatters (death). */
function scatterDirection(base: AnimBase, cx: number, cy: number, seed: number): { dirX: number; dirY: number } {
  let dx = base.pos[0] - cx;
  let dy = base.pos[1] - cy;
  if (Math.hypot(dx, dy) < 0.02) {
    const a = animHash01(seed, 7, 0) * Math.PI * 2;
    dx = Math.cos(a);
    dy = Math.sin(a);
  }
  const gain = (0.6 + 0.8 * animHash01(seed, 7, 1)) / Math.hypot(dx, dy);
  return { dirX: dx * gain, dirY: dy * gain };
}

/** Register the ink shells of a part in the material table. */
function addInkShells(mesh: THREE.Mesh, table: MatTable): void {
  for (const child of mesh.children) {
    const shell = child as THREE.Mesh;
    if (shell.userData.outline && shell.material && !Array.isArray(shell.material)) table.add(shell.material, true);
  }
}

export function buildPartRig(model: BuiltModel, opts: AnimatorOptions, table: MatTable, bodyBob: AnimTag | null): PartRig {
  const { cx, cy } = partsCentre(model);
  const hover = model.spec.tags?.includes('hover') ?? false;
  const modelSeed = hashSeed(model.spec.id);
  const lookParts = opts.lookParts ?? /eye|pupil|iris/i;
  const users = countMaterialUsers(model);
  const slots: PartSlot[] = [];
  const clones: MaterialClone[] = [];

  for (const [name, mesh] of model.parts) {
    const base = readBase(mesh);
    const tag = mesh.userData.anim as AnimTag | undefined;
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    let mi = material ? table.add(material, false) : -1;
    const shared = material as THREE.ShaderMaterial | undefined;
    if (opts.splitEmissive !== false && tag && DRIVES_EMISSIVE.has(tag.type) && shared?.uniforms?.uEmissive && (users.get(shared) ?? 0) > 1) {
      const made = cloneForPart(model, mesh, shared);
      clones.push(made);
      mi = table.add(made.clone, false, false);
    }
    addInkShells(mesh, table);
    if (tag?.type === 'blink' && mi >= 0 && table.mats[mi]!.baseEmissive < 0.05) table.mats[mi]!.blinkGlow = true;
    slots.push({
      mesh,
      tag,
      base,
      ctx: { fps: 0, name: `${model.spec.id}/${name}`, locomotion: 0, ampMul: 1, jitterMul: 1 },
      looks: lookParts.test(name),
      hovers: !carriesBodyBob(tag, bodyBob),
      ...scatterDirection(base, cx, cy, hashSeed(name, modelSeed)),
      emissiveMat: tag && DRIVES_EMISSIVE.has(tag.type) ? mi : -1,
    });
  }
  return { slots, clones, pivotX: cx, pivotY: hover ? cy : 0, modelSeed };
}

/** Put every part back to its authored transform. */
export function restoreParts(slots: readonly PartSlot[]): void {
  for (const s of slots) {
    s.mesh.position.set(s.base.pos[0], s.base.pos[1], s.base.pos[2]);
    s.mesh.rotation.set(s.base.rot[0], s.base.rot[1], s.base.rot[2]);
    s.mesh.scale.set(s.base.scale[0], s.base.scale[1], s.base.scale[2]);
  }
}
