import type { KernelEvent } from '../contracts/events.js';
import { planWordReveal, wordRevealEnds } from '../contracts/word-reveal.js';
import { matchesPattern, patternError } from '../game/lab-checks.js';
import { hasLsFlags } from '../game/unix-applets.js';
import { lookup } from '../game/tree.js';
import type { ChapterState } from './session-state.js';
import type { LevelSpec, ScriptCond, ScriptLock } from './types.js';

function argsMatchFlags(args: readonly string[], wantFlags: string): boolean {
  const trimmed = wantFlags.trim();
  if (!trimmed) return true;
  if (trimmed === '*') return hasLsFlags(args);
  if (trimmed.startsWith('--')) return args.includes(trimmed);
  const clean = trimmed.replace(/^-+/, '');
  if (!clean) return true;
  const shortChars = new Set<string>();
  for (const arg of args) {
    if (arg.startsWith('-') && !arg.startsWith('--') && arg.length > 1) {
      for (const ch of arg.slice(1)) shortChars.add(ch);
    }
  }
  return [...clean].every((ch) => shortChars.has(ch));
}

export function invocationMatches(args: readonly string[], flags?: string, argsPat?: string): boolean {
  if (flags !== undefined && flags !== '' && !argsMatchFlags(args, flags)) return false;
  if (argsPat !== undefined && argsPat !== '' && !matchesPattern(args.join(' '), argsPat)) return false;
  return true;
}

export function scriptDialogActive(g: ChapterState, isOpening: boolean): boolean {
  return !g.ended && (isOpening || g.rt.levelTicks < g.rt.dialogBusyUntilTick);
}

export function recordDialogHoldTicks(g: ChapterState, events: readonly KernelEvent[]): void {
  let totalSec = 0;
  for (const e of events) {
    if (e.type !== 'DIALOG_BOX') continue;
    const plan = planWordReveal(wordRevealEnds(e.text).length, e.holdMs);
    totalSec += Math.max(1, Math.ceil(plan.holdMs / 1000));
  }
  if (totalSec > 0) {
    g.rt.dialogBusyUntilTick = Math.max(g.rt.dialogBusyUntilTick, g.rt.levelTicks) + totalSec;
  }
}

export function findMatchingLock(
  locks: readonly ScriptLock[] | undefined,
  canonicalCmd: string,
  args: readonly string[],
  isUnlocked: (c: ScriptCond) => boolean,
): ScriptLock | undefined {
  return locks?.find(
    (l) =>
      (l.command === 'kiro.d' ? 'kiro' : l.command) === canonicalCmd &&
      invocationMatches(args, l.flags, l.args) &&
      !isUnlocked(l.until),
  );
}

export function validateArgsPattern(pat?: string): string | null {
  return pat ? patternError(pat) : null;
}

function collectCondTasks(c: ScriptCond | undefined, out: Set<string>): void {
  if (!c) return;
  if (c.kind === 'laptop_tasks_done') {
    for (const id of c.tasks) out.add(id);
  } else if (c.kind === 'all' || c.kind === 'any') {
    for (const child of c.of) collectCondTasks(child, out);
  }
}

/** Task ids from incomplete positive `laptop_tasks_done` gates on `spec` once the player carries `laptop`. */
export function pendingLaptopTasksForSpec(spec: LevelSpec, laptopDone: ReadonlySet<string>, hasLaptop: boolean): string[] {
  if (!hasLaptop) return [];
  const wanted = new Set<string>();
  for (const r of spec.winRules) {
    if (r.kind === 'laptop_tasks_done') for (const id of r.tasks) wanted.add(id);
  }
  for (const e of spec.enemies) collectCondTasks(e.appearWhen, wanted);
  for (const f of spec.files) collectCondTasks(f.appearWhen, wanted);
  for (const p of spec.pickups) collectCondTasks(p.appearWhen, wanted);
  collectCondTasks(spec.script?.holdEnemiesUntil, wanted);
  for (const tr of spec.script?.triggers ?? []) collectCondTasks(tr.when, wanted);
  return [...wanted].filter((id) => !laptopDone.has(id));
}

/** Materializes `appearWhen` files, pickups and enemies whose condition just turned true. */
export function syncConditionalSpawns(g: ChapterState, evalFn: (c: ScriptCond) => boolean, events: KernelEvent[]): void {
  for (const f of g.rt.spec.files) {
    if (!f.appearWhen || g.rt.spawnedFiles.has(f.path) || !evalFn(f.appearWhen)) continue;
    g.rt.spawnedFiles.add(f.path);
    const node = lookup(g.rt.root, f.path);
    if (node) events.push({ type: 'FILE_CREATED', inodeId: node.id, name: node.name });
  }
  for (const p of g.rt.spec.pickups) {
    if (!p.appearWhen || g.rt.droppedPickups.has(p.id) || !evalFn(p.appearWhen)) continue;
    g.rt.droppedPickups.add(p.id);
    const live = g.rt.world.pickups.find((x) => x.id === p.id && !x.collected);
    if (live) {
      events.push({
        type: 'ENTITY_SPAWNED',
        entityId: live.id,
        model: live.model,
        reason: 'script',
        ...(p.dropFromX !== undefined ? { fromX: p.dropFromX } : {}),
        ...(p.dropFromY !== undefined ? { fromY: p.dropFromY } : {}),
      });
      events.push({ type: 'FILE_CREATED', inodeId: live.inode, name: live.name, entityId: live.id });
    }
  }
  for (const e of g.rt.spec.enemies) {
    if (!e.appearWhen || g.rt.spawnedEnemies.has(e.id) || !evalFn(e.appearWhen)) continue;
    g.rt.spawnedEnemies.add(e.id);
    const live = g.rt.world.get(e.id);
    if (live && !live.dead && !g.rt.world.petrified(live)) {
      events.push({ type: 'ENTITY_SPAWNED', entityId: live.id, model: live.model, reason: 'script' });
    }
  }
}
