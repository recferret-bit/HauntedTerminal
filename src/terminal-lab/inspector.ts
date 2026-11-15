import type { LabInspect } from '../chapters/session-lab-types.js';
import { renderIssueList } from '../editor-core/chrome.js';
import { clear, h, type Rec } from '../editor-core/dom.js';
import { renderFields, type FormCtx } from '../editor-core/form.js';
import type { LabModel } from './lab-model.js';
import type { StepResult } from './runner.js';
import { SETTINGS, SETUP_VARIANTS, STEP_VARIANTS } from './schema.js';

/** The form of the selection: a setup object, a script step, or the lab settings. Item paths are the model's selection paths. */
export function renderObjectForm(host: HTMLElement, model: LabModel, ctx: FormCtx): void {
  clear(host);
  const { script } = model;
  const stepIdx = model.selectedStep;
  const setupIdx = model.selectedSetup;
  if (stepIdx !== null) {
    const step = script.steps[stepIdx]!;
    host.append(h('h3', {}, `${step.op} · step ${stepIdx + 1}`));
    renderFields(host, step as unknown as Rec, STEP_VARIANTS()[step.op], ctx, `steps[${stepIdx}]`);
  } else if (setupIdx !== null) {
    const op = script.setup[setupIdx]!;
    host.append(h('h3', {}, `${op.op} · setup[${setupIdx}]`));
    renderFields(host, op as unknown as Rec, SETUP_VARIANTS()[op.op], ctx, `setup[${setupIdx}]`);
  } else {
    host.append(h('h3', {}, 'Lab settings'));
    renderFields(host, script as unknown as Rec, SETTINGS, ctx, 'lab');
  }
}

/** What the selected step answered the last time it ran: failures, the output, events and where it left the world. */
export function renderResult(host: HTMLElement, result: StepResult | undefined): void {
  clear(host);
  if (!result) return;
  host.append(
    h('h3', {}, `Last run of step ${result.index + 1}`),
    h('p', { class: result.ok ? 'ok' : 'error' }, result.ok ? '✓ passed' : `✕ ${result.failures.join('; ')}`),
    result.output ? h('pre', { class: 'lab-pre', 'aria-label': 'Step output' }, result.output) : h('p', { class: 'note dim' }, 'It printed nothing.'),
    h('p', { class: 'note dim' }, `exit ${result.code ?? '-'} · events ${result.eventTypes.join(', ') || '-'} · HP ${result.hp}/${result.maxHp} · absorbed +${result.absorbed} · ${result.enemiesLeft} enemies left`),
  );
}

/** The lab's issues, each jumping to its object, and the riddles' answers for the author. */
export function renderChecks(host: HTMLElement, model: LabModel, onJump: (where: string) => void): void {
  clear(host);
  const riddles = model.script.setup.flatMap((op) => (op.op === 'riddle' ? [op] : []));
  host.append(
    h('h3', {}, model.issues.length === 0 ? 'Checks' : `Checks (${model.issues.length})`),
    renderIssueList(model.issues, { okText: '✓ No problems.', onJump: (i) => onJump(i.where) }),
    ...(riddles.length === 0
      ? []
      : [
          h('h3', {}, 'Riddle answers and hints'),
          h('ul', { class: 'lab-list', 'aria-label': 'Riddle answers and hints' }, ...riddles.map((r) => h('li', {}, `${r.id}: answer ${r.answer}${r.hints?.length ? ` · hints: ${r.hints.join(' / ')}` : ''}`))),
        ]),
  );
}

/** The live goals of the level: tasks (win rules), checks and riddles with a done mark. */
export function renderGoals(host: HTMLElement, info: LabInspect | null): void {
  clear(host);
  if (!info || info.goals.length === 0) return;
  const done = info.goals.filter((t) => t.done).length;
  host.append(
    h('h3', {}, `Goals (${done}/${info.goals.length})`),
    h(
      'ul',
      { class: 'lab-list', 'aria-label': 'Goals' },
      ...info.goals.map((t) =>
        h('li', { class: `lab-goal ${t.done ? 'done' : 'open'}`, 'data-goal': t.id }, `${t.done ? '✓' : '○'} ${t.id} · ${t.kind}: ${t.description}${t.attempts ? ` (${t.attempts} wrong)` : ''}`),
      ),
    ),
  );
}
