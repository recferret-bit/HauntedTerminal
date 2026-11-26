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
