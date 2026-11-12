import { TextureCatalog } from '../../core/catalog.js';
import type { BakedPart } from '../../geometry/geometry.js';
import { MODEL_CATEGORIES, type ModelSpec, type ShapeSpec } from '../../core/types.js';
import { modelZoneDef } from './zone-info.js';
import { modelPartList, type ModelIssueSink, type ModelRules } from './rules.js';

const CATEGORIES: readonly string[] = MODEL_CATEGORIES;

export const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
export const finiteVec = (v: unknown, len: number): boolean => Array.isArray(v) && v.length === len && v.every(finite);

/** Why a shape cannot be built, or null. */
function shapeProblem(shape: ShapeSpec): string | null {
  const s = shape as ShapeSpec & Record<string, unknown>;
  const pos = (key: string): string | null => (finite(s[key]) && (s[key] as number) > 0 ? null : `${key} must be a positive number`);
  switch (shape.kind) {
    case 'box':
      if (!finiteVec(shape.size, 3)) return 'size must be three finite numbers';
      return shape.size.every((v) => v > 0) ? null : 'every size component must be > 0';
    case 'cylinder':
      if (!finite(shape.rTop) || !finite(shape.rBottom) || shape.rTop < 0 || shape.rBottom < 0) return 'radii must be finite and >= 0';
      if (shape.rTop + shape.rBottom <= 0) return 'rTop and rBottom are both 0';
      if (shape.sides !== undefined && (!finite(shape.sides) || shape.sides < 3)) return 'sides must be at least 3';
      return pos('height');
    case 'capsule': return pos('radius') ?? (finite(shape.length) && shape.length >= 0 ? null : 'length must be >= 0');
    case 'sphere': return pos('radius');
    case 'cone':
      if (shape.sides !== undefined && (!finite(shape.sides) || shape.sides < 3)) return 'sides must be at least 3';
      return pos('radius') ?? pos('height');
    case 'torus':
      if (shape.arc !== undefined && (!finite(shape.arc) || shape.arc <= 0)) return 'arc must be > 0';
      return pos('radius') ?? pos('tube');
    case 'extrude': {
      if (!Array.isArray(shape.outline) || shape.outline.length < 3) return 'outline needs at least 3 points';
      if (!shape.outline.every((p) => finiteVec(p, 2))) return 'outline has a non-finite point';
      let area = 0;
      for (let i = 0; i < shape.outline.length; i++) {
        const a = shape.outline[i], b = shape.outline[(i + 1) % shape.outline.length];
        area += a[0] * b[1] - b[0] * a[1];
      }
      if (Math.abs(area) / 2 < 1e-6) return 'outline has no area';
      return pos('depth');
    }
    case 'tube':
      if (!Array.isArray(shape.path) || shape.path.length < 2) return 'path needs at least 2 points';
      if (!shape.path.every((p) => finiteVec(p, 3))) return 'path has a non-finite point';
      if (shape.path.every((p) => Math.hypot(p[0] - shape.path[0][0], p[1] - shape.path[0][1], p[2] - shape.path[0][2]) < 1e-6)) return 'path has no length';
      return pos('radius');
    case 'lathe':
      if (!Array.isArray(shape.profile) || shape.profile.length < 2) return 'profile needs at least 2 points';
      if (!shape.profile.every((p) => finiteVec(p, 2))) return 'profile has a non-finite point';
      if (shape.profile.every((p) => Math.abs(p[0]) < 1e-6)) return 'every profile radius is 0';
      return null;
    default:
      return `unknown shape kind "${String((shape as { kind?: unknown }).kind)}"`;
  }
}

/**
 * Checks that must hold before the model can even be baked. Returns false when baking would
 * throw or produce garbage, so the geometry checks are skipped.
 */
export function checkModelStructure(spec: ModelSpec, rules: ModelRules, sink: ModelIssueSink): boolean {
  let bakeable = true;
  if (!CATEGORIES.includes(spec.category)) {
    sink.add('error', 'BAD_ID', `unknown category "${spec.category}"`, `Use one of: ${CATEGORIES.join(', ')}.`);
  }
  if (typeof spec.id !== 'string' || !new RegExp(`^${spec.category}\\.[a-z][a-z0-9_]*$`).test(spec.id)) {
    sink.add('error', 'BAD_ID', `id "${spec.id}" is not "<category>.<name>" for category "${spec.category}"`,
      `Rename it to "${spec.category}.<name>", lowercase letters, digits and underscores.`);
  }
  if (!Array.isArray(spec.parts) || spec.parts.length === 0) {
    sink.add('error', 'EMPTY_MODEL', 'the model has no parts', 'Return at least one PartSpec from build().');
    return false;
  }

  const seen = new Map<string, number>();
  for (const part of spec.parts) seen.set(part.name, (seen.get(part.name) ?? 0) + 1);
  const dupes = [...seen.entries()].filter(([, count]) => count > 1).map(([n]) => n);
  if (dupes.length) {
    sink.add('error', 'DUPLICATE_PART_NAME', `part names used more than once: ${modelPartList(dupes)}`,
      'Give every part a unique name (suffix repeated parts with an index: pin_0, pin_1). Animation and the validator address parts by name.', dupes);
  }

  spec.parts.forEach((part, i) => {
    const label = typeof part.name === 'string' && part.name ? part.name : `#${i}`;
    if (typeof part.name !== 'string' || !part.name) {
      sink.add('error', 'DEGENERATE_SHAPE', `part #${i} has no name`, 'Name every part; role words (eye, led, leg, lock) drive the checks.');
    }
    const badNumbers: string[] = [];
    if (!finiteVec(part.pos, 3)) badNumbers.push('pos');
    if (part.rot !== undefined && !finiteVec(part.rot, 3)) badNumbers.push('rot');
    if (part.scale !== undefined && !finiteVec(part.scale, 3)) badNumbers.push('scale');
    if (badNumbers.length) {
      bakeable = false;
      sink.add('error', 'NON_FINITE', `"${label}": ${badNumbers.join(', ')} must be three finite numbers`,
        'Look for a division by zero, an undefined value or a missing component in the builder.', label);
    }
    if (part.scale && finiteVec(part.scale, 3) && part.scale.some((v) => Math.abs(v) < 1e-6)) {
      bakeable = false;
      sink.add('error', 'DEGENERATE_SHAPE', `"${label}": scale has a zero component, the part is flat`, 'Use a non-zero scale on every axis.', label);
    }
    const problem = part.shape && typeof part.shape === 'object' ? shapeProblem(part.shape) : 'part has no shape';
    if (problem) {
      bakeable = false;
      sink.add('error', 'DEGENERATE_SHAPE', `"${label}" (${part.shape?.kind ?? 'no shape'}): ${problem}`,
        'Fix the shape parameters; a degenerate shape bakes to nothing or to NaN.', label);
    }
    if (!modelZoneDef(part.zone)) {
      bakeable = false;
      sink.add('error', 'UNKNOWN_ZONE', `"${label}" uses zone "${String(part.zone)}", which is not in ZONES`,
        'Use a zone from src/procgen/core/palette.ts. A new colour is a palette change: add it to ZONES with a family, never inline a hex.', label);
    }
  });

  const untextured = spec.parts.filter((p) => p.texture !== undefined && !TextureCatalog.has(p.texture));
  if (untextured.length) {
    sink.add('warning', 'UNKNOWN_TEXTURE',
      `texture${untextured.length > 1 ? 's' : ''} not registered in TextureCatalog: ${[...new Set(untextured.map((p) => p.texture))].join(', ')} (on ${modelPartList(untextured.map((p) => p.name))}). The part${untextured.length > 1 ? 's' : ''} will render untextured`,
      'Use an id that TextureCatalog.list() returns (src/procgen/textures), or remove the texture field.', untextured.map((p) => p.name));
  }

  const budget = rules.budgets[spec.category];
  if (budget) {
    const count = spec.parts.length;
    if (count > budget.maxParts) {
      sink.add('error', 'PART_BUDGET', `${count} parts, the budget for ${spec.category} is ${budget.maxParts}`,
        'Merge repeated details into one extrude outline (a row of pins or teeth can be a single comb-shaped part) or drop parts that do not change the silhouette.');
    } else if (count < budget.minParts) {
      sink.add('warning', 'PART_BUDGET', `only ${count} part${count > 1 ? 's' : ''}, a ${spec.category} should have at least ${budget.minParts}`,
        'Add the details that say what it is: contacts, pins, an LED, a label, a second zone.');
    }
  }
  return bakeable;
}

export function checkModelTriBudget(spec: ModelSpec, baked: BakedPart[], tris: number, rules: ModelRules, sink: ModelIssueSink): void {
  const budget = rules.budgets[spec.category];
  if (!budget || tris <= budget.maxTris) return;
  const heavy = [...baked].sort((a, b) => b.triCount - a.triCount).slice(0, 4).map((b) => `${b.part.name} (${b.triCount})`);
  sink.add('error', 'TRI_BUDGET', `${tris} triangles, the budget for ${spec.category} is ${budget.maxTris}. Heaviest: ${heavy.join(', ')}`,
    'Spheres (352), capsules and bevelled boxes are the expensive shapes. Use an extrude or a plain box for flat parts, lower `sides` on cylinders and cones, and drop bevels on parts under ~6 px.');
}
