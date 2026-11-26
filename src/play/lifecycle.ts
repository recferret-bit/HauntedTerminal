import { createStateMachine, type StateMachine, type TransitionTable } from '../contracts/state-machine.js';

export const PLAY_PHASES = ['boot', 'intro', 'play', 'outro', 'stats'] as const;
export type Phase = (typeof PLAY_PHASES)[number];

/** Every reason the game clock is stopped. Input is blocked for all of them except a hidden tab. */
export type PauseReason = 'intro' | 'card' | 'transition' | 'outro' | 'ended' | 'cinematic' | 'hidden' | 'reveal';

export type PlayPhaseEvent =
  | 'ENTER_INTRO'
  | 'BEGIN_PLAY'
  | 'BEGIN_ENDING'
  | 'FINISH_OUTRO'
  | 'PLAY_AGAIN'
  | 'SWAP_LAB';

export const PLAY_PHASE_TRANSITIONS: TransitionTable<Phase, PlayPhaseEvent> = {
  boot: { ENTER_INTRO: 'intro', BEGIN_PLAY: 'play', SWAP_LAB: 'play' },
  intro: { BEGIN_PLAY: 'play', SWAP_LAB: 'play' },
  play: { BEGIN_ENDING: 'outro', ENTER_INTRO: 'intro', PLAY_AGAIN: 'intro', SWAP_LAB: 'play' },
  outro: { FINISH_OUTRO: 'stats', SWAP_LAB: 'play' },
  stats: { PLAY_AGAIN: 'intro', ENTER_INTRO: 'intro', SWAP_LAB: 'play' },
};

const OVERLAY_STORM_BLOCKERS: readonly PauseReason[] = ['cinematic', 'intro', 'transition', 'outro', 'ended', 'hidden'];
const MODAL_BLOCKERS: readonly PauseReason[] = ['intro', 'card', 'transition', 'outro', 'ended', 'cinematic', 'reveal'];

export interface PlayOverlayState {
  menuOpen: boolean;
  manualOpen: boolean;
  mapOpen: boolean;
  hintOpen: boolean;
  editorOpen: boolean;
  statsOpen: boolean;
}

export interface PlayDerivedState {
  clockPaused: boolean;
  stormPaused: boolean;
  shellBlocked: boolean;
  hideHud: boolean;
  closeOverlays: boolean;
  closeManual: boolean;
}

export interface PlayLifecycle {
  readonly machine: StateMachine<Phase, PlayPhaseEvent>;
  readonly reasons: Set<PauseReason>;
  phase(): Phase;
  send(event: PlayPhaseEvent): boolean;
  addReason(reason: PauseReason): void;
  deleteReason(reason: PauseReason): void;
  hasReason(reason: PauseReason): boolean;
  isEndingStarted(): boolean;
  beginEndingHold(): boolean;
  resetForPlayAgain(): void;
  resetForLabSwap(hidden: boolean): void;
  canOpenManualOrMap(): boolean;
  canOpenHint(statsOpen: boolean): boolean;
  canOpenEscMenu(statsOpen: boolean): boolean;
  canRestartFloor(): boolean;
  derive(overlays: Pick<PlayOverlayState, 'manualOpen' | 'mapOpen'>): PlayDerivedState;
}

export function createPlayLifecycle(initiallyHidden = false): PlayLifecycle {
  const reasons = new Set<PauseReason>(initiallyHidden ? ['intro', 'hidden'] : ['intro']);
  let endingStarted = false;
  const machine = createStateMachine<Phase, PlayPhaseEvent>({
    initial: 'boot',
    transitions: PLAY_PHASE_TRANSITIONS,
  });

  const anyReason = (list: readonly PauseReason[]): boolean => list.some((r) => reasons.has(r));

  return {
    machine,
    reasons,
    phase: () => machine.state,
    send: (event) => machine.send(event),
    addReason(reason) {
      reasons.add(reason);
    },
    deleteReason(reason) {
      reasons.delete(reason);
    },
    hasReason: (reason) => reasons.has(reason),
    isEndingStarted: () => endingStarted,
    beginEndingHold() {
      if (endingStarted) return false;
      endingStarted = true;
      reasons.add('ended');
      return true;
    },
    resetForPlayAgain() {
      reasons.delete('card');
      reasons.delete('transition');
      reasons.delete('reveal');
      reasons.delete('outro');
      reasons.delete('ended');
      reasons.add('intro');
      endingStarted = false;
      machine.send('PLAY_AGAIN');
    },
    resetForLabSwap(hidden) {
      reasons.clear();
      if (hidden) reasons.add('hidden');
      endingStarted = false;
      machine.send('SWAP_LAB');
    },
    canOpenManualOrMap() {
      const p = machine.state;
      return (p === 'play' && !endingStarted) || p === 'stats';
    },
    canOpenHint(statsOpen) {
      return machine.state === 'play' && !endingStarted && !statsOpen && !anyReason(MODAL_BLOCKERS);
    },
    canOpenEscMenu(statsOpen) {
      return machine.state === 'play' && !anyReason(MODAL_BLOCKERS) && !statsOpen;
    },
    canRestartFloor() {
      return machine.state === 'play' && !reasons.has('card') && !reasons.has('transition');
    },
    derive(overlays) {
      const p = machine.state;
      const nonHidden = [...reasons].some((r) => r !== 'hidden');
      const nonHiddenNonIntro = [...reasons].some((r) => r !== 'hidden' && r !== 'intro');
      return {
        clockPaused: reasons.size > 0,
        stormPaused: p !== 'play' || anyReason(OVERLAY_STORM_BLOCKERS),
        shellBlocked: nonHidden || overlays.manualOpen || overlays.mapOpen,
        hideHud: p === 'boot' || p === 'intro' || reasons.has('reveal') || reasons.has('card') || reasons.has('cinematic'),
        closeOverlays: nonHiddenNonIntro,
        closeManual: reasons.has('cinematic') || reasons.has('outro') || reasons.has('ended'),
      };
    },
  };
}
