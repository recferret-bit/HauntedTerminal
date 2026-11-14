import type { PackIssue } from '../chapters/validate-pack.js';
import { workstationChrome } from '../editor-core/chrome.js';
import { clear, h } from '../editor-core/dom.js';
import type { BaseDockId, WorkspaceManager } from '../editor-core/workspace.js';
import type { ChapterModel, FileKey } from './chapter-model.js';
import { CHAPTER_TABS, LEVEL_TABS, type Sel } from './panes.js';

export type ChapterDockId = BaseDockId | 'log';

export interface ChapterChromeDeps {
  models: ChapterModel[];
  model: ChapterModel;
  sel: Sel;
  writable: boolean;
  status: string;
  conflict: boolean;
  stale: string[];
  issues: PackIssue[];
  workspace: WorkspaceManager<ChapterDockId>;
  currentKeys: () => FileKey[];
  select: (next: Partial<Sel>) => void;
  revertKeys: (keys: FileKey[]) => void;
  saveKeys: (keys: FileKey[]) => void;
  reloadFromDisk: () => void;
}

export function renderChapterTopBar(topEl: HTMLElement, d: ChapterChromeDeps): void {
  const m = d.model;
  const keys = d.currentKeys();
  const dirtyAll = m.dirtyKeys().length;
  workstationChrome.topBar(topEl, {
    brandAccent: 'CHAPTER',
    brandRest: 'EDITOR',
    pickerLabel: 'Select chapter',
    options: d.models.map((c) => ({
      slug: c.slug,
      label: `#${c.draft.manifest.issueNumber} ${c.draft.manifest.title}`,
    })),
    activeSlug: m.slug,
    writable: d.writable,
    curDirty: keys.some((k) => m.isDirty(k)),
    dirtyCount: dirtyAll,
    needReload: d.conflict || d.stale.length > 0,
    reloadLabel: d.conflict ? 'Reload from disk (409 conflict)' : `Reload from disk (${d.stale.length} changed)`,
    revertLabel: 'Revert file',
    statusText: d.writable
      ? d.status || `${m.draft.levels.length} levels`
      : 'READ-ONLY — start the dev server (npm start) to edit chapters on disk',
    topTogglesEl: d.workspace.renderTopToggles(),
    onSelectPack: (slug) => {
      const next = d.models.find((c) => c.slug === slug);
      if (next) d.select({ slug: next.slug, target: 'level', levelId: next.draft.levels[0]?.id ?? '', tab: 'overview' });
    },
    onRevert: () => d.revertKeys(keys),
    onSaveFile: () => d.saveKeys(keys),
    onSaveAll: () => d.saveKeys(m.dirtyKeys()),
    onReload: () => d.reloadFromDisk(),
  });
}

export function renderChapterSidebar(sideBodyEl: HTMLElement, d: ChapterChromeDeps): void {
  const m = d.model;
  clear(sideBodyEl);
  sideBodyEl.append(
    workstationChrome.dockHead({
      panel: 'left',
      title: 'Chapter',
      panelName: 'Levels',
      closeGlyph: '◀',
      closeTitle: 'Hide Levels Outliner ([)',
      closeAria: 'Hide Levels Outliner',
      onClose: () => d.workspace.toggle('left'),
    }),
    workstationChrome.outlinerItem({
      label: 'Settings, speakers & comic',
      active: d.sel.target === 'chapter',
      counts: {
        dirty: ['manifest', 'dialogs', 'comix'].some((k) => m.isDirty(k)),
        ...workstationChrome.issueCountsFor(d.issues, ['chapter', 'comix', 'dialogs']),
      },
      ariaCurrent: 'true',
      onClick: () => d.select({ target: 'chapter', tab: 'manifest' }),
    }),
    h('h3', {}, `Levels (${m.draft.levels.length})`),
  );

  for (const l of m.draft.levels) {
    const active = d.sel.target === 'level' && d.sel.levelId === l.id;
    sideBodyEl.append(
      workstationChrome.outlinerItem({
        label: `${String(l.index).padStart(2, '0')} ${l.title}`,
        subtitle: `${l.mechanic} · ${l.roomKind}`,
        active,
        counts: { dirty: m.isDirty(`level:${l.id}`), ...workstationChrome.issueCountsFor(d.issues, [l.id]) },
        ariaCurrent: 'true',
        onClick: () => d.select({ target: 'level', levelId: l.id }),
      }),
    );
  }
}

export function renderChapterTabBar(tabsEl: HTMLElement, paneEl: HTMLElement, d: ChapterChromeDeps): void {
  const tabs = d.sel.target === 'level' ? LEVEL_TABS : CHAPTER_TABS;
  workstationChrome.tabs(tabsEl, paneEl, {
    tabs,
    activeTab: d.sel.tab,
    idPrefix: 'ch-tab',
    panelId: 'ch-tabpanel',
    dragLabel: 'Inspector',
    closeTitle: 'Hide Inspector (])',
    errorCountForTab: (tabId) =>
      d.issues.filter(
        (i) =>
          i.tab === tabId &&
          (d.sel.target === 'level' ? i.where === d.sel.levelId : i.where === 'chapter' || i.where === 'comix' || i.where === 'dialogs') &&
          i.severity === 'error',
      ).length,
    onSelectTab: (tabId) => d.select({ tab: tabId }),
    onClose: () => d.workspace.toggle('right'),
  });
}
