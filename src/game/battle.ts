/**
 * The battle orchestrator: one turn-based state machine per session that says who is acting now.
 *
 *   idle ──threats appear──▶ intro ──4 s / Enter / a command──▶ player ──action / 30 s timeout──▶ enemy
 *     ▲                                                          ▲                                 │
 *     └──────── no threat left, hero left, respawn, new level ───┴──────── one world step ─────────┘
 *
 * Pure functions over plain data: no timers, no DOM, no three, no world. The session runs the world (the
 * enemy turn is one `World.tick`) and tells this module what happened; time reaches it only through
 * `clockSecond()`, one call per real second. Every transition pushes one KernelEvent, so the play page,
 * the Terminal Lab and the tests all see the same sequence. Spec: `.kiro/specs/turn-based-battles/`.
 */
import type { BattleAgent, BattlePhase, KernelEvent } from '../contracts/events.js';
import { battleAdvice, battleTaunt } from './agents.js';
import type { EnemyType } from './bestiary.js';
import type { BattleView } from './types.js';

/** Seconds the player has to act before the enemies take their turn anyway. */
export const TURN_SEC = 30;
/** Seconds of battle intro (agent taunt, Kiro advice, FIGHT!) before the player's first turn. */
export const INTRO_SEC = 4;
/** The agents that taunt before a battle, in seed order. */
export const BIG_FOUR: readonly BattleAgent[] = ['clod', 'gork', 'codec', 'antigravy'];

/** What stops the turn timer besides pause and the intro. Dialog boxes are not a hold. */
export type BattleHold = 'editor' | 'laptop';
export type BattleEndReason = Extract<KernelEvent, { type: 'BATTLE_ENDED' }>['reason'];
export type TurnReason = Extract<KernelEvent, { type: 'BATTLE_TURN' }>['reason'];

/** One enemy that would fight the hero now (see `threats` in entities-combat). */
export interface BattleThreat {
  id: string;
  type: EnemyType;
  boss: boolean;
}

export interface BattleState {
  phase: BattlePhase;
  /** Battles begun so far in this session; the id of the current or last one. */
  battle: number;
  /** Seconds left on the player's turn. */
  secondsLeft: number;
  /** Seconds left of the intro. */
  introLeft: number;
  enemyIds: string[];
  holds: Set<BattleHold>;
}

export function createBattle(): BattleState {
  return { phase: 'idle', battle: 0, secondsLeft: TURN_SEC, introLeft: 0, enemyIds: [], holds: new Set() };
}

export function inBattle(b: BattleState): boolean {
  return b.phase !== 'idle';
}

/** The agent of the big four who taunts, picked from a seed (the session hashes the level id and battle number). */
export function pickAgent(seed: number): BattleAgent {
  return BIG_FOUR[Math.abs(seed) % BIG_FOUR.length]!;
}

/** idle -> intro: a battle begins. `seed` picks the agent and its taunt; nobody acts during the intro. */
export function beginBattle(b: BattleState, threats: readonly BattleThreat[], seed: number, events: KernelEvent[]): void {
  if (b.phase !== 'idle' || threats.length === 0) return;
  b.battle += 1;
  b.phase = 'intro';
  b.introLeft = INTRO_SEC;
  b.secondsLeft = TURN_SEC;
  b.enemyIds = threats.map((t) => t.id);
  const agent = pickAgent(seed);
  events.push({
    type: 'BATTLE_STARTED',
    battle: b.battle,
    agent,
    model: `agent.${agent}`,
    taunt: battleTaunt(agent, seed),
    advice: battleAdvice(threats),
    enemyIds: [...b.enemyIds],
  });
}

/** Any phase -> idle. Does nothing outside a battle. */
export function endBattle(b: BattleState, reason: BattleEndReason, events: KernelEvent[]): void {
  if (b.phase === 'idle') return;
  b.phase = 'idle';
  b.enemyIds = [];
  b.secondsLeft = TURN_SEC;
  b.introLeft = 0;
  events.push({ type: 'BATTLE_ENDED', battle: b.battle, reason });
}

/** -> player, with a fresh turn timer. */
export function startPlayerTurn(b: BattleState, reason: TurnReason, first: boolean, events: KernelEvent[]): void {
  b.phase = 'player';
  b.secondsLeft = TURN_SEC;
  events.push({ type: 'BATTLE_TURN', battle: b.battle, actor: 'player', first, reason });
}

/** player -> enemy. The session then runs one world step and calls `afterEnemyTurn`. */
export function startEnemyTurn(b: BattleState, reason: TurnReason, events: KernelEvent[]): void {
  b.phase = 'enemy';
  events.push({ type: 'BATTLE_TURN', battle: b.battle, actor: 'enemy', first: false, reason });
}

/** enemy -> player (the battle goes on) or -> idle (nobody left to fight, or the hero is gone). */
export function afterEnemyTurn(
  b: BattleState,
  threats: readonly BattleThreat[],
  ended: BattleEndReason | null,
  events: KernelEvent[],
): void {
  if (b.phase === 'idle') return;
  if (ended) return endBattle(b, ended, events);
  if (threats.length === 0) return endBattle(b, 'cleared', events);
  b.enemyIds = threats.map((t) => t.id);
  startPlayerTurn(b, 'action', false, events);
}

/** intro -> player: Enter on the play page, or a command line from a headless driver. */
export function skipIntro(b: BattleState, events: KernelEvent[]): boolean {
  if (b.phase !== 'intro') return false;
  b.introLeft = 0;
  startPlayerTurn(b, 'start', true, events);
  return true;
}

/**
 * One real second passed (the session calls this from `tick()`, never while paused).
 * Returns `timeout` when the player's turn just ran out: the session must run the enemy turn.
 */
export function clockSecond(b: BattleState, events: KernelEvent[]): 'timeout' | null {
  if (b.phase === 'intro') {
    b.introLeft -= 1;
    if (b.introLeft <= 0) skipIntro(b, events);
    return null;
  }
  if (b.phase !== 'player' || b.holds.size > 0) return null;
  b.secondsLeft = Math.max(0, b.secondsLeft - 1);
  return b.secondsLeft === 0 ? 'timeout' : null;
}

export function setHold(b: BattleState, hold: BattleHold, on: boolean): void {
  if (on) b.holds.add(hold);
  else b.holds.delete(hold);
}

/** The snapshot view: null outside a battle. */
export function battleView(b: BattleState): BattleView | null {
  if (b.phase === 'idle') return null;
  return {
    phase: b.phase,
    battle: b.battle,
    secondsLeft: b.phase === 'player' ? b.secondsLeft : null,
    held: b.holds.size > 0,
    enemyIds: [...b.enemyIds],
  };
}
