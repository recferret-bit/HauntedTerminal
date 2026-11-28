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
  type BattleIntroOverride,
  type BattleThreat,
  type TurnReason,
} from '../game/battle.js';
import { absPath } from '../game/tree.js';
import { isEnemyHidden } from './script.js';
import { hashSeed, resolveTauntAgent, type ChapterState } from './session-state.js';
import { enemiesHeld, worldStep } from './session-world.js';

/** The enemies that would fight the hero now; none while the level holds its enemies. */
function currentThreats(g: ChapterState): BattleThreat[] {
  if (enemiesHeld(g)) return [];
  return g.rt.world.threats().filter((e) => !isEnemyHidden(g, e.id)).map((e) => ({ id: e.id, type: e.type, boss: e.boss }));
}

/** Ends an active battle immediately if non-shell actions (like saving code in an editor) killed the last threat. */
export function syncClearedBattle(g: ChapterState, events: KernelEvent[]): void {
  if (g.battle.phase !== 'idle' && currentThreats(g).length === 0) {
    endBattle(g.battle, 'cleared', events);
  }
}

/** idle -> intro when threats are in the hero's room; returns the terminal lines. Battle #1 of a level uses its Big Four `agentTaunt` when present. */
export function maybeBeginBattle(g: ChapterState, events: KernelEvent[]): string {
  if (g.battle.phase !== 'idle' || g.ended) return '';
  const threats = currentThreats(g);
  if (threats.length === 0) return '';
  const mark = events.length;
  const seed = hashSeed(`${g.rt.spec.id}:${g.battle.battle + 1}`);
  let override: BattleIntroOverride | undefined;
  if (g.rt.levelBattles === 0 && g.rt.dialog?.agentTaunt) {
    const raw = g.rt.dialog.agentTaunt;
    const who = resolveTauntAgent(raw);
    const clean = raw.replace(/^(?:\[[^\]]+\]|[A-Z0-9 ._-]+)\s*:\s*/i, '').replace(/^"|"$/g, '').trim();
    override = {
      agent: who === 'kiro' ? undefined : who,
      taunt: clean || raw,
    };
  }
  const hasCustomBug = threats.some((t) => g.rt.world.enemies.find((e) => e.id === t.id)?.customCodeRule);
  if (hasCustomBug) {
    const rule = g.rt.spec.winRules.find((r) =>
      r.kind === 'payment_js_valid' || r.kind === 'cart_js_valid' || r.kind === 'html_css_valid');
    const action = g.inventory.items.includes('laptop') ? 'open Laptop [F4] -> JS Pad, or edit/sed' : 'use edit/sed to fix the logic';
    const target = rule
      ? (rule.kind === 'html_css_valid' ? rule.htmlPath : rule.jsPath).split('/').pop() ?? ''
      : '';
    const where = target ? ` in ${target}` : '';
    const advice = rule ? `BUG${where}: ${rule.description} (${action})` : `BUG: fix the buggy code file (${action})`;
    override = { ...override, advice };
  }
  g.rt.levelBattles += 1;
  beginBattle(g.battle, threats, seed, events, override);
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
