import type { LayoutState } from '../editor-core/dock-layout.js';
import { clear, h } from '../editor-core/dom.js';
import type { FormCtx } from '../editor-core/form.js';
import {
  createWorkstationHookApi,
  WorkspaceManager,
  type DockButtonDef,
  type WorkspaceState,
  type WorkstationHook,
} from '../editor-core/workspace.js';
import type { ComixElementRef } from '../cinematic/editor-select.js';
import { resolveTime } from '../cinematic/expr.js';
import type { SceneViewState } from '../cinematic/preview.js';
import type { ShotBox } from '../cinematic/spec-types.js';
import { compileTimeline, visiblePanelStart } from '../cinematic/timeline.js';
import { ConflictError, fetchComixDiskState, loadComixes, saveComixFile } from './api.js';
import { checkComixPack, runComixSim, type ComixIssue } from './check.js';
import {
  renderEditorSidebar,
  renderEditorTabBar,
  renderEditorTopBar,
  type ChromeRenderDeps,
  type ComixDockId,
} from './chrome.js';
import { ComixModel, type ComixFileKey } from './model.js';
import { COMIX_TABS, PAGE_TABS, renderComixPane, type ComixEnv, type ComixSel } from './panes.js';
import { ComixPreview } from './preview.js';
import { resolveSelectionFromPath, routeForElement, syncInspectorSelectionDom, visibilityJumpForElement } from './selection.js';
import { suggestForComix } from './suggest.js';

const ISSUE_DEBOUNCE_MS = 200;
const ETAG_POLL_MS = 5000;

const COMIX_DOCK_BUTTONS: readonly DockButtonDef<ComixDockId>[] = [
  { id: 'left', label: '◧ Pages', title: 'Toggle Left Pages Outliner ([)', restoreLabel: 'Pages' },
  { id: 'right', label: '◨ Inspector', title: 'Toggle Right Inspector (])', restoreLabel: 'Inspector' },
  { id: 'timeline', label: '◫ Timeline', title: 'Toggle Bottom Timeline (\\)', restoreLabel: 'Timeline' },
  { id: 'jumps', label: '⊟ Chips', title: 'Toggle Quick-Jump Chips' },
  { id: 'stagebar', label: '⬒ Bar', title: 'Toggle Viewport Toolbar' },
  { id: 'top', label: '▴ Top', title: 'Hide Top Bar (restorable from floating pill)' },
];

export interface ComixEditorHook extends WorkstationHook<ComixDockId> {
  ready: boolean;
  state(): {
    slug: string;
    target: string;
    tab: string;
    writable: boolean;
    dirty: string[];
    issueCount: number;
    previewTime: number;
    previewMode: 'play' | 'freeze';
    docks: WorkspaceState<ComixDockId>;
    layout: LayoutState;
    viewportSize: { w: number; h: number };
    pageZoom: number | 'fit';
    sceneZoom: number;
    selectedElement: ComixElementRef | null;
  };
  select(next: Partial<ComixSel>): void;
  selectElement(refOrPath: ComixElementRef | string | null): ComixElementRef | null;
  pickViewportElement(clientX: number, clientY: number): ComixElementRef | null;
  jumpTo(sec: number): void;
  playFull(): void;
  simulate(): ReturnType<typeof runComixSim>;
  setSceneView(next: Partial<SceneViewState>): void;
  resetSceneView(): void;
  applySceneShot(): boolean;
  reload(): Promise<void>;
}

declare global {
  interface Window {
    __comixEditor?: ComixEditorHook;
  }
}

class ComixEditorController {
  private models: ComixModel[] = [];
  private writable = false;
  private sel: ComixSel = { slug: '', target: 'manifest', tab: 'manifest' };
  private issues: ComixIssue[] = [];
  private readonly openDetails = new Set<string>();
  private readonly topEl = h('header', { class: 'ed-top' });
  private readonly sideBodyEl = h('div', { class: 'cx-side-body' });
  private readonly sideEl = h('nav', { class: 'ed-side', 'aria-label': 'Comix sequences and pages' }, this.sideBodyEl);
  private readonly tabsEl = h('div', { class: 'ed-tabs', 'data-panel-drag': 'right' });
  private readonly paneEl = h('div', { class: 'ed-pane', role: 'tabpanel' });
  private readonly mainEl = h('main', { class: 'ed-main' }, this.tabsEl, this.paneEl);
  private readonly workspace = new WorkspaceManager<ComixDockId>({
    storageKey: 'ht-comix-editor-ui',
    buttons: COMIX_DOCK_BUTTONS,
    labels: { left: 'Pages', right: 'Inspector', timeline: 'Timeline' },
  });
  private readonly preview: ComixPreview;
  private readonly gridEl: HTMLElement;
  private statusMsg = '';
  private conflict = false;
  private staleFiles: string[] = [];
  private issueTimer = 0;
  private issuesDirty = false;
  private selectedEl: ComixElementRef | null = null;

  constructor(private readonly host: HTMLElement) {
    this.preview = new ComixPreview({
      getPack: () => this.activeModel.pack(),
      onToggleDock: (dock) => this.workspace.toggle(dock),
      onToggleZen: () => this.workspace.toggleZen(),
      onApplyShot: (panelId, shot, portrait) => this.applySceneShotToDraft(panelId, shot, portrait),
      onSelectElement: (sel) => this.handleViewportSelect(sel),
      onRevealSelected: (sel) => this.handleViewportSelect(sel),
    });
    this.preview.stageEl.append(this.workspace.renderRestoreOverlay());
    this.gridEl = h('div', { class: 'ed cx-ed' }, this.topEl, this.sideEl, this.preview.stageEl, this.preview.timelineEl, this.mainEl);
    host.append(this.gridEl);
    this.workspace.attach(
      this.gridEl,
      { left: this.sideEl, right: this.mainEl, timeline: this.preview.timelineEl },
      () => window.requestAnimationFrame(() => this.preview.stage.updateFrameLayout()),
      () => this.preview.stage.setPageZoom('fit'),
      (saveAll) =>
        void this.saveKeys(saveAll ? this.activeModel.dirtyEntries().map((e) => e.key) : [this.activeFileKey()]),
    );

    window.addEventListener('popstate', () => {
      if (this.models.length > 0) this.navigate(this.parseUrlRoute(), false);
    });
    window.addEventListener('beforeunload', (ev) => {
      if (this.models.some((m) => m.anyDirty())) ev.preventDefault();
    });
  }

  private get activeModel(): ComixModel {
    return this.models.find((m) => m.slug === this.sel.slug) ?? this.models[0]!;
  }

  private activeFileKey(): ComixFileKey {
    return this.sel.target === 'manifest' ? 'manifest' : `page:${this.sel.target}`;
  }

  private chromeDeps(): ChromeRenderDeps {
    return {
      models: this.models,
      activeModel: this.activeModel,
      sel: this.sel,
      writable: this.writable,
      statusMsg: this.statusMsg,
      conflict: this.conflict,
      staleFiles: this.staleFiles,
      issues: this.issues,
      workspace: this.workspace,
      activeFileKey: () => this.activeFileKey(),
      navigate: (next) => this.navigate(next),
      revertCurrent: () => this.revertCurrent(),
      saveKeys: (keys) => void this.saveKeys(keys),
      reloadFromDisk: () => void this.reloadComixFromDisk(),
    };
  }

  private formCtx(): FormCtx {
    return {
      suggest: (name: string) => suggestForComix(this.activeModel.pack(), this.sel.target, name),
      changed: () => this.handleDraftEdit(),
      restructure: () => {
        this.renderPaneOnly();
        this.handleDraftEdit();
      },
      selectedPath: this.selectedEl?.itemPath,
      selectPath: (path) => {
        this.selectByItemPath(path);
      },
      remapSelection: (mapPath) => {
        const cur = this.selectedEl?.itemPath;
        if (!cur) return;
        const next = mapPath(cur);
        if (next === cur) return;
        if (next === null) this.applySelection(null, false, false);
        else this.selectByItemPath(next);
      },
      open: this.openDetails,
    };
  }

  private paneEnv(): ComixEnv {
    return {
      model: this.activeModel,
      writable: this.writable,
      baseCtx: this.formCtx(),
      preview: this.preview,
      issues: this.issues,
      selectedElement: this.selectedEl,
      selectElement: (ref, nav = false) => {
        this.applySelection(ref, nav, false);
      },
      navigate: (next) => this.navigate(next),
      redraw: () => this.renderAll(),
      changed: () => this.handleDraftEdit(),
    };
  }

  async boot(): Promise<void> {
    let payload;
    try {
      payload = await loadComixes();
    } catch (err) {
      this.host.replaceChildren(h('p', { class: 'note error' }, (err as Error).message));
      return;
    }
    this.writable = payload.writable;
    this.models = payload.comixes.map((c) => new ComixModel(c));
    if (this.models.length === 0) {
      this.host.replaceChildren(h('p', { class: 'note error' }, 'No comixes found in comix/.'));
      return;
    }
    this.sel = this.parseUrlRoute();
    this.recomputeIssues();
    this.renderAll();
    this.syncUrlRoute(true);
    this.preview.playFull();
    if (this.writable) {
      window.setInterval(() => void this.pollDiskEtags(), ETAG_POLL_MS);
      window.addEventListener('focus', () => void this.pollDiskEtags());
    }
    this.installWindowHook();
  }

  private installWindowHook(): void {
    window.__comixEditor = {
      ready: true,
      state: () => ({
        slug: this.activeModel.slug,
        target: this.sel.target,
        tab: this.sel.tab,
        writable: this.writable,
        dirty: this.activeModel.dirtyEntries().map((e) => e.path),
        issueCount: this.issues.length,
        previewTime: this.preview.currentTime,
        previewMode: this.preview.mode,
        docks: this.workspace.current,
        layout: this.workspace.layout,
        viewportSize: this.preview.stage.viewportSize,
        pageZoom: this.preview.stage.pageZoomMode,
        sceneZoom: this.preview.sceneZoomValue,
        selectedElement: this.selectedEl,
      }),
      select: (next) => this.navigate(next),
      selectElement: (refOrPath) =>
        typeof refOrPath === 'string' ? this.selectByItemPath(refOrPath) : this.applySelection(refOrPath, true, true),
      pickViewportElement: (clientX, clientY) => this.preview.pickViewportAt(clientX, clientY),
      jumpTo: (sec) => this.preview.jumpTo(sec),
      playFull: () => this.preview.playFull(),
      simulate: () => runComixSim(this.activeModel.pack()),
      ...createWorkstationHookApi(this.workspace, this.preview.stage),
      setSceneView: (next) => this.preview.setSceneView(next),
      resetSceneView: () => this.preview.resetSceneView(),
      applySceneShot: () => this.preview.applySceneShot(),
      reload: () => this.reloadComixFromDisk(),
    };
  }

  private applySceneShotToDraft(panelId: string, shot: ShotBox, portrait: boolean): void {
    const manifestCues = this.activeModel.draft.manifest.cues ?? {};
    for (const page of this.activeModel.draft.pages) {
      const panel = page.panels.find((p) => p.id === panelId);
      if (!panel) continue;
      let targetSlot = 'camera.from';
      if (portrait) {
        panel.camera.portrait = { ...shot };
        targetSlot = 'camera.portrait';
      } else if (panel.camera.to) {
        const cues = { ...manifestCues, ...(page.cues ?? {}) };
        let useTo = false;
        try {
          const pFrom = resolveTime(panel.from, cues, page.from);
          const pUntil = resolveTime(panel.until, cues, page.from);
          const s0 = panel.camera.span ? resolveTime(panel.camera.span[0], cues, pFrom) : pFrom;
          const s1 = panel.camera.span ? resolveTime(panel.camera.span[1], cues, pFrom) : pUntil;
          useTo = this.preview.currentTime >= (s0 + s1) * 0.5;
        } catch {
          useTo = false;
        }
        if (useTo) {
          panel.camera.to = { ...shot };
          targetSlot = 'camera.to';
        } else {
          panel.camera.from = { ...shot };
        }
      } else {
        panel.camera.from = { ...shot };
      }
      this.preview.resetSceneView();
      this.statusMsg = `applied ${targetSlot} shot to ${panelId}`;
      this.handleDraftEdit();
      this.renderAll();
      return;
    }
  }

  private parseUrlRoute(): ComixSel {
    const parts = location.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    const model = this.models.find((m) => m.slug === parts[1]) ?? this.models[0]!;
    const rawTarget = parts[2] ?? 'manifest';
    const validPage = model.page(rawTarget);
    const target = validPage ? validPage.id : 'manifest';
    const tabs = target === 'manifest' ? COMIX_TABS : PAGE_TABS;
    const requestedTab = new URLSearchParams(location.search).get('tab') ?? tabs[0].id;
    const tab = tabs.some((t) => t.id === requestedTab) ? requestedTab : tabs[0].id;
    return { slug: model.slug, target, tab };
  }

  private syncUrlRoute(replace: boolean): void {
    const { slug, target, tab } = this.sel;
    const url = `/comix-editor/${encodeURIComponent(slug)}/${encodeURIComponent(target)}?tab=${encodeURIComponent(tab)}`;
    const cur = `${location.pathname}${location.search}`;
    if (replace) history.replaceState(null, '', url);
    else if (cur !== url) history.pushState(null, '', url);
  }

  private navigate(next: Partial<ComixSel>, updateUrl = true): void {
    const prevSlug = this.sel.slug;
    const prevTarget = this.sel.target;
    const model = this.models.find((m) => m.slug === (next.slug ?? this.sel.slug)) ?? this.activeModel;
    let target = next.target ?? (next.slug && next.slug !== prevSlug ? 'manifest' : this.sel.target);
    if (target !== 'manifest' && !model.page(target)) target = 'manifest';
    const tabs = target === 'manifest' ? COMIX_TABS : PAGE_TABS;
    let tab = next.tab ?? this.sel.tab;
    if (!tabs.some((t) => t.id === tab) || (next.target !== undefined && next.target !== prevTarget && next.tab === undefined)) {
      tab = tabs[0].id;
    }
    this.sel = { slug: model.slug, target, tab };
    if (model.slug !== prevSlug) {
      this.selectedEl = null;
      this.preview.setSelectedElement(null);
      this.recomputeIssues();
    }
    if (updateUrl) this.syncUrlRoute(false);
    this.renderAll();
    if (model.slug !== prevSlug) {
      this.preview.playFull();
    } else if (target !== 'manifest' && target !== prevTarget) {
      const page = model.page(target);
      if (page) {
        let jumpSec = page.from + 0.05;
        try {
          jumpSec = visiblePanelStart(compileTimeline(model.pack()), page.index, page.from, page.until);
        } catch {
          // Keep fallback if draft timeline has syntax errors.
        }
        this.preview.jumpTo(jumpSec);
      }
    }
  }

  private handleDraftEdit(): void {
    window.clearTimeout(this.issueTimer);
    this.issuesDirty = true;
    this.issueTimer = window.setTimeout(() => {
      this.recomputeIssues();
      this.renderChromeOnly();
    }, ISSUE_DEBOUNCE_MS);
    this.renderChromeOnly();
    this.preview.refreshDraftSoon();
  }

  private recomputeIssues(): void {
    window.clearTimeout(this.issueTimer);
    this.issuesDirty = false;
    this.issues = checkComixPack(this.activeModel.pack());
  }

  private revertCurrent(): void {
    const key = this.activeFileKey();
    if (!this.activeModel.dirty(key)) return;
    this.activeModel.revert(key);
    this.recomputeIssues();
    this.statusMsg = `reverted ${this.activeModel.entry(key)?.path ?? key}`;
    this.renderAll();
    this.preview.refreshDraftSoon();
  }

  private async saveKeys(keys: ComixFileKey[]): Promise<void> {
    if (!this.writable) {
      this.statusMsg = 'read-only mode: run npm start to save specs to disk';
      this.renderChromeOnly();
      return;
    }
    this.activeModel.syncSummaries();
    const targetKeys = new Set<ComixFileKey>(keys);
    if (this.activeModel.dirty('manifest')) targetKeys.add('manifest');
    const toWrite = [...targetKeys]
      .map((k) => this.activeModel.entry(k))
      .filter((e): e is NonNullable<typeof e> => Boolean(e) && this.activeModel.dirty(e!.key));
    if (toWrite.length === 0) {
      this.statusMsg = 'nothing to save';
      this.renderChromeOnly();
      return;
    }
    try {
      for (const entry of toWrite) {
        const res = await saveComixFile(this.activeModel.slug, entry.path, entry.value, this.activeModel.etag(entry.key));
        this.activeModel.accept(entry.key, res.etag);
      }
      this.conflict = false;
      this.recomputeIssues();
      this.statusMsg = `saved ${toWrite.map((e) => e.path).join(', ')}`;
    } catch (err) {
      if (err instanceof ConflictError) {
        this.conflict = true;
        this.statusMsg = '✕ Disk conflict (409): file changed outside the editor. Reload to sync.';
        await this.pollDiskEtags();
      } else {
        this.statusMsg = `✕ Save error: ${(err as Error).message}`;
      }
    }
    this.renderAll();
  }

  private async pollDiskEtags(): Promise<void> {
    if (document.hidden || !this.writable) return;
    try {
      const disk = await fetchComixDiskState(this.activeModel.slug);
      const changed = this.activeModel.changedPaths(disk.etags);
      if (Array.isArray(disk.slugs)) {
        const known = new Set(this.models.map((m) => m.slug));
        const live = new Set(disk.slugs);
        for (const s of disk.slugs) if (!known.has(s)) changed.push(`comix/${s}`);
        for (const s of known) if (!live.has(s)) changed.push(`comix/${s}`);
      }
      if (changed.join('|') !== this.staleFiles.join('|')) {
        this.staleFiles = changed;
        renderEditorTopBar(this.topEl, this.chromeDeps());
      }
    } catch {
      // Ignore transient network hiccups during background poll.
    }
  }

  private async reloadComixFromDisk(): Promise<void> {
    if (this.activeModel.anyDirty() && !window.confirm('Discard unsaved edits and reload this comix from disk?')) {
      return;
    }
    const loaded = await loadComixes();
    if (loaded.comixes.length === 0) {
      this.statusMsg = '✕ Reload failed: no comixes returned by dev server';
      renderEditorTopBar(this.topEl, this.chromeDeps());
      return;
    }
    const prevBySlug = new Map(this.models.map((m) => [m.slug, m]));
    const activeSlug = this.activeModel.slug;
    this.models = loaded.comixes.map((files) => {
      const existing = prevBySlug.get(files.slug);
      if (existing) {
        if (files.slug === activeSlug || !existing.anyDirty()) existing.reloadFrom(files);
        return existing;
      }
      return new ComixModel(files);
    });
    const nextModel = this.models.find((m) => m.slug === this.sel.slug) ?? this.models[0]!;
    const nextTarget = this.sel.target !== 'manifest' && nextModel.page(this.sel.target) ? this.sel.target : 'manifest';
    const tabs = nextTarget === 'manifest' ? COMIX_TABS : PAGE_TABS;
    const nextTab = tabs.some((t) => t.id === this.sel.tab) ? this.sel.tab : tabs[0].id;
    this.sel = { slug: nextModel.slug, target: nextTarget, tab: nextTab };
    this.conflict = false;
    this.staleFiles = [];
    this.recomputeIssues();
    this.statusMsg = 'reloaded from disk';
    this.syncUrlRoute(true);
    this.renderAll();
    this.preview.playFull();
  }

  private renderChromeOnly(): void {
    const deps = this.chromeDeps();
    renderEditorTopBar(this.topEl, deps);
    renderEditorSidebar(this.sideBodyEl, deps);
    renderEditorTabBar(this.tabsEl, this.paneEl, deps);
  }

  private renderAll(): void {
    if (this.issuesDirty) this.recomputeIssues();
    this.renderChromeOnly();
    this.renderPaneOnly();
  }

  private renderPaneOnly(): void {
    const prevScroll = this.paneEl.scrollTop;
    clear(this.paneEl);
    this.paneEl.append(renderComixPane(this.paneEnv(), this.sel));
    syncInspectorSelectionDom(this.paneEl, this.selectedEl, false);
    this.paneEl.scrollTop = prevScroll;
  }

  private handleViewportSelect(sel: ComixElementRef | null): void {
    this.selectedEl = sel;
    if (!sel) {
      syncInspectorSelectionDom(this.paneEl, null, false);
      return;
    }
    const route = routeForElement(this.activeModel.pack(), sel);
    const canonicalPath = route.openPaths[0] ?? sel.itemPath;
    this.selectedEl = canonicalPath === sel.itemPath ? sel : { ...sel, itemPath: canonicalPath };
    this.preview.setSelectedElement(this.selectedEl);
    for (const p of route.openPaths) this.openDetails.add(p);
    if (!this.workspace.current.right) this.workspace.toggle('right');
    if (this.sel.target !== route.target || this.sel.tab !== route.tab) {
      this.sel = { ...this.sel, target: route.target, tab: route.tab };
      this.syncUrlRoute(false);
      this.renderAll();
    } else {
      this.renderPaneOnly();
    }
    syncInspectorSelectionDom(this.paneEl, this.selectedEl, true);
  }

  private selectByItemPath(itemPath: string): ComixElementRef | null {
    if (this.selectedEl?.itemPath === itemPath) return this.selectedEl;
    const ref = resolveSelectionFromPath(this.activeModel.pack(), itemPath);
    return this.applySelection(ref, false, true);
  }

  private applySelection(
    ref: ComixElementRef | null,
    navigateToRoute: boolean,
    seekIfHidden: boolean,
  ): ComixElementRef | null {
    this.selectedEl = ref;
    if (ref) {
      for (const p of routeForElement(this.activeModel.pack(), ref).openPaths) this.openDetails.add(p);
    }
    this.preview.setSelectedElement(ref);
    if (ref && seekIfHidden) {
      const jump = visibilityJumpForElement(this.activeModel.pack(), ref, this.preview.currentSec);
      if (jump !== null) this.preview.jumpTo(jump);
    }
    if (ref && navigateToRoute) {
      this.handleViewportSelect(ref);
    } else {
      syncInspectorSelectionDom(this.paneEl, ref, false);
    }
    return this.selectedEl;
  }
}

export async function startComixEditor(root: HTMLElement): Promise<void> {
  await new ComixEditorController(root).boot();
}
