import {
  clampBottomHeight,
  clampFloatRect,
  clampSideWidth,
  cloneLayout,
  DEFAULT_LAYOUT,
  MIN_BOTTOM_H,
  MIN_SIDE_W,
  makeDefaultLayout,
  PANEL_IDS,
  sanitizeLayout,
  type DockSizeDefaults,
  type DockSlot,
  type FloatRect,
  type LayoutState,
  type PanelId,
  type SplitEdge,
} from './dock-state.js';
import { h } from './dom.js';
import { bindPointerGesture, clampNum, type GestureSession } from './drag.js';

export {
  DEFAULT_LAYOUT,
  sanitizeLayout,
  type DockSizeDefaults,
  type DockSlot,
  type FloatRect,
  type LayoutState,
  type PanelId,
  type SplitEdge,
};

export interface DockMountOpts {
  rootEl: HTMLElement;
  panels: Record<PanelId, HTMLElement>;
  isVisible: (id: PanelId) => boolean;
  isZen: () => boolean;
  onCommit: () => void;
  onAnnounce?: (msg: string) => void;
}

export interface DockLayoutControllerOpts {
  initial?: LayoutState;
  defaults?: Partial<DockSizeDefaults>;
  labels?: Partial<Record<PanelId, string>>;
}

const RESIZE_AXES = [
  { cls: 'cx-fr-n', north: true, south: false, west: false, east: false, cursor: 'ns-resize' },
  { cls: 'cx-fr-s', north: false, south: true, west: false, east: false, cursor: 'ns-resize' },
  { cls: 'cx-fr-w', north: false, south: false, west: true, east: false, cursor: 'ew-resize' },
  { cls: 'cx-fr-e', north: false, south: false, west: false, east: true, cursor: 'ew-resize' },
  { cls: 'cx-fr-nw', north: true, south: false, west: true, east: false, cursor: 'nwse-resize' },
  { cls: 'cx-fr-ne', north: true, south: false, west: false, east: true, cursor: 'nesw-resize' },
  { cls: 'cx-fr-sw', north: false, south: true, west: true, east: false, cursor: 'nesw-resize' },
  { cls: 'cx-fr-se', north: false, south: true, west: false, east: true, cursor: 'nwse-resize' },
] as const;

/**
 * Manages dock splitters, undocking to floating windows, edge snap/swap docking,
 * and floating window corner/edge resizing across shared workstation editors.
 */
export class DockLayoutController {
  private readonly baseDefaults: LayoutState;
  private readonly labels: Record<PanelId, string>;
  private state: LayoutState;
  private dockWidths: { left: number; right: number };
  private opts: DockMountOpts | null = null;
  private topZ = 35;
  private leftSplitEl: HTMLElement | null = null;
  private rightSplitEl: HTMLElement | null = null;
  private bottomSplitEl: HTMLElement | null = null;
  private dropPreviewEl: HTMLElement | null = null;
  private dropTarget: DockSlot | null = null;

  constructor(cfg?: DockLayoutControllerOpts) {
    this.baseDefaults = makeDefaultLayout(cfg?.defaults);
    this.labels = {
      left: cfg?.labels?.left ?? 'Outliner',
      right: cfg?.labels?.right ?? 'Inspector',
      timeline: cfg?.labels?.timeline ?? 'Bottom Dock',
    };
    this.state = cfg?.initial ? cloneLayout(cfg.initial) : cloneLayout(this.baseDefaults);
    this.dockWidths = {
      left: this.state.slots.left === 'left'
        ? this.state.leftWidth
        : this.state.slots.left === 'right'
          ? this.state.rightWidth
          : this.baseDefaults.leftWidth,
      right: this.state.slots.right === 'right'
        ? this.state.rightWidth
        : this.state.slots.right === 'left'
          ? this.state.leftWidth
          : this.baseDefaults.rightWidth,
    };
    this.topZ = Math.max(35, ...PANEL_IDS.map((id) => this.state.floats[id].z));
  }

  private sideOccupant(edge: 'left' | 'right'): 'left' | 'right' | null {
    if (this.state.slots.left === edge) return 'left';
    if (this.state.slots.right === edge) return 'right';
    return null;
  }

  private syncEdgeWidthsFromPanels(): void {
    const occL = this.sideOccupant('left');
    const occR = this.sideOccupant('right');
    if (occL) this.state.leftWidth = this.dockWidths[occL];
    if (occR) this.state.rightWidth = this.dockWidths[occR];
  }

  get current(): LayoutState {
    return cloneLayout(this.state);
  }

  mount(opts: DockMountOpts): void {
    this.opts = opts;
    this.leftSplitEl = h('div', {
      class: 'cx-splitter cx-split-left',
      role: 'separator',
      'aria-orientation': 'vertical',
      'aria-valuemin': String(MIN_SIDE_W),
      'aria-valuemax': '760',
      'aria-valuenow': String(this.state.leftWidth),
      'aria-label': `Resize ${this.labels.left} dock width`,
      tabIndex: 0,
      title: `Drag to resize ${this.labels.left} dock (double-click to reset)`,
    });
    this.rightSplitEl = h('div', {
      class: 'cx-splitter cx-split-right',
      role: 'separator',
      'aria-orientation': 'vertical',
      'aria-valuemin': String(MIN_SIDE_W),
      'aria-valuemax': '760',
      'aria-valuenow': String(this.state.rightWidth),
      'aria-label': `Resize ${this.labels.right} dock width`,
      tabIndex: 0,
      title: `Drag to resize ${this.labels.right} dock (double-click to reset)`,
    });
    this.bottomSplitEl = h('div', {
      class: 'cx-splitter cx-split-bottom',
      role: 'separator',
      'aria-orientation': 'horizontal',
      'aria-valuemin': String(MIN_BOTTOM_H),
      'aria-valuemax': '560',
      'aria-valuenow': String(this.state.bottomHeight ?? 150),
      'aria-label': `Resize ${this.labels.timeline} dock height`,
      tabIndex: 0,
      title: `Drag to resize ${this.labels.timeline} height (double-click to reset)`,
    });
    this.dropPreviewEl = h('div', { class: 'cx-dock-preview', hidden: true });
    opts.rootEl.append(this.leftSplitEl, this.rightSplitEl, this.dropPreviewEl);
    opts.panels.timeline.prepend(this.bottomSplitEl);

    this.bindSplitter(this.leftSplitEl, 'left', 'ew-resize');
    this.bindSplitter(this.rightSplitEl, 'right', 'ew-resize');
    this.bindSplitter(this.bottomSplitEl, 'bottom', 'ns-resize');
    for (const id of PANEL_IDS) this.setupPanelInteractions(id, opts.panels[id]);
    window.addEventListener('resize', () => this.reclampFloats());
    this.syncDom();
  }

  private applySplitEdge(edge: SplitEdge, px: number): void {
    if (edge === 'left') {
      const w = clampSideWidth(px);
      this.state.leftWidth = w;
      const occ = this.sideOccupant('left');
      if (occ) this.dockWidths[occ] = w;
    } else if (edge === 'right') {
      const w = clampSideWidth(px);
      this.state.rightWidth = w;
      const occ = this.sideOccupant('right');
      if (occ) this.dockWidths[occ] = w;
    } else {
      this.state.bottomHeight = clampBottomHeight(px);
    }
  }

  setSplitSize(edge: SplitEdge, px: number): void {
    this.applySplitEdge(edge, px);
    this.commit();
  }

  undockPanel(id: PanelId, patch?: Partial<FloatRect>): void {
    const el = this.opts?.panels[id];
    if (el && this.state.slots[id] !== 'float') {
      const r = el.getBoundingClientRect();
      if (r.width > 40 && r.height > 40) {
        this.state.floats[id] = clampFloatRect(id, {
          x: r.left,
          y: r.top,
          w: r.width,
          h: id === 'timeline' ? Math.max(150, r.height) : r.height,
          z: ++this.topZ,
        });
      }
    }
    this.state.slots[id] = 'float';
    if (patch) {
      this.state.floats[id] = clampFloatRect(id, { ...this.state.floats[id], ...patch, z: ++this.topZ });
    } else {
      this.state.floats[id].z = ++this.topZ;
    }
    this.commit();
    this.opts?.onAnnounce?.(`${this.labels[id]} panel floated`);
  }

  dockPanel(id: PanelId, target?: DockSlot): void {
    let slot: DockSlot = target ?? this.baseDefaults.slots[id];
    if (id === 'timeline') slot = 'bottom';
    else if (slot !== 'left' && slot !== 'right') slot = this.baseDefaults.slots[id];
    if (slot === 'left' || slot === 'right') {
      const other: 'left' | 'right' = id === 'left' ? 'right' : 'left';
      if (this.state.slots[other] === slot) {
        this.state.slots[other] = slot === 'left' ? 'right' : 'left';
      }
    }
    this.state.slots[id] = slot;
    this.syncEdgeWidthsFromPanels();
    this.commit();
    this.opts?.onAnnounce?.(`${this.labels[id]} docked to ${slot}`);
  }

  reset(): void {
    this.state = cloneLayout(this.baseDefaults);
    this.dockWidths = { left: this.baseDefaults.leftWidth, right: this.baseDefaults.rightWidth };
    this.topZ = 35;
    this.commit();
    this.opts?.onAnnounce?.('Workspace layout reset');
  }

  syncDom(): void {
    const opts = this.opts;
    if (!opts) return;
    const zen = opts.isZen();
    let hasLeft = false;
    let hasRight = false;
    let hasBottom = false;

    for (const id of PANEL_IDS) {
      const el = opts.panels[id];
      const slot = this.state.slots[id];
      const visible = opts.isVisible(id) && !zen;
      el.setAttribute('data-panel-hidden', String(!visible));
      el.setAttribute('data-slot', slot);
      if (slot === 'float') {
        const f = clampFloatRect(id, this.state.floats[id]);
        this.state.floats[id] = f;
        el.style.left = `${f.x}px`;
        el.style.top = `${f.y}px`;
        el.style.width = `${f.w}px`;
        el.style.height = `${f.h}px`;
        el.style.zIndex = String(f.z);
      } else {
        el.style.left = '';
        el.style.top = '';
        el.style.width = '';
        el.style.height = '';
        el.style.zIndex = '';
        if (visible && slot === 'left') hasLeft = true;
        if (visible && slot === 'right') hasRight = true;
        if (visible && slot === 'bottom') hasBottom = true;
      }
    }

    opts.rootEl.style.setProperty('--cx-left', hasLeft ? `${this.state.leftWidth}px` : '0px');
    opts.rootEl.style.setProperty('--cx-right', hasRight ? `${this.state.rightWidth}px` : '0px');
    opts.rootEl.style.setProperty(
      '--cx-bottom',
      hasBottom ? (this.state.bottomHeight ? `${this.state.bottomHeight}px` : 'auto') : '0px',
    );
    opts.rootEl.setAttribute('data-custom-bottom', String(hasBottom && this.state.bottomHeight !== null));
    if (this.leftSplitEl) {
      const occ = this.sideOccupant('left');
      const lbl = this.labels[occ ?? 'left'];
      this.leftSplitEl.hidden = !hasLeft;
      this.leftSplitEl.setAttribute('aria-valuenow', String(this.state.leftWidth));
      this.leftSplitEl.setAttribute('aria-label', `Resize ${lbl} dock width`);
      this.leftSplitEl.title = `Drag to resize ${lbl} width (double-click to reset)`;
    }
    if (this.rightSplitEl) {
      const occ = this.sideOccupant('right');
      const lbl = this.labels[occ ?? 'right'];
      this.rightSplitEl.hidden = !hasRight;
      this.rightSplitEl.setAttribute('aria-valuenow', String(this.state.rightWidth));
      this.rightSplitEl.setAttribute('aria-label', `Resize ${lbl} dock width`);
      this.rightSplitEl.title = `Drag to resize ${lbl} width (double-click to reset)`;
    }
    if (this.bottomSplitEl) {
      this.bottomSplitEl.hidden = !hasBottom;
      this.bottomSplitEl.setAttribute('aria-valuenow', String(this.state.bottomHeight ?? 150));
    }
  }

  private commit(): void {
    this.syncDom();
    this.opts?.onCommit();
  }

  private reclampFloats(): void {
    let changed = false;
    for (const id of PANEL_IDS) {
      if (this.state.slots[id] !== 'float') continue;
      this.state.floats[id] = clampFloatRect(id, this.state.floats[id]);
      changed = true;
    }
    if (changed) this.syncDom();
  }

  private bindSplitter(el: HTMLElement, edge: SplitEdge, cursor: string): void {
    let startVal = 0;
    bindPointerGesture(el, {
      cursor,
      onStart: () => {
        if (edge === 'left') startVal = this.state.leftWidth;
        else if (edge === 'right') startVal = this.state.rightWidth;
        else startVal = this.state.bottomHeight ?? (this.opts?.panels.timeline.getBoundingClientRect().height || 150);
      },
      onMove: (s) => {
        const nextPx = edge === 'left' ? startVal + s.dx : edge === 'right' ? startVal - s.dx : startVal - s.dy;
        this.applySplitEdge(edge, nextPx);
        this.syncDom();
      },
      onEnd: () => this.commit(),
    });
    el.addEventListener('dblclick', () => {
      if (edge === 'left' || edge === 'right') {
        const occ = this.sideOccupant(edge) ?? edge;
        const defW = occ === 'right' ? this.baseDefaults.rightWidth : this.baseDefaults.leftWidth;
        this.dockWidths[occ] = defW;
        if (edge === 'left') this.state.leftWidth = defW;
        else this.state.rightWidth = defW;
      } else {
        this.state.bottomHeight = null;
      }
      this.commit();
    });
    el.addEventListener('keydown', (ev) => {
      const step = edge === 'bottom'
        ? (ev.key === 'ArrowUp' ? 16 : ev.key === 'ArrowDown' ? -16 : 0)
        : (ev.key === 'ArrowLeft' ? (edge === 'left' ? -16 : 16) : ev.key === 'ArrowRight' ? (edge === 'left' ? 16 : -16) : 0);
      if (!step) return;
      ev.preventDefault();
      const base = edge === 'left'
        ? this.state.leftWidth
        : edge === 'right'
          ? this.state.rightWidth
          : (this.state.bottomHeight ?? (this.opts?.panels.timeline.getBoundingClientRect().height || 150));
      this.setSplitSize(edge, base + step);
    });
  }

  private setupPanelInteractions(id: PanelId, panelEl: HTMLElement): void {
    for (const def of RESIZE_AXES) {
      const handle = h('div', {
        class: `cx-float-resizer ${def.cls}`,
        title: 'Drag to resize floating panel',
      });
      panelEl.append(handle);
      let startRect: FloatRect = { ...this.state.floats[id] };
      bindPointerGesture(handle, {
        cursor: def.cursor,
        onStart: () => {
          if (this.state.slots[id] !== 'float') return false;
          startRect = { ...this.state.floats[id] };
        },
        onMove: (s) => {
          const minW = id === 'timeline' ? 320 : 220;
          const minH = id === 'timeline' ? 120 : 200;
          let x = startRect.x;
          let y = startRect.y;
          let w = startRect.w;
          let hPx = startRect.h;
          if (def.east) w = startRect.w + s.dx;
          if (def.west) {
            const right = startRect.x + startRect.w;
            x = clampNum(startRect.x + s.dx, 8, Math.max(8, right - minW));
            w = right - x;
          }
          if (def.south) hPx = startRect.h + s.dy;
          if (def.north) {
            const bottom = startRect.y + startRect.h;
            y = clampNum(startRect.y + s.dy, 8, Math.max(8, bottom - minH));
            hPx = bottom - y;
          }
          this.state.floats[id] = clampFloatRect(id, { ...startRect, x, y, w, h: hPx });
          this.syncDom();
        },
        onEnd: () => this.commit(),
      });
    }

    let dragStart: FloatRect = { ...this.state.floats[id] };
    bindPointerGesture(panelEl, {
      threshold: 4,
      cursor: 'grabbing',
      allowStart: (target) => {
        if (!target.closest(`[data-panel-drag="${id}"]`)) return false;
        const btn = target.closest('button, input, select, textarea, a');
        return !btn || btn.hasAttribute('data-drag-grip');
      },
      onStart: (s) => {
        if (this.state.slots[id] !== 'float') {
          this.undockPanel(id);
          const f = this.state.floats[id];
          if (s.startX > f.x + f.w) f.x = Math.round(s.startX - f.w * 0.5);
          this.state.floats[id] = clampFloatRect(id, f);
          this.syncDom();
        }
        dragStart = { ...this.state.floats[id] };
        this.state.floats[id].z = ++this.topZ;
        panelEl.setAttribute('data-dragging', 'true');
      },
      onMove: (s) => {
        this.state.floats[id] = clampFloatRect(id, {
          ...dragStart,
          x: dragStart.x + s.dx,
          y: dragStart.y + s.dy,
          z: this.state.floats[id].z,
        });
        this.updateDropPreview(id, s);
        this.syncDom();
      },
      onEnd: () => {
        panelEl.removeAttribute('data-dragging');
        const target = this.dropTarget;
        this.clearDropPreview();
        if (target) this.dockPanel(id, target);
        else this.commit();
      },
    });

    panelEl.addEventListener('pointerdown', () => {
      if (this.state.slots[id] !== 'float') return;
      this.state.floats[id].z = ++this.topZ;
      panelEl.style.zIndex = String(this.topZ);
    });
    panelEl.addEventListener('click', (ev) => {
      if (ev.target instanceof Element && ev.target.closest(`[data-redock="${id}"]`)) {
        this.dockPanel(id);
      }
    });
    panelEl.addEventListener('dblclick', (ev) => {
      if (ev.target instanceof Element && ev.target.closest(`[data-drag-grip="${id}"]`)) {
        this.dockPanel(id);
      }
    });
    panelEl.addEventListener('keydown', (ev) => this.handleGripKey(id, ev));
  }

  private handleGripKey(id: PanelId, ev: KeyboardEvent): void {
    if (!(ev.target instanceof Element) || !ev.target.closest(`[data-drag-grip="${id}"]`)) return;
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      if (this.state.slots[id] === 'float') this.dockPanel(id);
      else {
        const r = this.opts?.panels[id].getBoundingClientRect();
        this.undockPanel(id, r ? { x: r.left + 20, y: r.top + 20 } : undefined);
      }
      return;
    }
    if (this.state.slots[id] !== 'float') return;
    const step = ev.altKey ? 24 : ev.shiftKey ? 40 : 16;
    const dx = ev.key === 'ArrowLeft' ? -step : ev.key === 'ArrowRight' ? step : 0;
    const dy = ev.key === 'ArrowUp' ? -step : ev.key === 'ArrowDown' ? step : 0;
    if (!dx && !dy) return;
    ev.preventDefault();
    const cur = this.state.floats[id];
    this.state.floats[id] = clampFloatRect(
      id,
      ev.altKey ? { ...cur, w: cur.w + dx, h: cur.h + dy } : { ...cur, x: cur.x + dx, y: cur.y + dy },
    );
    this.commit();
  }

  private updateDropPreview(id: PanelId, s: GestureSession): void {
    const preview = this.dropPreviewEl;
    const rootRect = this.opts?.rootEl.getBoundingClientRect();
    if (!preview || !rootRect) return;
    let next: DockSlot | null = null;
    if (id === 'timeline') {
      if (s.clientY >= rootRect.bottom - 64) next = 'bottom';
    } else if (s.clientX <= rootRect.left + 56) {
      next = 'left';
    } else if (s.clientX >= rootRect.right - 56) {
      next = 'right';
    }
    this.dropTarget = next;
    preview.hidden = next === null;
    if (next) preview.setAttribute('data-target', next);
    else preview.removeAttribute('data-target');
  }

  private clearDropPreview(): void {
    this.dropTarget = null;
    if (this.dropPreviewEl) {
      this.dropPreviewEl.hidden = true;
      this.dropPreviewEl.removeAttribute('data-target');
    }
  }
}
