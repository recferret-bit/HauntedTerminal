/**
 * Static checks on the AnimTags of a ModelSpec. Plain data in, issues out: no scene objects.
 * The rules live in validate-part.ts (one part at a time) and validate-gait.ts (limbs and legs);
 * this file only gathers the model and calls them.
 * Skill: .kiro/skills/procedural-animation-3d/SKILL.md
 */
import { isHostile, type ModelSpec } from '../core/types.js';
import { baseOf, animShapeBounds, emptyBox, growBox, posedBox, type Box } from './validate-geometry.js';
import { checkGait, limbPivotGaps } from './validate-gait.js';
import { checkPart, makePartCheck } from './validate-part.js';
import type { AddIssue, AnimIssue, Tagged } from './validate-shared.js';

export { animShapeBounds } from './validate-geometry.js';
export type { AnimIssue, AnimIssueCode } from './validate-shared.js';

/** Rest box of every part and of the whole model. */
function restBoxes(spec: ModelSpec): { rests: Map<string, Box>; model: Box } {
  const rests = new Map<string, Box>();
  const model = emptyBox();
  for (const part of spec.parts) {
    const b = posedBox(animShapeBounds(part.shape), baseOf(part));
    rests.set(part.name, b);
    growBox(model, b.min);
    growBox(model, b.max);
  }
  return { rests, model };
}

/** Category rules: malware must glitch, pickups must move. */
function checkCategory(spec: ModelSpec, tagged: Tagged[], add: AddIssue): void {
  if (isHostile(spec.category) && !tagged.some((p) => p.anim.type === 'jitter')) {
    add('warn', 'ANIM_MALWARE_NO_JITTER', '', 'malware needs at least one part tagged jitter: the glitch is how the player knows it is hostile');
  }
  if (spec.category === 'pickup' && !tagged.some((p) => ['bob', 'spin', 'pulse', 'orbit'].includes(p.anim.type))) {
    add('warn', 'ANIM_PICKUP_STILL', '', 'pickups must move (bob plus spin or pulse): motion is what says "take me"');
  }
}

/**
 * Check every AnimTag of a model. Errors are things that will look broken (a limb flying off, a foot
 * deep in the floor, both legs in step); warnings are things that will read badly.
 */
export function validateAnimTags(spec: ModelSpec): AnimIssue[] {
  const issues: AnimIssue[] = [];
  const add: AddIssue = (severity, code, part, message) => {
    issues.push({ severity, code, part, message });
  };
  const { rests, model } = restBoxes(spec);
  const tagged = spec.parts.filter((p): p is Tagged => !!p.anim);
  const shared = { spec, model, tagged, limbGap: limbPivotGaps(tagged, rests), reportedLimb: new Set<string>(), add };

  for (const part of tagged) checkPart(makePartCheck(shared, part, rests.get(part.name)!));
  checkGait(tagged, add);
  checkCategory(spec, tagged, add);
  return issues;
}
