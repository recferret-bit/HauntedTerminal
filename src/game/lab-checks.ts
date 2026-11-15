import { lookup, type VNode } from './tree.js';
import type { LabCond, LabConfig, LabGoal, LabLevelState, LabPattern } from './lab-types.js';

const RE_PREFIX = 're:';

/** True for a `re:` pattern (a regular expression), false for plain text. */
export const isRegexPattern = (pattern: LabPattern): boolean => pattern.startsWith(RE_PREFIX);

/** The regular expression of a `re:` pattern, or null for plain text. Throws when the expression does not compile. */
function regexOf(pattern: LabPattern): RegExp | null {
  if (!isRegexPattern(pattern)) return null;
  const body = pattern.slice(RE_PREFIX.length);
  const slashed = /^\/(.*)\/([dgimsuvy]*)$/s.exec(body);
  return slashed ? new RegExp(slashed[1] ?? '', slashed[2]) : new RegExp(body);
}

/** Why a pattern cannot be used, or null when it is fine. Lab checks report it instead of failing silently at run time. */
export function patternError(pattern: LabPattern): string | null {
  try {
    regexOf(pattern);
    return null;
  } catch (err) {
    return `"${pattern}" is not a valid regular expression: ${(err as Error).message}`;
  }
}

/** Plain text matches as a substring; `re:...` as a regular expression. A broken expression matches nothing. */
export function matchesPattern(text: string, pattern: LabPattern): boolean {
  try {
    const re = regexOf(pattern);
    return re ? re.test(text) : text.includes(pattern);
  } catch {
    return false;
  }
}

/** A riddle answer: the exact text (both sides trimmed), or a `re:` pattern. */
export function answerMatches(text: string, answer: LabPattern): boolean {
  return isRegexPattern(answer) ? matchesPattern(text.trim(), answer) : text.trim() === answer.trim();
}

/** What a command or a tick produced, for the checks that latch (`ran`, `output`, `code`, `event`). */
export interface Observation {
  line?: string;
  output: string;
  code?: number;
  eventTypes: readonly string[];
}

function seen(cond: LabCond, o: Observation): boolean {
  switch (cond.kind) {
    case 'ran':
      return o.line !== undefined && matchesPattern(o.line, cond.pattern);
    case 'output':
      return matchesPattern(o.output, cond.pattern);
    case 'code':
      return o.line !== undefined && o.code === cond.code && (cond.line === undefined || matchesPattern(o.line, cond.line));
    case 'event':
      return o.eventTypes.includes(cond.type);
    case 'file':
    case 'riddle':
      return false;
  }
}

/** Called after every command, tick and inject of a lab session: latches the checks that just came true. */
export function observeLab(lab: LabConfig | null, state: LabLevelState, o: Observation): void {
  if (!lab || lab.content.checks.length === 0) return;
  const hits = state.hits;
  for (const check of lab.content.checks) {
    if (!hits.has(check.id) && seen(check.when, o)) hits.add(check.id);
  }
}

function isDone(root: VNode, state: LabLevelState, id: string, cond: LabCond): boolean {
  switch (cond.kind) {
    case 'file': {
      const node = lookup(root, cond.path);
      if (cond.absent) return node === null;
      return node !== null && (cond.contains === undefined || matchesPattern(node.content, cond.contains));
    }
    case 'riddle':
      return state.solved.has(cond.riddleId);
    case 'ran':
    case 'output':
    case 'code':
    case 'event':
      return state.hits.has(id);
  }
}

/** Tasks (win rules, in order), then checks, then riddles. */
export function labGoalsOf(
  lab: LabConfig | null,
  state: LabLevelState,
  root: VNode,
  checklist: ReadonlyArray<{ description: string; done: boolean }>,
): LabGoal[] {
  const content = lab?.content;
  if (!content) return [];
  return [
    ...checklist.map((c, i): LabGoal => ({ id: content.taskIds[i] ?? `task-${i + 1}`, kind: 'task', description: c.description, done: c.done })),
    ...content.checks.map((c): LabGoal => ({ id: c.id, kind: 'check', description: c.description, done: isDone(root, state, c.id, c.when) })),
    ...content.riddles.map((r): LabGoal => ({ id: r.id, kind: 'riddle', description: `Solve ${r.path}`, done: state.solved.has(r.id), attempts: state.attempts[r.id] ?? 0 })),
  ];
}
