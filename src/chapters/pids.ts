/**
 * Random PIDs (spec `.kiro/specs/random-pids/`). A level spec writes an enemy's PID as a marker (`pid` set); the
 * number the player sees is rolled on every level load. Text that names it writes `{pid:<enemy id>}`.
 */

export const PID_MIN = 1100;
export const PID_MAX = 8899;

/** PIDs that mean something fixed: `agentd` and the boss (1), `cron_restorer` (10), `kiro.d` (777), the player's shell (4242). */
export const RESERVED_PIDS: readonly number[] = [1, 10, 777, 4242];

const PLACEHOLDER = /\{pid:([^{}\s]+)\}/g;

/** A small seeded generator (xorshift32), for the tests and the property suite. */
export function seededRandom(seed: number): () => number {
  let s = (seed | 0) || 0x9e3779b9;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

interface PidEnemy {
  id: string;
  pid?: number;
}

/** One random PID per enemy that has a `pid` other than a reserved one: unique, in range, never another fixed PID of the level. */
export function rollPids(enemies: readonly PidEnemy[], random: () => number = Math.random): Map<string, number> {
  const taken = new Set<number>(RESERVED_PIDS);
  for (const e of enemies) if (e.pid !== undefined) taken.add(e.pid);
  const rolled = new Map<string, number>();
  const span = PID_MAX - PID_MIN + 1;
  for (const e of enemies) {
    if (e.pid === undefined || RESERVED_PIDS.includes(e.pid)) continue;
    let pid = PID_MIN + Math.floor(random() * span);
    while (taken.has(pid)) pid = pid === PID_MAX ? PID_MIN : pid + 1;
    taken.add(pid);
    rolled.set(e.id, pid);
  }
  return rolled;
}

/** What a lab session uses instead of a roll: each enemy keeps the PID its author placed, and `{pid:<id>}` still resolves. */
export function fixedPids(enemies: readonly PidEnemy[]): Map<string, number> {
  const kept = new Map<string, number>();
  for (const e of enemies) if (e.pid !== undefined && !RESERVED_PIDS.includes(e.pid)) kept.set(e.id, e.pid);
  return kept;
}

/** Replace every `{pid:<enemy id>}` with that enemy's PID. An id that was not rolled stays as written. */
export function fillPids(text: string, pids: ReadonlyMap<string, number>): string {
  if (pids.size === 0 || !text.includes('{pid:')) return text;
  return text.replace(PLACEHOLDER, (whole, id: string) => {
    const pid = pids.get(id);
    return pid === undefined ? whole : String(pid);
  });
}

/** `fillPids` over every string of a JSON value, as a copy. `skip` names top-level keys to leave raw. */
export function fillPidsDeep<T>(value: T, pids: ReadonlyMap<string, number>, skip: readonly string[] = []): T {
  if (pids.size === 0) return value;
  const walk = (v: unknown, top: boolean): unknown => {
    if (typeof v === 'string') return fillPids(v, pids);
    if (Array.isArray(v)) return v.map((x) => walk(x, false));
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v)) out[k] = top && skip.includes(k) ? x : walk(x, false);
      return out;
    }
    return v;
  };
  return walk(value, true) as T;
}

/** The level as the player plays it: every string filled (except `solutionCommands`, which `exec` fills as typed) and each enemy carrying its rolled PID. */
export function applyPids<T extends { enemies: PidEnemy[] }>(spec: T, pids: ReadonlyMap<string, number>): T {
  if (pids.size === 0) return spec;
  const filled = fillPidsDeep(spec, pids, ['solutionCommands']);
  return { ...filled, enemies: filled.enemies.map((e) => (pids.has(e.id) ? { ...e, pid: pids.get(e.id) } : e)) };
}

/** Every enemy id named by a `{pid:<id>}` anywhere in a JSON value. */
export function pidRefs(value: unknown): string[] {
  return allStrings(value).flatMap((text) => [...text.matchAll(PLACEHOLDER)].map((m) => m[1]!));
}

/** Every string of a JSON value (for the pack check's leftover-number scan). */
export function allStrings(value: unknown): string[] {
  const out: string[] = [];
  const walk = (v: unknown): void => {
    if (typeof v === 'string') out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(value);
  return out;
}
