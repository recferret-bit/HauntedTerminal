import type * as THREE from 'three';
import { ModelCatalog } from '../../procgen/core/catalog.js';
import { zone, type ZoneId } from '../../procgen/core/palette.js';
import { buildModel, disposeModel, type BuiltModel } from '../../procgen/runtime/build.js';
import { describeModel } from './describe.js';
import { createPartAnimator } from './part-animator.js';
import type { Subject, SubjectOptions } from './types.js';

/** Zone emissive at or above this makes a mesh a light source that stays lit in lantern-dark mode. */
const GLOW_EMISSIVE = 0.3;

/** Light-source meshes, and the ink-shell materials the lab must dispose itself. */
function scanMeshes(built: BuiltModel): { glow: THREE.Mesh[]; inkMaterials: Set<THREE.MeshBasicMaterial> } {
  const glow: THREE.Mesh[] = [];
  const inkMaterials = new Set<THREE.MeshBasicMaterial>();
  built.group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (mesh.userData.outline) {
      inkMaterials.add(mesh.material as THREE.MeshBasicMaterial);
      return;
    }
    const z = mesh.userData.zone as ZoneId | undefined;
    if (z && (zone(z)?.emissive ?? 0) >= GLOW_EMISSIVE) glow.push(mesh);
  });
  return { glow, inkMaterials };
}

/** Build a catalog model exactly as the game would: buildModel() comic materials and ink shells. Throws if the spec is bad. */
export function buildModelSubject(id: string, opts: SubjectOptions): Subject {
  const entry = ModelCatalog.get(id);
  const spec = ModelCatalog.build(id, opts.seed);
  const built = buildModel(spec, { seed: opts.seed, textures: opts.tex, ...(opts.ink ? {} : { inkWeight: 0 }) });
  const { bounds, info } = describeModel(spec, opts.seed);
  const animator = createPartAnimator(built);
  const { glow, inkMaterials } = scanMeshes(built);

  return {
    kind: 'model',
    id,
    label: entry.label,
    category: entry.category,
    lore: entry.lore,
    object: built.group,
    materials: built.allMaterials,
    bounds,
    glow,
    built,
    spec,
    animator,
    sockets: built.sockets,
    info,
    dispose() {
      animator.dispose();
      disposeModel(built);
      inkMaterials.forEach((m) => m.dispose());
    },
  };
}
