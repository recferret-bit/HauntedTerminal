import { workstationChrome } from '../editor-core/chrome.js';
import { clear, h } from '../editor-core/dom.js';
import type { BaseDockId, WorkspaceManager } from '../editor-core/workspace.js';
import type { ComixIssue } from './check.js';
import type { ComixFileKey, ComixModel } from './model.js';
import { COMIX_TABS, PAGE_TABS, type ComixSel } from './panes.js';

export type ComixDockId = BaseDockId | 'jumps';

export interface ChromeRenderDeps {
  models: ComixModel[];
  activeModel: ComixModel;
  sel: ComixSel;
  writable: boolean;
  statusMsg: string;
  conflict: boolean;
  staleFiles: string[];
  issues: ComixIssue[];
  workspace: WorkspaceManager<ComixDockId>;
  activeFileKey: () => ComixFileKey;
  navigate: (next: Partial<ComixSel>) => void;
  revertCurrent: () => void;
  saveKeys: (keys: ComixFileKey[]) => void;
  reloadFromDisk: () => void;
}

export function renderEditorTopBar(topEl: HTMLElement, d: ChromeRenderDeps): void {
  const model = d.activeModel;
  const curKey = d.activeFileKey();
  workstationChrome.topBar(topEl, {
    brandAccent: 'COMIX',
    brandRest: 'EDITOR',
    pickerLabel: 'Select comix sequence',
    options: d.models.map((m) => ({ slug: m.slug, label: `${m.slug} — ${m.draft.manifest.title}` })),
    activeSlug: model.slug,
    writable: d.writable,
    curDirty: model.dirty(curKey),
    dirtyCount: model.dirtyEntries().length,
    needReload: d.conflict || d.staleFiles.length > 0,
    reloadLabel: d.conflict ? 'Reload (409 conflict)' : `Reload (${d.staleFiles.length} changed on disk)`,
    revertLabel: 'Revert',
    statusText: d.writable
      ? d.statusMsg || `${model.draft.pages.length} pages · ${model.draft.manifest.durationSec}s`
      : 'READ-ONLY — run npm start to save edits to comix/',
    topTogglesEl: d.workspace.renderTopToggles(),
    onSelectPack: (slug) => d.navigate({ slug, target: 'manifest', tab: 'manifest' }),
    onRevert: () => d.revertCurrent(),
    onSaveFile: () => d.saveKeys([curKey]),
    onSaveAll: () => d.saveKeys(model.dirtyEntries().map((e) => e.key)),
    onReload: () => d.reloadFromDisk(),
  });
}

export function renderEditorSidebar(sideBodyEl: HTMLElement, d: ChromeRenderDeps): void {
  const model = d.activeModel;
  const m = model.draft.manifest;
  clear(sideBodyEl);
  sideBodyEl.append(
    workstationChrome.dockHead({
      panel: 'left',
      title: 'Sequence Setup',
      panelName: 'Pages',
      closeGlyph: '◀',
      closeTitle: 'Hide Pages Outliner ([)',
      closeAria: 'Hide Pages Outliner',
      onClose: () => d.workspace.toggle('left'),
    }),
    workstationChrome.outlinerItem({
      label: 'Comix & Stage',
      subtitle: `${m.cast.length} cast · ${m.durationSec}s · skip: ${m.skip === 'end' ? 'end' : `${m.skip.length} stops`}`,
      active: d.sel.target === 'manifest',
      counts: { dirty: model.dirty('manifest'), ...workstationChrome.issueCountsFor(d.issues, ['comix']) },
      ariaCurrent: 'page',
      onClick: () => d.navigate({ target: 'manifest' }),
    }),
    h('h3', {}, `Connected Pages (${model.draft.pages.length})`),
  );

  for (const page of model.draft.pages) {
    const num = String(page.index + 1).padStart(2, '0');
    sideBodyEl.append(
      workstationChrome.outlinerItem({
        label: `${num} ${page.title}`,
        subtitle: `${page.from}s → ${page.until}s · ${page.panels.length} panel${page.panels.length === 1 ? '' : 's'}`,
        active: d.sel.target === page.id,
        counts: { dirty: model.dirty(`page:${page.id}`), ...workstationChrome.issueCountsFor(d.issues, [page.id]) },
        ariaCurrent: 'page',
        onClick: () => d.navigate({ target: page.id }),
      }),
    );
  }
}

export function renderEditorTabBar(tabsEl: HTMLElement, paneEl: HTMLElement, d: ChromeRenderDeps): void {
  const tabs = d.sel.target === 'manifest' ? COMIX_TABS : PAGE_TABS;
  const scopeWhere = d.sel.target === 'manifest' ? 'comix' : d.sel.target;
  workstationChrome.tabs(tabsEl, paneEl, {
    tabs,
    activeTab: d.sel.tab,
    idPrefix: 'cx-tab',
    panelId: 'cx-tabpanel',
    dragLabel: 'Inspector',
    closeTitle: 'Hide Inspector (])',
    errorCountForTab: (tabId) =>
      tabId === 'check'
        ? d.issues.filter((i) => i.severity === 'error').length
        : d.issues.filter((i) => i.where === scopeWhere && i.tab === tabId && i.severity === 'error').length,
    onSelectTab: (tabId) => d.navigate({ tab: tabId }),
    onClose: () => d.workspace.toggle('right'),
  });
}
