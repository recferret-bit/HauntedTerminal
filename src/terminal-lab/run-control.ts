import { createStateMachine, type TransitionTable } from '../contracts/state-machine.js';
import type { LabStep } from './lab-types.js';
import { runSteps, type LabDriver, type StepResult, type StopReason } from './runner.js';

type RunPhase = 'idle' | 'running';
type RunEvent = 'START' | 'STOP';

const RUN_TRANSITIONS: TransitionTable<RunPhase, RunEvent> = {
  idle: { START: 'running' },
  running: { STOP: 'idle' },
};

export interface RunControlDeps {
  driver: () => LabDriver;
  steps: () => LabStep[];
  /** Something the panels show changed. */
  onChange: () => void;
  /** Words for the status line. */
  say: (text: string) => void;
}

const REASONS: Record<StopReason, string> = {
  end: 'script finished',
  failure: 'stopped: a step failed',
  breakpoint: 'stopped at a breakpoint',
  cancelled: 'paused',
};

/**
 * Where the script is: the next step to run (`cursor`), what each step answered, breakpoints, and Record.
 * It owns no game state. A reset reloads the level; a replay runs the steps before the cursor again after the scene changed.
 */
export class RunControl {
  readonly results = new Map<number, StepResult>();
  readonly breakpoints = new Set<number>();
  cursor = 0;
  recording = false;
  private readonly phase = createStateMachine({ initial: 'idle', transitions: RUN_TRANSITIONS });
  private epoch = 0;

  get running(): boolean {
    return this.phase.state === 'running';
  }

  constructor(private readonly deps: RunControlDeps) {}

  /** Every result so far, in step order. */
  sorted(): StepResult[] {
    return [...this.results.values()].sort((a, b) => a.index - b.index);
  }

  /** A fresh level, then every step (breakpoints honoured): what a test or the CLI calls "run the lab". */
  async runFresh(): Promise<StepResult[]> {
    await this.reset();
    await this.runAll();
    return this.sorted();
  }

  private get prev(): StepResult | null {
    return this.results.get(this.cursor - 1) ?? null;
  }

  /** Stops whatever is running, without touching the cursor or the results. */
  pause(): void {
    this.epoch += 1;
    if (this.phase.send('STOP')) {
      this.deps.onChange();
    }
  }

  /** Back to the first step on a fresh level. */
  async reset(): Promise<void> {
    this.pause();
    this.results.clear();
    this.cursor = 0;
    await this.deps.driver().reset();
    this.deps.say('reset: a fresh level');
    this.deps.onChange();
  }

  private async inEpoch(
    what: string,
    work: (cancelled: () => boolean, recordStep: (r: StepResult, bumpCursor: boolean) => void) => Promise<void>,
  ): Promise<void> {
    const epoch = ++this.epoch;
    this.phase.send('START');
    this.deps.onChange();
    const active = () => this.epoch === epoch;
    const recordStep = (r: StepResult, bumpCursor: boolean) => {
      if (!active()) return;
      this.results.set(r.index, r);
      if (bumpCursor) this.cursor = r.index + 1;
      this.deps.onChange();
    };
    try {
      await work(() => !active(), recordStep);
    } catch (err) {
      if (active()) this.deps.say(`✕ the ${what} was interrupted: ${(err as Error).message}`);
    } finally {
      if (active()) {
        this.phase.send('STOP');
        this.deps.onChange();
      }
    }
  }

  /** Runs steps from the cursor up to (not including) `to`, or all of them. */
  private async advance(to: number | undefined, label: string): Promise<void> {
    if (this.running) return;
    await this.inEpoch('run', async (cancelled, recordStep) => {
      const outcome = await runSteps(this.deps.driver(), this.deps.steps(), {
        from: this.cursor,
        to,
        breakpoints: this.breakpoints,
        prev: this.prev,
        cancelled,
        onStep: (r) => recordStep(r, true),
      });
      if (cancelled()) return;
      this.cursor = outcome.next;
      const failed = outcome.results.find((r) => !r.ok);
      this.deps.say(failed ? `✕ step ${failed.index + 1} failed: ${failed.failures[0]}` : `${label}: ${REASONS[outcome.reason]}`);
    });
  }

  step(): Promise<void> {
    return this.advance(this.cursor + 1, 'step');
  }

  runAll(): Promise<void> {
    return this.advance(undefined, 'run');
  }

  /** Runs up to and including step `index`. */
  runTo(index: number): Promise<void> {
    return this.advance(index + 1, 'run to step');
  }

  /** After a scene change reloaded the level: put it back where the script was, ignoring expects. */
  async replay(): Promise<void> {
    const upTo = this.cursor;
    if (upTo === 0) return;
    this.deps.say(`replaying ${upTo} step${upTo === 1 ? '' : 's'}…`);
    await this.inEpoch('replay', async (cancelled, recordStep) => {
      const outcome = await runSteps(this.deps.driver(), this.deps.steps(), {
        to: upTo,
        stopOnFail: false,
        cancelled,
        onStep: (r) => recordStep(r, false),
      });
      if (cancelled()) return;
      const bad = outcome.results.filter((r) => !r.ok).length;
      this.deps.say(outcome.reason === 'cancelled' ? 'replay cancelled' : bad ? `replayed ${upTo}: ${bad} step(s) differ from their expects` : `replayed ${upTo} step${upTo === 1 ? '' : 's'}`);
    });
  }

  toggleBreakpoint(index: number): void {
    if (!this.breakpoints.delete(index)) this.breakpoints.add(index);
    this.deps.onChange();
  }

  /** Record appends at the end, so it only makes sense when every step has run. */
  toggleRecord(): void {
    if (!this.recording && this.cursor !== this.deps.steps().length) {
      this.deps.say('Record appends to the end of the script: run the rest of it first (▶ Run all)');
      return;
    }
    this.recording = !this.recording;
    this.deps.say(this.recording ? 'recording: lines you type and ticks you press become steps' : 'recording stopped');
    this.deps.onChange();
  }

  /** A line typed in the game terminal, or a tick pressed, while recording. */
  record(step: LabStep): void {
    if (!this.recording) return;
    const steps = this.deps.steps();
    const last = steps.at(-1);
    if (step.op === 'tick' && last?.op === 'tick' && !last.expect && !last.note) last.n = (last.n ?? 1) + 1;
    else steps.push(step);
    this.cursor = steps.length;
    this.deps.onChange();
  }

  /** A different lab was opened: nothing that was recorded about the last one applies. */
  forget(): void {
    this.pause();
    this.results.clear();
    this.breakpoints.clear();
    this.cursor = 0;
    this.recording = false;
  }

  /** Steps were removed or reordered: indexes in the results and breakpoints no longer mean the same steps. */
  invalidate(): void {
    this.results.clear();
    this.breakpoints.clear();
    this.cursor = Math.min(this.cursor, this.deps.steps().length);
  }
}
