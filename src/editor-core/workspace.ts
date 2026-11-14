import {
  DockLayoutController,
  sanitizeLayout,
  type DockSizeDefaults,
  type DockSlot,
  type FloatRect,
  type LayoutState,
  type PanelId,
  type SplitEdge,
} from './dock-layout.js';
import { h } from './dom.js';

export type BaseDockId = 'top' | 'left' | 'right' | 'timeline' | 'stagebar';
export type WorkspaceState<D extends string = BaseDockId> = Record<D, boolean> & { zen: boolean };

export interface DockButtonDef<D extends string> {
  id: D;
  label: string;
  title: string;
  restoreLabel?: string;
}

export interface WorkspaceConfig<D extends string> {
  storageKey: string;
  buttons: readonly DockButtonDef<D>[];
  labels?: Partial<Record<PanelId, string>>;
  defaultSizes?: Partial<DockSizeDefaults>;
}

export interface WorkstationStageTarget {
  setViewportSize(w: number, h: number): void;
  setPageZoom(scale: number | 'fit'): void;
  togglePortrait(): void;
}

export interface WorkstationHook<D extends string> {
  toggleDock(dock: D): void;
  toggleZen(): void;
  setSplitSize(edge: SplitEdge, px: number): void;
  undockPanel(id: PanelId, patch?: Partial<FloatRect>): void;
  dockPanel(id: PanelId, target?: DockSlot): void;
  setViewportSize(w: number, h: number): void;
  setPageZoom(scale: number | 'fit'): void;
  togglePortrait(): void;
  resetLayout(): void;
}

export function createWorkstationHookApi<D extends string>(
  ws: WorkspaceManager<D>,
  stage: WorkstationStageTarget,
): WorkstationHook<D> {
  return {
    toggleDock: (dock) => ws.toggle(dock),
    toggleZen: () => ws.toggleZen(),
    setSplitSize: (edge, px) => ws.setSplitSize(edge, px),
    undockPanel: (id, patch) => ws.undockPanel(id, patch),
    dockPanel: (id, target) => ws.dockPanel(id, target),
    setViewportSize: (w, hPx) => stage.setViewportSize(w, hPx),
    setPageZoom: (scale) => stage.setPageZoom(scale),
    togglePortrait: () => stage.togglePortrait(),
    resetLayout: () => ws.resetLayout(),
  };
}

interface StoredWorkspace<D extends string> {
  state: WorkspaceState<D>;
  layout: LayoutState;
}

function makeDefaultState<D extends string>(buttons: readonly DockButtonDef<D>[]): WorkspaceState<D> {
  const out: Record<string, boolean> = { zen: false };
  for (const btn of buttons) out[btn.id] = true;
  return out as WorkspaceState<D>;
}

function loadBundle<D extends string>(cfg: WorkspaceConfig<D>): StoredWorkspace<D> {
  const defState = makeDefaultState(cfg.buttons);
  try {
    const raw = localStorage.getItem(cfg.storageKey);
    if (!raw) return { state: defState, layout: sanitizeLayout(null, cfg.defaultSizes) };
    const parsed = JSON.parse(raw) as Record<string, unknown> & { layout?: unknown };
    const nextState: Record<string, boolean> = { zen: Boolean(parsed.zen) };
    for (const btn of cfg.buttons) nextState[btn.id] = parsed[btn.id] !== false;
    return {
      state: nextState as WorkspaceState<D>,
      layout: sanitizeLayout(parsed.layout, cfg.defaultSizes),
    };
  } catch {
    return { state: defState, layout: sanitizeLayout(null, cfg.defaultSizes) };
  }
}

function saveBundle<D extends string>(storageKey: string, state: WorkspaceState<D>, layout: LayoutState): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify({ ...state, layout }));
  } catch {
    // Storage quota or private browsing; non-fatal.
  }
}

/**
 * Manages visibility of every dock/toolbar in a workstation editor, Focus/Zen mode,
 * keyboard shortcuts (`[`, `]`, `\`, `` ` ``, `Escape`), `localStorage` persistence, and the floating restore pill.
 */
export class WorkspaceManager<D extends string = BaseDockId> {
  private readonly cfg: WorkspaceConfig<D>;
  private readonly keys: readonly D[];
  private state: WorkspaceState<D>;
  private snapshot: WorkspaceState<D> | null = null;
  private readonly layoutCtrl: DockLayoutController;
  private rootEl: HTMLElement | null = null;
  private onLayoutChange: (() => void) | null = null;
  private onResetView: (() => void) | null = null;
  private onSave: ((saveAll: boolean) => void) | null = null;
  private readonly topBtns = new Map<D | 'zen', HTMLButtonElement>();
  private readonly restoreBtns = new Map<string, HTMLButtonElement>();
  private restoreEl: HTMLElement | null = null;
  private liveEl: HTMLElement | null = null;
  private keysBound = false;

  constructor(cfg: WorkspaceConfig<D>) {
    this.cfg = cfg;
    this.keys = cfg.buttons.map((b) => b.id);
    const bundle = loadBundle(cfg);
    this.state = bundle.state;
    this.layoutCtrl = new DockLayoutController({
      initial: bundle.layout,
      defaults: cfg.defaultSizes,
      labels: cfg.labels,
    });
  }

  get current(): WorkspaceState<D> {
    return { ...this.state };
  }

  get layout(): LayoutState {
    return this.layoutCtrl.current;
  }

  private setFlag(key: keyof WorkspaceState<D>, value: boolean): void {
    (this.state as Record<string, boolean>)[key as string] = value;
  }

  attach(
    rootEl: HTMLElement,
    panels: Record<PanelId, HTMLElement>,
    onLayoutChange: () => void,
    onResetView?: () => void,
    onSave?: (saveAll: boolean) => void,
  ): void {
    this.rootEl = rootEl;
    this.onLayoutChange = onLayoutChange;
    this.onResetView = onResetView ?? null;
    this.onSave = onSave ?? null;
    if (!this.liveEl) {
      this.liveEl = h('span', { class: 'sr cx-sr-live', role: 'status', 'aria-live': 'polite' });
      rootEl.append(this.liveEl);
    }
    this.layoutCtrl.mount({
      rootEl,
      panels,
      isVisible: (id) => Boolean(this.state[id as D]),
      isZen: () => this.state.zen,
      onCommit: () => this.commit(true),
      onAnnounce: (msg) => this.announce(msg),
    });
    this.syncVisibilityAttrs();
    if (!this.keysBound) {
      this.keysBound = true;
      window.addEventListener('keydown', (ev) => this.handleKey(ev));
    }
  }

  private announce(msg: string): void {
    if (this.liveEl) this.liveEl.textContent = msg;
  }

  toggle(dock: D): void {
    const next = !this.state[dock];
    this.setFlag(dock, next);
    if (next && this.state.zen) this.state.zen = false;
    this.commit(false, dock);
    this.announce(`${dock} ${next ? 'shown' : 'hidden'}`);
  }

  toggleZen(): void {
    if (!this.state.zen) {
      this.snapshot = { ...this.state };
      for (const k of ['top', 'left', 'right', 'timeline', 'stagebar'] as const) {
        if (k in this.state) this.setFlag(k as D, false);
      }
      this.state.zen = true;
    } else {
      const prev = this.snapshot;
      this.snapshot = null;
      this.state = prev ? { ...prev, zen: false } : makeDefaultState(this.cfg.buttons);
    }
    this.commit(false, 'zen');
    this.announce(this.state.zen ? 'Focus mode enabled' : 'Focus mode exited');
  }

  showAll(): void {
    this.snapshot = null;
    this.state = makeDefaultState(this.cfg.buttons);
    this.commit();
    this.announce('All workspace panels restored');
  }

  setSplitSize(edge: SplitEdge, px: number): void {
    this.layoutCtrl.setSplitSize(edge, px);
  }

  undockPanel(id: PanelId, patch?: Partial<FloatRect>): void {
    if (this.state.zen) this.state.zen = false;
    this.setFlag(id as D, true);
    this.layoutCtrl.undockPanel(id, patch);
  }

  dockPanel(id: PanelId, target?: DockSlot): void {
    if (this.state.zen) this.state.zen = false;
    this.setFlag(id as D, true);
    this.layoutCtrl.dockPanel(id, target);
  }

  resetLayout(): void {
    this.snapshot = null;
    this.state = makeDefaultState(this.cfg.buttons);
    this.layoutCtrl.reset();
    this.onResetView?.();
    this.commit();
  }

  renderTopToggles(): HTMLElement {
    const strip = h('div', { class: 'cx-view-strip', role: 'group', 'aria-label': 'Workspace panels' });
    this.topBtns.clear();
    for (const item of this.cfg.buttons) {
      const btn = h(
        'button',
        {
          type: 'button',
          class: 'cx-view-btn',
          'data-dock': item.id,
          title: item.title,
          'aria-pressed': String(this.state[item.id]),
          onclick: () => this.toggle(item.id),
        },
        item.label,
      );
      this.topBtns.set(item.id, btn);
      strip.append(btn);
    }
    const zenBtn = h(
      'button',
      {
        type: 'button',
        class: 'cx-view-btn cx-zen-btn',
        'data-dock': 'zen',
        title: 'Toggle Focus / Zen mode (`)',
        'aria-pressed': String(this.state.zen),
        onclick: () => this.toggleZen(),
      },
      '⛶ Focus',
    );
    const resetBtn = h(
      'button',
      {
        type: 'button',
        class: 'cx-view-btn',
        'data-action': 'reset-layout',
        title: 'Reset panel positions, sizes & viewport layout',
        onclick: () => this.resetLayout(),
      },
      '↺ Layout',
    );
    this.topBtns.set('zen', zenBtn);
    strip.append(zenBtn, resetBtn);
    return strip;
  }

  renderRestoreOverlay(): HTMLElement {
    this.restoreBtns.clear();
    const showAllBtn = h(
      'button',
      { type: 'button', class: 'cx-restore-btn primary', onclick: () => this.showAll() },
      '☰ Restore UI',
    );
    const items: HTMLButtonElement[] = [showAllBtn];
    this.restoreBtns.set('all', showAllBtn);
    for (const def of this.cfg.buttons) {
      if (!def.restoreLabel) continue;
      const btn = h(
        'button',
        { type: 'button', class: 'cx-restore-btn', onclick: () => this.toggle(def.id) },
        def.restoreLabel,
      );
      this.restoreBtns.set(def.id, btn);
      items.push(btn);
    }
    const exitZenBtn = h(
      'button',
      { type: 'button', class: 'cx-restore-btn', onclick: () => this.toggleZen() },
      'Exit Focus',
    );
    this.restoreBtns.set('zen', exitZenBtn);
    items.push(exitZenBtn);

    const pill = h(
      'div',
      { class: 'cx-restore-pill', role: 'toolbar', 'aria-label': 'Restore hidden UI panels' },
      ...items,
    );
    this.restoreEl = pill;
    this.syncButtons();
    return pill;
  }

  private rescueFocusIfHidden(preferredDock?: D | 'zen'): void {
    const active = document.activeElement as HTMLElement | null;
    if (!active || active === document.body || !this.rootEl?.contains(active)) return;
    const inHiddenPanel = Boolean(active.closest('[data-panel-hidden="true"]'));
    const inHiddenTop = Boolean(this.rootEl.getAttribute('data-hide-top') === 'true' && active.closest('.ed-top'));
    const inHiddenBar = Boolean(this.rootEl.getAttribute('data-hide-stagebar') === 'true' && active.closest('.cx-stage-bar'));
    if (!inHiddenPanel && !inHiddenTop && !inHiddenBar) return;
    if (this.restoreEl && !this.restoreEl.hidden) {
      this.restoreBtns.get('all')?.focus();
      return;
    }
    const fallback = (preferredDock ? this.topBtns.get(preferredDock) : null) ?? this.topBtns.get('zen');
    fallback?.focus();
  }

  private commit(fromLayout = false, focusDock?: D | 'zen'): void {
    saveBundle(this.cfg.storageKey, this.state, this.layoutCtrl.current);
    this.syncVisibilityAttrs();
    if (!fromLayout) this.layoutCtrl.syncDom();
    this.rescueFocusIfHidden(focusDock);
    this.onLayoutChange?.();
  }

  private syncVisibilityAttrs(): void {
    const root = this.rootEl;
    if (root) {
      for (const k of this.keys) root.setAttribute(`data-hide-${k}`, String(!this.state[k]));
      root.setAttribute('data-zen', String(this.state.zen));
    }
    this.syncButtons();
  }

  private syncButtons(): void {
    for (const k of this.keys) this.topBtns.get(k)?.setAttribute('aria-pressed', String(this.state[k]));
    this.topBtns.get('zen')?.setAttribute('aria-pressed', String(this.state.zen));
    if (this.restoreEl) {
      const topHidden = 'top' in this.state && !this.state['top' as D];
      this.restoreEl.hidden = !(this.state.zen || topHidden);
      for (const def of this.cfg.buttons) {
        if (!def.restoreLabel) continue;
        this.restoreBtns.get(def.id)?.setAttribute('aria-pressed', String(this.state[def.id]));
      }
      const exitZenBtn = this.restoreBtns.get('zen');
      if (exitZenBtn) exitZenBtn.hidden = !this.state.zen;
    }
  }

  private handleKey(ev: KeyboardEvent): void {
    if (ev.isComposing || ev.keyCode === 229) return;
    if ((ev.metaKey || ev.ctrlKey) && !ev.altKey && ev.key.toLowerCase() === 's') {
      if (this.onSave) {
        ev.preventDefault();
        this.onSave(ev.shiftKey);
      }
      return;
    }
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    const target = ev.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) {
      return;
    }
    if (ev.key === '`') {
      ev.preventDefault();
      this.toggleZen();
    } else if (ev.key === '[' && 'left' in this.state) {
      ev.preventDefault();
      this.toggle('left' as D);
    } else if (ev.key === ']' && 'right' in this.state) {
      ev.preventDefault();
      this.toggle('right' as D);
    } else if (ev.key === '\\' && 'timeline' in this.state) {
      ev.preventDefault();
      this.toggle('timeline' as D);
    } else if (ev.key === 'Escape' && this.state.zen) {
      ev.preventDefault();
      this.toggleZen();
    }
  }
}
