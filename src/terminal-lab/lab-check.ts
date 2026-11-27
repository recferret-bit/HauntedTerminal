import { FxCatalog, ModelCatalog } from '../procgen/index.js';
import { patternError } from '../chapters/session-lab-checks.js';
import { assetIssues, validatePack, type PackIssue } from '../chapters/validate-pack.js';
import { buildFloor } from '../game/floors.js';
import { lookup } from '../game/tree.js';
import { buildLabPack } from './lab-pack.js';
import type { LabExpect, LabScript, LabSetupOp, LabStep } from './lab-types.js';

/**
 * Problems with a lab. `where` names the object to fix (`setup[i]`, `steps[i]`), or `lab` for the compiled level as a whole,
 * so the Inspector can jump to it and the scene list can badge it.
 */
const at = (where: string, severity: PackIssue['severity'], message: string): PackIssue => ({ severity, where, tab: 'object', message });

const idOf = (op: LabSetupOp): string | null => ('id' in op ? op.id : null);

function patternsOfOp(op: LabSetupOp): string[] {
  if (op.op === 'riddle') return [op.answer];
  if (op.op !== 'check') return [];
  const w = op.when;
  if (w.kind === 'ran' || w.kind === 'output') return [w.pattern];
  if (w.kind === 'code') return w.line === undefined ? [] : [w.line];
  if (w.kind === 'file') return w.contains === undefined ? [] : [w.contains];
  return [];
}

const patternsOfExpect = (e: LabExpect | undefined): string[] =>
  e ? [e.stdout, e.stderr, e.file?.contains].filter((p): p is string => typeof p === 'string') : [];

const CHAPTER_ONLY_OPS = new Set<LabSetupOp['op']>(['task', 'patch', 'npc', 'taunt', 'dialogue']);

function setupIssues(script: LabScript): PackIssue[] {
  const out: PackIssue[] = [];
  const seen = new Map<string, number>();
  const paths = new Set(script.setup.flatMap((op) => ('path' in op ? [op.path] : [])));
  const riddleIds = new Set(script.setup.flatMap((op) => (op.op === 'riddle' ? [op.id] : [])));
  const classicRoot = script.driver === 'classic' ? buildFloor(script.room.floorTheme).root : null;
  script.setup.forEach((op, i) => {
    const where = `setup[${i}]`;
    const id = idOf(op);
    if (id !== null) {
      if (seen.has(id)) out.push(at(where, 'error', `${op.op} id "${id}" is also used by setup[${seen.get(id)}]`));
      else seen.set(id, i);
    }
    if (classicRoot && CHAPTER_ONLY_OPS.has(op.op)) {
      out.push(at(where, 'warn', `${op.op} only runs in the chapter driver (classic floors ignore chapter tasks, patches and arrival speech)`));
    }
    for (const p of patternsOfOp(op)) {
      const problem = patternError(p);
      if (problem) out.push(at(where, 'error', problem));
    }
    if (op.op === 'prop' && !ModelCatalog.has(op.model)) out.push(at(where, 'error', `unknown model "${op.model}"`));
    if (op.op === 'enemy' && op.type !== 'zombie' && !op.path.startsWith(`${script.room.cwd}/`)) {
      out.push(at(where, 'warn', `${op.id} lives outside the room (${script.room.cwd}): you will have to cd to it`));
    }
    if (op.op === 'riddle' && op.opens !== undefined && !paths.has(op.opens) && !(classicRoot && lookup(classicRoot, op.opens))) {
      out.push(at(where, 'error', `the door it opens, ${op.opens}, is not in the scene`));
    }
    if (op.op === 'check' && op.when.kind === 'riddle' && !riddleIds.has(op.when.riddleId)) out.push(at(where, 'error', `no riddle "${op.when.riddleId}"`));
  });
  return out;
}

function stepProblem(step: LabStep, ids: Set<string>): string | null {
  switch (step.op) {
    case 'run':
      return step.line.trim() === '' ? 'the command line is empty' : null;
    case 'tick':
      return step.n !== undefined && (!Number.isInteger(step.n) || step.n < 1) ? 'ticks must be a whole number of at least 1' : null;
    case 'emit':
      return typeof (step.event as { type?: unknown }).type === 'string' ? null : 'the event needs a "type"';
    case 'inject': {
      const added = step.enemy ?? step.pickup;
      if (!step.enemy === !step.pickup || !added) return 'inject exactly one of enemy or pickup';
      if (ids.has(added.id)) return `id "${added.id}" is already in the scene`;
      ids.add(added.id);
      return null;
    }
    case 'check':
      return ids.has(step.id) ? null : `no task, check or riddle "${step.id}"`;
    default:
      return null;
  }
}

function stepIssues(script: LabScript): PackIssue[] {
  const ids = new Set(script.setup.flatMap((op) => idOf(op) ?? []));
  const out: PackIssue[] = [];
  script.steps.forEach((step, i) => {
    const where = `steps[${i}]`;
    const problem = stepProblem(step, ids);
    if (problem) out.push(at(where, 'error', problem));
    const expect = step.op === 'run' || step.op === 'tick' || step.op === 'expect' ? step.expect : undefined;
    for (const p of patternsOfExpect(expect)) {
      const bad = patternError(p);
      if (bad) out.push(at(where, 'error', bad));
    }
  });
  return out;
}

/** What the chapter checks say about the compiled level, plus the lab's own rules. */
export function checkLab(script: LabScript): PackIssue[] {
  const { pack } = buildLabPack(script);
  const level = [
    ...validatePack(pack, { winnable: false }),
    ...assetIssues(pack, (id) => ModelCatalog.has(id), (id) => FxCatalog.has(id)),
  ].map((i) => ({ ...i, where: 'lab' }));
  return [...level, ...setupIssues(script), ...stepIssues(script)];
}
