/**
 * Example: turn a SANITIZED .glb (output of ../scripts/sanitize-glb.mjs) into a comic-shaded group that
 * looks like a procgen model. The game does not ship this loader; copy it into src/ when a GLB is
 * actually adopted (and say so in the PR: the game is procedural-first).
 *
 * It trusts nothing in the file except geometry and the `zone:<id>` material names:
 * every material is replaced by createComicMaterial for that zone, and every solid mesh gets the
 * same constant-width ink shell as buildModel() gives a procedural part.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createComicMaterial, type ComicMaterial } from '../../../../src/shaders/comic-material.js';
import { DEFAULT_INK_WEIGHT } from '../../../../src/procgen/runtime/build.js';
import { inkShellGeometry } from '../../../../src/procgen/geometry/geometry.js';
import { INK, ZONES, zone, type ZoneId } from '../../../../src/procgen/core/palette.js';

export interface ComicGlb {
  /** Feet at y = 0, facing −z, named after the asset key. */
  group: THREE.Group;
  /** One material per zone. Feed these uTime / uFlash like any other comic material. */
  materials: Map<ZoneId, ComicMaterial>;
}

function zoneOf(material: THREE.Material | THREE.Material[]): ZoneId {
  const mat = Array.isArray(material) ? material[0] : material;
  const fromExtras = mat?.userData?.zone as string | undefined;
  const fromName = mat?.name.startsWith('zone:') ? mat.name.slice(5) : undefined;
  const id = fromExtras ?? fromName;
  if (!id || !(id in ZONES)) {
    throw new Error(`material "${mat?.name ?? '?'}" has no palette zone: run the file through sanitize-glb.mjs first`);
  }
  return id as ZoneId;
}

/** Re-skins a parsed glTF scene. Pure: no loading, so it also runs in node. */
export function comicGroupFromGltf(scene: THREE.Object3D, assetKey: string, inkWeight = DEFAULT_INK_WEIGHT): ComicGlb {
  const group = new THREE.Group();
  group.name = assetKey;
  const materials = new Map<ZoneId, ComicMaterial>();
  const inkMat = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });

  scene.updateMatrixWorld(true);
  scene.traverse((obj) => {
    const src = obj as THREE.Mesh;
    if (!src.isMesh) return;
    const id = zoneOf(src.material);
    const def = zone(id);
    let mat = materials.get(id);
    if (!mat) {
      mat = createComicMaterial(def.color, {
        emissive: def.emissive,
        opacity: def.opacity,
        ghost: def.ghost,
        halftone: def.halftone,
        stripes: def.stripes,
      });
      materials.set(id, mat);
    }
    // The sanitizer already baked transforms; applying matrixWorld keeps this correct for any nesting.
    const geo = src.geometry.clone().applyMatrix4(src.matrixWorld);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = `${assetKey}:${id}`;
    mesh.userData.assetKey = assetKey;
    mesh.userData.zone = id;
    const solid = !def.ghost && (def.opacity ?? 1) > 0.9;
    if (inkWeight > 0 && solid) {
      const shell = new THREE.Mesh(inkShellGeometry(geo, inkWeight), inkMat);
      shell.userData.outline = true;
      shell.raycast = () => {};
      mesh.add(shell);
    }
    group.add(mesh);
  });
  if (!group.children.length) throw new Error(`"${assetKey}": the file contains no meshes`);
  return { group, materials };
}

/** Browser entry point: `/assets/models/<key>.glb` is served from public/assets/models/. */
export async function loadComicGlb(url: string, assetKey: string): Promise<ComicGlb> {
  const gltf = await new GLTFLoader().loadAsync(url);
  return comicGroupFromGltf(gltf.scene, assetKey);
}
