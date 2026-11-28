import { maxHpFor } from '../game/bestiary.js';
import { applyLabInjection, buildLabInspect } from '../game/lab-support.js';
import type { TickResult } from '../game/types.js';
import { isEnemyHidden } from './script.js';
import { skipIntro } from '../game/battle.js';
import { enemyTurn, freeStep } from './session-battle.js';
import { clockTick } from './session-flow.js';
import { enemiesHeld } from './session-world.js';
import { observe } from './session-lab-checks.js';
import type { LabInjection, LabInspect } from './session-lab-types.js';
import { getChecklist, refreshExitGates } from './session-rules.js';
import { snapshot } from './session-snapshot.js';
import type { ChapterState } from './session-state.js';

/** Everything a tool wants to show about the running level, as plain data. Changes nothing. */
export function inspect(g: ChapterState): LabInspect {
  const counts = g.rt.world.counts();
  const hiddenLeft = g.rt.world.enemies.filter((e) => !e.minion && !e.dead && !g.rt.world.petrified(e) && isEnemyHidden(g, e.id)).length;
  return buildLabInspect({
    levelId: g.rt.spec.id,
    root: g.rt.root,
    cwd: g.rt.cwd,
    world: g.rt.world,
    hp: g.hp,
    maxHp: maxHpFor(g.ram),
    // Script-hidden enemies are not counted until they appear, like the HUD.
    enemiesLeft: Math.max(0, counts.left - hiddenLeft),
    held: enemiesHeld(g),
    lab: g.lab,
    state: g.rt.lab,
    socketInputs: g.rt.socketInputs,
    filesRead: g.rt.filesRead,
    checklist: getChecklist(g),
  });
}

/**
 * One step on request. The manual clock stops `tick()`; this is how a tool advances time: one second of the level
 * clock, then in a battle the enemy turn (forced, as a timer runout would), outside one a free world step.
 */
export function labTick(g: ChapterState): TickResult {
  if (g.paused || g.intro || g.ended) return { output: '', events: [], snapshot: snapshot(g) };
  return clockTick(g, (events) => {
    skipIntro(g.battle, events);
    return g.battle.phase === 'player' ? enemyTurn(g, events, 'forced') : freeStep(g, events);
  });
}

/** Puts an enemy or a pickup into the running level, with the files it needs, and tells the stage. */
export function inject(g: ChapterState, what: LabInjection): TickResult {
  const events = applyLabInjection(g.rt.root, g.rt.world, what);
  refreshExitGates(g, events);
  observe(g, { output: '', eventTypes: events.map((e) => e.type) });
  return { output: '', events, snapshot: snapshot(g) };
}
