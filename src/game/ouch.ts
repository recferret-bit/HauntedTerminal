/**
 * The vibecoder's rare "ouch" comments (spec `.kiro/specs/hero-ouch-comments/`): when a hit lands, now and then he
 * lets out one nerdy word, drawn by the stage as big yellow lettering (not a dialog). Pure: the session rolls it, puts
 * the word on `PLAYER_DAMAGED.ouch`, and the stage letters it.
 */

/** Twenty distinct words, one or two each. */
export const OUCH_WORDS: readonly string[] = [
  'OUCH!', 'SEGFAULT!', 'NULL POINTER!', 'OFF-BY-ONE!', 'STACK OVERFLOW!',
  'CORE DUMPED!', 'KERNEL PANIC!', '404 HP!', 'EXCEPTION!', 'BUFFER BURN!',
  'MEMORY LEAK!', 'RACE CONDITION!', 'DEADLOCK!', 'SYNTAX ERROR!', 'BAD SECTOR!',
  'PACKET LOSS!', 'TIMEOUT!', 'UNDEFINED!', 'GIT BLAME!', 'REGRESSION!',
];

/** One hit in this many speaks... */
const OUCH_CHANCE = 0.25;
/** ...but never before this many hits have passed since the last comment. */
const OUCH_COOLDOWN_HITS = 3;

export interface OuchState {
  /** Hits since the last comment (starts at the cooldown, so the first hit may speak). */
  hitsSince: number;
  last: string | null;
  readonly random: () => number;
}

export function createOuch(random: () => number = Math.random): OuchState {
  return { hitsSince: OUCH_COOLDOWN_HITS, last: null, random };
}

/** The comment for this hit, or undefined (most hits, a lethal hit, a hit inside the cooldown). */
export function rollOuch(state: OuchState, hpRemaining: number): string | undefined {
  if (hpRemaining <= 0) return undefined;
  if (state.hitsSince < OUCH_COOLDOWN_HITS) {
    state.hitsSince += 1;
    return undefined;
  }
  state.hitsSince += 1;
  if (state.random() >= OUCH_CHANCE) return undefined;
  const pool = OUCH_WORDS.filter((w) => w !== state.last);
  const word = pool[Math.min(pool.length - 1, Math.floor(state.random() * pool.length))]!;
  state.last = word;
  state.hitsSince = 0;
  return word;
}
