/**
 * The chapter session's side of the battle orchestrator (`src/game/battle.ts`): it feeds the state machine what
 * the world looks like and runs the world step of every enemy turn. The orchestrator decides; this file acts.
 */
import type { KernelEvent } from '../contracts/events.js';
import { battleBanner } from '../game/agents.js';
import {
  afterEnemyTurn,
  beginBattle,
  clockSecond,
  endBattle,
  startEnemyTurn,
  type BattleThreat,
  type TurnReason,
} from '../game/battle.js';
import { absPath } from '../game/tree.js';
import { hashSeed, type ChapterState } from './session-state.js';
import { enemiesHeld, worldStep } from './session-world.js';

/** The enemies that would fight the hero now; none while the level holds its enemies. */
function currentThreats(g: ChapterState): BattleThreat[] {
  if (enemiesHeld(g)) return [];
  return g.rt.world.threats().map((e) => ({ id: e.id, type: e.type, boss: e.boss }));
}

/** idle -> intro when threats are in the hero's room; returns the terminal lines. The agent is seeded by the level and the battle number. */
export function maybeBeginBattle(g: ChapterState, events: KernelEvent[]): string {
  if (g.battle.phase !== 'idle' || g.ended) return '';
  const threats = currentThreats(g);
  if (threats.length === 0) return '';
  const mark = events.length;
  beginBattle(g.battle, threats, hashSeed(`${g.rt.spec.id}:${g.battle.battle + 1}`), events);
  const started = events.slice(mark).find((e) => e.type === 'BATTLE_STARTED');
  return started?.type === 'BATTLE_STARTED' ? battleBanner(started) : '';
}

/** Outside a battle: one world step. If threats are already here, they hold fire for it and a battle begins. */
export function freeStep(g: ChapterState, events: KernelEvent[]): string {
  const out = worldStep(g, events, currentThreats(g).length > 0);
  return out + maybeBeginBattle(g, events);
}

/** An enemy of this battle is still alive but no longer in the hero's room: he walked out. */
function heroLeft(g: ChapterState): boolean {
  const here = absPath(g.rt.cwd);
  return g.battle.enemyIds.some((id) => {
    const e = g.rt.world.get(id);
    return e !== undefined && !e.dead && !g.rt.world.zone(e).includes(here);
  });
}

/** player -> enemy -> player (or idle): the enemies act in one world step. */
export function enemyTurn(g: ChapterState, events: KernelEvent[], reason: TurnReason): string {
  startEnemyTurn(g.battle, reason, events);
  const out = worldStep(g, events, false);
  const threats = currentThreats(g);
  const ended = g.ended ? 'level' : g.deadNow ? 'respawn' : threats.length === 0 && heroLeft(g) ? 'left' : null;
  afterEnemyTurn(g.battle, threats, ended, events);
  return ended === 'respawn' ? out + maybeBeginBattle(g, events) : out;
}

/**
 * After a player command (a non-empty line): in a battle it was the player's action and the enemies answer;
 * outside one the world takes a free step. A level change, the end or a death ends the battle instead.
 */
export function afterCommand(g: ChapterState, events: KernelEvent[]): string {
  if (g.ended) {
    endBattle(g.battle, 'level', events);
    return '';
  }
  if (g.deadNow) {
    endBattle(g.battle, 'respawn', events);
    return '';
  }
  if (g.battle.phase === 'player') return enemyTurn(g, events, 'action');
  return freeStep(g, events);
}

/** One real second for the battle: the intro runs down, the turn timer runs down; a runout is the enemy turn. */
export function battleSecond(g: ChapterState, events: KernelEvent[]): string {
  return clockSecond(g.battle, events) === 'timeout' ? enemyTurn(g, events, 'timeout') : '';
}
