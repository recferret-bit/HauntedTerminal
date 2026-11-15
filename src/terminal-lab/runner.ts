import type { KernelEvent } from '../contracts/events.js';
import { matchesPattern } from '../chapters/session-lab-checks.js';
import type { LabInjection, LabInspect, LabNode } from '../chapters/session-lab-types.js';
import { impliedFiles } from './lab-pack.js';
import { speechOutput } from './lab-steps.js';
import type { LabExpect, LabStep } from './lab-types.js';

/**
 * Runs lab script steps against a `LabDriver`. The browser drives the game iframe (`frame-driver.ts`); the Node harness drives
 * a `ChapterSession` directly (`node-driver.ts`). The runner has no DOM and no game rules, so both give the same transcript.
 */
export interface DriverResult {
  /** stdout and stderr in the order the terminal printed them. */
  output: string;
  stderr: string;
  /** Exit status of the last command; undefined for steps that run no command. */
  code?: number;
  events: KernelEvent[];
}

export interface LabDriver {
  /** A fresh level: the state a lab starts in. */
  reset(): Promise<void>;
  run(line: string): Promise<DriverResult>;
  tick(): Promise<DriverResult>;
  /** Puts events on the stage and prints `print` in the terminal. The game rules do not change. */
  emit(events: KernelEvent[], print?: string): Promise<DriverResult>;
  inject?(what: LabInjection): Promise<DriverResult>;
  wait(ms: number): Promise<void>;
  inspect(): Promise<LabInspect>;
}

export interface StepResult {
  index: number;
  op: LabStep['op'];
  /** One line saying what ran: `$ ls`, `tick x3`, `emit AGENT_TAUNT`. */
  label: string;
  ok: boolean;
  failures: string[];
  output: string;
  stderr: string;
  code?: number;
  eventTypes: string[];
  hp: number;
  maxHp: number;
  /** Damage absorbed by this step alone, and in total so far. */
  absorbed: number;
  absorbedTotal: number;
  cwd: string;
  enemiesLeft: number;
}

export type StopReason = 'end' | 'failure' | 'breakpoint' | 'cancelled';

export interface RunOptions {
  /** First step to run (default 0). */
  from?: number;
  /** Stop before this index (default: all steps). */
  to?: number;
  /** Stop after a failed step (default true). Replays set it false. */
  stopOnFail?: boolean;
  /** Stop before running a step in this set, except the one the run starts on. */
  breakpoints?: ReadonlySet<number>;
  cancelled?: () => boolean;
  onStep?: (result: StepResult) => void;
  /** The step before `from`, for a standalone `expect` that reads its output. */
  prev?: StepResult | null;
}

export interface RunOutcome {
  results: StepResult[];
  reason: StopReason;
  /** Index of the next step to run. */
  next: number;
}

/** The shape of a driver answer, from what a world tick returned. */
export function tickResult(r: { output: string; stderr?: string; events: KernelEvent[] }): DriverResult {
  return { output: r.output, stderr: r.stderr ?? '', events: r.events };
}

/** Emitted events change no game state: the events, and any line printed with them, are the whole answer. */
export function emitResult(events: KernelEvent[], print = ''): DriverResult {
  return { output: print, stderr: '', events };
}

const EMPTY: DriverResult = { output: '', stderr: '', events: [] };

function findByName(tree: LabNode, name: string): LabNode | null {
  if (tree.name === name && tree.kind !== 'dir') return tree;
  for (const child of tree.children ?? []) {
    const hit = findByName(child, name);
    if (hit) return hit;
  }
  return null;
}

function findNode(tree: LabNode, path: string): LabNode | null {
  const parts = path.split('/').filter(Boolean);
  let cur: LabNode | undefined = tree;
  for (const part of parts) cur = cur?.children?.find((c) => c.name === part);
  return cur ?? null;
}

interface View {
  output: string;
  stderr: string;
  code: number;
  eventTypes: string[];
}

function checkText(failures: string[], what: string, text: string, pattern: string | undefined): void {
  if (pattern !== undefined && !matchesPattern(text, pattern)) failures.push(`${what} does not match ${pattern}`);
}

/** What a step expected and did not get. Empty means it passed. */
function failuresOf(expect: LabExpect, view: View, state: LabInspect, absorbed: number): string[] {
  const out: string[] = [];
  if (expect.code !== undefined && view.code !== expect.code) out.push(`exit code ${view.code}, expected ${expect.code}`);
  checkText(out, 'stdout', view.output, expect.stdout);
  checkText(out, 'stderr', view.stderr, expect.stderr);
  for (const type of expect.events ?? []) if (!view.eventTypes.includes(type)) out.push(`event ${type} did not happen`);
  for (const type of expect.noEvents ?? []) if (view.eventTypes.includes(type)) out.push(`event ${type} happened`);
  if (expect.cwd !== undefined && state.cwd !== expect.cwd) out.push(`cwd is ${state.cwd}, expected ${expect.cwd}`);
  if (expect.enemiesLeft !== undefined && state.enemiesLeft !== expect.enemiesLeft) out.push(`${state.enemiesLeft} enemies left, expected ${expect.enemiesLeft}`);
  if (expect.absorbed?.min !== undefined && absorbed < expect.absorbed.min) out.push(`absorbed ${absorbed}, expected at least ${expect.absorbed.min}`);
  if (expect.absorbed?.max !== undefined && absorbed > expect.absorbed.max) out.push(`absorbed ${absorbed}, expected at most ${expect.absorbed.max}`);
  if (expect.file) {
    const node = findNode(state.tree, expect.file.path);
    if (expect.file.absent && node) out.push(`${expect.file.path} exists`);
    if (!expect.file.absent && !node) out.push(`${expect.file.path} does not exist`);
    if (node && expect.file.contains !== undefined && !matchesPattern(node.content ?? '', expect.file.contains)) out.push(`${expect.file.path} does not contain ${expect.file.contains}`);
  }
  return out;
}

function merge(parts: DriverResult[]): DriverResult {
  return {
    output: parts.map((p) => p.output).join(''),
    stderr: parts.map((p) => p.stderr).join(''),
    code: parts.at(-1)?.code,
    events: parts.flatMap((p) => p.events),
  };
}

/** Does what the step says and returns what it printed. A standalone `expect` does nothing. */
async function perform(driver: LabDriver, step: LabStep): Promise<{ label: string; res: DriverResult }> {
  switch (step.op) {
    case 'run':
      return { label: `$ ${step.line}`, res: await driver.run(step.line) };
    case 'tick': {
      const n = Math.max(1, step.n ?? 1);
      const parts: DriverResult[] = [];
      for (let i = 0; i < n; i += 1) parts.push(await driver.tick());
      return { label: n === 1 ? 'tick' : `tick x${n}`, res: merge(parts) };
    }
    case 'emit':
      return { label: `emit ${step.event.type}`, res: await driver.emit([step.event]) };
    case 'say':
    case 'taunt':
    case 'dialogue': {
      const inode = (await driver.inspect()).tree;
      const out = speechOutput(step, (socket) => findByName(inode, socket)?.id ?? 0);
      return { label: step.op === 'say' ? `say ${step.agent}` : step.op === 'taunt' ? 'taunt' : `dialogue ${step.speaker}`, res: await driver.emit(out.events, out.print) };
    }
    case 'inject': {
      if (!driver.inject) throw new Error('this driver cannot inject into a running level');
      const what: LabInjection = step.enemy
        ? { files: impliedFiles({ op: 'enemy', ...step.enemy }), enemy: step.enemy }
        : { files: impliedFiles({ op: 'pickup', ...(step.pickup as NonNullable<typeof step.pickup>) }), pickup: step.pickup };
      return { label: `inject ${step.enemy ? `enemy ${step.enemy.id}` : `pickup ${step.pickup?.id ?? ''}`}`.trim(), res: await driver.inject(what) };
    }
    case 'wait':
      await driver.wait(step.ms);
      return { label: `wait ${step.ms} ms`, res: EMPTY };
    case 'expect':
      return { label: 'expect', res: EMPTY };
    case 'check':
      return { label: `check ${step.id}${step.is === 'fail' ? ' is fail' : ''}`, res: EMPTY };
  }
}

async function runStep(driver: LabDriver, step: LabStep, index: number, prev: StepResult | null): Promise<StepResult> {
  const before = await driver.inspect();
  let label: string = step.op;
  let res = EMPTY;
  const failures: string[] = [];
  try {
    ({ label, res } = await perform(driver, step));
  } catch (err) {
    failures.push(`could not run: ${(err as Error).message}`);
  }
  const after = await driver.inspect();
  const absorbed = after.absorbedTotal - before.absorbedTotal;
  // A standalone expect reads what the step before it printed.
  const view: View =
    step.op === 'expect' && prev
      ? { output: prev.output, stderr: prev.stderr, code: prev.code ?? 0, eventTypes: prev.eventTypes }
      : { output: res.output, stderr: res.stderr, code: res.code ?? 0, eventTypes: res.events.map((e) => e.type) };
  if (step.op === 'check') {
    const goal = after.goals.find((t) => t.id === step.id);
    const want = step.is ?? 'pass';
    if (!goal) failures.push(`no task, check or riddle "${step.id}"`);
    else if (goal.done !== (want === 'pass')) failures.push(`"${step.id}" is ${goal.done ? 'done' : 'not done'}, expected ${want === 'pass' ? 'done' : 'not done'}`);
  }
  const expect = step.op === 'run' || step.op === 'tick' || step.op === 'expect' ? step.expect : undefined;
  if (expect) failures.push(...failuresOf(expect, view, after, absorbed));
  return {
    index,
    op: step.op,
    label,
    ok: failures.length === 0,
    failures,
    output: res.output,
    stderr: res.stderr,
    code: res.code,
    eventTypes: res.events.map((e) => e.type),
    hp: after.hp,
    maxHp: after.maxHp,
    absorbed,
    absorbedTotal: after.absorbedTotal,
    cwd: after.cwd,
    enemiesLeft: after.enemiesLeft,
  };
}

/** Runs steps in order from `from` until the end, a failure, a breakpoint or a cancel. */
export async function runSteps(driver: LabDriver, steps: readonly LabStep[], options: RunOptions = {}): Promise<RunOutcome> {
  const from = options.from ?? 0;
  const to = Math.min(options.to ?? steps.length, steps.length);
  const results: StepResult[] = [];
  let prev = options.prev ?? null;
  for (let i = from; i < to; i += 1) {
    if (options.cancelled?.()) return { results, reason: 'cancelled', next: i };
    if (i !== from && options.breakpoints?.has(i)) return { results, reason: 'breakpoint', next: i };
    const result = await runStep(driver, steps[i]!, i, prev);
    results.push(result);
    prev = result;
    options.onStep?.(result);
    if (!result.ok && (options.stopOnFail ?? true)) return { results, reason: 'failure', next: i + 1 };
  }
  return { results, reason: 'end', next: to };
}

/** The same text for the same run, whichever driver produced it. Wall-clock time is never part of it. */
export function transcriptOf(results: readonly StepResult[]): string {
  return results
    .map((r) => {
      const out = r.output === '' || r.output.endsWith('\n') ? r.output : `${r.output}\n`;
      const events = r.eventTypes.length > 0 ? r.eventTypes.join(',') : '-';
      const tail = `= code=${r.code ?? '-'} events=${events} hp=${r.hp}/${r.maxHp} absorbed=+${r.absorbed} total=${r.absorbedTotal} cwd=${r.cwd} enemies=${r.enemiesLeft}${r.ok ? '' : ` FAIL: ${r.failures.join('; ')}`}`;
      return `[${r.index + 1}] ${r.label}\n${out}${tail}\n`;
    })
    .join('\n');
}
