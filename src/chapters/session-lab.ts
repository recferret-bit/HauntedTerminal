import { maxHpFor } from '../game/bestiary.js';
import { applyLabInjection, buildLabInspect } from '../game/lab-support.js';
import type { TickResult } from '../game/types.js';
import { hiddenEnemyId } from './script.js';
import { enemiesHeld, internalTick } from './session-flow.js';
import { observe } from './session-lab-checks.js';
import type { LabInjection, LabInspect } from './session-lab-types.js';
import { getChecklist, refreshExitGates } from './session-rules.js';
import { snapshot } from './session-snapshot.js';
import type { ChapterState } from './session-state.js';

/** Everything a tool wants to show about the running level, as plain data. Changes nothing. */
export function inspect(g: ChapterState): LabInspect {
  const counts = g.rt.world.counts();
  return buildLabInspect({
    levelId: g.rt.spec.id,
    root: g.rt.root,
    cwd: g.rt.cwd,
    world: g.rt.world,
    hp: g.hp,
    maxHp: maxHpFor(g.ram),
    // The script's hidden enemy is not counted until it shows, like the HUD.
    enemiesLeft: hiddenEnemyId(g) ? Math.max(0, counts.left - 1) : counts.left,
    held: enemiesHeld(g),
    lab: g.lab,
    state: g.rt.lab,
    socketInputs: g.rt.socketInputs,
    filesRead: g.rt.filesRead,
    checklist: getChecklist(g),
  });
}

/** One world tick on request. The manual clock stops `tick()`; this is how a tool advances time, in tactical mode too. */
export function labTick(g: ChapterState): TickResult {
  if (g.paused || g.intro || g.ended) return { output: '', events: [], snapshot: snapshot(g) };
  return internalTick(g, false);
}

/** Puts an enemy or a pickup into the running level, with the files it needs, and tells the stage. */
export function inject(g: ChapterState, what: LabInjection): TickResult {
  const events = applyLabInjection(g.rt.root, g.rt.world, what);
  refreshExitGates(g, events);
  observe(g, { output: '', eventTypes: events.map((e) => e.type) });
  return { output: '', events, snapshot: snapshot(g) };
}
