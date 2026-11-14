import { clear, h } from '../editor-core/dom.js';
import { clampNum } from '../editor-core/drag.js';
import { ViewportStageController } from '../editor-core/viewport-stage.js';
import { writeDraftComixPack } from '../cinematic/draft.js';
import type { ComixElementRef } from '../cinematic/editor-select.js';
import type { EditorCallbacks, SceneViewState } from '../cinematic/preview.js';
import type { ComixPack, ShotBox } from '../cinematic/spec-types.js';
import { activePanelAt, compileTimeline, visiblePanelStart, type ResolvedTimeline } from '../cinematic/timeline.js';
import type { ComixDockId } from './chrome.js';
import { buildPreviewStageBar, buildPreviewTransportBar } from './preview-bars.js';

interface PreviewCineApi {
  readonly state?: string;
  readonly which?: string;
  readonly time?: number;
  readonly paused?: boolean;
  readonly frozen?: boolean;
  readonly currentPanel?: string;
  seek?: (targetSec: number) => boolean;
  setPaused?: (p: boolean) => boolean;
  playFromStart?: () => boolean;
  sceneView?: () => SceneViewState;
  setSceneView?: (next: Partial<SceneViewState>) => SceneViewState;
  resetSceneView?: () => SceneViewState;
  effectiveShot?: () => ShotBox | null;
  selectElement?: (ref: ComixElementRef | null) => ComixElementRef | null;
  pickAt?: (clientX: number, clientY: number) => ComixElementRef | null;
  onEditorCallbacks?: (cbs: EditorCallbacks) => void;
}

interface PreviewWindow {
  __cinematic?: PreviewCineApi;
}

export interface ComixPreviewOpts {
  getPack: () => ComixPack;
  onToggleDock?: (dock: ComixDockId) => void;
  onToggleZen?: () => void;
  onApplyShot?: (panelId: string, shot: ShotBox, portrait: boolean) => void;
  onSelectElement?: (sel: ComixElementRef | null) => void;
  onRevealSelected?: (sel: ComixElementRef) => void;
}

const clampSceneZoom = (z: number): number => clampNum(z, 0.25, 6);

/**
 * Center Comix Viewport (`stageEl`) + Bottom Timeline Dock (`timelineEl`).
 * Supports full-reel playback, in-place 0.05s scrubbing, Page Canvas zoom (`Fit` / `40%-250%`),
 * symmetric edge/corner resize, and 3D Scene Camera zoom/pan (`0.25x-6.0x` + Apply Shot).
 */
export class ComixPreview {
  readonly stageEl: HTMLElement;
  readonly timelineEl: HTMLElement;
  readonly stage: ViewportStageController;
  private readonly playFullBtn: HTMLButtonElement;
  private readonly freezeBtn: HTMLButtonElement;
  private readonly sceneReadoutEl: HTMLElement;
  private readonly resetCamBtn: HTMLButtonElement;
  private readonly selReadoutBtn: HTMLButtonElement;
  private readonly slider: HTMLInputElement;
  private readonly numInput: HTMLInputElement;
  private readonly statusEl: HTMLElement;
  private readonly jumpsEl: HTMLElement;
  private timeline: ResolvedTimeline | null = null;
  private rev = 0;
  private debounceId = 0;
  private sec = 0;
  private frozen = false;
  private sceneView: SceneViewState = { zoom: 1, panX: 0, panY: 0 };
  private selectedRef: ComixElementRef | null = null;
  private loadedSlug = '';
  private loadedDraftJson = '';

  constructor(private readonly opts: ComixPreviewOpts) {
    this.stage = new ViewportStageController({
      frameTitle: 'Comix preview',
      onFrameLoad: () => this.bindIframe(),
      onPortraitChange: () => {
        if (!this.frozen) return;
        this.updateFrozenStatus(this.opts.getPack(), this.sec);
        window.requestAnimationFrame(() => this.jumpTo(this.sec));
      },
    });
    this.statusEl = h('span', { class: 'pv-status', role: 'status' }, 'Ready');

    this.playFullBtn = h('button', {
      type: 'button',
      class: 'btn primary',
      'aria-pressed': 'true',
      onclick: () => this.playFull(),
    }, '▶ Play Full');
    this.freezeBtn = h('button', {
      type: 'button',
      class: 'btn',
      'aria-pressed': 'false',
      onclick: () => this.jumpTo(this.sec),
    }, '⏸ Freeze');

    this.sceneReadoutEl = h('span', { class: 'cx-readout mono', title: '3D Scene Camera Zoom & Pan' }, '1.00×');
    this.resetCamBtn = h('button', {
      type: 'button',
      class: 'btn small',
      disabled: true,
      title: 'Reset 3D Scene Camera zoom & pan',
      onclick: () => this.resetSceneView(),
    }, '↺ Reset Cam');
    this.selReadoutBtn = h('button', {
      type: 'button',
      class: 'cx-sel-pill',
      hidden: true,
      title: 'Selected element — click to reveal & focus in Inspector',
      onclick: () => { if (this.selectedRef) this.opts.onRevealSelected?.(this.selectedRef); },
    }, '');

    this.slider = h('input', {
      type: 'range',
      min: 0,
      max: 10,
      step: 0.05,
      value: 0,
      'aria-label': 'Timeline scrubber (seconds)',
      oninput: () => {
        const next = Number(this.slider.value) || 0;
        this.setSecInputs(next);
        this.jumpSoon(next);
      },
      onchange: () => this.jumpTo(Number(this.slider.value) || 0),
    });
    this.numInput = h('input', {
      type: 'number',
      min: 0,
      step: 0.1,
      value: 0,
      class: 'mono',
      'aria-label': 'Preview timestamp (seconds)',
      onchange: () => this.jumpTo(Number(this.numInput.value) || 0),
    });
    this.jumpsEl = h('div', { class: 'comix-jumps', 'aria-label': 'Timeline quick jumps' });

    const stageBar = buildPreviewStageBar({
      pageZoomGroup: this.stage.buildZoomGroup('Page'),
      sceneReadoutEl: this.sceneReadoutEl,
      resetCamBtn: this.resetCamBtn,
      selReadoutBtn: this.selReadoutBtn,
      zoomSceneBy: (f) => this.zoomSceneBy(f),
      applySceneShot: () => { this.applySceneShot(); },
      onToggleZen: this.opts.onToggleZen,
      onToggleDock: this.opts.onToggleDock,
    });
    const transportBar = buildPreviewTransportBar({
      playFullBtn: this.playFullBtn,
      freezeBtn: this.freezeBtn,
      aspectBtn: this.stage.aspectBtn,
      statusEl: this.statusEl,
      stepPanel: (d) => this.stepPanel(d),
      onToggleDock: this.opts.onToggleDock,
    });
    this.stageEl = h('section', { class: 'cx-stage', 'aria-label': 'Comix Viewport' }, stageBar, this.stage.matEl);
    this.timelineEl = h(
      'section',
      { class: 'cx-timeline', 'aria-label': 'Timeline and Transport' },
      transportBar,
      h('div', { class: 'comix-scrub' }, this.slider, this.numInput),
      this.jumpsEl,
    );

    window.setInterval(() => this.tickLive(), 100);
  }

  get currentTime(): number {
    return this.sec;
  }

  get mode(): 'play' | 'freeze' {
    return this.frozen ? 'freeze' : 'play';
  }

  get activePanelId(): string {
    return this.cine()?.currentPanel || (this.timeline ? activePanelAt(this.timeline, this.sec).id : '');
  }

  get sceneZoomValue(): number {
    return this.sceneView.zoom;
  }

  setSceneView(next: Partial<SceneViewState>): void {
    this.sceneView = {
      zoom: next.zoom !== undefined ? clampSceneZoom(next.zoom) : this.sceneView.zoom,
      panX: next.panX ?? this.sceneView.panX,
      panY: next.panY ?? this.sceneView.panY,
    };
    const cine = this.cine();
    if (cine?.setSceneView) this.sceneView = cine.setSceneView(this.sceneView);
    this.syncSceneReadout();
  }

  zoomSceneBy(factor: number): void {
    this.setSceneView({ zoom: this.sceneView.zoom * factor });
  }

  resetSceneView(): void {
    this.sceneView = { zoom: 1, panX: 0, panY: 0 };
    const cine = this.cine();
    if (cine?.resetSceneView) this.sceneView = cine.resetSceneView();
    this.syncSceneReadout();
  }

  applySceneShot(): boolean {
    const cine = this.cine();
    const shot = cine?.effectiveShot?.();
    if (!shot) return false;
    const panelId = this.activePanelId;
    if (!panelId) return false;
    this.opts.onApplyShot?.(panelId, shot, this.stage.isPortrait);
    return true;
  }

  get currentSec(): number {
    const cine = this.cine();
    return !this.frozen && cine && typeof cine.time === 'number' ? cine.time : this.sec;
  }

  getSelectedElement(): ComixElementRef | null {
    return this.selectedRef;
  }

  setSelectedElement(ref: ComixElementRef | null): void {
    this.selectedRef = ref;
    this.syncSelectionReadout();
    this.cine()?.selectElement?.(ref);
  }

  pickViewportAt(clientX: number, clientY: number): ComixElementRef | null {
    return this.cine()?.pickAt?.(clientX, clientY) ?? null;
  }

  private syncSelectionReadout(): void {
    this.selReadoutBtn.hidden = !this.selectedRef;
    this.selReadoutBtn.textContent = this.selectedRef ? `◎ ${this.selectedRef.label}` : '';
  }

  private cine(): PreviewCineApi | undefined {
    return (this.stage.frame.contentWindow as PreviewWindow | null)?.__cinematic;
  }

  private isSceneDirty(): boolean {
    return Math.abs(this.sceneView.zoom - 1) > 1e-3 || Math.abs(this.sceneView.panX) > 1e-3 || Math.abs(this.sceneView.panY) > 1e-3;
  }

  private syncSceneReadout(): void {
    const { zoom, panX, panY } = this.sceneView;
    const panned = Math.abs(panX) > 0.01 || Math.abs(panY) > 0.01;
    this.sceneReadoutEl.textContent = panned ? `${zoom.toFixed(2)}× (${panX.toFixed(2)},${panY.toFixed(2)})` : `${zoom.toFixed(2)}×`;
    this.resetCamBtn.disabled = !this.isSceneDirty();
  }

  private syncTransportState(): void {
    this.playFullBtn.classList.toggle('primary', !this.frozen);
    this.playFullBtn.setAttribute('aria-pressed', String(!this.frozen));
    this.freezeBtn.classList.toggle('primary', this.frozen);
    this.freezeBtn.setAttribute('aria-pressed', String(this.frozen));
  }

  private syncActiveIndicators(atSec: number): void {
    const active = this.timeline ? activePanelAt(this.timeline, atSec) : undefined;
    const activePageIdx = active ? String(active.pageIndex) : '';
    const activeId = active?.id ?? '';
    for (const el of this.jumpsEl.querySelectorAll<HTMLElement>('[data-page-idx]')) {
      el.classList.toggle('is-active', el.dataset.pageIdx === activePageIdx);
    }
    for (const el of this.jumpsEl.querySelectorAll<HTMLElement>('[data-panel-chip]')) {
      el.classList.toggle('is-active', el.dataset.panelChip === activeId);
    }
    for (const el of document.querySelectorAll<HTMLElement>('.layout-box[data-panel-id]')) {
      el.classList.toggle('is-active', el.dataset.panelId === activeId);
    }
  }

  private tickLive(): void {
    if (this.frozen) return;
    const cine = this.cine();
    if (!cine || typeof cine.time !== 'number') return;
    const pack = this.opts.getPack();
    this.setSecInputs(cine.time);
    this.syncActiveIndicators(cine.time);
    const active = this.timeline ? activePanelAt(this.timeline, cine.time) : undefined;
    const label = active ? `P${active.pageIndex + 1} · ${active.id}` : 'hold';
    if (cine.paused && cine.time >= pack.manifest.durationSec - 0.05) {
      this.frozen = true;
      this.syncTransportState();
      this.statusEl.textContent = `Held @ ${cine.time.toFixed(2)}s (${label})`;
    } else {
      this.statusEl.textContent = `Playing ${pack.manifest.id} · ${cine.time.toFixed(1)}s / ${pack.manifest.durationSec}s (${label})`;
    }
  }

  private bindIframe(): void {
    const cine = this.cine();
    if (!cine) return;
    cine.onEditorCallbacks?.({
      onSceneView: (v) => {
        this.sceneView = v;
        this.syncSceneReadout();
      },
      onPageWheelZoom: (factor) => this.stage.zoomPageBy(factor),
      onSelectElement: (sel) => {
        this.selectedRef = sel;
        this.syncSelectionReadout();
        this.opts.onSelectElement?.(sel);
      },
    });
    if (this.isSceneDirty()) cine.setSceneView?.(this.sceneView);
    if (this.selectedRef) cine.selectElement?.(this.selectedRef);
  }

  private scrubMax(pack: ComixPack): number {
    return Math.max(0.5, (pack.manifest.durationSec || 1) + (pack.manifest.holdAtEnd ? 1.5 : 0));
  }

  sync(pack: ComixPack): void {
    const dur = this.scrubMax(pack);
    this.slider.max = String(dur);
    this.numInput.max = String(dur);
    clear(this.jumpsEl);
    try {
      const tl = compileTimeline(pack);
      this.timeline = tl;
      for (const page of pack.pages) {
        const t = visiblePanelStart(tl, page.index, page.from, page.until);
        this.jumpsEl.append(
          h('button', { type: 'button', class: 'chip chip-page', 'data-page-idx': String(page.index), onclick: () => this.jumpTo(t) }, `P${page.index + 1} ${t.toFixed(1)}s`),
        );
      }
      tl.panels.forEach((panel, idx) => {
        const t = visiblePanelStart(tl, panel.pageIndex, panel.from, panel.until);
        this.jumpsEl.append(
          h('button', { type: 'button', class: 'chip', 'data-panel-chip': panel.id, onclick: () => this.jumpTo(t) }, `${idx + 1}. ${panel.id}`),
        );
      });
      for (const [cue, at] of Object.entries(tl.cues)) {
        this.jumpsEl.append(
          h('button', { type: 'button', class: 'chip chip-cue', onclick: () => this.jumpTo(at + 0.02) }, `⚡ ${cue} ${at.toFixed(1)}s`),
        );
      }
      this.syncActiveIndicators(this.sec);
    } catch {
      this.timeline = null;
      this.jumpsEl.append(h('span', { class: 'note error' }, 'Fix timeline errors in Check tab to build jump chips.'));
    }
  }

  playFull(): void {
    window.clearTimeout(this.debounceId);
    this.frozen = false;
    this.setSecInputs(0);
    this.syncTransportState();
    const pack = this.opts.getPack();
    this.sync(pack);
    this.reloadFrame(pack, null);
  }

  jumpTo(targetSec: number): void {
    window.clearTimeout(this.debounceId);
    const pack = this.opts.getPack();
    this.sync(pack);
    const clamped = Math.max(0, Math.min(this.scrubMax(pack), targetSec));
    this.frozen = true;
    this.syncTransportState();
    this.setSecInputs(clamped);
    this.syncActiveIndicators(clamped);
    this.reloadFrame(pack, clamped);
  }

  refreshDraftSoon(): void {
    window.clearTimeout(this.debounceId);
    this.debounceId = window.setTimeout(() => {
      const pack = this.opts.getPack();
      this.sync(pack);
      this.reloadFrame(pack, this.frozen ? this.sec : null);
    }, 450);
  }

  private jumpSoon(targetSec: number): void {
    window.clearTimeout(this.debounceId);
    this.debounceId = window.setTimeout(() => this.jumpTo(targetSec), 40);
  }

  private stepPanel(delta: -1 | 1): void {
    const pack = this.opts.getPack();
    this.sync(pack);
    const panels = this.timeline?.panels ?? [];
    if (panels.length === 0 || !this.timeline) return;
    let curIdx = 0;
    for (let i = 0; i < panels.length; i += 1) {
      if (this.sec >= panels[i]!.from - 0.01) curIdx = i;
    }
    const next = panels[Math.max(0, Math.min(panels.length - 1, curIdx + delta))]!;
    this.jumpTo(visiblePanelStart(this.timeline, next.pageIndex, next.from, next.until));
  }

  private setSecInputs(val: number): void {
    this.sec = Math.round(val * 100) / 100;
    if (document.activeElement !== this.slider) this.slider.value = String(this.sec);
    if (document.activeElement !== this.numInput) this.numInput.value = this.sec.toFixed(2);
  }

  private updateFrozenStatus(pack: ComixPack, freezeAt: number): void {
    const active = this.timeline ? activePanelAt(this.timeline, freezeAt) : undefined;
    const label = active ? `P${active.pageIndex + 1} · ${active.id}` : 'hold';
    const orient = this.stage.isPortrait ? ' · portrait' : '';
    this.statusEl.textContent = `Frozen @ ${freezeAt.toFixed(2)}s (${label}${orient})`;
    void pack;
  }

  private reloadFrame(pack: ComixPack, freezeAt: number | null): void {
    const draftJson = JSON.stringify(pack);
    const cine = this.cine();
    const sameLoaded =
      pack.manifest.id === this.loadedSlug &&
      draftJson === this.loadedDraftJson &&
      cine?.which === pack.manifest.id &&
      cine.state === 'playing';
    if (sameLoaded && cine) {
      if (freezeAt === null && cine.playFromStart?.()) {
        this.statusEl.textContent = `Playing ${pack.manifest.id} (${pack.manifest.durationSec}s)`;
        return;
      }
      if (freezeAt !== null && cine.seek?.(freezeAt)) {
        this.updateFrozenStatus(pack, freezeAt);
        return;
      }
    }
    writeDraftComixPack(pack);
    this.loadedSlug = pack.manifest.id;
    this.loadedDraftJson = draftJson;
    this.rev += 1;
    const slug = encodeURIComponent(pack.manifest.id);
    if (freezeAt === null) {
      this.stage.frame.src = `/cinematic.html?play=${slug}&draft=1&editor=1&muted=1&r=${this.rev}`;
      this.statusEl.textContent = `Playing ${pack.manifest.id} (${pack.manifest.durationSec}s)`;
      return;
    }
    this.stage.frame.src = `/cinematic.html?play=${slug}&draft=1&editor=1&muted=1&t=${freezeAt.toFixed(2)}&r=${this.rev}`;
    this.updateFrozenStatus(pack, freezeAt);
  }
}
