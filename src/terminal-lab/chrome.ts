import { workstationChrome } from '../editor-core/chrome.js';
import { clear, h } from '../editor-core/dom.js';
import type { BaseDockId, DockButtonDef, WorkspaceManager } from '../editor-core/workspace.js';
import { paletteGroups, type PaletteEntry } from './catalog.js';
import type { LabModel } from './lab-model.js';
import type { ImportableLevel } from './level-import.js';
import { setupTitle } from './schema.js';

export type LabDockId = BaseDockId | 'log';

export const LAB_DOCK_BUTTONS: readonly DockButtonDef<LabDockId>[] = [
  { id: 'left', label: '◧ Scene', title: 'Toggle Left Scene dock ([)', restoreLabel: 'Scene' },
  { id: 'right', label: '◨ Inspector', title: 'Toggle Right Inspector (])', restoreLabel: 'Inspector' },
  { id: 'timeline', label: '◫ Console', title: 'Toggle Bottom Script & Console (\\)', restoreLabel: 'Console' },
  { id: 'log', label: '⊟ Log', title: 'Toggle Event Log' },
  { id: 'stagebar', label: '⬒ Bar', title: 'Toggle Viewport Toolbar' },
  { id: 'top', label: '▴ Top', title: 'Hide Top Bar (restorable from floating pill)' },
];

/** Palette groups open when the lab is first shown. */
export const FIRST_OPEN_GROUPS: readonly string[] = ['Enemies', 'Pickups', 'Files'];

export interface LabChromeDeps {
  model: LabModel;
  /** Labs to pick from: in this browser, and in the repo (`repoOnly` when only there). */
  labs: ReadonlyArray<{ id: string; title: string; repoOnly: boolean }>;
  /** Chapter levels that can be copied into a new lab (`<chapterId>/<levelId>`). */
  levels: readonly ImportableLevel[];
  writable: boolean;
  repoDir: string;
  stale: boolean;
  status: string;
  workspace: WorkspaceManager<LabDockId>;
  /** Clock, enemy fire and the no-damage badge: built once by the app, placed in the top bar. */
  extras: readonly HTMLElement[];
  /** Palette groups that are open, kept across redraws. */
  paletteOpen: Set<string>;
  onPick: (id: string) => void;
  onRevert: () => void;
  onSave: () => void;
  onReload: () => void;
  onSelect: (path: string | null) => void;
  onAdd: (entry: PaletteEntry) => void;
  onRemove: (index: number) => void;
  onNew: () => void;
  onDuplicate: () => void;
  onImport: (file: File) => void;
  onExport: () => void;
  onDelete: () => void;
  onOpenLevel: (ref: string) => void;
}

/** One row: brand, lab picker, Revert to repo, Save to repo, Reload from repo, clock, enemy fire, badge, status, dock toggles. */
export function renderLabTopBar(top: HTMLElement, d: LabChromeDeps): void {
  const state = d.model.repoState();
  workstationChrome.topBar(top, {
    brandAccent: 'TERMINAL',
    brandRest: 'LAB',
    pickerLabel: 'Select lab',
    options: d.labs.map((l) => ({ slug: l.id, label: `${l.title === l.id ? l.id : `${l.title} (${l.id})`}${l.repoOnly ? ' · repo' : ''}` })),
    activeSlug: d.model.id,
    writable: d.writable,
    curDirty: state !== 'clean',
    dirtyCount: 0,
    showSaveAll: false,
    saveFileLabel: 'Save to repo',
    saveFileTitle: `Write ${d.repoDir}/${d.model.id}.lab.json (Ctrl/Cmd+S)`,
    needReload: d.stale,
    reloadLabel: 'Reload from repo',
    revertLabel: 'Revert to repo',
    statusText: d.writable ? d.status : `${d.status} · repo read-only (npm start to save)`,
    topTogglesEl: d.workspace.renderTopToggles(),
    extras: d.extras,
    onSelectPack: d.onPick,
    onRevert: d.onRevert,
    onSaveFile: d.onSave,
    onSaveAll: d.onSave,
    onReload: d.onReload,
  });
}

/** New, Duplicate, Import, Export, Delete: the browser library, at the top of the Scene dock. */
function libraryBar(d: LabChromeDeps): HTMLElement {
  const file = h('input', { type: 'file', accept: '.json,application/json', hidden: true, 'aria-label': 'Import a .lab.json file' });
  file.addEventListener('change', () => {
    const picked = file.files?.[0];
    if (picked) d.onImport(picked);
    file.value = '';
  });
  const btn = (label: string, title: string, onclick: () => void) => h('button', { type: 'button', class: 'btn small', title, 'data-focus-key': `lib-${label}`, onclick }, label);
  return h(
    'div',
    { class: 'lab-library', role: 'group', 'aria-label': 'Lab library' },
    btn('New', 'Start a new empty lab', d.onNew),
    btn('Duplicate', 'Copy this lab under a new id', d.onDuplicate),
    btn('Import…', 'Open a .lab.json file', () => file.click()),
    btn('Export', 'Download this lab as .lab.json', d.onExport),
    btn('Delete', 'Delete this lab from the browser (the repo copy stays)', d.onDelete),
    file,
  );
}

/** Copies a compiled chapter level into a new lab, without touching `chapters/`. */
function chapterLevelBar(d: LabChromeDeps): HTMLElement[] {
  if (d.levels.length === 0) return [];
  const pick = h(
    'select',
    { 'aria-label': 'Import chapter level', title: 'Choose a chapter level to open as a lab', 'data-focus-key': 'lib-level-pick' },
    ...d.levels.map((l) => h('option', { value: l.ref }, `${String(l.index).padStart(2, '0')} · ${l.title} (${l.levelId})`)),
  );
  const open = h(
    'button',
    {
      type: 'button',
      class: 'btn small',
      title: 'Open a copy of this chapter level in the lab (never edits chapters/)',
      'data-focus-key': 'lib-open-level',
      onclick: () => {
        if (pick.value) d.onOpenLevel(pick.value);
      },
    },
    'Open level',
  );
  return [h('div', { class: 'lab-from-level', role: 'group', 'aria-label': 'Open a chapter level' }, pick, open)];
}

/** Nesting depth of a path below the start directory, for the indented scene list. */
function depthBelow(path: string, cwd: string): number {
  return path.startsWith(`${cwd}/`) ? path.slice(cwd.length + 1).split('/').length - 1 : 0;
}

function sceneRow(d: LabChromeDeps, index: number): HTMLElement {
  const { model } = d;
  const op = model.script.setup[index]!;
  const where = `setup[${index}]`;
  const title = setupTitle(op as unknown as Record<string, unknown>);
  const item = workstationChrome.outlinerItem({
    label: `${'· '.repeat(depthBelow('path' in op ? op.path : '', model.script.room.cwd))}${title}`,
    active: model.selectedSetup === index,
    counts: { dirty: false, ...workstationChrome.issueCountsFor(model.issues, [where]) },
    onClick: () => d.onSelect(where),
  });
  item.setAttribute('data-focus-key', `${where}-pick`);
  const del = h('button', { type: 'button', class: 'mini', title: 'Remove from the scene', 'aria-label': `Remove ${title}`, 'data-focus-key': `${where}-remove`, onclick: () => d.onRemove(index) }, '✕');
  return h('div', { class: 'lab-row', 'data-item-path': where }, item, del);
}

function paletteGroup(d: LabChromeDeps, group: string, entries: PaletteEntry[]): HTMLElement {
  const details = h(
    'details',
    { class: 'lab-group', 'data-group': group, open: d.paletteOpen.has(group) },
    h('summary', {}, `${group} (${entries.length})`),
    h(
      'div',
      { class: 'lab-chips' },
      ...entries.map((e) =>
        h(
          'button',
          { type: 'button', class: 'chip', draggable: 'true', title: e.hint, 'data-palette': e.id, 'data-focus-key': `palette-${e.id}`, onclick: () => d.onAdd(e) },
          e.label,
        ),
      ),
    ),
  );
  details.addEventListener('toggle', () => {
    if (details.open) d.paletteOpen.add(group);
    else d.paletteOpen.delete(group);
  });
  return details;
}

/** The left dock: library actions, lab settings, the scene list (badged by its issues), and the palette of everything placeable. */
export function renderSceneDock(body: HTMLElement, d: LabChromeDeps): void {
  const { model } = d;
  clear(body);
  body.append(
    workstationChrome.dockHead({
      panel: 'left',
      title: 'Scene',
      panelName: 'Scene',
      closeGlyph: '◀',
      closeTitle: 'Hide Scene dock ([)',
      closeAria: 'Hide Scene dock',
      onClose: () => d.workspace.toggle('left'),
    }),
    libraryBar(d),
    ...chapterLevelBar(d),
    workstationChrome.outlinerItem({
      label: 'Room, player & clock',
      active: model.selectedPath === null,
      counts: { dirty: false, ...workstationChrome.issueCountsFor(model.issues, ['lab']) },
      onClick: () => d.onSelect(null),
    }),
    h('h3', {}, `In the room (${model.script.setup.length})`),
    model.script.setup.length === 0
      ? h('p', { class: 'note dim lab-scene-empty', 'data-scene-drop': 'true' }, 'Empty. Click or drag something below to place it.')
      : h('div', { class: 'lab-scene', 'data-scene-drop': 'true' }, ...model.script.setup.map((_, i) => sceneRow(d, i))),
    h('h3', {}, 'Place'),
    ...paletteGroups().map((g) => paletteGroup(d, g.group, g.entries)),
  );
}
