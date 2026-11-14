import { clear, h, isRec, type Rec } from './dom.js';

export interface EditorIssueLike {
  severity: 'error' | 'warn';
  where: string;
  tab: string;
  message: string;
}

export interface TabDef {
  readonly id: string;
  readonly label: string;
}

export interface BadgeCounts {
  dirty: boolean;
  errors: number;
  warns: number;
}

export interface PackOption {
  slug: string;
  label: string;
}

export interface TopBarSpec {
  brandAccent: string;
  brandRest: string;
  pickerLabel: string;
  options: readonly PackOption[];
  activeSlug: string;
  writable: boolean;
  curDirty: boolean;
  dirtyCount: number;
  needReload: boolean;
  reloadLabel: string;
  revertLabel: string;
  statusText: string;
  topTogglesEl: HTMLElement;
  onSelectPack: (slug: string) => void;
  onRevert: () => void;
  onSaveFile: () => void;
  onSaveAll: () => void;
  onReload: () => void;
}

export interface DockHeadSpec {
  panel: 'left' | 'right' | 'timeline';
  title: string;
  panelName: string;
  closeGlyph: string;
  closeTitle: string;
  closeAria: string;
  onClose: () => void;
}

export interface OutlinerItemSpec {
  label: string;
  subtitle?: string;
  active: boolean;
  counts: BadgeCounts;
  ariaCurrent?: 'page' | 'true';
  onClick: () => void;
}

export interface TabsBarSpec {
  tabs: readonly TabDef[];
  activeTab: string;
  idPrefix: string;
  panelId: string;
  dragLabel?: string;
  closeTitle: string;
  errorCountForTab: (tabId: string) => number;
  onSelectTab: (tabId: string) => void;
  onClose: () => void;
}

export interface JsonPaneFile {
  key: string;
  path: string;
}

export interface JsonPaneSpec {
  files: readonly JsonPaneFile[];
  initialKey: string;
  readText: (key: string) => string;
  formatValue?: (val: Rec) => string;
  applyObject: (key: string, parsed: Rec) => string | void;
  applyButtonLabel?: string;
  liveInput?: boolean;
}

export interface StageBarRightSpec {
  selReadoutBtn: HTMLElement;
  hint: string;
  onToggleZen?: () => void;
  onHideBar?: () => void;
}

export function renderStageBarRightGroup(s: StageBarRightSpec): HTMLElement {
  return h(
    'div',
    { class: 'cx-bar-right' },
    s.selReadoutBtn,
    h('span', { class: 'cx-bar-hint' }, s.hint),
    h('button', { type: 'button', class: 'btn small', title: 'Focus Mode (`)', onclick: () => s.onToggleZen?.() }, '⛶ Focus'),
    h('button', {
      type: 'button',
      class: 'mini cx-dock-close',
      title: 'Hide viewport toolbar',
      'aria-label': 'Hide viewport toolbar',
      onclick: () => s.onHideBar?.(),
    }, '▴'),
  );
}

export const workstationChrome = {
  topBar: renderWorkstationTopBar,
  dockHead: renderDockHead,
  outlinerItem: renderOutlinerItem,
  tabs: renderWorkstationTabs,
  issueCountsFor,
} as const;

export function badgeMarks(counts: BadgeCounts): HTMLElement {
  return h(
    'span',
    { class: 'marks' },
    counts.dirty ? h('i', { class: 'dot', title: 'Unsaved changes' }, '●', h('span', { class: 'sr' }, ' unsaved')) : null,
    counts.errors > 0
      ? h('i', { class: 'bad', title: `${counts.errors} error(s)` }, `✕${counts.errors}`, h('span', { class: 'sr' }, ' errors'))
      : null,
    counts.warns > 0
      ? h('i', { class: 'warnmark', title: `${counts.warns} warning(s)` }, `▲${counts.warns}`, h('span', { class: 'sr' }, ' warnings'))
      : null,
  );
}

export function issueCountsFor(issues: readonly EditorIssueLike[], wheres: readonly string[]): { errors: number; warns: number } {
  let errors = 0;
  let warns = 0;
  for (const i of issues) {
    if (!wheres.includes(i.where)) continue;
    if (i.severity === 'error') errors += 1;
    else warns += 1;
  }
  return { errors, warns };
}

export function renderWorkstationTopBar(topEl: HTMLElement, s: TopBarSpec): void {
  const picker = h(
    'select',
    {
      class: 'ed-chapter',
      'aria-label': s.pickerLabel,
      onchange: () => s.onSelectPack(picker.value),
    },
    ...s.options.map((opt) => h('option', { value: opt.slug, selected: opt.slug === s.activeSlug }, opt.label)),
  );
  const revertBtn = h(
    'button',
    { type: 'button', class: 'btn', disabled: !s.curDirty, onclick: () => s.onRevert() },
    s.revertLabel,
  );
  const saveCurBtn = h(
    'button',
    {
      type: 'button',
      class: 'btn',
      title: 'Save current file (Ctrl/Cmd+S)',
      disabled: !s.writable || !s.curDirty,
      onclick: () => s.onSaveFile(),
    },
    s.curDirty ? 'Save file ●' : 'Save file',
  );
  const saveAllBtn = h(
    'button',
    {
      type: 'button',
      class: 'btn primary',
      title: 'Save all modified files (Ctrl/Cmd+Shift+S)',
      disabled: !s.writable || s.dirtyCount === 0,
      onclick: () => s.onSaveAll(),
    },
    s.dirtyCount > 0 ? `Save all (${s.dirtyCount})` : 'Save all',
  );
  const reloadBtn = s.needReload
    ? h('button', { type: 'button', class: 'btn warn', onclick: () => s.onReload() }, s.reloadLabel)
    : null;

  clear(topEl);
  topEl.append(
    h('span', { class: 'ed-brand' }, h('b', {}, s.brandAccent), ` ${s.brandRest}`),
    picker,
    revertBtn,
    saveCurBtn,
    saveAllBtn,
    ...(reloadBtn ? [reloadBtn] : []),
    h('span', { class: 'ed-status', role: 'status', 'aria-live': 'polite' }, s.statusText),
    s.topTogglesEl,
  );
}

export function renderDockHead(spec: DockHeadSpec): HTMLElement {
  return h(
    'div',
    { class: 'cx-dock-head', 'data-panel-drag': spec.panel },
    h('button', {
      type: 'button',
      class: 'mini cx-drag-grip',
      'data-drag-grip': spec.panel,
      title: `Drag ${spec.panelName} panel (double-click to dock)`,
      'aria-label': `Move ${spec.panelName} panel (Enter toggles float, Arrows nudge, Alt+Arrows resize)`,
    }, '⠿'),
    h('h3', {}, spec.title),
    h('span', { class: 'cx-bar-spacer' }),
    h('button', {
      type: 'button',
      class: 'mini cx-redock-btn',
      'data-redock': spec.panel,
      title: `Dock ${spec.panelName} panel`,
      'aria-label': `Dock ${spec.panelName} panel`,
    }, '📌'),
    h('button', {
      type: 'button',
      class: 'mini cx-dock-close',
      title: spec.closeTitle,
      'aria-label': spec.closeAria,
      onclick: () => spec.onClose(),
    }, spec.closeGlyph),
  );
}

export function renderOutlinerItem(spec: OutlinerItemSpec): HTMLElement {
  return h(
    'button',
    {
      type: 'button',
      class: `ed-item${spec.active ? ' on' : ''}`,
      'aria-current': spec.active ? (spec.ariaCurrent ?? 'true') : undefined,
      onclick: () => spec.onClick(),
    },
    h('span', { class: 'lbl' }, spec.label),
    badgeMarks(spec.counts),
    spec.subtitle ? h('small', {}, spec.subtitle) : null,
  );
}

export function renderWorkstationTabs(tabsEl: HTMLElement, paneEl: HTMLElement, s: TabsBarSpec): void {
  const hadFocus = Boolean(document.activeElement && tabsEl.contains(document.activeElement));
  clear(tabsEl);
  const tabListEl = h('div', { class: 'cx-tablist', role: 'tablist', 'aria-label': 'Spec sections' });
  s.tabs.forEach((tab, idx) => {
    const selected = tab.id === s.activeTab;
    const errCount = s.errorCountForTab(tab.id);
    const btnId = `${s.idPrefix}-${tab.id}`;
    const btn = h(
      'button',
      {
        type: 'button',
        role: 'tab',
        id: btnId,
        tabIndex: selected ? 0 : -1,
        'aria-selected': selected ? 'true' : 'false',
        'aria-controls': s.panelId,
        class: `ed-tab${selected ? ' on' : ''}`,
        onclick: () => s.onSelectTab(tab.id),
      },
      tab.label,
      errCount > 0 ? h('i', { class: 'bad' }, ` ✕${errCount}`, h('span', { class: 'sr' }, ' errors')) : null,
    );
    btn.addEventListener('keydown', (ev) => {
      let nextIdx = -1;
      if (ev.key === 'ArrowRight') nextIdx = (idx + 1) % s.tabs.length;
      else if (ev.key === 'ArrowLeft') nextIdx = (idx - 1 + s.tabs.length) % s.tabs.length;
      else if (ev.key === 'Home') nextIdx = 0;
      else if (ev.key === 'End') nextIdx = s.tabs.length - 1;
      if (nextIdx < 0) return;
      ev.preventDefault();
      const nextTab = s.tabs[nextIdx]!;
      s.onSelectTab(nextTab.id);
      const nextBtn = document.getElementById(`${s.idPrefix}-${nextTab.id}`);
      nextBtn?.focus();
      nextBtn?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
    tabListEl.append(btn);
  });

  const panelName = s.dragLabel ?? 'Inspector';
  tabsEl.append(
    h('button', {
      type: 'button',
      class: 'mini cx-drag-grip',
      'data-drag-grip': 'right',
      title: `Drag ${panelName} panel (double-click to dock)`,
      'aria-label': `Move ${panelName} panel (Enter toggles float, Arrows nudge, Alt+Arrows resize)`,
    }, '⠿'),
    tabListEl,
    h('span', { class: 'cx-bar-spacer' }),
    h('button', {
      type: 'button',
      class: 'mini cx-redock-btn',
      'data-redock': 'right',
      title: `Dock ${panelName} panel`,
      'aria-label': `Dock ${panelName} panel`,
    }, '📌'),
    h('button', {
      type: 'button',
      class: 'mini cx-dock-close',
      title: s.closeTitle,
      'aria-label': `Hide ${panelName}`,
      onclick: () => s.onClose(),
    }, '▶'),
  );
  paneEl.id = s.panelId;
  paneEl.setAttribute('role', 'tabpanel');
  paneEl.setAttribute('aria-labelledby', `${s.idPrefix}-${s.activeTab}`);
  const activeBtn = document.getElementById(`${s.idPrefix}-${s.activeTab}`);
  activeBtn?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  if (hadFocus) {
    activeBtn?.focus();
  }
}

export function renderIssueList(
  issues: readonly EditorIssueLike[],
  opts: { okText: string; onJump?: (issue: EditorIssueLike) => void },
): HTMLElement {
  if (issues.length === 0) return h('p', { class: 'ok' }, opts.okText);
  const ul = h('ul', { class: 'issues' });
  for (const issue of issues) {
    const isErr = issue.severity === 'error';
    const content = [
      h('b', { 'aria-hidden': 'true' }, isErr ? '✕ ' : '⚠ '),
      h('span', { class: 'sr' }, isErr ? 'Error: ' : 'Warning: '),
      h('span', { class: 'where' }, `[${issue.where}] `),
      issue.message,
    ];
    const li = opts.onJump
      ? h(
          'li',
          { class: `${issue.severity} link` },
          h('button', { type: 'button', class: 'issue-jump', onclick: () => opts.onJump?.(issue) }, ...content),
        )
      : h('li', { class: issue.severity }, ...content);
    ul.append(li);
  }
  return ul;
}

export function renderDataTable(headers: readonly string[], rows: readonly HTMLElement[]): HTMLElement {
  return h(
    'table',
    { class: 'tbl' },
    h(
      'thead',
      {},
      h(
        'tr',
        {},
        ...headers.map((col) => h('th', { scope: 'col' }, col === '' ? h('span', { class: 'sr' }, 'Action') : col)),
      ),
    ),
    h('tbody', {}, ...rows),
  );
}

export function renderJsonFilePane(spec: JsonPaneSpec): HTMLElement {
  if (spec.files.length === 0) return h('p', { class: 'note error' }, 'Unknown spec file.');
  let curKey = spec.files.some((f) => f.key === spec.initialKey) ? spec.initialKey : spec.files[0]!.key;
  const currentPath = (): string => spec.files.find((f) => f.key === curKey)?.path ?? curKey;
  const status = h('p', { class: 'note dim', role: 'status' }, `Editing ${currentPath()}`);
  const area = h('textarea', {
    class: 'json mono',
    spellcheck: 'false',
    'aria-label': `Raw JSON for ${currentPath()}`,
  });
  const loadKey = (key: string): void => {
    curKey = key;
    area.value = spec.readText(key).trimEnd();
    area.setAttribute('aria-label', `Raw JSON for ${currentPath()}`);
    status.className = 'note dim';
    status.textContent = `Editing ${currentPath()}`;
  };
  loadKey(curKey);

  const applyText = (reformat: boolean): void => {
    try {
      const parsed = JSON.parse(area.value) as unknown;
      if (!isRec(parsed)) throw new Error('Root JSON value must be an object');
      const feedback = spec.applyObject(curKey, parsed);
      if (reformat) {
        area.value = (spec.formatValue ? spec.formatValue(parsed) : JSON.stringify(parsed, null, 2)).trimEnd();
      }
      status.textContent = feedback ?? `✓ Applied JSON to draft (${currentPath()})`;
      status.className = 'ok';
    } catch (err) {
      status.textContent = `✕ JSON not applied: ${(err as Error).message}`;
      status.className = 'note error';
    }
  };

  if (spec.liveInput) area.addEventListener('input', () => applyText(false));
  const pick = spec.files.length > 1
    ? h(
        'select',
        { 'aria-label': 'Select spec JSON file', onchange: () => loadKey(pick!.value) },
        ...spec.files.map((f) => h('option', { value: f.key, selected: f.key === curKey }, f.path)),
      )
    : null;
  const applyBtn = spec.applyButtonLabel
    ? h('button', { type: 'button', class: 'btn primary', onclick: () => applyText(false) }, spec.applyButtonLabel)
    : null;
  const fmtBtn = h('button', { type: 'button', class: 'btn small', onclick: () => applyText(true) }, 'Format JSON');

  return h('div', { class: 'jsonpane' }, h('div', { class: 'row' }, pick, applyBtn, fmtBtn, status), area);
}
