/**
 * Limb and gait rules of the AnimTag validator: parts that hinge on one pivot are one limb, and the
 * legs of a model must alternate.
 */
import type { PartSpec, Vec3 } from '../core/types.js';
import type { Box } from './validate-geometry.js';
import { HINGED, limbKey, phaseGap, pivotOf, sameMotion, type AddIssue, type Tagged } from './validate-shared.js';

/**
 * Gap between each hinged limb's pivot and the limb itself, keyed by `limbKey`. A limb is attached if
 * any of its parts (leg + sneaker, arm + hand) reaches the pivot, so the smallest gap wins.
 */
export function limbPivotGaps(tagged: Tagged[], rests: Map<string, Box>): Map<string, number> {
  const limbGap = new Map<string, number>();
  for (const part of tagged) {
    if (!HINGED.has(part.anim.type) || !part.anim.pivot) continue;
    const rest = rests.get(part.name)!;
    const gap = Math.hypot(...part.anim.pivot.map((v, i) => Math.max(rest.min[i]! - v, 0, v - rest.max[i]!)));
    const key = limbKey(part);
    limbGap.set(key, Math.min(limbGap.get(key) ?? Infinity, gap));
  }
  return limbGap;
}

/** Gait limbs (legWalk, then armSwing) grouped by pivot: the parts of one leg or arm. */
export function groupGaitLimbs(tagged: Tagged[]): Map<string, Tagged[]> {
  const legs = tagged.filter((p) => p.anim.type === 'legWalk');
  const arms = tagged.filter((p) => p.anim.type === 'armSwing');
  const limbs = new Map<string, Tagged[]>();
  for (const part of [...legs, ...arms]) {
    const key = limbKey(part);
    limbs.set(key, [...(limbs.get(key) ?? []), part]);
  }
  return limbs;
}

/** Parts of one limb share a pivot and must share their motion too. */
function checkLimbSplit(limbs: Map<string, Tagged[]>, add: AddIssue): void {
  for (const group of limbs.values()) {
    for (const part of group.slice(1)) {
      if (!sameMotion(part.anim, group[0]!.anim)) {
        add('error', 'ANIM_LIMB_SPLIT', part.name, `shares a pivot with "${group[0]!.name}" but not its axis / speed / amp / phase: the limb will come apart`);
      }
    }
  }
}

/** -1 right of the model (x < 0), +1 left, 0 on the centre line. Uses the pivot when there is one. */
function sideOf(part: PartSpec): number {
  if (/(^|[_\-. ])(l|left)($|[_\-. ])/i.test(part.name)) return 1;
  if (/(^|[_\-. ])(r|right)($|[_\-. ])/i.test(part.name)) return -1;
  const x = part.anim?.pivot?.[0] ?? part.pos[0];
  return x > 0.01 ? 1 : x < -0.01 ? -1 : 0;
}

const phaseOf = (p: Tagged): number => p.anim.phase ?? 0;

function checkCounterPhase(legLimbs: Tagged[], add: AddIssue): void {
  for (const leg of legLimbs) {
    const phase = phaseOf(leg);
    if (!legLimbs.some((o) => o !== leg && Math.abs(phaseGap(phaseOf(o), phase) - 0.5) <= 0.1)) {
      add('error', 'ANIM_NO_COUNTER_PHASE', leg.name, 'legWalk has no partner half a cycle away (phase + 0.5): the model will hop instead of walk');
    }
  }
}

/** Two legs: opposite phases, and each arm follows the leg on its own side. */
function checkBiped(legLimbs: Tagged[], limbs: Map<string, Tagged[]>, add: AddIssue): void {
  const [a, b] = legLimbs as [Tagged, Tagged];
  if (phaseGap(phaseOf(a), phaseOf(b)) < 0.1) {
    add('error', 'ANIM_SIDE_PHASE', b.name, `shares phase ${b.anim.phase ?? 0} with the other leg "${a.name}": the two sides must be half a cycle apart`);
  }
  for (const arm of [...limbs.values()].map((g) => g[0]!).filter((p) => p.anim.type === 'armSwing')) {
    const side = sideOf(arm);
    const leg = legLimbs.find((l) => sideOf(l) === side);
    if (side !== 0 && leg && phaseGap(phaseOf(leg), phaseOf(arm)) > 0.1) {
      add('warn', 'ANIM_ARM_PHASE', arm.name, `armSwing should carry the phase of the leg on its own side ("${leg.name}"): the evaluator already swings it the other way`);
    }
  }
}

const sameRowZ = (a: Vec3, b: Vec3): boolean => Math.abs(a[2] - b[2]) < 0.02;

/** Many legs: neighbours along one row alternate, and the two legs of one pair (near / far) alternate. */
function checkManyLegs(legLimbs: Tagged[], add: AddIssue): void {
  for (let i = 0; i < legLimbs.length; i++) {
    for (let j = i + 1; j < legLimbs.length; j++) {
      const a = legLimbs[i]!;
      const b = legLimbs[j]!;
      if (phaseGap(phaseOf(a), phaseOf(b)) >= 0.1) continue;
      const pa = pivotOf(a);
      const pb = pivotOf(b);
      const sameRow = sameRowZ(pa, pb);
      const between = legLimbs.some((o) => o !== a && o !== b && Math.abs(pivotOf(o)[2] - pa[2]) < 0.02 && (pivotOf(o)[0] - pa[0]) * (pivotOf(o)[0] - pb[0]) < 0);
      const pair = !sameRow && Math.abs(pa[0] - pb[0]) < 0.05;
      if ((sameRow && !between) || pair) {
        add('warn', 'ANIM_SIDE_PHASE', b.name, `shares phase ${b.anim.phase ?? 0} with its ${pair ? 'opposite' : 'neighbour'} leg "${a.name}": alternate them (tripod gait) or the body will lurch`);
      }
    }
  }
}

/** All limb rules, in report order: split limbs, then the phases of the legs. */
export function checkGait(tagged: Tagged[], add: AddIssue): void {
  const limbs = groupGaitLimbs(tagged);
  checkLimbSplit(limbs, add);
  const legLimbs = [...limbs.values()].map((g) => g[0]!).filter((p) => p.anim.type === 'legWalk');
  checkCounterPhase(legLimbs, add);
  if (legLimbs.length === 2) checkBiped(legLimbs, limbs, add);
  else if (legLimbs.length > 2) checkManyLegs(legLimbs, add);
}
