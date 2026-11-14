import { h } from '../chapter-editor/dom.js';
import type { ComixPanelSpec, Rect4 } from '../cinematic/spec-types.js';
import { bindPointerGesture, clampNum } from './drag.js';

export interface SheetBoxOpts {
  sheet: HTMLElement;
  panel: ComixPanelSpec;
  index: number;
  mode: 'landscape' | 'portrait';
  jumpSec: number;
  active?: boolean;
  onJump: () => void;
  onCommitRect: () => void;
}

const roundGrid = (v: number): number => Math.round(v * 200) / 200;

function applyBoxStyle(box: HTMLElement, r: Rect4): void {
  box.style.left = `${(r[0] * 100).toFixed(1)}%`;
  box.style.top = `${(r[1] * 100).toFixed(1)}%`;
  box.style.width = `${(r[2] * 100).toFixed(1)}%`;
  box.style.height = `${(r[3] * 100).toFixed(1)}%`;
}

/**
 * Renders one interactive comic panel box on the 2D Landscape/Portrait sheet:
 * click to jump preview, drag box to move `[x, y]`, drag corner handle to resize `[w, h]`.
 */
export function createInteractiveSheetBox(opts: SheetBoxOpts): HTMLElement {
  const raw = opts.panel.layout?.[opts.mode];
  const initial: Rect4 = Array.isArray(raw) && raw.length === 4 ? [...raw] : [0.05, 0.05, 0.9, 0.9];
  const resizeHandle = h('i', {
    class: 'layout-box-se',
    title: 'Drag corner to resize comic panel bounds',
    'data-panel-resize': opts.panel.id,
  });
  const box = h(
    'button',
    {
      type: 'button',
      class: `layout-box${opts.active ? ' is-active' : ''}`,
      'data-panel-id': opts.panel.id,
      title: `Click to preview ${opts.panel.id} (${opts.jumpSec.toFixed(2)}s) · Drag or Alt+Arrows to move · Corner or Alt+Shift+Arrows to resize`,
    },
    h('b', {}, `${opts.index + 1}. ${opts.panel.id}`),
    h('span', {}, `${opts.panel.from} → ${opts.panel.until}`),
    resizeHandle,
  );
  applyBoxStyle(box, initial);

  let suppressClickUntil = 0;
  let startRect: Rect4 = [...initial];
  let sheetRect = opts.sheet.getBoundingClientRect();

  const commitWrite = (next: Rect4): void => {
    if (!opts.panel.layout) opts.panel.layout = { landscape: [...next], portrait: [...next] };
    opts.panel.layout[opts.mode] = next;
    applyBoxStyle(box, next);
  };

  box.addEventListener('click', (ev) => {
    if (Date.now() < suppressClickUntil) return;
    if (ev.target instanceof Element && ev.target.closest('.layout-box-se')) return;
    opts.onJump();
  });

  const bindBoxEdit = (trigger: HTMLElement, kind: 'move' | 'resize'): void => {
    bindPointerGesture(trigger, {
      threshold: kind === 'move' ? 4 : 2,
      cursor: kind === 'move' ? 'grabbing' : 'nwse-resize',
      allowStart: kind === 'move' ? (t) => !t.closest('.layout-box-se') : undefined,
      onStart: () => {
        const cur = opts.panel.layout?.[opts.mode];
        startRect = Array.isArray(cur) && cur.length === 4 ? [...cur] : [...initial];
        sheetRect = opts.sheet.getBoundingClientRect();
        box.setAttribute('data-dragging', 'true');
      },
      onMove: (s) => {
        const d0 = s.dx / Math.max(1, sheetRect.width);
        const d1 = s.dy / Math.max(1, sheetRect.height);
        const next: Rect4 = kind === 'move'
          ? [
              roundGrid(clampNum(startRect[0] + d0, 0, Math.max(0, 1 - startRect[2]))),
              roundGrid(clampNum(startRect[1] + d1, 0, Math.max(0, 1 - startRect[3]))),
              startRect[2],
              startRect[3],
            ]
          : [
              startRect[0],
              startRect[1],
              roundGrid(clampNum(startRect[2] + d0, 0.08, Math.max(0.08, 1 - startRect[0]))),
              roundGrid(clampNum(startRect[3] + d1, 0.08, Math.max(0.08, 1 - startRect[1]))),
            ];
        commitWrite(next);
      },
      onEnd: () => {
        box.removeAttribute('data-dragging');
        suppressClickUntil = Date.now() + 250;
        opts.onCommitRect();
      },
    });
  };

  box.addEventListener('keydown', (ev) => {
    if (!ev.altKey) return;
    const dx = ev.key === 'ArrowRight' ? 0.02 : ev.key === 'ArrowLeft' ? -0.02 : 0;
    const dy = ev.key === 'ArrowDown' ? 0.02 : ev.key === 'ArrowUp' ? -0.02 : 0;
    if (!dx && !dy) return;
    ev.preventDefault();
    const cur = opts.panel.layout?.[opts.mode];
    const r: Rect4 = Array.isArray(cur) && cur.length === 4 ? [...cur] : [...initial];
    const next: Rect4 = ev.shiftKey
      ? [
          r[0],
          r[1],
          roundGrid(clampNum(r[2] + dx, 0.08, Math.max(0.08, 1 - r[0]))),
          roundGrid(clampNum(r[3] + dy, 0.08, Math.max(0.08, 1 - r[1]))),
        ]
      : [
          roundGrid(clampNum(r[0] + dx, 0, Math.max(0, 1 - r[2]))),
          roundGrid(clampNum(r[1] + dy, 0, Math.max(0, 1 - r[3]))),
          r[2],
          r[3],
        ];
    commitWrite(next);
    opts.onCommitRect();
  });

  bindBoxEdit(box, 'move');
  bindBoxEdit(resizeHandle, 'resize');
  return box;
}
