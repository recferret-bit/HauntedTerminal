import {
  answerMatches,
  isRegexPattern,
  matchesPattern,
  observeLab,
  patternError,
  type Observation,
} from '../game/lab-checks.js';
import type { ChapterState } from './session-state.js';

export { answerMatches, isRegexPattern, matchesPattern, patternError, type Observation };

/** Called after every command, tick and inject of a lab session: latches the checks that just came true. */
export function observe(g: ChapterState, o: Observation): void {
  observeLab(g.lab, g.rt.lab, o);
}
