import { renderStageBarRightGroup } from './chrome.js';
import { clear, h } from './dom.js';
import { PlayFrame, type PlayWindow } from './play-frame.js';
import { ViewportStageController } from './viewport-stage.js';

const LOG_POLL_MS = 400;

export interface GamePreviewOpts {
  frameTitle: string;
  /** Tooltip of the stage bar's Reload button. */
  reloadTitle: string;
  onReload: () => void;
  /** Tooltip of the selection pill. */
  selectionTitle: string;
  onRevealSelected?: () => void;
  onToggleZen?: () => void;
  onHideBar?: () => void;
  /** Pills after Reload in the stage bar's Game group (the active level). */
  pills?: HTMLElement[];
}

/**
 * The centre of a game editor: the real game in an iframe on a draft, the stage bar (zoom, aspect, Reload, pills, the
 * selection readout, Focus), a status line and the event log. Shared by the chapter editor and the Terminal Lab;
 * the editor builds the URL and owns its own transport.
 */
export class GamePreviewShell<W extends PlayWindow = PlayWindow> {
  readonly stage: ViewportStageController;
  readonly play: PlayFrame<W>;
  /** `section.cx-stage`: the stage bar and the framed iframe. */
  readonly stageEl: HTMLElement;
  readonly logEl = h('div', { class: 'pv-log', role: 'log', 'aria-label': 'Event log' });
  readonly statusEl = h('span', { class: 'pv-status', role: 'status', 'aria-live': 'polite' }, 'idle');
  private readonly selPill: HTMLButtonElement;
  private loadToken = 0;
  private readonly timer: number;

  constructor(opts: GamePreviewOpts) {
    this.stage = new ViewportStageController({ frameTitle: opts.frameTitle, allow: 'autoplay', bindIframeCtrlWheel: true });
    this.play = new PlayFrame<W>(this.stage.frame);
    this.selPill = h('button', { type: 'button', class: 'cx-sel-pill', hidden: true, title: opts.selectionTitle, onclick: () => opts.onRevealSelected?.() }, '');
    const right = renderStageBarRightGroup({ selReadoutBtn: this.selPill, hint: 'Ctrl+Wheel: Canvas', onToggleZen: opts.onToggleZen, onHideBar: opts.onHideBar });
    const bar = h('div', { class: 'cx-stage-bar' }, this.stage.buildZoomGroup('Canvas'), this.stage.buildGameGroup(opts.reloadTitle, opts.onReload, ...(opts.pills ?? [])), right);
    this.stageEl = h('section', { class: 'cx-stage', 'aria-label': 'Game Viewport' }, bar, this.stage.matEl);
    this.timer = window.setInterval(() => this.play.flushTo(this.logEl), LOG_POLL_MS);
  }

  /** The game phase, or the status text while there is none. */
  get phase(): string {
    return this.play.phase ?? this.statusEl.textContent ?? 'idle';
  }

  setStatus(text: string): void {
    this.statusEl.textContent = text;
  }

  setSelectedReadout(label: string | null): void {
    this.selPill.hidden = !label;
    this.selPill.textContent = label ? `◎ ${label}` : '';
  }

  /** True while no newer `load` has started. */
  isCurrent(token: number): boolean {
    return token === this.loadToken;
  }

  /**
   * Loads `url` (a fresh event log, status "loading…") and resolves when the game is live: true, or false when it did not
   * start or a newer load replaced this one. `token` is what `isCurrent` takes.
   */
  async load(url: string): Promise<{ live: boolean; token: number }> {
    const token = ++this.loadToken;
    this.play.resetLog();
    clear(this.logEl);
    this.setStatus('loading…');
    const sep = url.includes('?') ? '&' : '?';
    this.play.load(`${url}${sep}t=${Date.now()}&seq=${token}`);
    const live = await this.play.waitUntilLive(() => this.isCurrent(token));
    if (this.isCurrent(token)) this.setStatus(live ? 'live' : 'the game did not start (see the iframe)');
    return { live: live && this.isCurrent(token), token };
  }

  /** Clears the event log and advances the load generation for an in-page session swap (no iframe reload). */
  prepareSwap(): void {
    this.loadToken += 1;
    this.play.resetLog();
    clear(this.logEl);
    this.setStatus('live');
  }

  /** Waits for the game that is loading (or running) now. */
  waitUntilLive(): Promise<boolean> {
    const token = this.loadToken;
    return this.play.waitUntilLive(() => this.isCurrent(token));
  }

  dispose(): void {
    window.clearInterval(this.timer);
  }
}
