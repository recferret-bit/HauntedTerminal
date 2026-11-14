import { clampNum } from './drag.js';

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

export interface DockSizeDefaults {
  leftWidth: number;
  rightWidth: number;
  bottomHeight: number | null;
}

export const PANEL_IDS: readonly PanelId[] = ['left', 'right', 'timeline'];
export const MIN_SIDE_W = 170;
export const MIN_BOTTOM_H = 115;

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

export function makeDefaultLayout(defaults?: Partial<DockSizeDefaults>): LayoutState {
  return {
    slots: { ...DEFAULT_LAYOUT.slots },
    leftWidth: defaults?.leftWidth ?? DEFAULT_LAYOUT.leftWidth,
    rightWidth: defaults?.rightWidth ?? DEFAULT_LAYOUT.rightWidth,
    bottomHeight: defaults?.bottomHeight ?? DEFAULT_LAYOUT.bottomHeight,
    floats: {
      left: { ...DEFAULT_LAYOUT.floats.left },
      right: { ...DEFAULT_LAYOUT.floats.right },
      timeline: { ...DEFAULT_LAYOUT.floats.timeline },
    },
  };
}

export function cloneLayout(src: LayoutState): LayoutState {
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

export function clampSideWidth(px: number): number {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1600;
  return Math.round(clampNum(px, MIN_SIDE_W, Math.max(280, Math.min(760, vw * 0.45))));
}

export function clampBottomHeight(px: number): number {
  const vh = typeof window !== 'undefined' ? window.innerHeight : 960;
  return Math.round(clampNum(px, MIN_BOTTOM_H, Math.max(220, vh * 0.55)));
}

export function clampFloatRect(id: PanelId, r: FloatRect): FloatRect {
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

function parseSlot(val: unknown, id: PanelId, defaults: LayoutState): DockSlot {
  if (id === 'timeline') return val === 'float' ? 'float' : 'bottom';
  if (val === 'left' || val === 'right' || val === 'float') return val;
  return defaults.slots[id];
}

export function sanitizeLayout(raw: unknown, sizeDefaults?: Partial<DockSizeDefaults>): LayoutState {
  const base = makeDefaultLayout(sizeDefaults);
  if (!raw || typeof raw !== 'object') return base;
  const obj = raw as Record<string, unknown>;
  const rawSlots = (obj.slots && typeof obj.slots === 'object' ? obj.slots : {}) as Record<string, unknown>;
  const slots: Record<PanelId, DockSlot> = {
    left: parseSlot(rawSlots.left, 'left', base),
    right: parseSlot(rawSlots.right, 'right', base),
    timeline: parseSlot(rawSlots.timeline, 'timeline', base),
  };
  if ((slots.left === 'left' || slots.left === 'right') && slots.left === slots.right) {
    slots.right = slots.left === 'left' ? 'right' : 'left';
  }
  const rawFloats = (obj.floats && typeof obj.floats === 'object' ? obj.floats : {}) as Record<string, unknown>;
  const pickFloat = (id: PanelId): FloatRect => {
    const rf = (rawFloats[id] && typeof rawFloats[id] === 'object' ? rawFloats[id] : {}) as Record<string, unknown>;
    const def = base.floats[id];
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
    leftWidth: clampSideWidth(numOr(obj.leftWidth, base.leftWidth)),
    rightWidth: clampSideWidth(numOr(obj.rightWidth, base.rightWidth)),
    bottomHeight: typeof obj.bottomHeight === 'number' && Number.isFinite(obj.bottomHeight)
      ? clampBottomHeight(obj.bottomHeight)
      : null,
    floats: { left: pickFloat('left'), right: pickFloat('right'), timeline: pickFloat('timeline') },
  };
}
