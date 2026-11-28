/**
 * The in-game laptop overlay (specs .kiro/specs/play-laptop-overlay/ and .kiro/specs/laptop-rework/):
 * the Laptop Lab's CSS 3D laptop (`mountLaptop`: model, lifecycle, desktop, apps, tasks, sounds)
 * floating transparently over `/play` (the stage and terminal stay visible behind it, while `/laptop-lab`
 * keeps its comic-panel stage). Auto-opens the lid on launch so the physical Power button is ready right
 * away; on close, quickly folds the lid shut (`220ms`) and hides the book with the same fast `160ms`
 * motion used when it appears. Never holds the battle turn timer (see .kiro/specs/play-laptop-overlay/ and
 * .kiro/specs/laptop-rework/).
 */
import '../styles/laptop.css';
import '../styles/play-laptop.css';
import { isChapterSession } from '../chapters/chapter-session.js';
import { dom } from '../contracts/dom.js';
import { laptopHear } from '../laptop/app-bus.js';
import { parseProgress } from '../laptop/domain/progress.js';
import { taskById } from '../laptop/domain/tasks.js';
import type { RoomNotice, RoomTaskBinding } from '../laptop/ui/apps/app-types.js';
import { mountLaptop, type LaptopHandle } from '../laptop/ui/laptop.js';
import { colourise } from '../ui/terminal.js';
import { closeOtherModals, type Play } from './state.js';

/** In-game task progress; the Laptop Lab keeps its own (`credits.laptop.progress`). */
const PLAY_LAPTOP_PROGRESS_KEY = 'out-of-credits:laptop-progress:v1';
const BOOK_IO_MS = 160;
const CLOSE_LID_MS = 220;

/** Clears persisted in-game laptop quest progress on a fresh campaign ("Play Again"). */
export function clearPlayLaptopProgress(): void {
  try {
    localStorage.removeItem(PLAY_LAPTOP_PROGRESS_KEY);
  } catch {
    // ignore storage errors
  }
}

/** Drops stale solved entries & drafts for tasks still pending in this chapter session so fresh runs must test them. */
function prunePendingLaptopProgress(key: string, pending: readonly string[]): void {
  if (pending.length === 0) return;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return;
    const parsed = parseProgress(raw);
    const pendingSet = new Set(pending);
    const nextDone = parsed.done.filter((id) => !pendingSet.has(id));
    const nextDrafts = { ...parsed.drafts };
    let changed = nextDone.length !== parsed.done.length;
    for (const id of pending) {
      if (id in nextDrafts) {
        delete nextDrafts[id];
        changed = true;
      }
    }
    if (changed) localStorage.setItem(key, JSON.stringify({ done: nextDone, drafts: nextDrafts }));
  } catch {
    // ignore storage errors
  }
}

const isInsideLaptopOrClose = (target: EventTarget | null): boolean =>
  target instanceof Element && Boolean(target.closest('.lt-deck, .laptop-overlay-close'));

const isReducedMotion = (): boolean =>
  typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

function createCloser(
  play: Play,
  root: HTMLElement,
  lt: LaptopHandle,
  onState: (next: string) => void,
  onClose: () => void,
): (immediate?: boolean) => void {
  let closing = false;
  let timer = 0;

  const finish = (): void => {
    window.clearTimeout(timer);
    const done = lt.ctx.progress().done;
    play.laptopOverlay = null;
    lt.dispose();
    root.remove();
    syncLaptopProgressToSession(play, done);
    onClose();
  };

  const hideBook = (): void => {
    onState('closed');
    lt.view.show('closed');
    root.classList.add('is-hiding');
    timer = window.setTimeout(finish, BOOK_IO_MS);
  };

  return (immediate = false): void => {
    if (immediate || isReducedMotion()) {
      finish();
      return;
    }
    if (closing) return;
    closing = true;
    root.classList.add('is-closing');
    const wasShut = lt.machine.state === 'closed';
    lt.machine.dispose();
    lt.view.boot.stop();
    lt.ctx.sound.note('fan-off');
    lt.view.led('power', 'off');
    lt.view.led('disk', 'off');
    if (wasShut) {
      hideBook();
      return;
    }
    lt.ctx.sound.note('close');
    for (const key of ['--t-closing', '--t-diving', '--t-surfacing']) {
      lt.view.el.style.setProperty(key, `${CLOSE_LID_MS}ms`);
    }
    onState('closing');
    lt.view.show('closing');
    timer = window.setTimeout(hideBook, CLOSE_LID_MS);
  };
}

export function isLaptopOpen(play: Play): boolean {
  return Boolean(play.laptopOverlay);
}

export function saveRoomFileToPlay(play: Play, fileName: string, content: string): void {
  if (!isChapterSession(play.session)) return;
  const res = play.session.saveEditableFile(fileName, content);
  play.session.bus?.emit({ kind: 'command', result: res.stderr ? 'fail' : 'ok' });
  if (res.output) play.shell.printAbove(colourise(res.output, res.stderr));
  play.events.emit({ kind: 'apply-events', events: res.events, snap: res.snapshot, printed: res.output });
}

function warmupRuleTasks(play: Play): readonly string[] {
  if (!isChapterSession(play.session)) return [];
  const rule = play.session.getCurrentLevel().winRules.find((r) => r.kind === 'laptop_tasks_done');
  return rule && rule.kind === 'laptop_tasks_done' ? rule.tasks : [];
}

function paymentRule(play: Play): { jsPath: string; description: string } | null {
  if (!isChapterSession(play.session)) return null;
  const rule = play.session.getCurrentLevel().winRules.find((r) => r.kind === 'payment_js_valid');
  return rule && rule.kind === 'payment_js_valid' ? { jsPath: rule.jsPath, description: rule.description } : null;
}

function isPaymentRuleDone(play: Play, rule: { description: string }): boolean {
  if (!isChapterSession(play.session)) return false;
  return Boolean(play.session.snapshot().level?.checklist.find((c) => c.description === rule.description)?.done);
}

function buildRoomTask(play: Play): RoomTaskBinding | null {
  const rule = paymentRule(play);
  if (!rule || !isChapterSession(play.session)) return null;
  if (isPaymentRuleDone(play, rule)) return null;
  if (!play.session.isPathDiscovered(rule.jsPath)) return null;
  const file = play.session.readEditableFile(rule.jsPath);
  if (!file.ok) return null;
  const starterFile = play.session.getCurrentLevel().files.find((f) => f.path === rule.jsPath);
  return {
    task: {
      id: `room:${rule.jsPath}`,
      title: `Fix ${file.name} (minors -> majors)`,
      app: 'jspad',
      brief: rule.description,
      hint: 'Divide minor units by 100 and round down (Math.floor(amountMinor / 100)). Click Check to save & purge the bug!',
      starter: { html: '', css: '', js: starterFile?.content ?? file.content },
      solution: { html: '', css: '', js: file.content },
      checks: [
        { kind: 'noError', label: 'Runs without an error' },
        { kind: 'value', expr: 'processPayment(100)', equals: '1', label: 'processPayment(100) returns 1' },
        { kind: 'value', expr: 'processPayment(199)', equals: '1', label: 'processPayment(199) rounds down to 1' },
        { kind: 'value', expr: 'processPayment(250)', equals: '2', label: 'processPayment(250) rounds down to 2' },
        { kind: 'value', expr: 'processPayment(99)', equals: '0', label: 'processPayment(99) rounds down to 0' },
        { kind: 'value', expr: 'processPayment(0)', equals: '0', label: 'processPayment(0) returns 0' },
        { kind: 'value', expr: 'processPayment(1050)', equals: '10', label: 'processPayment(1050) rounds down to 10' },
      ],
    },
    files: { html: '', css: '', js: file.content },
    onSolve: (files) => saveRoomFileToPlay(play, rule.jsPath, files.js),
  };
}

function buildRoomNotice(play: Play, done: readonly string[]): RoomNotice | null {
  if (!isChapterSession(play.session)) return null;
  const snap = play.session.snapshot();
  const pending = snap.pendingLaptopTasks ?? [];
  if (pending.length > 0 && pending.every((id) => done.includes(id))) {
    const total = warmupRuleTasks(play).length || pending.length;
    return {
      badge: 'OK',
      title: `Warmups complete (${total}/${total})!`,
      detail: 'Close the laptop (Esc or CLOSE) to return to the room.',
    };
  }
  const rule = paymentRule(play);
  if (!rule) return null;
  if (isPaymentRuleDone(play, rule)) {
    const fileName = rule.jsPath.split('/').pop() ?? rule.jsPath;
    return {
      badge: 'OK',
      title: `${fileName} fixed!`,
      detail: snap.promptGold
        ? 'Bug purged and exit door open! Close the laptop (Esc or CLOSE) to exit.'
        : 'Close the laptop (Esc or CLOSE) to return to the room.',
    };
  }
  if (play.session.readEditableFile(rule.jsPath).ok && !play.session.isPathDiscovered(rule.jsPath)) {
    return {
      badge: 'LOCK',
      title: 'Locate bug folder first',
      detail: 'Close the laptop (Esc) and run `ls` in the terminal to find the bug folder.',
    };
  }
  return null;
}

function syncLaptopProgressToSession(play: Play, done: readonly string[]): void {
  if (!isChapterSession(play.session)) return;
  const pending = play.session.snapshot().pendingLaptopTasks;
  if (!pending?.length || !pending.some((id) => done.includes(id))) return;
  const res = play.session.syncLaptopTasks?.(done);
  if (res) {
    if (res.output) play.shell.printAbove(colourise(res.output, res.stderr));
    play.events.emit({ kind: 'apply-tick', res });
  }
}

/** Opens the floating laptop overlay if he carries it and a modal may open now. `onClose` runs after it closes. */
export function openLaptop(play: Play, onClose: () => void): void {
  if (play.laptopOverlay || play.lifecycle.phase() !== 'play' || !play.lifecycle.canOpenManualOrMap()) return;
  const snap = play.session.snapshot();
  if (!snap.inventory.items.includes('laptop')) return;
  closeOtherModals(play, 'laptop');
  const storageKey = play.preview || play.terminalLab ? null : PLAY_LAPTOP_PROGRESS_KEY;
  const pendingOnOpen = isChapterSession(play.session) ? (snap.pendingLaptopTasks ?? []) : [];
  if (storageKey && pendingOnOpen.length > 0) prunePendingLaptopProgress(storageKey, pendingOnOpen);
  const initialRule = paymentRule(play);
  const initialCloseLabel = initialRule && isPaymentRuleDone(play, initialRule) ? 'DONE — RETURN [Esc]' : 'CLOSE [Esc]';
  const panel = dom('div', { class: 'laptop-overlay-panel' });
  const closeBtn = dom('button', { class: 'laptop-overlay-close', type: 'button', 'aria-label': 'Close the laptop' }, [initialCloseLabel]);
  const root = dom('div', { class: 'laptop-overlay', id: 'laptop-overlay', role: 'dialog', 'aria-label': 'Laptop' }, [panel, closeBtn]);
  document.body.appendChild(root);
  const bus = play.session.bus;
  const lt = mountLaptop(panel, {
    start: 'closed',
    speed: 1,
    muted: snap.muted,
    storageKey,
    hear: bus ? laptopHear(bus) : undefined,
    roomTask: () => buildRoomTask(play),
    roomNotice: (p) => buildRoomNotice(play, p.done),
    onTaskProgress: (done) => {
      if (pendingOnOpen.length > 0 && pendingOnOpen.every((id) => done.includes(id))) {
        closeBtn.textContent = 'DONE — RETURN [Esc]';
      }
    },
  });
  lt.ctx.onRoomChange?.(() => {
    const rule = paymentRule(play);
    if (rule && isPaymentRuleDone(play, rule)) {
      closeBtn.textContent = 'DONE — RETURN [Esc]';
    }
  });
  let currentState: string = lt.machine.state;
  lt.onState((next) => { currentState = next; });
  // Snap the closed rig transform and flush layout before opening so the 1.5s lid spring transition plays smoothly.
  lt.view.frame(false);
  lt.machine.send('OPEN');
  play.shell.blur();
  const close = createCloser(play, root, lt, (next) => { currentState = next; }, onClose);
  play.laptopOverlay = {
    state: () => currentState,
    close,
    async runTask(id: string): Promise<boolean> {
      const task = taskById(id);
      if (!task) return false;
      const results = await lt.runTask(id, task.solution);
      return results.length > 0 && results.every((r) => r.ok);
    },
  };
  let downInside = false;
  root.addEventListener('pointerdown', (ev) => { downInside = isInsideLaptopOrClose(ev.target); }, true);
  root.addEventListener('click', (ev) => {
    const clickedInside = isInsideLaptopOrClose(ev.target);
    const shouldClose = !downInside && !clickedInside;
    downInside = false;
    if (shouldClose) {
      ev.stopPropagation();
      play.laptopOverlay?.close();
    }
  });
  closeBtn.onclick = (ev) => {
    ev.stopPropagation();
    play.laptopOverlay?.close();
  };
}

export function closeLaptop(play: Play): void {
  play.laptopOverlay?.close();
}
