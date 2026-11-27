import type { KernelEvent } from '../contracts/events.js';
import { planWordReveal, wordRevealEnds } from '../contracts/word-reveal.js';
import { matchesPattern, patternError } from '../game/lab-checks.js';
import { hasLsFlags } from '../game/unix-applets.js';
import type { ChapterState } from './session-state.js';
import type { ScriptCond, ScriptLock } from './types.js';

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
