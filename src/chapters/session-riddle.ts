import { labRiddleRead, labRiddleWrite } from '../game/lab-riddle.js';
import type { LabConfig, LabRiddle } from '../game/lab-types.js';
import type { Step } from '../game/shell.js';
import type { VNode } from '../game/tree.js';
import { refreshExitGates } from './session-rules.js';
import type { ChapterState } from './session-state.js';
import type { LevelRiddleSpec } from './types.js';

function normalizeRiddle(r: LevelRiddleSpec): LabRiddle {
  return {
    id: r.id,
    path: r.path,
    speaker: r.speaker ?? 'Socket',
    prompt: r.prompt,
    answer: r.answer,
    hints: r.hints ?? [],
    success: r.success ?? 'The lock clicks open.',
    opens: r.opens,
    tokens: r.tokens ?? [],
  };
}

function effectiveLab(g: ChapterState): LabConfig | null {
  const specRiddles = (g.rt.spec.riddles ?? []).map(normalizeRiddle);
  if (!g.lab && specRiddles.length === 0) return null;
  if (!g.lab) return { extraActors: [], clock: 'live', content: { riddles: specRiddles, checks: [], taskIds: [] } };
  if (specRiddles.length === 0) return g.lab;
  const seen = new Set(g.lab.content.riddles.map((r) => r.id));
  const extra = specRiddles.filter((r) => !seen.has(r.id));
  return extra.length === 0 ? g.lab : { ...g.lab, content: { ...g.lab.content, riddles: [...g.lab.content.riddles, ...extra] } };
}

/** The next hint line of the first unsolved riddle whose socket is in `dir` (a path), or null with no such riddle. Each call moves to the next line; the last repeats. */
export function riddleHintLine(g: ChapterState, dir: string): string | null {
  const riddle = (g.rt.spec.riddles ?? []).find((r) => !g.rt.lab.solved.has(r.id) && r.path.slice(0, r.path.lastIndexOf('/')) === dir);
  if (!riddle) return null;
  const hints = riddle.hints ?? [];
  if (hints.length === 0) return 'Read the socket again with cat, and answer exactly what it asks.';
  const used = g.rt.hintUses.get(riddle.id) ?? 0;
  g.rt.hintUses.set(riddle.id, used + 1);
  return hints[Math.min(used, hints.length - 1)] ?? null;
}

/** `cat riddle.sock`: the socket speaks its prompt. */
export function riddleRead(g: ChapterState, node: VNode): Step | null {
  return labRiddleRead(effectiveLab(g), node, () => g.rt.talkedSockets.add(node.name));
}

/** `echo answer > riddle.sock`: right answers solve it (and open its door), wrong ones get the next hint, the last one repeated. */
export function riddleWrite(g: ChapterState, node: VNode, data: string): Step | null {
  return labRiddleWrite(
    effectiveLab(g),
    g.rt.lab,
    g.rt.root,
    g.rt.world,
    node,
    data,
    (events) => refreshExitGates(g, events),
    (answer) => g.rt.socketInputs.set(node.name, answer),
  );
}
