import { clear, h } from '../chapter-editor/dom.js';
import type { ComixIssue } from './check.js';
import type { ComixFileKey, ComixModel } from './model.js';
import { COMIX_TABS, PAGE_TABS, type ComixSel } from './panes.js';
import type { WorkspaceManager } from './workspace.js';

export interface ChromeRenderDeps {
  models: ComixModel[];
  activeModel: ComixModel;
  sel: ComixSel;
  writable: boolean;
  statusMsg: string;
  conflict: boolean;
  staleFiles: string[];
  issues: ComixIssue[];
  workspace: WorkspaceManager;
  activeFileKey: () => ComixFileKey;
  navigate: (next: Partial<ComixSel>) => void;
  revertCurrent: () => void;
  saveKeys: (keys: ComixFileKey[]) => void;
  reloadFromDisk: () => void;
}

function badgeMarks(issues: ComixIssue[], where: string, dirty: boolean): HTMLElement {
  const errs = issues.filter((i) => i.where === where && i.severity === 'error').length;
  const warns = issues.filter((i) => i.where === where && i.severity === 'warn').length;
  return h(
    'span',
    { class: 'marks' },
    dirty ? h('i', { class: 'dot', title: 'Unsaved changes' }, '●', h('span', { class: 'sr' }, ' unsaved')) : null,
    errs > 0 ? h('i', { class: 'bad', title: `${errs} error(s)` }, `✕${errs}`) : null,
    warns > 0 ? h('i', { class: 'warnmark', title: `${warns} warning(s)` }, `▲${warns}`) : null,
  );
}

export function renderEditorTopBar(topEl: HTMLElement, d: ChromeRenderDeps): void {
  const model = d.activeModel;
  const curKey = d.activeFileKey();
  const curDirty = model.dirty(curKey);
  const dirtyCount = model.dirtyEntries().length;
  const picker = h(
    'select',
    {
      class: 'ed-chapter',
      'aria-label': 'Select comix sequence',
      onchange: () => d.navigate({ slug: picker.value, target: 'manifest', tab: 'manifest' }),
    },
    ...d.models.map((m) =>
      h('option', { value: m.slug, selected: m.slug === model.slug }, `${m.slug} — ${m.draft.manifest.title}`),
    ),
  );
  const revertBtn = h(
    'button',
    { type: 'button', class: 'btn', disabled: !curDirty, onclick: () => d.revertCurrent() },
    'Revert',
  );
  const saveCurBtn = h(
    'button',
    {
      type: 'button',
      class: 'btn',
      disabled: !d.writable || !curDirty,
      onclick: () => d.saveKeys([curKey]),
    },
    curDirty ? 'Save file ●' : 'Save file',
  );
  const saveAllBtn = h(
    'button',
    {
      type: 'button',
      class: 'btn primary',
      disabled: !d.writable || dirtyCount === 0,
      onclick: () => d.saveKeys(model.dirtyEntries().map((e) => e.key)),
    },
    dirtyCount > 0 ? `Save all (${dirtyCount})` : 'Save all',
  );
  const needReload = d.conflict || d.staleFiles.length > 0;
  const reloadBtn = needReload
    ? h(
        'button',
        { type: 'button', class: 'btn warn', onclick: () => d.reloadFromDisk() },
        d.conflict ? 'Reload (409 conflict)' : `Reload (${d.staleFiles.length} changed on disk)`,
      )
    : null;
  const statusText = d.writable
    ? d.statusMsg || `${model.draft.pages.length} pages · ${model.draft.manifest.durationSec}s`
    : 'READ-ONLY — run npm start to save edits to comix/';

  clear(topEl);
  topEl.append(
    h('span', { class: 'ed-brand' }, h('b', {}, 'COMIX'), ' EDITOR'),
    picker,
    revertBtn,
    saveCurBtn,
    saveAllBtn,
    ...(reloadBtn ? [reloadBtn] : []),
    h('span', { class: 'ed-status', role: 'status', 'aria-live': 'polite' }, statusText),
    d.workspace.renderTopToggles(),
  );
}

export function renderEditorSidebar(sideBodyEl: HTMLElement, d: ChromeRenderDeps): void {
  const model = d.activeModel;
  const m = model.draft.manifest;
  clear(sideBodyEl);

  sideBodyEl.append(
    h(
      'div',
      { class: 'cx-dock-head', 'data-panel-drag': 'left' },
      h('button', {
        type: 'button',
        class: 'mini cx-drag-grip',
        'data-drag-grip': 'left',
        title: 'Drag Pages panel (double-click to dock)',
        'aria-label': 'Move Pages panel (Enter toggles float, Arrows nudge, Alt+Arrows resize)',
      }, '⠿'),
      h('h3', {}, 'Sequence Setup'),
      h('span', { class: 'cx-bar-spacer' }),
      h('button', {
        type: 'button',
        class: 'mini cx-redock-btn',
        'data-redock': 'left',
        title: 'Dock Pages panel',
        'aria-label': 'Dock Pages panel',
      }, '📌'),
      h('button', {
        type: 'button',
        class: 'mini cx-dock-close',
        title: 'Hide Pages Outliner ([)',
        'aria-label': 'Hide Pages Outliner',
        onclick: () => d.workspace.toggle('left'),
      }, '◀'),
    ),
  );
  const onManifest = d.sel.target === 'manifest';
  sideBodyEl.append(
    h(
      'button',
      {
        type: 'button',
        class: `ed-item${onManifest ? ' on' : ''}`,
        'aria-current': onManifest ? 'page' : undefined,
        onclick: () => d.navigate({ target: 'manifest' }),
      },
      h('span', {}, 'Comix & Stage'),
      badgeMarks(d.issues, 'comix', model.dirty('manifest')),
      h('small', {}, `${m.cast.length} cast · ${m.durationSec}s · skip: ${m.skip === 'end' ? 'end' : `${m.skip.length} stops`}`),
    ),
  );

  sideBodyEl.append(h('h3', {}, `Connected Pages (${model.draft.pages.length})`));
  for (const page of model.draft.pages) {
    const active = d.sel.target === page.id;
    const num = String(page.index + 1).padStart(2, '0');
    sideBodyEl.append(
      h(
        'button',
        {
          type: 'button',
          class: `ed-item${active ? ' on' : ''}`,
          'aria-current': active ? 'page' : undefined,
          onclick: () => d.navigate({ target: page.id }),
        },
        h('span', {}, `${num} ${page.title}`),
        badgeMarks(d.issues, page.id, model.dirty(`page:${page.id}`)),
        h('small', {}, `${page.from}s → ${page.until}s · ${page.panels.length} panel${page.panels.length === 1 ? '' : 's'}`),
      ),
    );
  }
}

export function renderEditorTabBar(tabsEl: HTMLElement, paneEl: HTMLElement, d: ChromeRenderDeps): void {
  const tabs = d.sel.target === 'manifest' ? COMIX_TABS : PAGE_TABS;
  const scopeWhere = d.sel.target === 'manifest' ? 'comix' : d.sel.target;
  clear(tabsEl);
  const tabListEl = h('div', { class: 'cx-tablist', role: 'tablist', 'aria-label': 'Spec sections' });
  tabs.forEach((tab, idx) => {
    const selected = tab.id === d.sel.tab;
    const errCount =
      tab.id === 'check'
        ? d.issues.filter((i) => i.severity === 'error').length
        : d.issues.filter((i) => i.where === scopeWhere && i.tab === tab.id && i.severity === 'error').length;
    const btn = h(
      'button',
      {
        type: 'button',
        role: 'tab',
        id: `cx-tab-${tab.id}`,
        tabIndex: selected ? 0 : -1,
        'aria-selected': selected ? 'true' : 'false',
        'aria-controls': 'cx-tabpanel',
        class: `ed-tab${selected ? ' on' : ''}`,
        onclick: () => d.navigate({ tab: tab.id }),
      },
      tab.label,
      errCount > 0 ? h('i', { class: 'bad' }, ` ✕${errCount}`) : null,
    );
    btn.addEventListener('keydown', (ev) => {
      let nextIdx = -1;
      if (ev.key === 'ArrowRight') nextIdx = (idx + 1) % tabs.length;
      else if (ev.key === 'ArrowLeft') nextIdx = (idx - 1 + tabs.length) % tabs.length;
      else if (ev.key === 'Home') nextIdx = 0;
      else if (ev.key === 'End') nextIdx = tabs.length - 1;
      if (nextIdx < 0) return;
      ev.preventDefault();
      const nextTab = tabs[nextIdx]!;
      d.navigate({ tab: nextTab.id });
      const nextBtn = document.getElementById(`cx-tab-${nextTab.id}`);
      nextBtn?.focus();
      nextBtn?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
    tabListEl.append(btn);
  });
  tabsEl.append(
    h('button', {
      type: 'button',
      class: 'mini cx-drag-grip',
      'data-drag-grip': 'right',
      title: 'Drag Inspector panel (double-click to dock)',
      'aria-label': 'Move Inspector panel (Enter toggles float, Arrows nudge, Alt+Arrows resize)',
    }, '⠿'),
    tabListEl,
    h('span', { class: 'cx-bar-spacer' }),
    h('button', {
      type: 'button',
      class: 'mini cx-redock-btn',
      'data-redock': 'right',
      title: 'Dock Inspector panel',
      'aria-label': 'Dock Inspector panel',
    }, '📌'),
    h('button', {
      type: 'button',
      class: 'mini cx-dock-close',
      title: 'Hide Inspector (])',
      'aria-label': 'Hide Inspector',
      onclick: () => d.workspace.toggle('right'),
    }, '▶'),
  );
  paneEl.id = 'cx-tabpanel';
  paneEl.setAttribute('aria-labelledby', `cx-tab-${d.sel.tab}`);
}
