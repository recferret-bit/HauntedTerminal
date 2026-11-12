import * as THREE from 'three';
import type { ComicMaterial } from '../../../shaders/comic-material.js';
import { ZONES, type ZoneDef } from '../../core/palette.js';
import { inkShellGeometry, shapeToGeometry } from '../../geometry/geometry.js';
import { fxKeylineColor } from '../../fx/preview.js';
import type { FxLayer, FxParticleState } from '../../fx/types.js';
import { keylineMaterial, zoneMaterial, type EmitterParts } from './parts.js';

export interface LayerPool {
  meshes: THREE.Mesh[];
  shells: (THREE.Mesh | null)[];
  /** One material per distinct alpha step, so stepped opacity needs no per-particle material. */
  byAlpha: Map<number, ComicMaterial>;
  zone: ZoneDef;
}

function alphaMaterials(layer: FxLayer, zone: ZoneDef, parts: EmitterParts): Map<number, ComicMaterial> {
  const byAlpha = new Map<number, ComicMaterial>();
  for (const a of new Set([1, ...(layer.alpha ?? []).map((k) => k[1])])) {
    if (a <= 0) continue;
    const mat = zoneMaterial(zone, a);
    byAlpha.set(a, mat);
    parts.materials.push(mat);
  }
  return byAlpha;
}

function particleMesh(layer: FxLayer, index: number, geo: THREE.BufferGeometry, mat: ComicMaterial | undefined, shell: THREE.Mesh | null): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = `${layer.name}#${index}`;
  mesh.visible = false;
  mesh.userData.zone = layer.zone;
  if (shell) mesh.add(shell);
  return mesh;
}

function inkShell(geo: THREE.BufferGeometry, lineColor: number, parts: EmitterParts): THREE.Mesh {
  const shell = new THREE.Mesh(geo, keylineMaterial(parts, lineColor));
  shell.userData.outline = true;
  shell.raycast = () => {};
  return shell;
}

/** A hidden mesh pool for one layer, all meshes sharing one geometry, one shell geometry and the alpha materials. */
function buildPool(layer: FxLayer, inkWeight: number, page: THREE.Group, parts: EmitterParts): LayerPool {
  const zone: ZoneDef = ZONES[layer.zone];
  const geo = shapeToGeometry(layer.shape);
  parts.geometries.push(geo);
  const lineColor = inkWeight > 0 ? fxKeylineColor(layer.zone, layer.outline !== false) : null;
  const shellGeo = lineColor === null ? null : inkShellGeometry(geo, inkWeight);
  if (shellGeo) parts.geometries.push(shellGeo);
  const byAlpha = alphaMaterials(layer, zone, parts);
  const meshes: THREE.Mesh[] = [];
  const shells: (THREE.Mesh | null)[] = [];
  for (let i = 0; i < layer.count; i++) {
    const shell = shellGeo && lineColor !== null ? inkShell(shellGeo, lineColor, parts) : null;
    const mesh = particleMesh(layer, i, geo, byAlpha.get(1), shell);
    page.add(mesh);
    meshes.push(mesh);
    shells.push(shell);
  }
  return { meshes, shells, byAlpha, zone };
}

export function buildPools(layers: readonly FxLayer[], inkWeight: number, page: THREE.Group, parts: EmitterParts): LayerPool[] {
  return layers.map((layer) => buildPool(layer, inkWeight, page, parts));
}

export function hideAll(pools: readonly LayerPool[]): void {
  for (const pool of pools) for (const mesh of pool.meshes) mesh.visible = false;
}

/** Pose one live particle onto its pooled mesh. */
export function poseParticle(pools: readonly LayerPool[], p: FxParticleState): void {
  const pool = pools[p.layer]!;
  const mesh = pool.meshes[p.index]!;
  mesh.visible = true;
  // Page z is "toward the camera"; the camera sits on world -z.
  mesh.position.set(p.x, p.y, -p.z);
  mesh.rotation.z = p.rot;
  mesh.scale.setScalar(p.scale);
  const mat = pool.byAlpha.get(p.alpha);
  if (mat) mesh.material = mat;
  const shell = pool.shells[p.index];
  if (shell) shell.visible = p.alpha * (pool.zone.opacity ?? 1) >= 0.9;
}
