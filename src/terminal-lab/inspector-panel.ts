import type { KernelEvent } from '../contracts/events.js';
import type { LabInspect } from '../chapters/session-lab-types.js';
import { renderJsonFilePane, workstationChrome, type TabDef } from '../editor-core/chrome.js';
import { clear, h, redrawKeepingFocus } from '../editor-core/dom.js';
import { syncSelectedDetailsDom, type FormCtx } from '../editor-core/form.js';
import { renderCommandsPanel } from './commands-panel.js';
import { commandEntries, ungrouped, type CommandProbe } from './commands.js';
import { contextCommands } from './context.js';
import { renderChecks, renderGoals, renderObjectForm, renderResult } from './inspector.js';
import { renderEvents, renderFiles, renderTranscript, renderWorld, type LiveDeps } from './inspect-panels.js';
import type { LabModel } from './lab-model.js';
import type { LabDriverKind, LabScript } from './lab-types.js';
import type { StepResult } from './runner.js';
import { exportLabText } from './store.js';

const INSPECTOR_TABS = [
  { id: 'object', label: 'Object' },
  { id: 'commands', label: 'Commands' },
  { id: 'world', label: 'World' },
  { id: 'files', label: 'Files' },
  { id: 'transcript', label: 'Transcript' },
  { id: 'events', label: 'Events' },
  { id: 'json', label: 'JSON' },
] as const satisfies readonly TabDef[];
export type InspectorTab = (typeof INSPECTOR_TABS)[number]['id'];
export const isInspectorTab = (id: string | null): id is InspectorTab => INSPECTOR_TABS.some((t) => t.id === id);

/** What the panel reads from the app and the things it asks the app to do. */
export interface InspectorHost {
  model(): LabModel;
  live(): LabInspect | null;
  results(): StepResult[];
  events(): KernelEvent[];
  probe(driver: LabDriverKind): CommandProbe;
  ctx: FormCtx;
  select(path: string | null): void;
  insert(text: string): void;
  run(line: string): void;
  copyTranscript(): void;
  /** The JSON tab applied a whole new document; returns why it was refused, or null. */
  replaceScript(next: LabScript): string | null;
  closeDock(): void;
  tabChanged(tab: InspectorTab): void;
}

/**
 * The right dock: a tab bar and one pane. Only the active tab is drawn. A tab is redrawn only when the data it shows changed,
 * and always through `redrawKeepingFocus`, so a live refresh never takes a field away from someone typing in it.
 */
export class InspectorPanel {
  readonly mainEl: HTMLElement;
  private readonly tabsEl = h('div', { class: 'ed-tabs', 'data-panel-drag': 'right' });
  private readonly paneEl = h('div', { class: 'ed-pane' });
  private readonly formEl = h('div', { class: 'lab-form' });
  private readonly resultEl = h('div', { class: 'lab-result' });
  private readonly checksEl = h('div', { class: 'lab-checks' });
  private readonly goalsEl = h('div', { class: 'lab-goals' });
  private readonly bodyEl = h('div', { class: 'lab-body' });
  private readonly open = new Set<string>();
  private tab: InspectorTab;
  private lastSig = '';
  /** The JSON tab is applying its own text: redrawing it now would throw away its status line. */
  private applyingJson = false;

  constructor(private readonly host: InspectorHost, tab: InspectorTab) {
    this.tab = tab;
    this.mainEl = h('main', { class: 'ed-main' }, this.tabsEl, this.paneEl);
  }

  get current(): InspectorTab {
    return this.tab;
  }

  setTab(tab: InspectorTab): void {
    if (tab === this.tab && this.paneEl.childElementCount > 0) return;
    this.tab = tab;
    this.host.tabChanged(tab);
    this.draw();
  }

  /** Redraws the tab bar and the whole active tab. */
  draw(): void {
    this.drawTabBar();
    clear(this.paneEl);
    if (this.tab === 'object') this.paneEl.append(this.formEl, this.resultEl, this.checksEl, this.goalsEl);
    else this.paneEl.append(this.bodyEl);
    this.lastSig = '';
    this.drawActive();
  }

  /** The tabs, with the Object tab's error count. Keeps focus on the tab that had it. */
  private drawTabBar(): void {
    const model = this.host.model();
    workstationChrome.tabs(this.tabsEl, this.paneEl, {
      tabs: INSPECTOR_TABS,
      activeTab: this.tab,
      idPrefix: 'lab-tab',
      panelId: 'lab-tabpanel',
      dragLabel: 'Inspector',
      closeTitle: 'Hide Inspector (])',
      errorCountForTab: (id) => (id === 'object' ? model.issues.filter((i) => i.severity === 'error').length : 0),
      onSelectTab: (id) => this.setTab(id as InspectorTab),
      onClose: () => this.host.closeDock(),
    });
  }

  /** The selection moved: what shows it. The form is rebuilt only when it is for another object. */
  selectionChanged(formChanged: boolean): void {
    if (this.tab === 'object') {
      if (formChanged) this.drawForm();
      else syncSelectedDetailsDom(this.formEl, this.host.model().selectedPath, false);
      this.drawResult();
    } else if (!this.applyingJson) this.drawActive(true);
  }

  drawForm(): void {
    redrawKeepingFocus(this.formEl, () => renderObjectForm(this.formEl, this.host.model(), this.host.ctx));
  }

  drawResult(): void {
    const step = this.host.model().selectedStep;
    renderResult(this.resultEl, step === null ? undefined : this.host.results().find((r) => r.index === step));
  }

  /** The issues changed (an edit): the Checks list and the Object tab's error count. */
  issuesChanged(): void {
    if (this.tab === 'object') redrawKeepingFocus(this.checksEl, () => this.drawChecks());
    this.drawTabBar();
  }

  private drawChecks(): void {
    renderChecks(this.checksEl, this.host.model(), (where) => this.host.select(where === 'lab' ? null : where));
  }

  /** The running game answered something new. */
  liveChanged(): void {
    this.drawActive();
  }

  /** Steps ran or were edited. */
  runChanged(): void {
    if (this.tab === 'object') this.drawResult();
    else this.drawActive();
  }

  /** What the active tab shows, as text: unchanged means nothing to redraw. */
  private signature(): string {
    switch (this.tab) {
      case 'object':
        return JSON.stringify(this.host.live()?.goals ?? null);
      case 'world':
        return JSON.stringify([this.host.live()?.entities, this.host.live()?.absorbed, this.host.live()?.cwd, this.host.live()?.hp]);
      case 'files':
        return JSON.stringify(this.host.live()?.tree ?? null);
      case 'transcript':
        return JSON.stringify(this.host.results().map((r) => [r.index, r.ok]));
      case 'events':
        return String(this.host.events().length);
      case 'commands':
        return this.host.model().script.driver ?? 'chapter';
      case 'json':
        return 'static';
    }
  }

  private drawActive(force = false): void {
    const sig = `${this.tab}|${this.host.model().selectedPath}|${this.signature()}`;
    if (!force && sig === this.lastSig) return;
    const first = this.lastSig === '';
    this.lastSig = sig;
    if (this.tab === 'object') {
      if (first) {
        this.drawForm();
        this.drawResult();
        this.drawChecks();
      }
      renderGoals(this.goalsEl, this.host.live());
      return;
    }
    redrawKeepingFocus(this.bodyEl, () => this.drawBody());
  }

  private liveDeps(): LiveDeps {
    const model = this.host.model();
    return {
      selectedPath: model.selectedPath,
      open: this.open,
      onSelect: (path) => this.host.select(path),
      itemFor: ({ entityId, path }) => {
        const i = model.script.setup.findIndex((o) => (entityId !== undefined && 'id' in o && o.id === entityId) || (path !== undefined && 'path' in o && o.path === path));
        return i >= 0 ? `setup[${i}]` : null;
      },
    };
  }

  private drawBody(): void {
    const live = this.host.live();
    switch (this.tab) {
      case 'commands':
        return this.drawCommands();
      case 'world':
        return renderWorld(this.bodyEl, live, this.liveDeps());
      case 'files':
        return renderFiles(this.bodyEl, live, this.liveDeps());
      case 'transcript':
        return renderTranscript(this.bodyEl, this.host.results(), { ...this.liveDeps(), onCopy: () => this.host.copyTranscript() });
      case 'events':
        return renderEvents(this.bodyEl, this.host.events(), this.liveDeps());
      case 'json':
        return this.drawJson();
      case 'object':
        return undefined;
    }
  }

  /** The whole lab document as JSON, with Format and Apply, like the editors' JSON tabs. */
  private drawJson(): void {
    const model = this.host.model();
    clear(this.bodyEl);
    this.bodyEl.append(
      renderJsonFilePane({
        files: [{ key: model.id, path: `${model.id}.lab.json` }],
        initialKey: model.id,
        readText: () => exportLabText(model.script),
        applyButtonLabel: 'Apply JSON',
        applyObject: (_key, parsed) => {
          this.applyingJson = true;
          let problem: string | null;
          try {
            problem = this.host.replaceScript(parsed as unknown as LabScript);
          } finally {
            this.applyingJson = false;
          }
          if (problem) throw new Error(problem);
          return `✓ Applied to ${model.id}`;
        },
      }),
    );
  }

  private drawCommands(): void {
    const model = this.host.model();
    const probe = this.host.probe(model.script.driver ?? 'chapter');
    renderCommandsPanel(this.bodyEl, {
      selectionLabel: model.selectionLabel(),
      context: contextCommands(model.script, { setup: model.selectedSetup, step: model.selectedStep }),
      entries: commandEntries(probe.names, probe.ally),
      missing: new Set(probe.missing),
      ungrouped: ungrouped(probe.names, probe.ally),
      open: this.open,
      onInsert: (text) => this.host.insert(text),
      onRun: (line) => this.host.run(line),
    });
  }
}
