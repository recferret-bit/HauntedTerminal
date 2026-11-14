import { h } from '../chapter-editor/dom.js';
import type { DockId } from './workspace.js';

export interface StageBarDeps {
  fitBtn: HTMLButtonElement;
  pageReadoutBtn: HTMLButtonElement;
  sceneReadoutEl: HTMLElement;
  resetCamBtn: HTMLButtonElement;
  selReadoutBtn: HTMLButtonElement;
  zoomPageBy: (factor: number) => void;
  zoomSceneBy: (factor: number) => void;
  applySceneShot: () => void;
  onToggleZen?: () => void;
  onToggleDock?: (dock: DockId) => void;
}

export interface TransportBarDeps {
  playFullBtn: HTMLButtonElement;
  freezeBtn: HTMLButtonElement;
  aspectBtn: HTMLButtonElement;
  statusEl: HTMLElement;
  stepPanel: (delta: -1 | 1) => void;
  onToggleDock?: (dock: DockId) => void;
}

export function buildPreviewStageBar(d: StageBarDeps): HTMLElement {
  const pageGrp = h(
    'div',
    { class: 'cx-bar-grp', role: 'group', 'aria-label': 'Page canvas zoom' },
    h('span', { class: 'cx-bar-lbl' }, 'Page'),
    d.fitBtn,
    h('button', { type: 'button', class: 'mini', title: 'Zoom out page', 'aria-label': 'Zoom out page', onclick: () => d.zoomPageBy(1 / 1.2) }, '−'),
    d.pageReadoutBtn,
    h('button', { type: 'button', class: 'mini', title: 'Zoom in page', 'aria-label': 'Zoom in page', onclick: () => d.zoomPageBy(1.2) }, '+'),
  );
  const sceneGrp = h(
    'div',
    { class: 'cx-bar-grp', role: 'group', 'aria-label': '3D scene camera zoom' },
    h('span', { class: 'cx-bar-lbl' }, 'Scene'),
    h('button', { type: 'button', class: 'btn small', title: 'Zoom out 3D camera', onclick: () => d.zoomSceneBy(1 / 1.25) }, 'Scene −'),
    d.sceneReadoutEl,
    h('button', { type: 'button', class: 'btn small', title: 'Zoom in 3D camera', onclick: () => d.zoomSceneBy(1.25) }, 'Scene +'),
    d.resetCamBtn,
    h('button', {
      type: 'button',
      class: 'btn small',
      title: 'Write current 3D zoom & pan into active panel camera (landscape from/to or portrait)',
      onclick: () => d.applySceneShot(),
    }, '📷 Apply Shot'),
  );
  const rightGrp = h(
    'div',
    { class: 'cx-bar-right' },
    d.selReadoutBtn,
    h('span', { class: 'cx-bar-hint' }, 'Wheel: 3D · Drag: Pan · Ctrl+Wheel: Page'),
    h('button', { type: 'button', class: 'btn small', title: 'Focus Mode (`)', onclick: () => d.onToggleZen?.() }, '⛶ Focus'),
    h('button', {
      type: 'button',
      class: 'mini cx-dock-close',
      title: 'Hide viewport toolbar',
      'aria-label': 'Hide viewport toolbar',
      onclick: () => d.onToggleDock?.('stagebar'),
    }, '▴'),
  );
  return h('div', { class: 'cx-stage-bar' }, pageGrp, sceneGrp, rightGrp);
}

export function buildPreviewTransportBar(d: TransportBarDeps): HTMLElement {
  return h(
    'div',
    { class: 'pv-bar', 'data-panel-drag': 'timeline' },
    h('button', {
      type: 'button',
      class: 'mini cx-drag-grip',
      'data-drag-grip': 'timeline',
      title: 'Drag Timeline panel (double-click to dock)',
      'aria-label': 'Move Timeline panel (Enter toggles float, Arrows nudge, Alt+Arrows resize)',
    }, '⠿'),
    d.playFullBtn,
    d.freezeBtn,
    h('button', { type: 'button', class: 'btn small', onclick: () => d.stepPanel(-1) }, '◀ Panel'),
    h('button', { type: 'button', class: 'btn small', onclick: () => d.stepPanel(1) }, 'Panel ▶'),
    d.aspectBtn,
    d.statusEl,
    h('span', { class: 'cx-bar-spacer' }),
    h('button', {
      type: 'button',
      class: 'mini cx-redock-btn',
      'data-redock': 'timeline',
      title: 'Dock Timeline to bottom',
      'aria-label': 'Dock Timeline to bottom',
    }, '📌'),
    h('button', {
      type: 'button',
      class: 'mini cx-dock-toggle',
      title: 'Toggle quick-jump chips',
      'aria-label': 'Toggle quick-jump chips',
      onclick: () => d.onToggleDock?.('jumps'),
    }, '⊟'),
    h('button', {
      type: 'button',
      class: 'mini cx-dock-close',
      title: 'Hide timeline dock (\\)',
      'aria-label': 'Hide timeline dock',
      onclick: () => d.onToggleDock?.('timeline'),
    }, '▾'),
  );
}
