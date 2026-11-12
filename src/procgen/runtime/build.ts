import * as THREE from 'three';
import { createComicMaterial, type ComicMaterial } from '../../shaders/comic-material.js';
import { TextureCatalog } from '../core/catalog.js';
import { inkShellGeometry, shapeToGeometry } from '../geometry/geometry.js';
import { INK, zone, type ZoneId } from '../core/palette.js';
import { toDataTexture } from './data-texture.js';
import type { ModelSpec, PartSpec, Vec3 } from '../core/types.js';

export const DEFAULT_INK_WEIGHT = 0.028;

export interface BuiltModel {
  spec: ModelSpec;
  /** Named `spec.id`. Feet at y = 0, facing −z. One child mesh per part, named after the part. */
  group: THREE.Group;
  /** One shared material per zone. Tint, fade or flash a whole zone through these. */
  materials: Map<ZoneId, ComicMaterial>;
  /** Every comic material, including per-part textured clones. Feed these uTime / uFlash. */
  allMaterials: ComicMaterial[];
  parts: Map<string, THREE.Mesh>;
  sockets: Record<string, Vec3>;
}

export interface BuildOptions {
  /** Overrides spec.inkWeight. 0 disables outlines. */
  inkWeight?: number;
  /** Bind TextureCatalog albedo maps named by parts. Default true. */
  textures?: boolean;
  seed?: number;
}

const textureCache = new Map<string, THREE.DataTexture>();

function albedo(id: string, seed: number): THREE.DataTexture | null {
  if (!TextureCatalog.has(id)) return null;
  const key = `${id}#${seed}`;
  let tex = textureCache.get(key);
  if (!tex) {
    tex = toDataTexture(TextureCatalog.build(id, seed), TextureCatalog.get(id).tileable);
    textureCache.set(key, tex);
  }
  return tex;
}

function zoneMaterial(id: ZoneId): ComicMaterial {
  const z = zone(id);
  return createComicMaterial(z.color, {
    emissive: z.emissive,
    opacity: z.opacity,
    ghost: z.ghost,
    halftone: z.halftone,
    stripes: z.stripes,
    uvReact: z.family === 'malware' ? 1 : 0,
  });
}

/**
 * Turn a ModelSpec into scene objects: comic cel materials plus an ink shell on every outlined part.
 * Each part stays its own Mesh so `userData.anim` can drive it (see src/procgen/anim).
 */
export function buildModel(spec: ModelSpec, opts: BuildOptions = {}): BuiltModel {
  const group = new THREE.Group();
  group.name = spec.id;
  const inkWeight = opts.inkWeight ?? spec.inkWeight ?? DEFAULT_INK_WEIGHT;
  const inkMat = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
  const materials = new Map<ZoneId, ComicMaterial>();
  const allMaterials: ComicMaterial[] = [];
  const parts = new Map<string, THREE.Mesh>();

  const materialFor = (part: PartSpec): ComicMaterial => {
    const tex = part.texture && opts.textures !== false ? albedo(part.texture, opts.seed ?? 1) : null;
    if (tex) {
      const mat = zoneMaterial(part.zone);
      mat.uniforms.uMap!.value = tex;
      mat.uniforms.uHasMap!.value = 1;
      allMaterials.push(mat);
      return mat;
    }
    let mat = materials.get(part.zone);
    if (!mat) {
      mat = zoneMaterial(part.zone);
      materials.set(part.zone, mat);
      allMaterials.push(mat);
    }
    return mat;
  };

  for (const part of spec.parts) {
    if (parts.has(part.name)) throw new Error(`${spec.id}: duplicate part name "${part.name}"`);
    const geo = shapeToGeometry(part.shape);
    const mesh = new THREE.Mesh(geo, materialFor(part));
    mesh.name = part.name;
    mesh.position.set(...part.pos);
    if (part.rot) mesh.rotation.set(...part.rot);
    if (part.scale) mesh.scale.set(...part.scale);
    mesh.userData.assetKey = spec.id;
    mesh.userData.zone = part.zone;
    if (part.anim) mesh.userData.anim = part.anim;
    mesh.userData.base = { pos: [...part.pos], rot: [...(part.rot ?? [0, 0, 0])], scale: [...(part.scale ?? [1, 1, 1])] };
    const z = zone(part.zone);
    const solid = !z.ghost && (z.opacity ?? 1) > 0.9;
    if (inkWeight > 0 && part.outline !== false && solid) {
      const s = part.scale ?? [1, 1, 1];
      const shell = new THREE.Mesh(inkShellGeometry(geo, inkWeight / Math.max(Math.abs(s[0]), Math.abs(s[1]), Math.abs(s[2]))), inkMat);
      shell.userData.outline = true;
      shell.raycast = () => {};
      mesh.add(shell);
    }
    group.add(mesh);
    parts.set(part.name, mesh);
  }

  group.userData.spec = spec;
  return { spec, group, materials, allMaterials, parts, sockets: { ...(spec.sockets ?? {}) } };
}

export function disposeModel(model: BuiltModel): void {
  model.group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) obj.geometry.dispose();
  });
  model.allMaterials.forEach((m) => m.dispose());
}
