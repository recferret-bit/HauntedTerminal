import { clear, h } from '../editor-core/dom.js';
import { bindOpenDetails } from '../editor-core/form-state.js';
import { groupedCommands, type CommandEntry } from './commands.js';
import type { ContextCommand } from './context.js';

export interface CommandsDeps {
  /** What the selection is, for the heading (`enemy virus-1`), or null when nothing is selected. */
  selectionLabel: string | null;
  context: readonly ContextCommand[];
  entries: readonly CommandEntry[];
  /** Listed by Tab but "command not found". */
  missing: ReadonlySet<string>;
  /** Commands the game lists that the panel has no group for. */
  ungrouped: readonly string[];
  /** Manual pages that are open, kept across redraws. */
  open: Set<string>;
  /** Puts the text in the game terminal without pressing Enter. */
  onInsert: (text: string) => void;
  /** Types the line and presses Enter. */
  onRun: (line: string) => void;
}

function actions(d: CommandsDeps, line: string, key: string): HTMLElement {
  return h(
    'span',
    { class: 'lab-cmd-actions' },
    h('button', { type: 'button', class: 'btn small', title: 'Put it in the terminal without running it', 'data-focus-key': `${key}-insert`, onclick: () => d.onInsert(line) }, 'Insert'),
    h('button', { type: 'button', class: 'btn small primary', title: 'Type it and press Enter', 'data-focus-key': `${key}-run`, onclick: () => d.onRun(line) }, 'Run'),
  );
}

function contextSection(d: CommandsDeps): HTMLElement[] {
  if (d.selectionLabel === null) return [h('p', { class: 'note dim' }, 'Select something in the scene or the script to see commands made for it.')];
  if (d.context.length === 0) return [h('h3', {}, `Try on ${d.selectionLabel}`), h('p', { class: 'note dim' }, 'Nothing to type for this one.')];
  return [
    h('h3', {}, `Try on ${d.selectionLabel}`),
    h('ul', { class: 'lab-cmds', 'aria-label': 'Commands for the selection' }, ...d.context.map((c, i) => h('li', { 'data-cmd': c.line }, h('div', {}, h('code', {}, c.line), h('div', { class: 'lab-cmd-why' }, c.why)), actions(d, c.line, `tip-${i}`)))),
  ];
}

function entryRow(d: CommandsDeps, e: CommandEntry): HTMLElement {
  const note = d.missing.has(e.name) ? h('span', { class: 'lab-cmd-missing', title: 'Tab completes it, but the shell answers "command not found".' }, 'not implemented') : null;
  const summary = h('summary', {}, h('code', {}, e.name), h('span', { class: 'lab-cmd-usage' }, e.usage), note);
  const key = `man:${e.name}`;
  const page = h('details', { class: 'lab-cmd', open: d.open.has(key) }, summary, e.man ? h('pre', { class: 'lab-pre' }, e.man) : h('p', { class: 'note dim' }, 'No manual page.'));
  bindOpenDetails(page, key, d.open);
  return h('li', { 'data-command': e.name }, page, actions(d, e.example, `cmd-${e.name}`));
}

/** The Commands tab: tips for the selection, then every command of the shell by group with its manual, Insert and Run. */
export function renderCommandsPanel(host: HTMLElement, d: CommandsDeps): void {
  clear(host);
  host.append(
    ...contextSection(d),
    h('h3', {}, `Every command (${d.entries.length})`),
    ...(d.ungrouped.length > 0 ? [h('p', { class: 'note warn', role: 'alert' }, `▲ The game lists commands this panel does not group yet: ${d.ungrouped.join(', ')}`)] : []),
    ...groupedCommands(d.entries).flatMap((g) => [h('h4', { class: 'lab-cmd-group' }, g.group), h('ul', { class: 'lab-cmds', 'aria-label': g.group }, ...g.entries.map((e) => entryRow(d, e)))]),
  );
}
