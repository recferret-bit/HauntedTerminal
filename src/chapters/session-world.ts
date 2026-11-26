/**
 * One world step of a chapter level: quest files grow back, Kiro's crack moves on, enemies act. Turn-based: a step
 * runs after a player command or on a battle's enemy turn, never in real time (`.kiro/specs/turn-based-battles/`).
 */
import type { KernelEvent } from '../contracts/events.js';
import { lookup, makeNode } from '../game/tree.js';
import { evalCond, hasOpeningGate, levelScript, openingActive } from './script.js';
import { stepKiroCrack } from './session-kiro.js';
import { refreshExitGates, syncValidatedCodeBugs } from './session-rules.js';
import { ensureDirChain, type ChapterState } from './session-state.js';

/** The world does not tick yet: during the opening conversation (or before the first command when none is declared), and while `holdEnemiesUntil` is unmet. */
export function enemiesHeld(g: ChapterState): boolean {
  const holdUntil = levelScript(g).holdEnemiesUntil;
  const preStart = hasOpeningGate(g) ? openingActive(g) : g.rt.levelCommands === 0;
  return preStart || (holdUntil !== undefined && !evalCond(g, holdUntil));
}

/** Anti-softlock cron_restorer: a quest-critical file that stays deleted for 2 steps comes back. */
function restoreQuestFiles(g: ChapterState, events: KernelEvent[]): void {
  for (const q of g.rt.quests) {
    if (lookup(g.rt.root, q.path)) {
      q.missingTicks = 0;
      continue;
    }
    q.missingTicks += 1;
    if (q.missingTicks < 2) continue;
    const parent = ensureDirChain(g.rt.root, q.parentPath);
    const restored = makeNode(parent, q.name, 'file', q.mode);
    restored.uid = q.uid;
    restored.questCritical = true;
    restored.content = q.content;
    q.missingTicks = 0;
    events.push({ type: 'SYSTEM_HAND_SPAWN', entityKind: 'inode', id: restored.id, name: restored.name, reason: 'cron_restore' });
    events.push({ type: 'FILE_CREATED', inodeId: restored.id, name: restored.name });
  }
}

/**
 * One world step. `holdFire`: enemies that hurt the hero keep their clocks at zero for this step (the step that
 * starts a battle, so the player always acts first); lock picks and encryption still happen.
 */
export function worldStep(g: ChapterState, events: KernelEvent[], holdFire: boolean): string {
  restoreQuestFiles(g, events);
  let out = '';
  if (!g.lastCmdStartedCrack && g.kiro.activeCrack) out += stepKiroCrack(g, events);
  if (!enemiesHeld(g)) {
    g.rt.world.holdFire = holdFire;
    try {
      out += g.rt.world.tick(events);
    } finally {
      g.rt.world.holdFire = false;
    }
  }
  syncValidatedCodeBugs(g);
  g.rt.world.sync(events);
  refreshExitGates(g, events);
  return out + g.rt.world.drain();
}
