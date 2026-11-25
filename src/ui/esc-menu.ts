/**
 * The Esc menu: a centred modal over the stage with the level details, the sound control, a two-step Restart level and
 * a Back to main menu with one confirm line. Spec: .kiro/specs/esc-menu-hud-rework/ (design 3, 4, 7; D4, D5, D12).
 *
 * It is NOT a pause. It never touches `play.reasons` or the turn-timer hold, so the game clock and the battle timer keep
 * running. While open it keeps keys away from the terminal: key, paste and beforeinput events whose target is outside the
 * menu are swallowed (Escape excepted), focus that strays outside is pulled back, and Tab wraps inside the card. The
 * terminal's line buffer is never touched, so a half-typed line survives. On close, focus returns to the element that had
 * it when the menu opened (the terminal's input).
 *
 * Esc itself is NOT handled here: `src/play` owns the Esc key (toggle) and calls `open(snap)` / `close()`. Closing by any
 * route cancels a pending second step.
 *
 * Handler contract (supplied by `src/play`; `src/ui` imports no `play`). All return void; none may throw for flow control:
 *   onMute(): void           toggle mute (e.g. `session.toggleMute()`), persist with `writeSoundPref`.
 *   onVolume(v: number): void  v is 0 to 1 in steps of 0.05 (slider 0 to 100 step 5, divided by 100); apply and persist.
 *   onRestartLevel(): void   the same session call `restart-level --yes` makes (`session.restartFloor()`); runs once, after
 *                            the second step's `Confirm restart`; it never types into the terminal.
 *   onLeave(): void          go to /chapters.html; runs once, after the confirm line's `Leave`.
 * Return: `{ open(snap: GameSnapshot): void; close(): void; isOpen(): boolean; update(snap: GameSnapshot): void }`.
 * `update` is cheap and does nothing while closed; call it with every snapshot.
 */
import type { GameSnapshot } from '../game/types.js';
import { clampVolume } from './sound-pref.js';
import { el } from './dom-lite.js';

export interface EscMenuHandlers {
  onMute(): void;
  onVolume(volume: number): void;
  onRestartLevel(): void;
  onLeave(): void;
}

export interface EscMenu {
  open(snap: GameSnapshot): void;
  close(): void;
  isOpen(): boolean;
  update(snap: GameSnapshot): void;
}

/** Shown after `Back to main menu` (D12). */
export const LEAVE_CONFIRM_TEXT = "This level's progress is not saved. Cleared levels are.";

const SWALLOWED = ['keydown', 'keypress', 'keyup', 'paste', 'beforeinput'] as const;

function button(id: string, text: string, className = 'esc-btn'): HTMLButtonElement {
  const b = el('button', className, [text]);
  b.type = 'button';
  b.id = id;
  return b;
}

function setText(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

function inside(root: Node, node: Node | null): boolean {
  for (let n: Node | null = node; n; n = n.parentNode) if (n === root) return true;
  return false;
}

/** True when neither the node nor an ancestor up to `root` is `hidden`. */
function shown(root: Node, node: HTMLElement): boolean {
  for (let n: Node | null = node; n && n !== root; n = n.parentNode) if ((n as HTMLElement).hidden) return false;
  return true;
}

interface Parts {
  backdrop: HTMLElement;
  card: HTMLElement;
  name: HTMLElement;
  path: HTMLElement;
  objective: HTMLElement;
  checklist: HTMLElement;
  bugs: HTMLElement;
  mute: HTMLButtonElement;
  volume: HTMLInputElement;
  volumeValue: HTMLElement;
  close: HTMLButtonElement;
  restart: HTMLButtonElement;
  restartConfirm: HTMLElement;
  restartYes: HTMLButtonElement;
  restartNo: HTMLButtonElement;
  leave: HTMLButtonElement;
  leaveConfirm: HTMLElement;
  leaveYes: HTMLButtonElement;
  leaveNo: HTMLButtonElement;
  /** Every control, in tab order. */
  controls: HTMLElement[];
}

function buildLevelSection(): Pick<Parts, 'name' | 'path' | 'objective' | 'checklist' | 'bugs'> & { section: HTMLElement } {
  const name = el('b', 'esc-level-name');
  name.id = 'esc-level-name';
  const path = el('code', 'esc-level-path');
  path.id = 'esc-level-path';
  const objective = el('p', 'esc-level-objective');
  objective.id = 'esc-level-objective';
  const checklist = el('ul', 'esc-level-checklist');
  checklist.id = 'esc-level-checklist';
  const bugs = el('span', 'esc-level-bugs');
  bugs.id = 'esc-level-bugs';
  const section = el('section', 'esc-menu-section esc-menu-level', [name, path, objective, checklist, bugs]);
  return { section, name, path, objective, checklist, bugs };
}

function buildSoundSection(): Pick<Parts, 'mute' | 'volume' | 'volumeValue'> & { section: HTMLElement } {
  const mute = button('esc-mute', 'Sound: on', 'esc-btn esc-mute');
  mute.setAttribute('aria-pressed', 'false');
  const volume = el('input', 'esc-volume');
  volume.id = 'esc-volume';
  volume.type = 'range';
  volume.min = '0';
  volume.max = '100';
  volume.step = '5';
  volume.value = '100';
  volume.setAttribute('aria-label', 'Volume');
  const volumeValue = el('output', 'esc-volume-value', ['100']);
  volumeValue.id = 'esc-volume-value';
  const section = el('section', 'esc-menu-section esc-menu-sound', [mute, volume, volumeValue]);
  return { section, mute, volume, volumeValue };
}

function build(): Parts {
  const level = buildLevelSection();
  const sound = buildSoundSection();
  const title = el('h2', 'esc-menu-title', ['MENU']);
  title.id = 'esc-menu-title';
  const close = button('esc-close', 'Back to game (Esc)');
  const restart = button('esc-restart', 'Restart level');
  const restartYes = button('esc-restart-yes', 'Confirm restart', 'esc-btn esc-danger');
  const restartNo = button('esc-restart-no', 'Cancel');
  const restartConfirm = el('div', 'esc-confirm esc-restart-confirm', [restartYes, restartNo]);
  restartConfirm.id = 'esc-restart-confirm';
  const leave = button('esc-leave', 'Back to main menu');
  const leaveYes = button('esc-leave-yes', 'Leave', 'esc-btn esc-danger');
  const leaveNo = button('esc-leave-no', 'Stay');
  const leaveNote = el('p', 'esc-note', [LEAVE_CONFIRM_TEXT]);
  const leaveConfirm = el('div', 'esc-confirm esc-leave-confirm', [leaveNote, leaveYes, leaveNo]);
  leaveConfirm.id = 'esc-leave-confirm';
  const actions = el('section', 'esc-menu-section esc-menu-actions', [restart, restartConfirm, leave, leaveConfirm]);
  const card = el('div', 'esc-menu-card', [title, level.section, sound.section, actions, close]);
  card.id = 'esc-menu-card';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  card.setAttribute('aria-labelledby', 'esc-menu-title');
  const backdrop = el('div', 'esc-menu-backdrop', [card]);
  backdrop.id = 'esc-menu';
  backdrop.hidden = true;
  backdrop.setAttribute('aria-hidden', 'true');
  restartConfirm.hidden = true;
  leaveConfirm.hidden = true;
  const controls = [sound.mute, sound.volume, restart, restartYes, restartNo, leave, leaveYes, leaveNo, close];
  return { backdrop, card, ...level, ...sound, close, restart, restartConfirm, restartYes, restartNo, leave, leaveConfirm, leaveYes, leaveNo, controls };
}

/** A description may carry its own `[ ] ` / `[x] ` marker; the CSS `::before` of `.esc-check` draws the only one. */
export function stripMarker(text: string): string {
  return text.replace(/^\s*\[[ xX]\]\s*/, '');
}

function renderChecklist(list: HTMLElement, items: ReadonlyArray<{ description: string; done: boolean }>): string {
  const key = items.map((i) => `${i.done ? 1 : 0}${i.description}`).join('\n');
  if (list.dataset.key === key) return key;
  list.dataset.key = key;
  list.replaceChildren(...items.map((i) => el('li', i.done ? 'esc-check done' : 'esc-check', [stripMarker(i.description)])));
  return key;
}

function focus(node: HTMLElement | null | undefined): void {
  node?.focus?.({ preventScroll: true });
}

function showRestartStep(p: Parts, on: boolean): void {
  p.restart.hidden = on;
  p.restartConfirm.hidden = !on;
}

function showLeaveStep(p: Parts, on: boolean): void {
  p.leave.hidden = on;
  p.leaveConfirm.hidden = !on;
}

function renderSnapshot(p: Parts, snap: GameSnapshot): void {
  const level = snap.level;
  setText(p.name, level?.title ?? snap.room?.title ?? '');
  setText(p.path, snap.room?.path ?? '');
  const objective = stripMarker(level?.objective ?? '');
  const rows = level?.checklist ?? [];
  // The objective is the first unfinished row; show it alone only when no checklist row repeats it.
  p.objective.hidden = objective === '' || rows.some((r) => stripMarker(r.description) === objective);
  setText(p.objective, objective);
  renderChecklist(p.checklist, level?.checklist ?? []);
  setText(p.bugs, `BUGS ${level?.bugsLeft ?? snap.enemiesLeft ?? 0}/${level?.bugsTotal ?? snap.enemiesTotal ?? 0}`);
  setText(p.mute, snap.muted ? 'Sound: muted' : 'Sound: on');
  p.mute.setAttribute('aria-pressed', snap.muted ? 'true' : 'false');
  if (typeof document === 'undefined' || document.activeElement !== p.volume) {
    const v = Math.round(clampVolume(snap.volume ?? 1) * 20) * 5;
    if (p.volume.value !== String(v)) p.volume.value = String(v);
    setText(p.volumeValue, String(v));
  }
}

/** Button clicks of the two-step Restart level, the leave confirm, the sound controls and the close button. */
function wireControls(p: Parts, handlers: EscMenuHandlers, close: () => void): void {
  p.close.onclick = close;
  p.mute.onclick = () => {
    const nowMuted = p.mute.getAttribute('aria-pressed') !== 'true';
    setText(p.mute, nowMuted ? 'Sound: muted' : 'Sound: on');
    p.mute.setAttribute('aria-pressed', nowMuted ? 'true' : 'false');
    handlers.onMute();
  };
  p.volume.addEventListener('input', () => {
    const v = Math.max(0, Math.min(100, Math.round(Number(p.volume.value) / 5) * 5));
    setText(p.volumeValue, String(v));
    handlers.onVolume(v / 100);
  });
  p.restart.onclick = () => {
    showLeaveStep(p, false);
    showRestartStep(p, true);
    focus(p.restartNo);
  };
  p.restartNo.onclick = () => {
    showRestartStep(p, false);
    focus(p.restart);
  };
  p.restartYes.onclick = () => {
    try {
      handlers.onRestartLevel();
    } finally {
      close();
    }
  };
  p.leave.onclick = () => {
    showRestartStep(p, false);
    showLeaveStep(p, true);
    focus(p.leaveNo);
  };
  p.leaveNo.onclick = () => {
    showLeaveStep(p, false);
    focus(p.leave);
  };
  p.leaveYes.onclick = () => {
    close();
    handlers.onLeave();
  };
}

export function mountEscMenu(host: HTMLElement, handlers: EscMenuHandlers): EscMenu {
  const p = build();
  host.appendChild(p.backdrop);
  let open = false;
  let returnFocus: HTMLElement | null = null;

  const resetSteps = (): void => {
    showRestartStep(p, false);
    showLeaveStep(p, false);
  };

  const update = (snap: GameSnapshot): void => {
    if (open) renderSnapshot(p, snap);
  };
  const strayFocus = (ev: Event): void => {
    if (!open || inside(p.card, ev.target as Node | null)) return;
    focus(p.controls.find((c) => shown(p.card, c)));
  };

  const swallow = (ev: Event): void => {
    if (!open || inside(p.card, ev.target as Node | null)) return;
    if ((ev as KeyboardEvent).key === 'Escape') return;
    ev.stopImmediatePropagation();
    ev.stopPropagation();
    ev.preventDefault();
    focus(p.controls.find((c) => shown(p.card, c)));
  };

  const onTab = (ev: KeyboardEvent): void => {
    if (ev.key !== 'Tab') return;
    const list = p.controls.filter((c) => shown(p.card, c) && !(c as HTMLButtonElement).disabled);
    if (list.length === 0) return;
    ev.preventDefault();
    const at = list.indexOf(document.activeElement as HTMLElement);
    const step = ev.shiftKey ? -1 : 1;
    focus(list[at < 0 ? (step > 0 ? 0 : list.length - 1) : (at + step + list.length) % list.length]);
  };

  const listen = (on: boolean): void => {
    const act = on ? document.addEventListener.bind(document) : document.removeEventListener.bind(document);
    for (const type of SWALLOWED) act(type, swallow, true);
    act('focusin', strayFocus, true);
  };

  const close = (): void => {
    if (!open) return;
    open = false;
    listen(false);
    resetSteps();
    p.backdrop.hidden = true;
    p.backdrop.classList.remove('open');
    p.backdrop.setAttribute('aria-hidden', 'true');
    const back = returnFocus;
    returnFocus = null;
    globalThis.setTimeout(() => {
      if (!open) focus(back);
    }, 0);
  };

  p.card.addEventListener('keydown', onTab as EventListener);
  wireControls(p, handlers, close);

  return {
    open(snap) {
      if (open) return update(snap);
      open = true;
      returnFocus = (document.activeElement as HTMLElement | null) ?? null;
      resetSteps();
      p.backdrop.hidden = false;
      p.backdrop.classList.add('open');
      p.backdrop.setAttribute('aria-hidden', 'false');
      listen(true);
      update(snap);
      focus(p.close);
      p.card.scrollTop = 0;
    },
    close,
    isOpen: () => open,
    update,
  };
}
