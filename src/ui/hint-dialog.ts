import { stripCommandsFromText } from '../game/puzzle.js';
import type { GameSnapshot, HintGoals, HintTask } from '../game/types.js';
import { el } from './dom-lite.js';

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
  closeBtn: HTMLButtonElement;
  xBtn: HTMLButtonElement;
}

function setText(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
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

  return { dialog, title, sector, badge, goal, list, closeBtn, xBtn };
}

function renderHintGoals(p: HintParts, snap: GameSnapshot): void {
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

/** Safari fallback for `closedby="any"`: require pointerdown and pointerup outside the dialog box. */
export function wireLightDismissFallback(
  dialog: HTMLDialogElement,
  onDismiss: () => void,
  forceFallback = false,
): void {
  const hasNative = !forceFallback && typeof HTMLDialogElement !== 'undefined' && 'closedBy' in HTMLDialogElement.prototype;
  if (hasNative || typeof dialog.addEventListener !== 'function') return;
  const isOutside = (ev: Event): boolean => {
    const pe = ev as PointerEvent;
    if (typeof dialog.getBoundingClientRect !== 'function') return false;
    const r = dialog.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    return pe.clientX < r.left || pe.clientX > r.right || pe.clientY < r.top || pe.clientY > r.bottom;
  };
  let pressedOutside = false;
  dialog.addEventListener('pointerdown', (ev) => {
    pressedOutside = ev.target === dialog && isOutside(ev);
  });
  dialog.addEventListener('pointerup', (ev) => {
    if (pressedOutside && ev.target === dialog && isOutside(ev)) onDismiss();
    pressedOutside = false;
  });
  dialog.addEventListener('pointercancel', () => {
    pressedOutside = false;
  });
  dialog.addEventListener('close', () => {
    pressedOutside = false;
  });
}

/**
 * Centered comic dialog popup for minimal room tasks & goals (zero exact commands).
 * Uses native `<dialog>` with `showModal()`, `closedby="any"` (+ Safari fallback), and `<form method="dialog">`.
 */
export function mountHintDialog(host: HTMLElement, handlers: HintDialogHandlers = {}): HintDialog {
  host.querySelector('#hint-dialog')?.remove();
  const p = buildHintDialog();
  host.appendChild(p.dialog);

  const hasShowModal = typeof p.dialog.showModal === 'function';
  let open = false;
  let returnFocus: HTMLElement | null = null;

  const isActuallyOpen = (): boolean => (hasShowModal ? Boolean(open && p.dialog.open) : open);

  const markClosed = (): void => {
    if (!open) return;
    open = false;
    p.dialog.returnValue = '';
    p.dialog.classList.remove('open');
    const back = returnFocus;
    returnFocus = null;
    handlers.onClose?.(back);
  };

  const close = (): void => {
    if (!open && (!hasShowModal || !p.dialog.open)) return;
    if (typeof p.dialog.close === 'function') {
      if (p.dialog.open) p.dialog.close();
      // Native `<dialog>.close()` queues the `close` event; sync state immediately too.
      markClosed();
    } else {
      p.dialog.removeAttribute?.('open');
      markClosed();
    }
  };

  p.dialog.addEventListener?.('close', () => {
    // Ignore a queued `close` event from an earlier close if the dialog was already reopened.
    if (hasShowModal && p.dialog.open) return;
    markClosed();
  });
  p.closeBtn.onclick = (ev) => {
    if (!hasShowModal) {
      ev.preventDefault();
      close();
    }
  };
  p.xBtn.onclick = (ev) => {
    if (!hasShowModal) {
      ev.preventDefault();
      close();
    }
  };
  wireLightDismissFallback(p.dialog, close);

  return {
    open(snap) {
      renderHintGoals(p, snap);
      // Sync if native close already hid the dialog before its queued `close` event fired.
      if (open && hasShowModal && !p.dialog.open) open = false;
      if (open) return;
      open = true;
      returnFocus = typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;
      p.dialog.classList.add('open');
      if (hasShowModal) {
        if (!p.dialog.open) p.dialog.showModal();
      } else {
        p.dialog.setAttribute('open', '');
      }
      p.closeBtn.focus?.({ preventScroll: true });
    },
    close,
    isOpen: isActuallyOpen,
    update(snap) {
      if (isActuallyOpen()) renderHintGoals(p, snap);
    },
  };
}
