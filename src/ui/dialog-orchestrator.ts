import type { KernelEvent } from '../contracts/events.js';
import { createStateMachine, type StateMachine, type TransitionTable } from '../contracts/state-machine.js';
import {
  cleanSpeakerId,
  mountDialogBox,
  type DialogBox,
  type DialogLine,
  type DialogMood,
  type DialogPriority,
} from './dialog-box.js';
import type { DrawPortrait } from './dom-lite.js';
import { AGENTS, type TutorialCard } from './tutorial.js';

export type DialogSocketMode = 'free' | 'socket_locked';
export type DialogSocketEvent = 'LOCK' | 'UNLOCK' | 'CLEAR';

export const DIALOG_SOCKET_TRANSITIONS: TransitionTable<DialogSocketMode, DialogSocketEvent> = {
  free: { LOCK: 'socket_locked' },
  socket_locked: { UNLOCK: 'free', CLEAR: 'free' },
};

export function createDialogSocketMachine(): StateMachine<DialogSocketMode, DialogSocketEvent> {
  return createStateMachine({ initial: 'free', transitions: DIALOG_SOCKET_TRANSITIONS });
}

type AgentSpeakerId = Extract<KernelEvent, { type: 'AGENT_TAUNT' }>['agent'];

/** Canonical procgen model id per speaker for unified corner dialog portraits. */
const AGENT_MODELS: Record<AgentSpeakerId, string> = {
  clod: 'agent.clod',
  gork: 'agent.gork',
  codec: 'agent.codec',
  antigravy: 'agent.antigravy',
  kiro: 'npc.kiro_ghost',
};

export interface DialogOrchestratorOptions {
  tutorial?: TutorialCard;
  onRightDialogOpen?: () => void;
  onDialogOpen?: (line: DialogLine, side: 'left' | 'right') => void;
  onClear?: () => void;
}

export interface DialogOrchestratorStats {
  shown: number;
  maxConcurrent: number;
  maxRightConcurrent: number;
  activeSide: 'left' | 'right' | null;
  pending: number;
  socketOpen: boolean;
}

export interface DialogOrchestrator {
  readonly box: DialogBox;
  handleEvent(ev: KernelEvent): void;
  enqueue(line: DialogLine): void;
  clear(): void;
  stats(): DialogOrchestratorStats;
}

const MAX_CHATTER_QUEUE = 3;
const MAX_TEXT_LEN = 240;
const SPEAKER_PREFIX_RX =
  /^(?:\[(?:KIRO(?:\s+GHOST|\.D)?|ADVISOR\s+KIRO(?:\.D)?|OLD\s+CODER(?:\s*\([^)]+\))?|DAD(?:\.TTY)?|ANTI-?GRAVY|CLOD|GORK|CODEC)\]|(?:ADVISOR\s+KIRO(?:\.D)?(?:\s*\([^)]+\))?|KIRO(?:\s+GHOST|\.D)?(?:\s*\([^)]+\))?|OLD\s+CODER(?:\s*\([^)]+\))?|DAD(?:\.TTY)?|ANTI-?GRAVY|CLOD|GORK|CODEC))\s*:\s*/i;

/** Removes redundant leading speaker tags (`KIRO.D: "..."`, `CLOD: ...`) since the dialog box displays the speaker header. */
export function stripSpeakerPrefix(raw: string): string {
  const trimmed = String(raw ?? '').trim();
  const stripped = trimmed.replace(SPEAKER_PREFIX_RX, '').trim();
  if (stripped.length >= 2 && stripped.startsWith('"') && stripped.endsWith('"')) {
    return stripped.slice(1, -1).trim();
  }
  return stripped;
}

/** How long each battle-intro line holds (extended 3x alongside dialog durations). */
const BATTLE_LINE_MS = 4800;

function toAgentDialogLine(ev: Extract<KernelEvent, { type: 'AGENT_TAUNT' }>): DialogLine | null {
  const agent: AgentSpeakerId = ev.agent in AGENT_MODELS ? ev.agent : 'clod';
  const text = stripSpeakerPrefix(ev.text);
  if (!text) return null;
  const mood: DialogMood = ['laugh', 'order', 'smug', 'annoyed'].includes(ev.mood) ? ev.mood : 'smug';
  const priority: DialogPriority = agent === 'kiro' || mood === 'order' ? 'prompt' : 'chatter';
  return {
    speaker: agent,
    name: AGENTS[agent]?.name ?? agent.toUpperCase(),
    model: ev.model || AGENT_MODELS[agent],
    text,
    holdMs: (2600 + Math.min(900, text.length * 12)) * 3,
    mood,
    priority,
  };
}

function countOpenDialogs(parent: HTMLElement, selector: string): number {
  if (typeof parent.querySelectorAll === 'function') {
    return parent.querySelectorAll(selector).length;
  }
  return parent.querySelector(selector) ? 1 : 0;
}

/**
 * Single orchestrator for all in-game corner dialogs (`DIALOG_BOX`, `AGENT_TAUNT`), coordinating left/right
 * turn-taking (`maxConcurrent <= 1`), `#tutorial-card` pass-through,
 * and chatter yielding while an in-room 3D socket speech balloon is open.
 */
export function mountDialogOrchestrator(
  parent: HTMLElement,
  drawPortrait: DrawPortrait,
  opts: DialogOrchestratorOptions = {},
): DialogOrchestrator {
  const socketFsm = createDialogSocketMachine();
  let shown = 0;
  let maxConcurrent = 0;
  let maxRightConcurrent = 0;

  const box = mountDialogBox(parent, drawPortrait, {
    canStartLine: (line) => !(socketFsm.state === 'socket_locked' && (line.priority ?? 'script') === 'chatter'),
    onOpen: (line, side) => {
      shown += 1;
      opts.onDialogOpen?.(line, side);
      if (side === 'right') opts.onRightDialogOpen?.();
      const openAll = Math.max(1, countOpenDialogs(parent, '.dialog-box.open'));
      const openRight = side === 'right' ? Math.max(1, countOpenDialogs(parent, '.dialog-box.side-right.open')) : 0;
      maxConcurrent = Math.max(maxConcurrent, openAll);
      maxRightConcurrent = Math.max(maxRightConcurrent, openRight);
    },
  });

  const enqueue = (raw: DialogLine): void => {
    const text = String(raw.text ?? '').trim().slice(0, MAX_TEXT_LEN);
    if (!text) return;
    const priority: DialogPriority = raw.priority ?? 'script';
    const line: DialogLine = { ...raw, text, priority };

    const queued = box.queuedLines();
    const last = queued[queued.length - 1] ?? box.activeLine();
    if (last && cleanSpeakerId(last.speaker) === cleanSpeakerId(line.speaker) && last.text === line.text) {
      return;
    }

    if (priority === 'script' || priority === 'prompt') {
      box.filterQueue((q) => (q.priority ?? 'script') !== 'chatter');
      if (box.activeLine()?.priority === 'chatter') box.shortenHold(320);
    } else {
      const chatterCount = queued.filter((q) => (q.priority ?? 'script') === 'chatter').length;
      if (chatterCount >= MAX_CHATTER_QUEUE) {
        let toDrop = chatterCount - MAX_CHATTER_QUEUE + 1;
        box.filterQueue((q) => {
          if ((q.priority ?? 'script') === 'chatter' && toDrop > 0) {
            toDrop -= 1;
            return false;
          }
          return true;
        });
      }
    }

    box.show(line);
  };

  const clear = (): void => {
    socketFsm.send('CLEAR');
    box.clear();
    opts.onClear?.();
  };

  return {
    box,
    enqueue,
    clear,
    handleEvent(ev) {
      switch (ev.type) {
        case 'DIALOG_BOX':
          enqueue({
            speaker: ev.speaker,
            name: ev.name,
            model: ev.model,
            text: ev.text,
            holdMs: ev.holdMs,
            priority: 'script',
          });
          break;
        case 'AGENT_TAUNT': {
          const line = toAgentDialogLine(ev);
          if (line) enqueue(line);
          break;
        }
        case 'BATTLE_STARTED':
          // The battle intro (INTRO_SEC, 10 s): the agent's taunt, then Kiro's advice, ahead of any chatter.
          enqueue({ speaker: ev.agent, name: AGENTS[ev.agent]?.name ?? ev.agent.toUpperCase(), model: ev.model, text: ev.taunt, holdMs: BATTLE_LINE_MS, mood: 'laugh', priority: 'script' });
          enqueue({ speaker: 'kiro', name: AGENTS.kiro?.name ?? 'KIRO.D', model: AGENT_MODELS.kiro, text: ev.advice, holdMs: BATTLE_LINE_MS, priority: 'script' });
          break;
        case 'TUTORIAL_STEP':
          opts.tutorial?.step(ev);
          break;
        case 'OBSTACLE_DIALOGUE_RENDERED':
          socketFsm.send('LOCK');
          if (box.activeLine()?.priority === 'chatter') box.shortenHold(200);
          break;
        case 'PUZZLE_DOOR_RESOLVED':
        case 'ROOM_TRANSITION':
          socketFsm.send('UNLOCK');
          box.wake();
          break;
        case 'FLOOR_ENTERED':
          clear();
          break;
        default:
          break;
      }
    },
    stats: () => ({
      shown,
      maxConcurrent,
      maxRightConcurrent,
      activeSide: box.activeSide(),
      pending: box.pending(),
      socketOpen: socketFsm.state === 'socket_locked',
    }),
  };
}
