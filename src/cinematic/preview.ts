/**
 * `/cinematic.html`: standalone preview & freeze-frame studio for any comix in `comix/<slug>/`.
 *   ?play=<slug>             start that comix immediately (otherwise show a dynamic catalog menu)
 *   &t=<seconds>             freeze at that timestamp (fast-forwarded at fixed 1/60s steps)
 *   &muted=1  &skippable=0   playback options
 *   &draft=1                 play `localStorage['ht-comix-draft']` when it matches `<slug>`
 *   &editor=1                enable interactive wheel zoom & pointer drag-pan on the 3D stage
 *   &rank=S|A|B|C  &time=<s>  &commands=<n>  &shortcuts=a,b   scorecard stats
 * `window.__cinematic` exposes `{ state, which, manifests, text(), children(), seek(), sceneView(), ... }`.
 */
import { COMIX_MANIFESTS, playComix, type ComixStats, type DebugOptions } from './index.js';
import { EditorSelectionOverlay, pickComixElementAt, type ComixElementRef } from './editor-select.js';
import { el } from './page.js';
import type { ComixWorld } from './reel.js';
import type { Runner } from './runner.js';

export interface SceneViewState {
  zoom: number;
  panX: number;
  panY: number;
}

export interface EditorCallbacks {
  onSceneView?: (v: SceneViewState) => void;
  onPageWheelZoom?: (factor: number) => void;
  onSelectElement?: (sel: ComixElementRef | null) => void;
}

const params = new URLSearchParams(location.search);
const host = document.getElementById('host')!;
const menu = document.getElementById('menu')!;
const listHost = document.getElementById('menu-list') ?? menu;

let activeRunner: Runner | null = null;
let activeWorld: ComixWorld | null = null;
let editorCbs: EditorCallbacks | null = null;
const selectionOverlay = new EditorSelectionOverlay();
const viewState: SceneViewState = { zoom: 1, panX: 0, panY: 0 };
const state = { state: 'idle' as 'idle' | 'playing' | 'done', which: '' };

const round2 = (v: number): number => Math.round(v * 100) / 100;
const clampZoom = (z: number): number => Math.max(0.25, Math.min(6, z));

function applySceneView(next: Partial<SceneViewState>): SceneViewState {
  if (next.zoom !== undefined && Number.isFinite(next.zoom)) viewState.zoom = clampZoom(next.zoom);
  if (next.panX !== undefined && Number.isFinite(next.panX)) viewState.panX = next.panX;
  if (next.panY !== undefined && Number.isFinite(next.panY)) viewState.panY = next.panY;
  const stage = activeWorld?.stage;
  if (stage) {
    stage.sceneZoom = viewState.zoom;
    stage.scenePanX = viewState.panX;
    stage.scenePanY = viewState.panY;
    const clamped = stage.syncClampedPan();
    viewState.panX = clamped.panX;
    viewState.panY = clamped.panY;
    activeRunner?.redraw();
  }
  const snap = { ...viewState };
  editorCbs?.onSceneView?.(snap);
  return snap;
}

function installEditorInteractions(): void {
  host.addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      editorCbs?.onPageWheelZoom?.(Math.exp(-e.deltaY * 0.0015));
      return;
    }
    const stage = activeWorld?.stage;
    if (!stage) return;
    e.preventDefault();
    const z1 = clampZoom(viewState.zoom * Math.exp(-e.deltaY * 0.0015));
    const curId = activeWorld?.current;
    const panelEl = curId ? host.querySelector<HTMLElement>(`[data-panel="${curId}"]`) : null;
    const rect = panelEl?.getBoundingClientRect();
    const v0 = stage.effectiveView();
    stage.sceneZoom = z1;
    viewState.zoom = z1;
    if (rect && rect.width > 1 && rect.height > 1 &&
        e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
      const nx = (e.clientX - rect.left) / rect.width - 0.5;
      const ny = (e.clientY - rect.top) / rect.height - 0.5;
      const v1 = stage.effectiveView();
      viewState.panX += nx * (v1.w - v0.w);
      viewState.panY += ny * (v1.h - v0.h);
      stage.scenePanX = viewState.panX;
      stage.scenePanY = viewState.panY;
    }
    const clamped = stage.syncClampedPan();
    viewState.panX = clamped.panX;
    viewState.panY = clamped.panY;
    activeRunner?.redraw();
    editorCbs?.onSceneView?.({ ...viewState });
  }, { passive: false });

  interface DragState {
    id: number;
    startX: number;
    startY: number;
    x: number;
    y: number;
    canPan: boolean;
    moved: boolean;
  }
  let drag: DragState | null = null;
  host.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement | null)?.closest('.htc-controls')) return;
    const canPan = Boolean(
      activeWorld?.stage &&
        (e.button === 1 || e.altKey || (e.button === 0 && (activeRunner?.frozen || activeRunner?.paused))),
    );
    const canPick = e.button === 0 && !e.altKey && Boolean(activeWorld);
    if (!canPan && !canPick) return;
    if (canPan) e.preventDefault();
    drag = {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      x: e.clientX,
      y: e.clientY,
      canPan,
      moved: false,
    };
  });
  host.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.moved) {
      if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 4) return;
      drag.moved = true;
      if (!drag.canPan) return;
      host.setPointerCapture(e.pointerId);
      host.style.cursor = 'grabbing';
    }
    if (!drag.canPan) return;
    const stage = activeWorld?.stage;
    if (!stage) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    drag.x = e.clientX;
    drag.y = e.clientY;
    const upp = stage.unitsPerPx;
    applySceneView({ panX: viewState.panX + dx * upp, panY: viewState.panY + dy * upp });
  });
  const endDrag = (e: PointerEvent, pickOnTap: boolean): void => {
    if (!drag || e.pointerId !== drag.id) return;
    const cur = drag;
    drag = null;
    if (host.hasPointerCapture(e.pointerId)) host.releasePointerCapture(e.pointerId);
    host.style.cursor = '';
    if (pickOnTap && !cur.moved && e.button === 0 && !e.altKey && activeWorld) {
      const sel = pickComixElementAt(activeWorld, e.clientX, e.clientY);
      selectionOverlay.setSelected(sel, activeWorld);
      editorCbs?.onSelectElement?.(sel);
    }
  };
  host.addEventListener('pointerup', (e) => endDrag(e, true));
  host.addEventListener('pointercancel', (e) => endDrag(e, false));
}

(window as unknown as { __cinematic: unknown }).__cinematic = {
  get state() {
    return state.state;
  },
  get which() {
    return state.which;
  },
  get time() {
    return activeRunner?.time ?? 0;
  },
  get paused() {
    return activeRunner?.paused ?? false;
  },
  get frozen() {
    return activeRunner?.frozen ?? false;
  },
  get currentPanel() {
    return host.querySelector<HTMLElement>('[data-active-panel]')?.dataset.activePanel ?? '';
  },
  seek(targetSec: number): boolean {
    if (!activeRunner || state.state !== 'playing') return false;
    activeRunner.seek(targetSec);
    return true;
  },
  setPaused(p: boolean): boolean {
    if (!activeRunner || state.state !== 'playing') return false;
    activeRunner.setPaused(p);
    return true;
  },
  playFromStart(): boolean {
    if (!activeRunner || state.state !== 'playing') return false;
    activeRunner.playFromStart();
    return true;
  },
  sceneView: (): SceneViewState => ({ ...viewState }),
  setSceneView: (next: Partial<SceneViewState>): SceneViewState => applySceneView(next),
  resetSceneView: (): SceneViewState => applySceneView({ zoom: 1, panX: 0, panY: 0 }),
  effectiveShot: (): { x: number; y: number; w: number; h: number } | null => {
    const stage = activeWorld?.stage;
    if (!stage) return null;
    const s = stage.effectiveView();
    return { x: round2(s.x), y: round2(s.y), w: round2(s.w), h: round2(s.h) };
  },
  onEditorCallbacks: (cbs: EditorCallbacks): void => {
    editorCbs = cbs;
  },
  selectedElement: (): ComixElementRef | null => selectionOverlay.getSelected(),
  selectElement: (ref: ComixElementRef | null): ComixElementRef | null => {
    selectionOverlay.setSelected(ref, activeWorld);
    return selectionOverlay.getSelected();
  },
  pickAt: (clientX: number, clientY: number): ComixElementRef | null => {
    if (!activeWorld) return null;
    const sel = pickComixElementAt(activeWorld, clientX, clientY);
    selectionOverlay.setSelected(sel, activeWorld);
    editorCbs?.onSelectElement?.(sel);
    return sel;
  },
  manifests: () => COMIX_MANIFESTS.map((m) => ({ id: m.id, title: m.title, durationSec: m.durationSec, pages: m.pages.length })),
  text: () => host.innerText,
  children: () => host.childElementCount,
};

const stats: ComixStats = {
  rank: ['S', 'A', 'B', 'C'].includes(params.get('rank') ?? '') ? (params.get('rank') as string) : 'A',
  timeSec: Number(params.get('time') ?? 1234),
  commands: Number(params.get('commands') ?? 87),
  shortcuts: (params.get('shortcuts') ?? 'ls -la,chmod +x,kill -9,cd -,!!,tab-complete').split(',').filter(Boolean),
};

const opts = { muted: params.get('muted') === '1', skippable: params.get('skippable') !== '0' };
const freeze = params.has('t') ? Number(params.get('t')) : undefined;
const debug: DebugOptions = {
  onRunner: (r) => {
    activeRunner = r;
  },
  onWorld: (w) => {
    activeWorld = w;
    if (w.stage) {
      w.stage.sceneZoom = viewState.zoom;
      w.stage.scenePanX = viewState.panX;
      w.stage.scenePanY = viewState.panY;
    }
    if (debug.editor) {
      selectionOverlay.attach(w);
      selectionOverlay.update(w);
    }
  },
  onDraw: (w) => {
    if (debug.editor) selectionOverlay.update(w);
  },
};
if (freeze !== undefined && Number.isFinite(freeze)) debug.freezeAt = freeze;
if (params.get('draft') === '1') debug.draft = true;
if (params.get('editor') === '1') {
  debug.editor = true;
  installEditorInteractions();
}

async function play(which: string): Promise<void> {
  menu.hidden = true;
  state.state = 'playing';
  state.which = which;
  try {
    await playComix(which, host, opts, stats, debug);
  } finally {
    activeRunner = null;
    activeWorld = null;
  }
  state.state = 'done';
  menu.hidden = false;
}

for (const manifest of COMIX_MANIFESTS) {
  const btn = el('button', '', `PLAY ${manifest.title.toUpperCase()} (${manifest.durationSec}s · ${manifest.pages.length}p)`);
  btn.type = 'button';
  btn.dataset.play = manifest.id;
  btn.addEventListener('click', () => void play(manifest.id));
  listHost.appendChild(btn);
}

const requested = params.get('play');
if (requested && (debug.draft || COMIX_MANIFESTS.some((m) => m.id === requested))) {
  void play(requested);
} else {
  menu.hidden = false;
}
