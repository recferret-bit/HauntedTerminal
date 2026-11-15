import type { KernelEvent } from '../contracts/events.js';
import type { LabEntity, LabInspect, LabNode } from '../chapters/session-lab-types.js';
import { renderDataTable } from '../editor-core/chrome.js';
import { clear, h } from '../editor-core/dom.js';
import { bindOpenDetails } from '../editor-core/form-state.js';
import type { StepResult } from './runner.js';

/** `rw-r--r--` for the low nine bits of a mode. */
const rwx = (mode: number): string => [0o400, 0o200, 0o100, 0o40, 0o20, 0o10, 0o4, 0o2, 0o1].map((bit, i) => (mode & bit ? 'rwx'[i % 3] : '-')).join('');

/** What the live tabs need from the app: the selection and the setup object behind a row, and what is expanded. */
export interface LiveDeps {
  selectedPath: string | null;
  /** The setup item path of an entity id or a VFS path (`setup[i]`), or null when the scene did not place it. */
  itemFor: (key: { entityId?: string; path?: string }) => string | null;
  onSelect: (path: string) => void;
  /** `<details>` that are open, kept across redraws. */
  open: Set<string>;
}

/** A row that selects its setup object when it has one. `data-item-path` is the same path the form and the scene use. */
function row(d: LiveDeps, item: string | null, text: string, ...more: Array<HTMLElement | null>): HTMLElement {
  const selected = item !== null && d.selectedPath === item;
  const label = item ? h('button', { type: 'button', class: 'lab-link', 'data-focus-key': `live-${item}`, onclick: () => d.onSelect(item) }, text) : h('span', {}, text);
  return h('li', { class: `lab-row-item${selected ? ' is-selected' : ''}`, 'data-item-path': item ?? undefined, 'aria-current': selected ? 'true' : undefined }, label, ...more);
}

function details(d: LiveDeps, key: string, summary: string, body: HTMLElement): HTMLElement {
  const el = h('details', { open: d.open.has(key) }, h('summary', {}, summary), body);
  bindOpenDetails(el, key, d.open);
  return el;
}

/** Clears the pane; false (with a waiting note) while the game has not answered yet. */
function ready(host: HTMLElement, info: LabInspect | null): info is LabInspect {
  clear(host);
  if (info) return true;
  host.append(h('p', { class: 'note dim' }, 'The game is starting…'));
  return false;
}

function entityLine(e: LabEntity): string {
  const next = e.kind === 'pickup' ? '' : e.attackIn === null || e.attackIn === undefined ? ' · not attacking' : ` · attacks in ${e.attackIn} tick${e.attackIn === 1 ? '' : 's'}`;
  const hp = e.hp !== undefined ? ` · HP ${e.hp}/${e.maxHp}` : '';
  return `${e.id} · ${e.kind} · ${e.state}${e.pid ? ` · pid ${e.pid}` : ''}${hp}${next}`;
}

/** The World tab: HP, damage absorbed per source, and every enemy and pickup with its state and attack countdown. */
export function renderWorld(host: HTMLElement, info: LabInspect | null, d: LiveDeps): void {
  if (!ready(host, info)) return;
  const sources = Object.entries(info.absorbed);
  host.append(
    h('h3', {}, 'Player'),
    h('p', {}, `HP ${info.hp}/${info.maxHp} · in ${info.cwd} · ${info.enemiesLeft} hostile${info.enemiesLeft === 1 ? '' : 's'} left`),
    h('h3', {}, `Damage absorbed: ${info.absorbedTotal}`),
    sources.length > 0
      ? renderDataTable(['Source', 'Absorbed'], sources.map(([src, n]) => h('tr', {}, h('td', {}, src), h('td', {}, String(n)))))
      : h('p', { class: 'note dim' }, 'Nothing has hit the player yet.'),
    h('h3', {}, `World (${info.entities.length})`),
    h('ul', { class: 'lab-list', 'aria-label': 'Enemies and pickups' }, ...info.entities.map((e) => row(d, d.itemFor({ entityId: e.id }), entityLine(e)))),
  );
}

function fileNode(d: LiveDeps, n: LabNode): HTMLElement {
  const isDir = n.kind === 'dir';
  const meta = h('span', { class: 'lab-meta' }, `${rwx(n.mode)} ${(n.mode & 0o777).toString(8).padStart(3, '0')} uid ${n.uid}${n.kind === 'socket' ? ' · socket' : ''}`);
  const content = n.content ? details(d, `file:${n.path}`, 'content', h('pre', { class: 'lab-pre' }, n.content)) : null;
  const kids = n.children?.length ? h('ul', {}, ...n.children.map((c) => fileNode(d, c))) : null;
  return row(d, d.itemFor({ path: n.path }), `${isDir ? '▸ ' : ''}${n.name || '/'}${isDir ? '/' : ''}`, meta, content, kids);
}

/** The Files tab: the live file tree with modes, owners and contents. */
export function renderFiles(host: HTMLElement, info: LabInspect | null, d: LiveDeps): void {
  if (!ready(host, info)) return;
  host.append(h('h3', {}, 'Files'), h('ul', { class: 'lab-list lab-tree', 'aria-label': 'File tree' }, fileNode(d, info.tree)));
}

/** The Transcript tab: what each script step printed and where it left the world. */
export function renderTranscript(host: HTMLElement, results: readonly StepResult[], d: LiveDeps & { onCopy: () => void }): void {
  clear(host);
  host.append(
    h('div', { class: 'add-row' }, h('h3', {}, `Transcript (${results.length})`), h('button', { type: 'button', class: 'btn small', onclick: d.onCopy }, 'Copy')),
    results.length === 0
      ? h('p', { class: 'note dim' }, 'Run the script (Step or Run all) to fill this in.')
      : h(
          'ul',
          { class: 'lab-list', 'aria-label': 'Transcript' },
          ...results.map((r) =>
            row(
              d,
              `steps[${r.index}]`,
              `${r.ok ? '✓' : '✕'} ${r.index + 1}. ${r.label}`,
              h('pre', { class: 'lab-pre' }, `${r.output || '(no output)'}\n= code ${r.code ?? '-'} · ${r.eventTypes.join(', ') || 'no events'} · HP ${r.hp}/${r.maxHp} · +${r.absorbed} absorbed · ${r.cwd}${r.ok ? '' : `\n✕ ${r.failures.join('; ')}`}`),
            ),
          ),
        ),
  );
}

/** The Events tab: the newest events the game produced, each expandable to its JSON. */
export function renderEvents(host: HTMLElement, events: readonly KernelEvent[], d: LiveDeps): void {
  clear(host);
  const shown = events.slice(-120);
  const first = events.length - shown.length;
  host.append(
    h('h3', {}, `Events (${events.length}, newest first)`),
    shown.length === 0
      ? h('p', { class: 'note dim' }, 'No events yet.')
      : h('ul', { class: 'lab-list', 'aria-label': 'Events' }, ...shown.map((ev, i) => h('li', {}, details(d, `event:${first + i}`, ev.type, h('pre', { class: 'lab-pre' }, JSON.stringify(ev, null, 2))))).reverse()),
  );
}
