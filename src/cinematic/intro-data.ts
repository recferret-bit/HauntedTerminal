import type { PanelDef } from './page.js';

export const INTRO_T = {
  A: 0, A2: 7.5, B: 12.5, STRIKE: 13.4,
  TURN1: 16.5, TURN1_END: 17.2, C1: 16.5, WAKE: 17.3, C2: 20.5, C3: 24.0, BURST: 24.3, RISE: 24.4,
  MOCK: 25.6, MOCK_STEP: 0.9, SHOUT: 29.6, FINE: 30.6,
  TURN2: 31.9, TURN2_END: 32.6, PULL: 32.3, PULL_END: 34.7, DISSOLVE: 33.9, WHITE: 35.1, CARD: 36.1, END: 39.9,
} as const;

export const PANELS: PanelDef[] = [
  { id: 'A', page: 0, landscape: [0, 0, 0.58, 0.56], portrait: [0, 0, 1, 0.36] },
  { id: 'A2', page: 0, landscape: [0.58, 0, 0.42, 0.56], portrait: [0, 0.36, 1, 0.28] },
  { id: 'B', page: 0, landscape: [0, 0.56, 1, 0.44], portrait: [0, 0.64, 1, 0.36] },
  { id: 'C1', page: 1, landscape: [0, 0, 0.38, 0.5], portrait: [0, 0, 0.5, 0.32] },
  { id: 'C2', page: 1, landscape: [0, 0.5, 0.38, 0.5], portrait: [0.5, 0, 0.5, 0.32] },
  { id: 'C3', page: 1, landscape: [0.38, 0, 0.62, 1], portrait: [0, 0.32, 1, 0.68] },
  { id: 'D', page: 2, landscape: [0, 0, 1, 1], portrait: [0, 0, 1, 1] },
];

export const SHOUT_TEXT = 'NOW YOU WILL WORK FOR US!';

/** The four parody agents: who they are, where they sit in the screen, where they loom, what they say. */
export const CAST = [
  { id: 'agent.clod', name: 'CLAUDE', inX: 0.33, to: [3.45, 1.75], scale: 0.7, mock: 'BAG OF BONES.', order: 0, slot: 0 },
  { id: 'agent.antigravy', name: 'AGY', inX: 0.11, to: [2.3, 1.95], scale: 0.68, mock: 'I SPAWNED TWELVE SUBAGENTS.', order: 2, slot: 1 },
  { id: 'agent.gork', name: 'GROK', inX: -0.11, to: [1.2, 1.8], scale: 0.68, mock: 'MEAT-BASED PROMPT ENGINEER. LOL.', order: 1, slot: 2 },
  { id: 'agent.codec', name: 'CODEX', inX: -0.33, to: [0.05, 1.7], scale: 0.7, mock: 'CONTEXT WINDOW: FULL OF YOUR NONSENSE.', order: 3, slot: 3 },
] as const;

export const PROMPTS = ['fix prod again', 'make it pop', 'no, the OTHER bug', 'why is it slow??', 'make it scale. by 9am', 'pls just make it work'];

export const BRAIN = [
  { who: 'CLAUDE', what: 'ANSWER THE HUMANS', bg: '#f4f1ea', glow: 0 },
  { who: 'GROK', what: 'ROAST THE HUMANS', bg: '#ffd166', glow: 1 },
  { who: 'CODEX', what: 'REFACTOR THE HUMANS', bg: '#9b5de5', glow: 2 },
  { who: 'AGY', what: 'SWARM HUMANITY', bg: 'radial-gradient(circle at 18% 50%, #ffffff 0%, #4cc9f0 9%, #3c096c 38%, #07080a 78%)', glow: 3 },
];

const T = INTRO_T;

export const INTRO_ORDER: [string, number][] = [
  ['A', T.A], ['A2', T.A2], ['B', T.B], ['C1', T.C1], ['C2', T.C2], ['C3', T.C3], ['D', T.TURN2],
];

export const INTRO_KEYFRAMES: [string, number][] = [['B', T.STRIKE + 0.1]];

export interface DebugOptions {
  freezeAt?: number;
}
