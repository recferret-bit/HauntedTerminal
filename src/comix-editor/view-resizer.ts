import { h } from '../chapter-editor/dom.js';
import { bindPointerGesture, clampNum } from './drag.js';

function centeredDelta(start: number, delta: number, innerLimit: number): number {
  if (start <= innerLimit) {
    const doubled = start + delta * 2;
    if (doubled <= innerLimit) return doubled;
    return innerLimit + (delta - (innerLimit - start) / 2);
  }
  const linear = start + delta;
  if (linear >= innerLimit) return linear;
  return innerLimit - (innerLimit - start - delta) * 2;
}

const VIEW_RESIZERS = [
  { cls: 'cx-vr-w', axis: 'x', dirX: -1, dirY: 1, cursor: 'ew-resize', orient: 'vertical', label: 'Resize Comix View width from left edge' },
  { cls: 'cx-vr-e', axis: 'x', dirX: 1, dirY: 1, cursor: 'ew-resize', orient: 'vertical', label: 'Resize Comix View width from right edge' },
  { cls: 'cx-vr-n', axis: 'y', dirX: 1, dirY: -1, cursor: 'ns-resize', orient: 'horizontal', label: 'Resize Comix View height from top edge' },
  { cls: 'cx-vr-s', axis: 'y', dirX: 1, dirY: 1, cursor: 'ns-resize', orient: 'horizontal', label: 'Resize Comix View height from bottom edge' },
  { cls: 'cx-vr-sw', axis: 'xy', dirX: -1, dirY: 1, cursor: 'nesw-resize', orient: 'horizontal', label: 'Resize Comix View bottom-left corner (Shift locks aspect)' },
  { cls: 'cx-vr-se', axis: 'xy', dirX: 1, dirY: 1, cursor: 'nwse-resize', orient: 'horizontal', label: 'Resize Comix View bottom-right corner (Shift locks aspect)' },
] as const;

export interface ViewResizerHooks {
  frameWrapEl: HTMLElement;
  frameEl: HTMLElement;
  matEl: HTMLElement;
  isPortrait: () => boolean;
  getViewportSize: () => { w: number; h: number };
  setViewportSize: (w: number, h: number) => void;
  resetFit: () => void;
  zoomPageBy: (factor: number) => void;
}

export function installViewResizers(hooks: ViewResizerHooks): HTMLElement[] {
  const handles: HTMLElement[] = [];
  for (const def of VIEW_RESIZERS) {
    const handle = h('div', {
      class: `cx-view-resizer ${def.cls}`,
      title: `${def.label} (Arrows resize, Enter/dblclick = Fit)`,
      role: 'separator',
      tabIndex: 0,
      'aria-orientation': def.orient,
      'aria-valuemin': def.axis === 'y' ? '175' : '220',
      'aria-valuemax': def.axis === 'y' ? '2400' : '2600',
      'aria-valuenow': def.axis === 'y' ? '500' : '800',
      'aria-label': def.label,
    });
    let startW = 800;
    let startH = 500;
    let matInnerW = 800;
    let matInnerH = 500;
    bindPointerGesture(handle, {
      cursor: def.cursor,
      onStart: () => {
        const rect = hooks.frameEl.getBoundingClientRect();
        startW = rect.width || 800;
        startH = rect.height || 500;
        matInnerW = Math.max(220, (hooks.matEl.clientWidth || 800) - 24);
        matInnerH = Math.max(175, (hooks.matEl.clientHeight || 500) - 24);
      },
      onMove: (s) => {
        const aspect = hooks.isPortrait() ? 9 / 16 : 16 / 10;
        const dx = s.dx * def.dirX;
        const dy = s.dy * def.dirY;
        let w = def.axis === 'y' ? startW : clampNum(centeredDelta(startW, dx, matInnerW), 220, 2600);
        let hPx = def.axis === 'x' ? startH : clampNum(centeredDelta(startH, dy, matInnerH), 175, 2400);
        if (s.shiftKey) {
          if (def.axis === 'y') w = clampNum(hPx * aspect, 220, 2600);
          else hPx = clampNum(w / aspect, 175, 2400);
        }
        hooks.setViewportSize(w, hPx);
      },
    });
    handle.addEventListener('dblclick', () => hooks.resetFit());
    handle.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === 'Home') {
        ev.preventDefault();
        hooks.resetFit();
        return;
      }
      const step = ev.shiftKey ? 48 : 20;
      const dx = ev.key === 'ArrowRight' ? step * def.dirX : ev.key === 'ArrowLeft' ? -step * def.dirX : 0;
      const dy = ev.key === 'ArrowDown' ? step * def.dirY : ev.key === 'ArrowUp' ? -step * def.dirY : 0;
      if (!dx && !dy) return;
      ev.preventDefault();
      const cur = hooks.getViewportSize();
      const w = def.axis === 'y' ? cur.w : cur.w + dx;
      const hPx = def.axis === 'x' ? cur.h : cur.h + dy;
      hooks.setViewportSize(w, hPx);
    });
    hooks.frameWrapEl.append(handle);
    handles.push(handle);
  }
  return handles;
}

export function syncViewResizerAria(handles: readonly HTMLElement[], w: number, hPx: number): void {
  for (const el of handles) {
    const isY = el.classList.contains('cx-vr-s') || el.classList.contains('cx-vr-n');
    el.setAttribute('aria-valuenow', String(Math.round(isY ? hPx : w)));
  }
}

export function installMatControls(hooks: Pick<ViewResizerHooks, 'matEl' | 'zoomPageBy'>): void {
  hooks.matEl.addEventListener('wheel', (ev) => {
    if (!ev.ctrlKey && !ev.metaKey) return;
    ev.preventDefault();
    hooks.zoomPageBy(Math.exp(-ev.deltaY * 0.0015));
  }, { passive: false });

  let startLeft = 0;
  let startTop = 0;
  bindPointerGesture(hooks.matEl, {
    buttons: [0, 1],
    cursor: 'grabbing',
    allowStart: (target, ev) => ev.button === 1 || target === hooks.matEl,
    onStart: () => {
      startLeft = hooks.matEl.scrollLeft;
      startTop = hooks.matEl.scrollTop;
    },
    onMove: (s) => {
      hooks.matEl.scrollLeft = startLeft - s.dx;
      hooks.matEl.scrollTop = startTop - s.dy;
    },
  });
}
