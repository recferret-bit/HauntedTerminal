import { h } from '../chapter-editor/dom.js';
import {
  DockLayoutController,
  sanitizeLayout,
  type DockSlot,
  type FloatRect,
  type LayoutState,
  type PanelId,
  type SplitEdge,
} from './dock-layout.js';

export type DockId = 'top' | 'left' | 'right' | 'timeline' | 'jumps' | 'stagebar';

export interface WorkspaceState {
  top: boolean;
  left: boolean;
  right: boolean;
  timeline: boolean;
  jumps: boolean;
  stagebar: boolean;
  zen: boolean;
}

interface StoredWorkspace {
  state: WorkspaceState;
  layout: LayoutState;
}

const STORAGE_KEY = 'ht-comix-editor-ui';
const DOCK_KEYS: readonly DockId[] = ['top', 'left', 'right', 'timeline', 'jumps', 'stagebar'];

const DEFAULT_STATE: WorkspaceState = {
  top: true,
  left: true,
  right: true,
  timeline: true,
  jumps: true,
  stagebar: true,
  zen: false,
};

function loadBundle(): StoredWorkspace {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { state: { ...DEFAULT_STATE }, layout: sanitizeLayout(null) };
    const parsed = JSON.parse(raw) as Partial<WorkspaceState> & { layout?: unknown };
    return {
      state: {
        top: parsed.top !== false,
        left: parsed.left !== false,
        right: parsed.right !== false,
        timeline: parsed.timeline !== false,
        jumps: parsed.jumps !== false,
        stagebar: parsed.stagebar !== false,
        zen: Boolean(parsed.zen),
      },
      layout: sanitizeLayout(parsed.layout),
    };
  } catch {
    return { state: { ...DEFAULT_STATE }, layout: sanitizeLayout(null) };
  }
}

function saveBundle(state: WorkspaceState, layout: LayoutState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, layout }));
  } catch {
    // Storage quota or private browsing; non-fatal.
  }
}

const DOCK_BUTTONS: ReadonlyArray<{ id: DockId; label: string; title: string }> = [
  { id: 'left', label: '◧ Pages', title: 'Toggle Left Pages Outliner ([)' },
  { id: 'right', label: '◨ Inspector', title: 'Toggle Right Inspector (])' },
  { id: 'timeline', label: '◫ Timeline', title: 'Toggle Bottom Timeline (\\)' },
  { id: 'jumps', label: '⊟ Chips', title: 'Toggle Quick-Jump Chips' },
  { id: 'stagebar', label: '⬒ Bar', title: 'Toggle Viewport Toolbar' },
  { id: 'top', label: '▴ Top', title: 'Hide Top Bar (restorable from floating pill)' },
];

/**
 * Manages visibility of every dock/toolbar in `/comix-editor`, Focus/Zen mode,
 * keyboard shortcuts, `localStorage` persistence, and the floating restore pill.
 */
export class WorkspaceManager {
  private readonly initialBundle = loadBundle();
  private state: WorkspaceState = this.initialBundle.state;
  private snapshot: WorkspaceState | null = null;
  private readonly layoutCtrl = new DockLayoutController(this.initialBundle.layout);
  private rootEl: HTMLElement | null = null;
  private onLayoutChange: (() => void) | null = null;
  private onResetView: (() => void) | null = null;
  private readonly topBtns = new Map<DockId | 'zen', HTMLButtonElement>();
  private readonly restoreBtns = new Map<DockId | 'zen' | 'all', HTMLButtonElement>();
  private restoreEl: HTMLElement | null = null;
  private liveEl: HTMLElement | null = null;
  private keysBound = false;

  get current(): WorkspaceState {
    return { ...this.state };
  }

  get layout(): LayoutState {
    return this.layoutCtrl.current;
  }

  attach(
    rootEl: HTMLElement,
    panels: Record<PanelId, HTMLElement>,
    onLayoutChange: () => void,
    onResetView?: () => void,
  ): void {
    this.rootEl = rootEl;
    this.onLayoutChange = onLayoutChange;
    this.onResetView = onResetView ?? null;
    if (!this.liveEl) {
      this.liveEl = h('span', { class: 'sr cx-sr-live', role: 'status', 'aria-live': 'polite' });
      rootEl.append(this.liveEl);
    }
    this.layoutCtrl.mount({
      rootEl,
      panels,
      isVisible: (id) => this.state[id],
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

  toggle(dock: DockId): void {
    this.state[dock] = !this.state[dock];
    if (this.state[dock] && this.state.zen) this.state.zen = false;
    this.commit();
    this.announce(`${dock} ${this.state[dock] ? 'shown' : 'hidden'}`);
  }

  toggleZen(): void {
    if (!this.state.zen) {
      this.snapshot = { ...this.state };
      this.state.top = false;
      this.state.left = false;
      this.state.right = false;
      this.state.timeline = false;
      this.state.stagebar = false;
      this.state.zen = true;
    } else {
      const prev = this.snapshot;
      this.snapshot = null;
      this.state = prev
        ? { ...prev, zen: false }
        : { ...DEFAULT_STATE };
    }
    this.commit();
    this.announce(this.state.zen ? 'Focus mode enabled' : 'Focus mode exited');
  }

  showAll(): void {
    this.snapshot = null;
    this.state = { ...DEFAULT_STATE };
    this.commit();
    this.announce('All workspace panels restored');
  }

  setSplitSize(edge: SplitEdge, px: number): void {
    this.layoutCtrl.setSplitSize(edge, px);
  }

  undockPanel(id: PanelId, patch?: Partial<FloatRect>): void {
    if (this.state.zen) this.state.zen = false;
    this.state[id] = true;
    this.layoutCtrl.undockPanel(id, patch);
  }

  dockPanel(id: PanelId, target?: DockSlot): void {
    if (this.state.zen) this.state.zen = false;
    this.state[id] = true;
    this.layoutCtrl.dockPanel(id, target);
  }

  resetLayout(): void {
    this.snapshot = null;
    this.state = { ...DEFAULT_STATE };
    this.layoutCtrl.reset();
    this.onResetView?.();
    this.commit();
  }

  renderTopToggles(): HTMLElement {
    const strip = h('div', { class: 'cx-view-strip', role: 'group', 'aria-label': 'Workspace panels' });
    this.topBtns.clear();
    for (const item of DOCK_BUTTONS) {
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
    const pagesBtn = h(
      'button',
      { type: 'button', class: 'cx-restore-btn', onclick: () => this.toggle('left') },
      'Pages',
    );
    const inspBtn = h(
      'button',
      { type: 'button', class: 'cx-restore-btn', onclick: () => this.toggle('right') },
      'Inspector',
    );
    const timeBtn = h(
      'button',
      { type: 'button', class: 'cx-restore-btn', onclick: () => this.toggle('timeline') },
      'Timeline',
    );
    const exitZenBtn = h(
      'button',
      { type: 'button', class: 'cx-restore-btn', onclick: () => this.toggleZen() },
      'Exit Focus',
    );
    this.restoreBtns.set('all', showAllBtn);
    this.restoreBtns.set('left', pagesBtn);
    this.restoreBtns.set('right', inspBtn);
    this.restoreBtns.set('timeline', timeBtn);
    this.restoreBtns.set('zen', exitZenBtn);

    const pill = h(
      'div',
      { class: 'cx-restore-pill', role: 'toolbar', 'aria-label': 'Restore hidden UI panels' },
      showAllBtn,
      pagesBtn,
      inspBtn,
      timeBtn,
      exitZenBtn,
    );
    this.restoreEl = pill;
    this.syncButtons();
    return pill;
  }

  private commit(fromLayout = false): void {
    saveBundle(this.state, this.layoutCtrl.current);
    this.syncVisibilityAttrs();
    if (!fromLayout) this.layoutCtrl.syncDom();
    this.onLayoutChange?.();
  }

  private syncVisibilityAttrs(): void {
    const root = this.rootEl;
    if (root) {
      for (const k of DOCK_KEYS) {
        root.setAttribute(`data-hide-${k}`, String(!this.state[k]));
      }
      root.setAttribute('data-zen', String(this.state.zen));
    }
    this.syncButtons();
  }

  private syncButtons(): void {
    for (const k of DOCK_KEYS) {
      this.topBtns.get(k)?.setAttribute('aria-pressed', String(this.state[k]));
    }
    this.topBtns.get('zen')?.setAttribute('aria-pressed', String(this.state.zen));
    if (this.restoreEl) {
      const showPill = this.state.zen || !this.state.top;
      this.restoreEl.hidden = !showPill;
      const pagesBtn = this.restoreBtns.get('left');
      const inspBtn = this.restoreBtns.get('right');
      const timeBtn = this.restoreBtns.get('timeline');
      const exitZenBtn = this.restoreBtns.get('zen');
      if (pagesBtn) pagesBtn.setAttribute('aria-pressed', String(this.state.left));
      if (inspBtn) inspBtn.setAttribute('aria-pressed', String(this.state.right));
      if (timeBtn) timeBtn.setAttribute('aria-pressed', String(this.state.timeline));
      if (exitZenBtn) exitZenBtn.hidden = !this.state.zen;
    }
  }

  private handleKey(ev: KeyboardEvent): void {
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    const target = ev.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) {
      return;
    }
    if (ev.key === '`') {
      ev.preventDefault();
      this.toggleZen();
    } else if (ev.key === '[') {
      ev.preventDefault();
      this.toggle('left');
    } else if (ev.key === ']') {
      ev.preventDefault();
      this.toggle('right');
    } else if (ev.key === '\\') {
      ev.preventDefault();
      this.toggle('timeline');
    } else if (ev.key === 'Escape' && this.state.zen) {
      ev.preventDefault();
      this.toggleZen();
    }
  }
}
