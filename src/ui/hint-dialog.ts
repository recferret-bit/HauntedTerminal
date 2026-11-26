import { stripCommandsFromText } from '../game/puzzle.js';
import type { GameSnapshot, HintGoals, HintTask } from '../game/types.js';
import { el, setText } from './dom-lite.js';
import { createNativeModal, wireLightDismissFallback } from './modal-dialog.js';

export { wireLightDismissFallback };

export interface HintDialogHandlers {
  onClose?(returnFocus: HTMLElement | null): void;
}

export interface HintDialog {
  open(snap: GameSnapshot): void;
  close(): void;
  isOpen(): boolean;
  update(snap: GameSnapshot): void;
}

interface HintParts {
  dialog: HTMLDialogElement;
  title: HTMLElement;
  sector: HTMLElement;
  badge: HTMLElement;
  goal: HTMLElement;
  list: HTMLElement;
  tip: HTMLElement;
  closeBtn: HTMLButtonElement;
  xBtn: HTMLButtonElement;
}

function fallbackGoals(snap: GameSnapshot): HintGoals {
  const rows = snap.level?.checklist ?? [];
  const tasks: HintTask[] = rows.map((r) => ({ label: stripCommandsFromText(r.description), done: r.done }));
  const exitReady = tasks.length > 0 && tasks.every((t) => t.done);
  return {
    title: snap.level?.title ?? snap.room?.title ?? 'Current Sector',
    goal: exitReady
      ? 'All tasks complete — head for the exit.'
      : stripCommandsFromText(snap.level?.objective ?? 'Complete the sector objectives.'),
    tasks,
    exitReady,
  };
}

function buildHintDialog(): HintParts {
  const title = el('h2', 'hint-dialog-title', ['TASKS & GOALS']);
  title.id = 'hint-dialog-title';
  const badge = el('span', 'hint-dialog-badge');
  badge.id = 'hint-dialog-badge';

  const xBtn = el('button', 'hint-dialog-x', ['×']) as HTMLButtonElement;
  xBtn.type = 'submit';
  xBtn.value = 'close';
  xBtn.id = 'hint-dialog-x';
  xBtn.setAttribute('aria-label', 'Close tasks and goals');

  const headLeft = el('div', 'hint-dialog-head-left', [title, badge]);
  const head = el('header', 'hint-dialog-head', [headLeft, xBtn]);

  const sector = el('p', 'hint-dialog-sector');
  sector.id = 'hint-dialog-sector';
  const goal = el('p', 'hint-dialog-goal');
  goal.id = 'hint-dialog-goal';

  const list = el('ul', 'hint-dialog-list');
  list.id = 'hint-dialog-list';

  const tip = el('p', 'hint-dialog-tip', ['Need command reference? Press F1 for the Field Manual.']);
  const closeBtn = el('button', 'hint-dialog-close', ['Close']) as HTMLButtonElement;
  closeBtn.type = 'submit';
  closeBtn.value = 'close';
  closeBtn.id = 'hint-dialog-close';
  closeBtn.autofocus = true;

  const foot = el('footer', 'hint-dialog-foot', [tip, closeBtn]);
  const form = el('form', 'hint-dialog-form', [head, sector, goal, list, foot]) as HTMLFormElement;
  form.setAttribute('method', 'dialog');

  const dialog = el('dialog', 'hint-dialog', [form]) as HTMLDialogElement;
  dialog.id = 'hint-dialog';
  dialog.setAttribute('closedby', 'any');
  dialog.setAttribute('aria-labelledby', 'hint-dialog-title');
  dialog.setAttribute('aria-describedby', 'hint-dialog-goal');

  return { dialog, title, sector, badge, goal, list, tip, closeBtn, xBtn };
}

function renderHintGoals(p: HintParts, snap: GameSnapshot): void {
  const hasManual = snap.inventory ? snap.inventory.items.includes('manual') : true;
  setText(
    p.tip,
    hasManual
      ? 'Need command reference? Press F1 for the Field Manual.'
      : 'Field Manual locked — reach the Server Hub to obtain it.',
  );
  const data = snap.hintGoals ?? fallbackGoals(snap);
  setText(p.sector, data.title);
  setText(p.goal, data.goal);
  const core = data.tasks.filter((t) => t.kind !== 'exit');
  const hasExit = data.tasks.some((t) => t.kind === 'exit');
  const doneCount = core.filter((t) => t.done).length;
  const badgeText = data.exitReady
    ? hasExit
      ? 'EXIT READY'
      : 'ALL DONE'
    : core.length === 0
      ? 'FREE ROAM'
      : `${doneCount}/${core.length} DONE`;
  setText(p.badge, badgeText);
  if (data.exitReady) p.badge.classList.add('ready');
  else p.badge.classList.remove('ready');

  const key = `${data.exitReady ? 1 : 0}|${data.tasks.map((t) => `${t.kind ?? 'task'}:${t.done ? 1 : 0}:${t.label}`).join('\n')}`;
  if (p.list.dataset.key === key) return;
  p.list.dataset.key = key;
  p.list.replaceChildren(
    ...data.tasks.map((t) => {
      const cls =
        t.kind === 'exit'
          ? data.exitReady
            ? 'hint-task exit ready'
            : 'hint-task exit'
          : t.done
            ? 'hint-task done'
            : 'hint-task';
      return el('li', cls, [t.label]);
    }),
  );
}

/**
 * Centered comic dialog popup for minimal room tasks & goals (zero exact commands).
 * Uses native `<dialog>` with `showModal()`, `closedby="any"` (+ Safari fallback), and `<form method="dialog">`.
 */
export function mountHintDialog(host: HTMLElement, handlers: HintDialogHandlers = {}): HintDialog {
  host.querySelector('#hint-dialog')?.remove();
  const p = buildHintDialog();
  host.appendChild(p.dialog);
  const modal = createNativeModal(p.dialog, [p.closeBtn, p.xBtn], handlers.onClose);

  return {
    open(snap) {
      renderHintGoals(p, snap);
      modal.open(p.closeBtn);
    },
    close: modal.close,
    isOpen: modal.isOpen,
    update(snap) {
      if (modal.isOpen()) renderHintGoals(p, snap);
    },
  };
}
