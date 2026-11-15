import { labRiddleRead, labRiddleWrite } from '../game/lab-riddle.js';
import type { Step } from '../game/shell.js';
import type { VNode } from '../game/tree.js';
import { refreshExitGates } from './session-rules.js';
import type { ChapterState } from './session-state.js';

/** `cat riddle.sock`: the socket speaks its prompt. */
export function riddleRead(g: ChapterState, node: VNode): Step | null {
  return labRiddleRead(g.lab, node, () => g.rt.talkedSockets.add(node.name));
}

/** `echo answer > riddle.sock`: right answers solve it (and open its door), wrong ones get the next hint, the last one repeated. */
export function riddleWrite(g: ChapterState, node: VNode, data: string): Step | null {
  return labRiddleWrite(
    g.lab,
    g.rt.lab,
    g.rt.root,
    g.rt.world,
    node,
    data,
    (events) => refreshExitGates(g, events),
    (answer) => g.rt.socketInputs.set(node.name, answer),
  );
}
