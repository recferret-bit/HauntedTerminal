import { writeDraftPack } from '../chapters/draft.js';
import type { ScriptStep } from '../chapters/types.js';
import type { LayoutState } from '../editor-core/dock-layout.js';
import { clear, h, type Rec } from '../editor-core/dom.js';
import { syncSelectedDetailsDom, type FormCtx } from '../editor-core/form.js';
import {
  createWorkstationHookApi,
  WorkspaceManager,
  type DockButtonDef,
  type WorkspaceState,
  type WorkstationHook,
} from '../editor-core/workspace.js';
import { ConflictError, fetchChapterDiskState, loadChapters, saveFile } from './api.js';
import { ChapterModel, type FileKey } from './chapter-model.js';
import { checkPack } from './check.js';
import {
  renderChapterSidebar,
  renderChapterTabBar,
  renderChapterTopBar,
  type ChapterChromeDeps,
  type ChapterDockId,
} from './chrome.js';
import { CHAPTER_TABS, LEVEL_TABS, renderPane, type Env, type Sel } from './panes.js';
import { Preview } from './preview.js';
import { makeSuggest } from './suggest.js';

const CHECK_DELAY_MS = 250;
const PREVIEW_DELAY_MS = 500;
const DISK_POLL_MS = 5000;

const CHAPTER_DOCK_BUTTONS: readonly DockButtonDef<ChapterDockId>[] = [
  { id: 'left', label: '◧ Levels', title: 'Toggle Left Levels Outliner ([)', restoreLabel: 'Levels' },
  { id: 'right', label: '◨ Inspector', title: 'Toggle Right Inspector (])', restoreLabel: 'Inspector' },
  { id: 'timeline', label: '◫ Console', title: 'Toggle Bottom Console & Walkthrough (\\)', restoreLabel: 'Console' },
  { id: 'log', label: '⊟ Log', title: 'Toggle Event Log & Console Drawer' },
  { id: 'stagebar', label: '⬒ Bar', title: 'Toggle Viewport Toolbar' },
  { id: 'top', label: '▴ Top', title: 'Hide Top Bar (restorable from floating pill)' },
];

export interface ChapterEditorHook extends WorkstationHook<ChapterDockId> {
  ready: boolean;
  state(): {
    slug: string;
    target: 'level' | 'chapter';
    levelId: string;
    tab: string;
    writable: boolean;
    dirty: string[];
    issueCount: number;
    previewLevel: string;
    previewPhase: string;
    selectedPath: string | null;
    docks: WorkspaceState<ChapterDockId>;
    layout: LayoutState;
    viewportSize: { w: number; h: number };
    pageZoom: number | 'fit';
  };
  select(next: Partial<Sel>, updateUrl?: boolean): void;
  selectItem(path: string | null, scrollIntoView?: boolean): string | null;
  reload(): Promise<void>;
}

declare global {
  interface Window {
    __chapterEditor?: ChapterEditorHook;
  }
}

function summarizeSelectedItem(pane: HTMLElement, path: string, item?: Rec): string {
  const details = [...pane.querySelectorAll<HTMLDetailsElement>('details[data-item-path]')].find(
    (el) => el.dataset.itemPath === path,
  );
  const titleText = details?.querySelector('.item-title')?.textContent?.trim();
  if (titleText) return titleText;
  if (item) {
    const pick = item.kind ?? item.id ?? item.name ?? item.title;
    if (typeof pick === 'string' && pick.trim()) return pick.trim();
  }
  return path.split('.').slice(-2).join('.');
}

/** Game-engine workstation shell for editing chapter specs with live centered preview. */
class EditorApp {
  private models: ChapterModel[] = [];
  private writable = false;
  private sel: Sel = { slug: '', target: 'level', levelId: '', tab: 'overview' };
  private issues = [] as ReturnType<typeof checkPack>;
  private readonly open = new Set<string>();
  private readonly top = h('header', { class: 'ed-top' });
  private readonly sideBody = h('div', { class: 'cx-side-body' });
  private readonly side = h('nav', { class: 'ed-side', 'aria-label': 'Chapter and levels' }, this.sideBody);
  private readonly tabs = h('div', { class: 'ed-tabs', 'data-panel-drag': 'right' });
  private readonly pane = h('div', { class: 'ed-pane', role: 'tabpanel' });
  private readonly main = h('main', { class: 'ed-main' }, this.tabs, this.pane);
  private readonly workspace = new WorkspaceManager<ChapterDockId>({
    storageKey: 'ht-chapter-editor-ui',
    buttons: CHAPTER_DOCK_BUTTONS,
    labels: { left: 'Levels', right: 'Inspector', timeline: 'Console' },
  });
  private readonly pv: Preview;
  private readonly gridEl: HTMLElement;
  private status = '';
  private conflict = false;
  private stale: string[] = [];
  private selectedPath: string | null = null;
  private checkTimer = 0;
  private checkPending = false;
  private previewTimer = 0;

  constructor(private readonly root: HTMLElement) {
    this.pv = new Preview({
      getPack: () => this.model.pack(),
      onToggleDock: (dock) => this.workspace.toggle(dock),
      onToggleZen: () => this.workspace.toggleZen(),
      onRevealSelected: () => this.revealSelectedItem(),
    });
    this.pv.stageEl.append(this.workspace.renderRestoreOverlay());
    this.gridEl = h('div', { class: 'ed cx-ed' }, this.top, this.side, this.pv.stageEl, this.pv.timelineEl, this.main);
    root.append(this.gridEl);
    this.workspace.attach(
      this.gridEl,
      { left: this.side, right: this.main, timeline: this.pv.timelineEl },
      () => window.requestAnimationFrame(() => this.pv.stage.updateFrameLayout()),
      () => this.pv.stage.setPageZoom('fit'),
      (saveAll) => void this.save(saveAll ? this.model.dirtyKeys() : this.currentKeys()),
    );

    window.addEventListener('popstate', () => {
      if (this.models.length > 0) this.select(this.readRoute(), false);
    });
    window.addEventListener('beforeunload', (e) => {
      if (this.models.some((m) => m.dirtyKeys().length > 0)) e.preventDefault();
    });
  }

  private get model(): ChapterModel {
    return this.models.find((m) => m.slug === this.sel.slug) ?? this.models[0]!;
  }

  private get ctx(): FormCtx {
    return {
      suggest: makeSuggest(() => this.model.level(this.sel.levelId)),
      changed: () => this.onChanged(),
      restructure: () => this.drawPane(),
      playStep: (step: Rec) => this.pv.playStep(step as unknown as ScriptStep),
      selectedPath: this.selectedPath ?? undefined,
      selectPath: (path, item) => this.selectItem(path, false, item),
      remapSelection: (mapPath) => {
        if (!this.selectedPath) return;
        const mapped = mapPath(this.selectedPath);
        if (mapped !== this.selectedPath) this.selectItem(mapped, false);
      },
      open: this.open,
    };
  }

  private get env(): Env {
    return {
      model: this.model,
      writable: this.writable,
      ctx: this.ctx,
      preview: this.pv,
      issues: this.issues,
      select: (next) => this.select(next),
      redraw: () => this.draw(),
      changed: () => this.onChanged(),
    };
  }

  private chromeDeps(): ChapterChromeDeps {
    return {
      models: this.models,
      model: this.model,
      sel: this.sel,
      writable: this.writable,
      status: this.status,
      conflict: this.conflict,
      stale: this.stale,
      issues: this.issues,
      workspace: this.workspace,
      currentKeys: () => this.currentKeys(),
      select: (next) => this.select(next),
      revertKeys: (keys) => {
        keys.forEach((k) => this.model.revert(k));
        this.onChanged();
        this.draw();
      },
      saveKeys: (keys) => void this.save(keys),
      reloadFromDisk: () => void this.reloadFromDisk(),
    };
  }

  async start(): Promise<void> {
    const loaded = await loadChapters();
    this.writable = loaded.writable;
    this.models = loaded.chapters.map((c) => new ChapterModel(c));
    if (this.models.length === 0) {
      this.root.replaceChildren(h('p', { class: 'note error' }, 'No chapters found in chapters/.'));
      return;
    }
    this.sel = this.readRoute();
    this.issues = checkPack(this.model.pack());
    this.syncUrl(true);
    this.draw();
    this.loadPreview();
    this.installWindowHook();
    window.setInterval(() => void this.checkDisk(), DISK_POLL_MS);
    window.addEventListener('focus', () => void this.checkDisk());
  }

  private installWindowHook(): void {
    window.__chapterEditor = {
      ready: true,
      state: () => ({
        slug: this.model.slug,
        target: this.sel.target,
        levelId: this.sel.levelId,
        tab: this.sel.tab,
        writable: this.writable,
        dirty: this.model.dirtyKeys(),
        issueCount: this.issues.length,
        previewLevel: this.pv.currentLevelId,
        previewPhase: this.pv.livePhase,
        selectedPath: this.selectedPath,
        docks: this.workspace.current,
        layout: this.workspace.layout,
        viewportSize: this.pv.stage.viewportSize,
        pageZoom: this.pv.stage.pageZoomMode,
      }),
      select: (next, updateUrl = true) => this.select(next, updateUrl),
      selectItem: (path, scrollIntoView = true) => this.selectItem(path, scrollIntoView),
      ...createWorkstationHookApi(this.workspace, this.pv.stage),
      reload: () => this.reloadFromDisk(),
    };
  }

  private readRoute(): Sel {
    const parts = location.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    const m = this.models.find((c) => c.slug === (parts[1] ?? '')) ?? this.models[0]!;
    const target: 'level' | 'chapter' = parts[1] !== undefined && parts[2] === undefined ? 'chapter' : 'level';
    const level = m.level(parts[2] ?? '') ?? m.draft.levels[0];
    const tabs = target === 'level' ? LEVEL_TABS : CHAPTER_TABS;
    const rawTab = new URLSearchParams(location.search).get('tab') ?? tabs[0].id;
    const tab = tabs.some((t) => t.id === rawTab) ? rawTab : tabs[0].id;
    return { slug: m.slug, target, levelId: level?.id ?? '', tab };
  }

  private syncUrl(replace: boolean): void {
    const s = this.sel;
    const path = s.target === 'level' ? `/editor/${encodeURIComponent(s.slug)}/${encodeURIComponent(s.levelId)}` : `/editor/${encodeURIComponent(s.slug)}`;
    const url = `${path}?tab=${encodeURIComponent(s.tab)}`;
    if (replace) history.replaceState(null, '', url);
    else if (`${location.pathname}${location.search}` !== url) history.pushState(null, '', url);
  }

  private select(next: Partial<Sel>, updateUrl = true): void {
    const levelChanged = (next.levelId !== undefined && next.levelId !== this.sel.levelId) || (next.slug !== undefined && next.slug !== this.sel.slug);
    const prevTarget = this.sel.target;
    this.sel = { ...this.sel, ...next };
    const tabs = this.sel.target === 'level' ? LEVEL_TABS : CHAPTER_TABS;
    if (!tabs.some((t) => t.id === this.sel.tab)) this.sel.tab = tabs[0].id;
    if (next.target && next.target !== prevTarget && next.tab === undefined) this.sel.tab = tabs[0].id;
    if (levelChanged) this.selectItem(null, false);
    if (updateUrl) this.syncUrl(false);
    this.draw();
    if (levelChanged && this.sel.target === 'level') this.loadPreviewSoon();
  }

  private selectItem(path: string | null, scrollIntoView = false, item?: Rec): string | null {
    this.selectedPath = path;
    if (path) this.open.add(path);
    this.pv.setSelectedReadout(path ? summarizeSelectedItem(this.pane, path, item) : null);
    syncSelectedDetailsDom(this.pane, path, scrollIntoView);
    return this.selectedPath;
  }

  private revealSelectedItem(): void {
    if (!this.selectedPath) return;
    if (!this.workspace.current.right) this.workspace.toggle('right');
    const inferred = this.routeForPath(this.selectedPath);
    if (inferred && (inferred.target !== this.sel.target || inferred.levelId !== this.sel.levelId || inferred.tab !== this.sel.tab)) {
      this.select(inferred);
    }
    this.open.add(this.selectedPath);
    syncSelectedDetailsDom(this.pane, this.selectedPath, true);
  }

  private routeForPath(path: string): Partial<Sel> | null {
    const head = path.split('.')[0]?.replace(/\[.*$/, '') ?? '';
    if (head === 'manifest') return { target: 'chapter', tab: 'manifest' };
    if (head === 'cast') return { target: 'chapter', tab: 'cast' };
    if (head === 'comic') return { target: 'chapter', tab: 'comic' };
    if (this.model.level(head)) {
      const seg = path.split('.')[1]?.replace(/\[.*$/, '') ?? 'overview';
      const tab = seg === 'dialog' ? 'dialogs' : LEVEL_TABS.some((t) => t.id === seg) ? seg : 'overview';
      return { target: 'level', levelId: head, tab };
    }
    return null;
  }

  private loadPreview(): void {
    const level = this.model.level(this.sel.levelId);
    if (level) this.pv.load(level);
  }

  private loadPreviewSoon(): void {
    window.clearTimeout(this.previewTimer);
    this.previewTimer = window.setTimeout(() => this.loadPreview(), PREVIEW_DELAY_MS);
  }

  private onChanged(): void {
    window.clearTimeout(this.checkTimer);
    this.checkPending = true;
    this.checkTimer = window.setTimeout(() => {
      this.refreshIssues();
      this.drawChrome();
    }, CHECK_DELAY_MS);
    this.drawChrome();
  }

  private refreshIssues(): void {
    window.clearTimeout(this.checkTimer);
    this.checkPending = false;
    const pack = this.model.pack();
    writeDraftPack(pack);
    this.issues = checkPack(pack);
  }

  private currentKeys(): FileKey[] {
    return this.sel.target === 'level' ? [`level:${this.sel.levelId}`] : ['manifest', 'dialogs', 'comix'].filter((k) => this.model.entry(k));
  }

  private async save(keys: FileKey[]): Promise<void> {
    if (!this.writable) {
      this.setStatus('read-only: run the dev server (npm start) to save');
      return;
    }
    const m = this.model;
    const todo = new Set(keys.filter((k) => m.isDirty(k)));
    if ([...todo].some((k) => k.startsWith('level:'))) {
      m.syncSummaries();
      if (m.isDirty('manifest')) todo.add('manifest');
    }
    if (todo.size === 0) {
      this.setStatus('nothing to save');
      return;
    }
    try {
      for (const key of todo) {
        const entry = m.entry(key);
        if (!entry) continue;
        const res = await saveFile(m.slug, entry.path, entry.value, m.etag(key));
        m.markSaved(key, res.etag);
        if (res.warning) this.setStatus(res.warning, true);
      }
      this.conflict = false;
      this.setStatus(`saved ${todo.size} file${todo.size > 1 ? 's' : ''}; src/chapters/generated recompiled`);
    } catch (err) {
      if (err instanceof ConflictError) {
        this.conflict = true;
        this.setStatus(`${err.message}. Nothing was overwritten: use "Reload from disk".`, true);
        await this.checkDisk();
      } else {
        this.setStatus(`save failed: ${(err as Error).message}`, true);
      }
    }
    this.drawChrome();
  }

  private async checkDisk(): Promise<void> {
    if (!this.writable || document.hidden) return;
    try {
      const disk = await fetchChapterDiskState(this.model.slug);
      const stale = this.model.changedOnDisk(disk.etags);
      if (Array.isArray(disk.slugs)) {
        const present = new Set(this.models.map((c) => c.slug));
        const current = new Set(disk.slugs);
        for (const s of disk.slugs) if (!present.has(s)) stale.push(`chapters/${s}`);
        for (const s of present) if (!current.has(s)) stale.push(`chapters/${s}`);
      }
      if (stale.join() !== this.stale.join()) {
        this.stale = stale;
        renderChapterTopBar(this.top, this.chromeDeps());
      }
    } catch {
      /* dev server restarting: try again on the next poll */
    }
  }

  private async reloadFromDisk(): Promise<void> {
    const m = this.model;
    if (m.dirtyKeys().length > 0 && !window.confirm('Discard your unsaved edits and reload this chapter from disk?')) return;
    const loaded = await loadChapters();
    if (loaded.chapters.length === 0) return;
    const oldMap = new Map(this.models.map((c) => [c.slug, c]));
    const activeSlug = m.slug;
    this.models = loaded.chapters.map((ch) => {
      const prev = oldMap.get(ch.slug);
      if (!prev) return new ChapterModel(ch);
      if (ch.slug === activeSlug || prev.dirtyKeys().length === 0) prev.reloadFrom(ch);
      return prev;
    });
    const next = this.models.find((c) => c.slug === activeSlug) ?? this.models[0]!;
    this.sel.slug = next.slug;
    if (!next.level(this.sel.levelId)) this.sel.levelId = next.draft.levels[0]?.id ?? '';
    this.conflict = false;
    this.stale = [];
    this.issues = checkPack(next.pack());
    this.setStatus('reloaded from disk');
    this.syncUrl(true);
    this.draw();
    this.loadPreview();
  }

  private setStatus(text: string, bad = false): void {
    this.status = bad ? `✕ ${text}` : text;
    renderChapterTopBar(this.top, this.chromeDeps());
  }

  private drawChrome(): void {
    const deps = this.chromeDeps();
    renderChapterTopBar(this.top, deps);
    renderChapterSidebar(this.sideBody, deps);
    renderChapterTabBar(this.tabs, this.pane, deps);
  }

  draw(): void {
    if (this.checkPending) this.refreshIssues();
    this.drawChrome();
    this.drawPane();
  }

  private drawPane(): void {
    const scroll = this.pane.scrollTop;
    clear(this.pane);
    this.pane.append(renderPane(this.env, this.sel));
    syncSelectedDetailsDom(this.pane, this.selectedPath, false);
    this.pane.scrollTop = scroll;
  }
}

export async function startEditor(root: HTMLElement): Promise<void> {
  await new EditorApp(root).start();
}
