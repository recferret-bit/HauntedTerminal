import type { KernelEvent } from '../contracts/events.js';
import { h, sleep, type Rec } from './dom.js';

/** The automation hooks `src/play/loop.ts` puts on the game window. Tools extend it with their own (`__lab`). */
export interface PlayWindow extends Window {
  __term?: {
    submit(line: string): void;
    emit(ev: KernelEvent): void;
    print(text: string): void;
    busy(): boolean;
    phase(): string;
    text(): string;
    /** Raw keystrokes as xterm would deliver them. */
    input(data: string): void;
  };
  __game?: { events(): KernelEvent[]; snapshot(): { cwd: string; hp: number; maxHp: number; enemiesLeft: number } };
}

const BOOT_TIMEOUT_MS = 30_000;
const FORM_CONTROL = /^(INPUT|TEXTAREA|SELECT)$/;

/** One line for the event log: the type plus the most telling field. */
function describeEvent(ev: KernelEvent): string {
  const r = ev as unknown as Rec;
  const text = r.text ?? r.message ?? r.entityId ?? r.name ?? r.command ?? '';
  const payload = r.payload as Rec | undefined;
  const detail = text || (payload ? String(payload.speakerName ?? '') : '');
  return `${ev.type}${detail ? `  ${String(detail).replace(/\s+/g, ' ').slice(0, 90)}` : ''}`;
}

const talks = (ev: KernelEvent): boolean =>
  ev.type === 'AGENT_TAUNT' || ev.type === 'DIALOG_BOX' || ev.type === 'OBSTACLE_DIALOGUE_RENDERED' || ev.type === 'TUTORIAL_STEP';

/**
 * The editor side of the game iframe: load a URL, wait until the terminal is live, type a line and wait for it to finish,
 * fire a raw event, and read new `KernelEvent`s. Shared by the chapter editor and the Terminal Lab.
 * It knows nothing about packs or levels; the caller builds the URL.
 */
export class PlayFrame<W extends PlayWindow = PlayWindow> {
  private logged = 0;
  /** The terminal hook of the page that was showing when `load` was called: still being there means "not reloaded yet". */
  private stale: unknown = null;
  /** A form control that had focus when `load` was called; the new game page must not steal it. */
  private keepFocus: HTMLElement | null = null;

  constructor(private readonly frame: HTMLIFrameElement) {}

  get win(): W | null {
    return this.frame.contentWindow as W | null;
  }

  /** The game's phase (`play`, `intro`, ...), or undefined while the page is still loading. */
  get phase(): string | undefined {
    return this.win?.__term?.phase?.();
  }

  submit(line: string): void {
    this.win?.__term?.submit(line);
  }

  emit(ev: KernelEvent): void {
    this.win?.__term?.emit(ev);
  }

  print(text: string): void {
    this.win?.__term?.print(text);
  }

  /**
   * Points the iframe at `url`. A loaded same-origin page is replaced in place, so reloads add no browser history entries
   * (Back keeps moving the editor, not the game). `waitUntilLive` then waits for the new page.
   */
  load(url: string): void {
    this.stale = this.win?.__term ?? null;
    const active = document.activeElement;
    this.keepFocus = active instanceof HTMLElement && FORM_CONTROL.test(active.tagName) ? active : null;
    try {
      if (this.win && this.win.location.href !== 'about:blank') {
        this.win.location.replace(new URL(url, location.href).href);
        return;
      }
    } catch {
      /* not same-origin yet: fall back to src */
    }
    this.frame.src = url;
  }

  /** Polls until the terminal is in phase `play`. `current` turns false when a newer load replaced this one. */
  async waitUntilLive(current: () => boolean = () => true): Promise<boolean> {
    const started = Date.now();
    while (Date.now() - started < BOOT_TIMEOUT_MS) {
      if (!current()) return false;
      if (this.phase === 'play' && this.win?.__term !== this.stale) {
        this.giveFocusBack();
        return true;
      }
      await sleep(250);
    }
    return false;
  }

  /** The game focuses its terminal when it starts; a field the user was typing in keeps the focus instead. */
  private giveFocusBack(): void {
    const keep = this.keepFocus;
    this.keepFocus = null;
    if (keep?.isConnected && document.activeElement === this.frame) keep.focus();
  }

  /** Runs `fn` while keeping keyboard focus on any active editor form control if the iframe steals it. */
  preservingFormFocus<T>(fn: () => T): T {
    const active = document.activeElement;
    const keep = active instanceof HTMLElement && FORM_CONTROL.test(active.tagName) ? active : null;
    try {
      return fn();
    } finally {
      if (keep?.isConnected && document.activeElement === this.frame) keep.focus();
    }
  }

  /** Submits a line like Enter does, then waits until the terminal has finished printing it. */
  async typeLine(line: string): Promise<void> {
    const term = this.win?.__term;
    if (!term) return;
    term.submit(line);
    await sleep(120);
    const until = Date.now() + 15_000;
    while (term.busy() && Date.now() < until) await sleep(100);
  }

  /** Forget how many events were already read (a reload empties the game's log). */
  resetLog(): void {
    this.logged = 0;
  }

  /** Events the game logged since the last call. */
  newEvents(): KernelEvent[] {
    const events = this.win?.__game?.events?.();
    if (!events || events.length === this.logged) return [];
    if (events.length < this.logged) this.logged = 0;
    const fresh = events.slice(this.logged);
    this.logged = events.length;
    return fresh;
  }

  /** Appends the events logged since the last call to an event log element, keeping the newest `cap` rows. */
  flushTo(logEl: HTMLElement, cap = 300): void {
    const fresh = this.newEvents();
    if (fresh.length === 0) return;
    for (const ev of fresh) logEl.append(h('div', { class: `pv-ev${talks(ev) ? ' talk' : ''}` }, describeEvent(ev)));
    while (logEl.childElementCount > cap) logEl.firstElementChild?.remove();
    logEl.scrollTop = logEl.scrollHeight;
  }
}
