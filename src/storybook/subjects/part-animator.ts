import type { AnimState } from '../../procgen/anim/states.js';
import type { BuiltModel } from '../../procgen/runtime/build.js';
import { createAnimator, createAnimMaterialTint, type ModelAnimator } from '../../procgen/runtime/index.js';
import type { StateId } from '../domain/options.js';

/**
 * How the lab's clock reaches an animator.
 *   run   the clock is live; a state starts when it is selected.
 *   seek  the clock is frozen (`?t=`): `time` is seconds into the state, so a screenshot repeats.
 *   rest  animation is off: the authored pose (state `normal`) or one held frame of the state.
 */
export type ClockMode = 'run' | 'seek' | 'rest';

/** What the lab needs from an animator: put the subject in the pose of `state` at `time`. */
export interface PartAnimator {
  apply(time: number, state: StateId, mode: ClockMode): void;
  dispose(): void;
}

/** Name shown in the lab's stats and info column. */
export const ANIMATOR_SOURCE = 'src/procgen/runtime createAnimator';

const ONE_SHOT: ReadonlySet<StateId> = new Set<StateId>(['attack', 'hit', 'death', 'revealed']);
/** Seconds between replays of a one-shot state while the clock runs. */
const REPLAY_EVERY = 1.8;
/** `anim=0` with a state selected: the frame held, this many seconds into the state. */
const REST_FRAME = 0.5;

/** The one place the lab meets the real animator: it maps the lab's clock onto `createAnimator`. */
class ClockedAnimator implements PartAnimator {
  private readonly anim: ModelAnimator;
  private wanted: AnimState = 'idle';
  private enteredAt = 0;
  private last: number | null = null;

  constructor(model: BuiltModel) {
    this.anim = createAnimator(model, { onTint: createAnimMaterialTint(model) });
  }

  apply(time: number, state: StateId, mode: ClockMode): void {
    const target: AnimState = state === 'normal' ? 'idle' : state;
    if (mode === 'rest' && target === 'idle') this.applyAuthoredPose();
    else if (mode === 'run') this.applyLive(time, state, target);
    else this.applyHeld(target, mode === 'rest' ? REST_FRAME : time);
  }

  dispose(): void {
    this.anim.dispose();
  }

  private applyAuthoredPose(): void {
    this.anim.setEnabled(false);
    this.last = null;
  }

  /** Deterministic: re-enter the state and jump to the frame. */
  private applyHeld(target: AnimState, at: number): void {
    this.anim.setEnabled(true);
    this.anim.setState(target);
    this.anim.seek(at);
    this.wanted = target;
    this.last = null;
  }

  private applyLive(time: number, state: StateId, target: AnimState): void {
    this.anim.setEnabled(true);
    const replay = ONE_SHOT.has(state) && time - this.enteredAt > REPLAY_EVERY;
    if (target !== this.wanted || replay || this.last === null) {
      if (target !== this.wanted || replay || this.anim.state !== target) this.anim.setState(target);
      this.wanted = target;
      this.enteredAt = time;
      this.last = time;
    }
    this.anim.update(Math.max(0, time - this.last));
    this.last = time;
  }
}

export function createPartAnimator(model: BuiltModel): PartAnimator {
  return new ClockedAnimator(model);
}
