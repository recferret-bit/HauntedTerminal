import { badgeMarks } from '../editor-core/chrome.js';
import { clear, h } from '../editor-core/dom.js';
import type { LabStep, LabStepKind } from './lab-types.js';
import type { StepResult } from './runner.js';
import { stepTitle } from './schema.js';

export interface ScriptDeps {
  steps: readonly LabStep[];
  results: ReadonlyMap<number, StepResult>;
  cursor: number;
  selected: number | null;
  breakpoints: ReadonlySet<number>;
  recording: boolean;
  running: boolean;
  /** Item paths that have issues (`steps[i]`), for the row badges. */
  issueCounts: (where: string) => { errors: number; warns: number };
  onSelect: (index: number) => void;
  onToggleBreakpoint: (index: number) => void;
  onRunTo: (index: number) => void;
  onRemove: (index: number) => void;
  onMove: (index: number, delta: -1 | 1) => void;
  onAdd: (op: LabStepKind) => void;
  onReset: () => void;
  onStep: () => void;
  onRunAll: () => void;
  onPause: () => void;
  onToggleRecord: () => void;
}

const ADDABLE: readonly LabStepKind[] = ['run', 'tick', 'expect', 'check', 'say', 'taunt', 'dialogue', 'emit', 'wait', 'inject'];

/** A row's small button. Its `data-focus-key` lets a redraw put focus back on the same control. */
function icon(key: string, title: string, glyph: string, onclick: () => void, extra: Record<string, string> = {}): HTMLElement {
  return h('button', { type: 'button', class: 'mini', title, 'aria-label': title, 'data-focus-key': key, onclick, ...extra }, glyph);
}

function statusOf(r: StepResult | undefined): { glyph: string; cls: string; title: string } {
  if (!r) return { glyph: '·', cls: 'pending', title: 'not run yet' };
  return r.ok ? { glyph: '✓', cls: 'pass', title: 'passed' } : { glyph: '✕', cls: 'fail', title: r.failures.join('; ') };
}

function row(d: ScriptDeps, i: number): HTMLElement {
  const step = d.steps[i]!;
  const where = `steps[${i}]`;
  const status = statusOf(d.results.get(i));
  const title = stepTitle(step as unknown as Record<string, unknown>);
  const bp = d.breakpoints.has(i);
  const label = h(
    'button',
    { type: 'button', class: `lab-step-label${d.selected === i ? ' on' : ''}`, 'aria-current': d.selected === i ? 'true' : undefined, title: step.note ?? title, 'data-focus-key': `${where}-pick`, onclick: () => d.onSelect(i) },
    h('span', { class: 'lab-step-no' }, String(i + 1)),
    h('span', { class: 'lab-step-text' }, title),
    badgeMarks({ dirty: false, ...d.issueCounts(where) }),
  );
  return h(
    'li',
    { class: `lab-step ${status.cls}${d.cursor === i ? ' next' : ''}`, 'data-item-path': where },
    icon(`${where}-bp`, bp ? 'Remove breakpoint' : 'Break before this step', bp ? '●' : '○', () => d.onToggleBreakpoint(i), { 'aria-pressed': String(bp), class: `mini lab-bp${bp ? ' on' : ''}` }),
    label,
    h('span', { class: `lab-step-status ${status.cls}`, title: status.title }, status.glyph),
    icon(`${where}-to`, 'Run up to and including this step', '▶|', () => d.onRunTo(i)),
    icon(`${where}-up`, 'Move up', '↑', () => d.onMove(i, -1)),
    icon(`${where}-down`, 'Move down', '↓', () => d.onMove(i, 1)),
    icon(`${where}-remove`, 'Remove step', '✕', () => d.onRemove(i)),
  );
}

function transport(d: ScriptDeps): HTMLElement {
  const add = h(
    'select',
    { 'aria-label': 'Add a step', onchange: () => { if (add.value) d.onAdd(add.value as LabStepKind); add.value = ''; } },
    h('option', { value: '' }, '+ step'),
    ...ADDABLE.map((op) => h('option', { value: op }, op)),
  );
  const btn = (label: string, title: string, onclick: () => void, extra: Record<string, string | boolean> = {}) =>
    h('button', { type: 'button', class: 'btn small', title, 'aria-label': label, onclick, ...extra }, label);
  return h(
    'div',
    { class: 'lab-transport', role: 'group', 'aria-label': 'Script controls' },
    btn('⏮ Reset', 'Fresh level, back to step 1', d.onReset),
    btn('⏭ Step', 'Run the next step', d.onStep, { disabled: d.running }),
    btn('▶ Run all', 'Run until the end, a failure or a breakpoint', d.onRunAll, { disabled: d.running, class: 'btn small primary' }),
    btn('⏸ Pause', 'Stop after the current step', d.onPause, { disabled: !d.running }),
    btn(d.recording ? '⏺ Recording' : '⏺ Record', 'Lines you type in the game terminal and ticks you press become steps', d.onToggleRecord, {
      'aria-pressed': String(d.recording),
      class: `btn small${d.recording ? ' primary' : ''}`,
      'data-focus-key': 'record',
    }),
    add,
  );
}

/** The Script panel: transport and the step list with breakpoints, results and issue badges. The JSON tab edits it as text. */
export function renderScriptPanel(host: HTMLElement, d: ScriptDeps): void {
  clear(host);
  const list =
    d.steps.length === 0
      ? h('p', { class: 'note dim' }, 'No steps yet. Add one, or press Record and type in the game terminal.')
      : h('ol', { class: 'lab-steps', 'aria-label': 'Script steps' }, ...d.steps.map((_, i) => row(d, i)));
  host.append(transport(d), list);
}
