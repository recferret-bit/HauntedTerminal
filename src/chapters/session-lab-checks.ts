import {
  answerMatches,
  isRegexPattern,
  labGoalsOf,
  matchesPattern,
  observeLab,
  patternError,
  type Observation,
} from '../game/lab-checks.js';
import type { LabGoal } from './session-lab-types.js';
import type { ChapterState } from './session-state.js';

export { answerMatches, isRegexPattern, matchesPattern, patternError, type Observation };

/** Called after every command, tick and inject of a lab session: latches the checks that just came true. */
export function observe(g: ChapterState, o: Observation): void {
  observeLab(g.lab, g.rt.lab, o);
}

/** Tasks (the level's win rules, in order), then checks, then riddles. `checklist` is `getChecklist(g)`, computed once by the caller. */
export function goalsOf(g: ChapterState, checklist: ReadonlyArray<{ description: string; done: boolean }>): LabGoal[] {
  return labGoalsOf(g.lab, g.rt.lab, g.rt.root, checklist);
}
