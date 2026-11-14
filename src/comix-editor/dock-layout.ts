import { h } from '../chapter-editor/dom.js';
import { bindPointerGesture, clampNum, type GestureSession } from './drag.js';

export type PanelId = 'left' | 'right' | 'timeline';
export type DockSlot = 'left' | 'right' | 'bottom' | 'float';
export type SplitEdge = 'left' | 'right' | 'bottom';

export interface FloatRect {
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
}

export interface LayoutState {
  slots: Record<PanelId, DockSlot>;
  leftWidth: number;
  rightWidth: number;
  bottomHeight: number | null;
  floats: Record<PanelId, FloatRect>;
}

const PANEL_IDS: readonly PanelId[] = ['left', 'right', 'timeline'];
const MIN_SIDE_W = 170;
const MIN_BOTTOM_H = 115;

export const DEFAULT_LAYOUT: LayoutState = {
  slots: { left: 'left', right: 'right', timeline: 'bottom' },
  leftWidth: 232,
  rightWidth: 430,
  bottomHeight: null,
  floats: {
    left: { x: 24, y: 64, w: 280, h: 480, z: 31 },
    right: { x: 860, y: 64, w: 460, h: 560, z: 32 },
    timeline: { x: 240, y: 660, w: 720, h: 170, z: 33 },
  },
};

function cloneLayout(src: LayoutState): LayoutState {
  return {
    slots: { ...src.slots },
    leftWidth: src.leftWidth,
    rightWidth: src.rightWidth,
    bottomHeight: src.bottomHeight,
    floats: {
      left: { ...src.floats.left },
      right: { ...src.floats.right },
      timeline: { ...src.floats.timeline },
    },
  };
}

function clampSideWidth(px: number): number {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1600;
  return Math.round(clampNum(px, MIN_SIDE_W, Math.max(280, Math.min(760, vw * 0.45))));
}

function clampBottomHeight(px: number): number {
  const vh = typeof window !== 'undefined' ? window.innerHeight : 960;
  return Math.round(clampNum(px, MIN_BOTTOM_H, Math.max(220, vh * 0.55)));
}

function clampFloatRect(id: PanelId, r: FloatRect): FloatRect {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1600;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 960;
  const minW = id === 'timeline' ? 320 : 220;
  const minH = id === 'timeline' ? 120 : 200;
  const w = Math.round(clampNum(r.w, minW, Math.max(minW, vw - 24)));
  const hPx = Math.round(clampNum(r.h, minH, Math.max(minH, vh - 24)));
  return {
    x: Math.round(clampNum(r.x, 8, Math.max(8, vw - w - 8))),
    y: Math.round(clampNum(r.y, 8, Math.max(8, vh - hPx - 8))),
    w,
    h: hPx,
    z: Math.max(30, Math.round(r.z)),
  };
}

function numOr(val: unknown, fallback: number): number {
  return typeof val === 'number' && Number.isFinite(val) ? val : fallback;
}

function parseSlot(val: unknown, id: PanelId): DockSlot {
  if (id === 'timeline') return val === 'float' ? 'float' : 'bottom';
  if (val === 'left' || val === 'right' || val === 'float') return val;
  return DEFAULT_LAYOUT.slots[id];
}

export function sanitizeLayout(raw: unknown): LayoutState {
  if (!raw || typeof raw !== 'object') return cloneLayout(DEFAULT_LAYOUT);
  const obj = raw as Record<string, unknown>;
  const rawSlots = (obj.slots && typeof obj.slots === 'object' ? obj.slots : {}) as Record<string, unknown>;
  const slots: Record<PanelId, DockSlot> = {
    left: parseSlot(rawSlots.left, 'left'),
    right: parseSlot(rawSlots.right, 'right'),
    timeline: parseSlot(rawSlots.timeline, 'timeline'),
  };
  if ((slots.left === 'left' || slots.left === 'right') && slots.left === slots.right) {
    slots.right = slots.left === 'left' ? 'right' : 'left';
  }
  const rawFloats = (obj.floats && typeof obj.floats === 'object' ? obj.floats : {}) as Record<string, unknown>;
  const pickFloat = (id: PanelId): FloatRect => {
    const rf = (rawFloats[id] && typeof rawFloats[id] === 'object' ? rawFloats[id] : {}) as Record<string, unknown>;
    const def = DEFAULT_LAYOUT.floats[id];
    return clampFloatRect(id, {
      x: numOr(rf.x, def.x),
      y: numOr(rf.y, def.y),
      w: numOr(rf.w, def.w),
      h: numOr(rf.h, def.h),
      z: numOr(rf.z, def.z),
    });
  };
  return {
    slots,
    leftWidth: clampSideWidth(numOr(obj.leftWidth, DEFAULT_LAYOUT.leftWidth)),
    rightWidth: clampSideWidth(numOr(obj.rightWidth, DEFAULT_LAYOUT.rightWidth)),
    bottomHeight: typeof obj.bottomHeight === 'number' && Number.isFinite(obj.bottomHeight)
      ? clampBottomHeight(obj.bottomHeight)
      : null,
    floats: { left: pickFloat('left'), right: pickFloat('right'), timeline: pickFloat('timeline') },
  };
}

export interface DockMountOpts {
  rootEl: HTMLElement;
  panels: Record<PanelId, HTMLElement>;
  isVisible: (id: PanelId) => boolean;
  isZen: () => boolean;
  onCommit: () => void;
  onAnnounce?: (msg: string) => void;
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
 * and floating window corner/edge resizing for `/comix-editor` panels.
 */
export class DockLayoutController {
  private state: LayoutState;
  private dockWidths: { left: number; right: number };
  private opts: DockMountOpts | null = null;
  private topZ = 35;
  private leftSplitEl: HTMLElement | null = null;
  private rightSplitEl: HTMLElement | null = null;
  private bottomSplitEl: HTMLElement | null = null;
  private dropPreviewEl: HTMLElement | null = null;
  private dropTarget: DockSlot | null = null;

  constructor(initial?: LayoutState) {
    this.state = initial ? cloneLayout(initial) : cloneLayout(DEFAULT_LAYOUT);
    this.dockWidths = {
      left: this.state.slots.left === 'left'
        ? this.state.leftWidth
        : this.state.slots.left === 'right'
          ? this.state.rightWidth
          : DEFAULT_LAYOUT.leftWidth,
      right: this.state.slots.right === 'right'
        ? this.state.rightWidth
        : this.state.slots.right === 'left'
          ? this.state.leftWidth
          : DEFAULT_LAYOUT.rightWidth,
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
      'aria-label': 'Resize left dock width',
      tabIndex: 0,
      title: 'Drag to resize left dock (double-click to reset)',
    });
    this.rightSplitEl = h('div', {
      class: 'cx-splitter cx-split-right',
      role: 'separator',
      'aria-orientation': 'vertical',
      'aria-valuemin': String(MIN_SIDE_W),
      'aria-valuemax': '760',
      'aria-valuenow': String(this.state.rightWidth),
      'aria-label': 'Resize right dock width',
      tabIndex: 0,
      title: 'Drag to resize right dock (double-click to reset)',
    });
    this.bottomSplitEl = h('div', {
      class: 'cx-splitter cx-split-bottom',
      role: 'separator',
      'aria-orientation': 'horizontal',
      'aria-valuemin': String(MIN_BOTTOM_H),
      'aria-valuemax': '560',
      'aria-valuenow': String(this.state.bottomHeight ?? 150),
      'aria-label': 'Resize timeline dock height',
      tabIndex: 0,
      title: 'Drag to resize timeline height (double-click to reset)',
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
    this.opts?.onAnnounce?.(`${id === 'left' ? 'Pages' : id === 'right' ? 'Inspector' : 'Timeline'} panel floated`);
  }

  dockPanel(id: PanelId, target?: DockSlot): void {
    let slot: DockSlot = target ?? DEFAULT_LAYOUT.slots[id];
    if (id === 'timeline') slot = 'bottom';
    else if (slot !== 'left' && slot !== 'right') slot = DEFAULT_LAYOUT.slots[id];
    if (slot === 'left' || slot === 'right') {
      const other: 'left' | 'right' = id === 'left' ? 'right' : 'left';
      if (this.state.slots[other] === slot) {
        this.state.slots[other] = slot === 'left' ? 'right' : 'left';
      }
    }
    this.state.slots[id] = slot;
    this.syncEdgeWidthsFromPanels();
    this.commit();
    this.opts?.onAnnounce?.(`${id === 'left' ? 'Pages' : id === 'right' ? 'Inspector' : 'Timeline'} docked to ${slot}`);
  }

  reset(): void {
    this.state = cloneLayout(DEFAULT_LAYOUT);
    this.dockWidths = { left: DEFAULT_LAYOUT.leftWidth, right: DEFAULT_LAYOUT.rightWidth };
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
      this.leftSplitEl.hidden = !hasLeft;
      this.leftSplitEl.setAttribute('aria-valuenow', String(this.state.leftWidth));
    }
    if (this.rightSplitEl) {
      this.rightSplitEl.hidden = !hasRight;
      this.rightSplitEl.setAttribute('aria-valuenow', String(this.state.rightWidth));
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
        const defW = occ === 'right' ? DEFAULT_LAYOUT.rightWidth : DEFAULT_LAYOUT.leftWidth;
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
