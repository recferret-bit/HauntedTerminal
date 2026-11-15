import { agentModel, stepOutput } from '../chapters/script.js';
import type { ScriptStep } from '../chapters/types.js';
import type { KernelEvent } from '../contracts/events.js';
import type { LabSetupOp, LabStep } from './lab-types.js';

type Speech = Extract<LabSetupOp | LabStep, { op: 'npc' | 'say' | 'taunt' | 'dialogue' }>;

export const isSpeech = (x: { op: string }): x is Speech => x.op === 'npc' || x.op === 'say' || x.op === 'taunt' || x.op === 'dialogue';

/** The level script step an agent line or bubble stands for: the game's own interpreter plays it. */
export function speechStep(x: Speech): ScriptStep {
  switch (x.op) {
    case 'npc':
    case 'say':
      return { kind: 'say', agent: x.agent, model: agentModel(x.agent), text: x.text, mood: x.mood, ...('print' in x && x.print ? { print: x.print } : {}) };
    case 'taunt':
      return { kind: 'taunt', mood: x.mood, fallback: x.text, ...('print' in x && x.print ? { print: x.print } : {}) };
    case 'dialogue': {
      const { op: _op, ...rest } = x;
      return { kind: 'dialogue', ...rest };
    }
  }
}

/** What playing a speech step puts on the stage and the terminal. `anchorOf` finds the inode of a socket by name. */
export function speechOutput(x: Speech, anchorOf: (socket: string) => number): { events: KernelEvent[]; print: string } {
  return stepOutput(speechStep(x), { taunt: x.op === 'taunt' ? x.text : undefined, anchorOf });
}
