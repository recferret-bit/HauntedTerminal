import type { KernelEvent } from '../contracts/events.js';
import { dialogueEvent } from './dialogue.js';
import type { World } from './entities.js';
import { answerMatches } from './lab-checks.js';
import type { LabConfig, LabLevelState, LabRiddle } from './lab-types.js';
import { empty, out } from './play.js';
import type { Step } from './shell.js';
import { absPath, hasExec, lookup, type VNode } from './tree.js';

const riddleOn = (lab: LabConfig | null, node: VNode): LabRiddle | undefined => {
  if (!lab || lab.content.riddles.length === 0) return undefined;
  const path = absPath(node);
  return lab.content.riddles.find((r) => r.path === path);
};

const speech = (node: VNode, r: LabRiddle, wrong: boolean, text: string) =>
  dialogueEvent({
    obstacleId: node.name,
    speaker: r.speaker,
    style: wrong ? 'JAGGED_SCREAM' : 'COMIX_CLASSIC',
    mood: wrong ? 'mocking' : 'cryptic',
    text,
    tokens: r.tokens,
    anchor: node.id,
  });

/** `cat riddle.sock`: the socket speaks its prompt, or null when no lab riddle owns this socket. */
export function labRiddleRead(lab: LabConfig | null, node: VNode, onRead?: () => void): Step | null {
  const r = riddleOn(lab, node);
  if (!r) return null;
  onRead?.();
  const ev = speech(node, r, false, r.prompt);
  return out(`${ev.payload.ansiTerminalBanner}${r.prompt}\n`, [ev]);
}

const isLocked = (n: VNode): boolean => (n.kind === 'dir' ? !hasExec(n) : (n.mode & 0o444) === 0);

function openDoor(root: VNode, path: string, events: KernelEvent[]): number | null {
  const door = lookup(root, path);
  if (!door) return null;
  if (isLocked(door)) {
    const old = door.mode;
    door.mode |= door.kind === 'dir' ? 0o755 : 0o644;
    events.push({ type: 'INODE_MODE_CHANGED', inodeId: door.id, oldMode: old, newMode: door.mode });
  }
  return door.id;
}

/** `echo answer > riddle.sock`: solves or emits next hint, or null when no lab riddle owns this socket. */
export function labRiddleWrite(
  lab: LabConfig | null,
  state: LabLevelState,
  root: VNode,
  world: World,
  node: VNode,
  data: string,
  onSolved?: (events: KernelEvent[]) => void,
  onInput?: (answer: string) => void,
): Step | null {
  const r = riddleOn(lab, node);
  if (!r) return null;
  const answer = data.trim();
  onInput?.(answer);
  const events: KernelEvent[] = [];
  if (answerMatches(answer, r.answer)) {
    state.solved.add(r.id);
    const opened = r.opens ? openDoor(root, r.opens, events) : null;
    events.push({
      type: 'PUZZLE_DOOR_RESOLVED',
      socketInodeId: node.id,
      unlockedInodeId: opened ?? node.id,
      solvedViaInput: answer,
    });
    world.sync(events);
    onSolved?.(events);
    return out(`${r.success}\n`, events);
  }
  const tries = (state.attempts[r.id] ?? 0) + 1;
  state.attempts[r.id] = tries;
  const hint = r.hints[Math.min(tries, r.hints.length) - 1] ?? 'That is not the phrase.';
  const ev = speech(node, r, true, hint);
  return { ...empty(1, `${ev.payload.ansiTerminalBanner}${hint}\n`), events: [ev] };
}
