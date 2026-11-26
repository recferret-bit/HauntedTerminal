import { makeSuggest } from '../chapter-editor/suggest.js';
import { buildConsoleDock } from '../editor-core/console-dock.js';
import { h, redrawKeepingFocus } from '../editor-core/dom.js';
import { pollDisk } from '../editor-core/file-tracker.js';
import type { FormCtx } from '../editor-core/form.js';
import { attachWithStage, WorkspaceManager } from '../editor-core/workspace.js';
import { CLASSIC_START_CWD } from '../game/floors.js';
import type { PaletteEntry } from './catalog.js';
import { FIRST_OPEN_GROUPS, LAB_DOCK_BUTTONS, renderLabTopBar, renderSceneDock, type LabChromeDeps, type LabDockId } from './chrome.js';
import { probeCommands, type CommandProbe } from './commands.js';
import { createFrameDriver } from './frame-driver.js';
import { installLabHook } from './hook.js';
import { InspectorPanel } from './inspector-panel.js';
import { LabFrame } from './lab-frame.js';
import { itemOf, LabModel, type AddSetupOptions } from './lab-model.js';
import { buildLabPack, newLabScript } from './lab-pack.js';
import type { LabDriverKind, LabScript, LabStepKind } from './lab-types.js';
import { importChapterLevelRef, listImportableLevels } from './level-import.js';
import { bindPaletteDrag } from './palette-drag.js';
import { RepoLink } from './repo.js';
import { readRoute, syncRoute } from './route.js';
import { RunControl } from './run-control.js';
import { transcriptOf } from './runner.js';
import { renderScriptPanel } from './script-dock.js';
import { deleteLab, duplicateLab, exportLabText, lastLabId, listLabs, loadLab, parseLabText, saveLab, uniqueLabId } from './store.js';

const CHECK_DELAY_MS = 250;
const REBUILD_DELAY_MS = 500;
const POLL_MS = 500;

/** Terminal Lab workstation: the real game in the centre; scene, inspector and script docks around it. */
export class LabApp {
  model = new LabModel(newLabScript());
  readonly repo = new RepoLink();
  readonly frame: LabFrame;
  readonly control: RunControl;
  readonly inspector: InspectorPanel;
  readonly workspace = new WorkspaceManager<LabDockId>({
    storageKey: 'ht-terminal-lab-ui',
    buttons: LAB_DOCK_BUTTONS,
    labels: { left: 'Scene', right: 'Inspector', timeline: 'Console' },
    defaultSizes: { rightWidth: 440 },
  });
  /** Says what the last action did; replaced by the default line on the next edit. */
  notice = '';
  /** The open lab's repo file changed after it was opened or saved here. */
  stale = false;
  private readonly paletteOpen = new Set<string>(FIRST_OPEN_GROUPS);
  private readonly probes = new Map<LabDriverKind, CommandProbe>();
  private readonly top = h('header', { class: 'ed-top' });
  private readonly sideBody = h('div', { class: 'cx-side-body' });
  private readonly scriptEl = h('div', { class: 'lab-script' });
  private readonly clockSel = this.switchSelect('Clock', [['manual', 'manual'], ['live', 'live 1/s']], (v) => this.setRun({ clock: v as LabScript['clock'] }));
  private readonly fireSel = this.switchSelect('Enemy fire', [['live', 'fire: live'], ['hold', 'fire: hold']], (v) => this.setRun({ enemyFire: v as LabScript['enemyFire'] }));
  private readonly badge = h('span', { class: 'ch-level-pill lab-badge', role: 'status', title: 'Locked: damage is counted, never applied' });
  private sceneJson = '';
  private checkTimer = 0;
  private rebuildTimer = 0;
  private polls = 0;

  constructor(root: HTMLElement) {
    this.frame = new LabFrame({
      onReload: () => void this.rebuild(true),
      onRevealSelected: () => this.inspector.setTab('object'),
      onToggleZen: () => this.workspace.toggleZen(),
      onHideBar: () => this.workspace.toggle('stagebar'),
    });
    this.control = new RunControl({
      driver: () => driver,
      steps: () => this.model.script.steps,
      onChange: () => this.runChanged(),
      say: (text) => this.frame.shell.setStatus(text),
    });
    const driver = createFrameDriver(this.frame, () => this.rebuild(false));
    this.inspector = new InspectorPanel(
      {
        model: () => this.model,
        live: () => this.frame.live,
        results: () => this.control.sorted(),
        events: () => this.frame.shell.play.win?.__game?.events() ?? [],
        probe: (kind) => this.probeFor(kind),
        ctx: this.formCtx(),
        select: (path) => this.select(path),
        insert: (text) => this.frame.shell.play.win?.__term?.input(text),
        run: (line) => this.frame.shell.play.submit(line),
        copyTranscript: () => void this.copyTranscript(),
        replaceScript: (next) => this.replaceScript(next),
        closeDock: () => this.workspace.toggle('right'),
        tabChanged: (tab) => syncRoute({ labId: this.model.id, tab }, true),
      },
      readRoute().tab,
    );
    const side = h('nav', { class: 'ed-side', 'aria-label': 'Scene' }, this.sideBody);
    const console = this.buildConsole();
    this.frame.shell.stageEl.append(this.workspace.renderRestoreOverlay());
    const grid = h('div', { class: 'ed cx-ed' }, this.top, side, this.frame.shell.stageEl, console, this.inspector.mainEl);
    root.append(grid);
    attachWithStage(this.workspace, grid, { left: side, right: this.inspector.mainEl, timeline: console }, this.frame.shell.stage, () => void this.saveToRepo());
    bindPaletteDrag({ grid, sideBody: this.sideBody, stageEl: this.frame.shell.stageEl, onDrop: (entry, opts) => this.add(entry, opts) });
  }

  async start(): Promise<void> {
    await this.repo.refresh();
    const route = readRoute();
    const imported = route.fromLevel ? importChapterLevelRef(route.fromLevel, this.labIds(), route.draft) : null;
    await this.open(imported?.script ?? this.resolve(route.labId), 'replace');
    if (imported?.problem) this.say(`✕ ${imported.problem}`);
    else if (imported?.script && route.fromLevel) this.say(`opened level ${route.fromLevel}`);
    window.setInterval(() => this.poll(), POLL_MS);
    pollDisk(() => this.checkRepo());
    window.addEventListener('popstate', () => void this.followRoute());
    installLabHook(this);
  }

  private probeFor(kind: LabDriverKind): CommandProbe {
    let found = this.probes.get(kind);
    if (!found) {
      found = probeCommands(kind);
      this.probes.set(kind, found);
    }
    return found;
  }

  // ---- labs --------------------------------------------------------------------------------------------------------

  /** The lab a URL names: this browser's copy, else the repo's; with no id the last one opened; else a new one. */
  resolve(id: string | null): LabScript {
    const want = id ?? lastLabId();
    const found = want ? (loadLab(want) ?? this.fromRepo(want)) : null;
    return found ?? newLabScript(uniqueLabId('new-lab', this.labIds()), 'New lab');
  }

  private fromRepo(id: string): LabScript | null {
    const read = this.repo.read(id);
    return 'script' in read ? read.script : null;
  }

  labIds(): string[] {
    return [...new Set([...listLabs().map((l) => l.id), ...this.repo.ids])].sort();
  }

  /** Makes `script` the open lab: a fresh run, its repo baseline, the route, everything drawn, the game loaded. */
  async open(script: LabScript, history: 'push' | 'replace' | 'none'): Promise<void> {
    this.control.forget();
    this.model = new LabModel(script);
    this.repo.adopt(this.model);
    this.stale = false;
    this.notice = '';
    saveLab(script);
    if (history !== 'none') syncRoute({ labId: script.id, tab: this.inspector.current }, history === 'replace');
    this.drawAll();
    await this.rebuild(false);
  }

  private async followRoute(): Promise<void> {
    const route = readRoute();
    if (route.labId !== this.model.id) await this.open(this.resolve(route.labId), 'none');
    this.inspector.setTab(route.tab);
  }

  /** Opens the repo copy of a lab, asking first when it would replace different edits in this browser. */
  async openFromRepo(id: string): Promise<void> {
    await this.repo.refresh();
    const read = this.repo.read(id);
    if (!('script' in read)) return this.say(`✕ ${read.problem}`);
    const local = loadLab(id);
    if (local && exportLabText(local) !== exportLabText(read.script) && !window.confirm(`Replace the browser copy of "${id}" with the repo version?`)) return;
    await this.open(read.script, id === this.model.id ? 'none' : 'push');
  }

  async saveToRepo(): Promise<void> {
    const res = await this.repo.save(this.model);
    if (res.ok) this.stale = res.stale ?? false;
    this.say(res.message);
  }

  private async checkRepo(): Promise<void> {
    const stale = await this.repo.changed(this.model);
    if (stale !== this.stale) {
      this.stale = stale;
      this.drawTop();
    }
  }

  private revertToRepo(): void {
    const repo = this.model.repoVersion();
    if (!repo) return this.say('this lab is not in the repo yet: Save to repo first');
    if (window.confirm(`Discard the edits to "${this.model.id}" and go back to the repo version?`)) void this.open(structuredClone(repo), 'none');
  }

  async openChapterLevel(ref: string, useDraft = false): Promise<void> {
    const { script, problem } = importChapterLevelRef(ref, this.labIds(), useDraft);
    if (!script) return this.say(`✕ ${problem ?? 'could not open chapter level'}`);
    await this.open(script, 'push');
    this.say(`opened level ${ref}`);
  }

  private newLab(): void {
    void this.open(newLabScript(uniqueLabId('new-lab', this.labIds()), 'New lab'), 'push');
  }

  private duplicate(): void {
    void this.open(duplicateLab(this.model.script, this.labIds()), 'push');
  }

  private deleteCurrent(): void {
    const id = this.model.id;
    if (!window.confirm(`Delete lab "${id}" from this browser? ${this.repo.ids.includes(id) ? 'The repo copy stays.' : 'Export it first to keep a copy.'}`)) return;
    deleteLab(id);
    const next = this.labIds().find((l) => l !== id);
    void this.open(next ? this.resolve(next) : newLabScript(uniqueLabId('new-lab', []), 'New lab'), 'push');
  }

  private async importFile(file: File): Promise<void> {
    const { script, problems } = parseLabText(await file.text());
    if (!script) return this.say(`✕ import refused: ${problems[0] ?? 'unknown problem'}${problems.length > 1 ? ` (+${problems.length - 1} more)` : ''}`);
    await this.open({ ...script, id: uniqueLabId(script.id, this.labIds()) }, 'push');
  }

  private exportCurrent(): void {
    const url = URL.createObjectURL(new Blob([exportLabText(this.model.script)], { type: 'application/json' }));
    const a = h('a', { href: url, download: `${this.model.id}.lab.json` });
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  private async copyTranscript(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.transcript());
      this.frame.shell.setStatus('transcript copied');
    } catch (err) {
      this.frame.shell.setStatus(`✕ copy failed: ${(err as Error).message}`);
    }
  }

  /** Every step's result as text: what `terminal-lab.mjs --transcript` prints for the same lab. */
  transcript(): string {
    return transcriptOf(this.control.sorted());
  }

  // ---- edits -------------------------------------------------------------------------------------------------------

  private formCtx(): FormCtx {
    const { model } = this;
    return {
      suggest: (name) => makeSuggest(() => buildLabPack(model.script).pack.levels[0])(name),
      changed: () => this.edited(),
      restructure: () => this.inspector.drawForm(),
      get selectedPath() {
        return model.selectedPath ?? undefined;
      },
      selectPath: (path) => this.select(path),
      remapSelection: (map) => {
        const now = model.selectedPath;
        const next = now ? map(now) : null;
        if (now && next !== now) this.select(next);
      },
      open: new Set<string>(),
    };
  }

  /** Something in the script changed: save it, then (debounced) check it, redraw what shows it, and reload a changed scene. */
  edited(): void {
    if (this.model.script.driver === 'chapter') delete this.model.script.driver;
    saveLab(this.model.script);
    this.notice = '';
    window.clearTimeout(this.checkTimer);
    this.checkTimer = window.setTimeout(() => {
      this.model.refreshIssues();
      this.inspector.issuesChanged();
      this.drawTop();
      this.drawScene();
      this.drawScript();
    }, CHECK_DELAY_MS);
    window.clearTimeout(this.rebuildTimer);
    if (this.model.sceneFingerprint() !== this.sceneJson) {
      this.control.pause();
      this.rebuildTimer = window.setTimeout(() => void this.rebuild(true), REBUILD_DELAY_MS);
    }
  }

  /** A structural edit (add, remove, move): the list and the form for the new selection show at once. */
  private restructured(focusKey?: string): void {
    this.edited();
    this.drawScene();
    this.drawScript(focusKey);
    this.inspector.selectionChanged(true);
    this.frame.shell.setSelectedReadout(this.model.selectionLabel());
  }

  select(path: string | null): void {
    const before = itemOf(this.model.selectedPath);
    const after = itemOf(path);
    const formChanged = before?.list !== after?.list || before?.index !== after?.index || (this.model.selectedPath === null) !== (path === null);
    this.model.select(path);
    this.drawScene();
    this.drawScript();
    this.inspector.selectionChanged(formChanged);
    this.frame.shell.setSelectedReadout(this.model.selectionLabel());
  }

  add(entry: PaletteEntry, opts?: AddSetupOptions): number {
    const index = this.model.add(entry, opts);
    this.restructured();
    return index;
  }

  removeSetup(index: number): void {
    this.model.removeSetup(index);
    this.restructured();
  }

  addStep(op: LabStepKind): number {
    const index = this.model.addStep(op);
    this.restructured();
    return index;
  }

  private removeStep(index: number): void {
    this.model.removeStep(index);
    this.control.invalidate();
    this.restructured();
  }

  private moveStep(index: number, delta: -1 | 1): void {
    const to = this.model.moveStep(index, delta);
    if (to === null) return;
    this.control.invalidate();
    this.restructured(`steps[${to}]-${delta < 0 ? 'up' : 'down'}`);
  }

  private replaceScript(next: LabScript): string | null {
    const problem = this.model.replaceScript(next);
    if (problem) return problem;
    this.control.invalidate();
    this.restructured();
    return null;
  }

  /** The top bar's Clock and Enemy fire. */
  setRun(change: Partial<Pick<LabScript, 'clock' | 'enemyFire'>>): void {
    Object.assign(this.model.script, change);
    this.edited();
  }

  setDriver(driver: LabDriverKind): void {
    const s = this.model.script;
    const room = driver === 'classic' && s.room.cwd === '/lab' ? { ...s.room, cwd: CLASSIC_START_CWD[s.room.floorTheme] } : s.room;
    this.model.script = {
      id: s.id,
      title: s.title,
      ...(driver === 'classic' ? { driver: 'classic' } : {}),
      room,
      player: s.player,
      clock: s.clock,
      enemyFire: s.enemyFire,
      setup: s.setup,
      steps: s.steps,
    };
    this.inspector.drawForm();
    this.edited();
  }

  // ---- the game ----------------------------------------------------------------------------------------------------

  /** Reloads the game on the lab. With `replay`, the steps before the cursor run again, so the level is where the script was. */
  async rebuild(replay: boolean): Promise<void> {
    this.control.pause();
    this.sceneJson = this.model.sceneFingerprint();
    const live = await this.frame.load(this.model.script);
    this.liveChanged();
    if (live && replay) await this.control.replay();
  }

  tick(): void {
    this.frame.tick();
    if (!this.control.running) this.control.record({ op: 'tick' });
    this.liveChanged();
  }

  /** Every half second: lines typed in the game become steps while recording; once a second, read the level again. */
  private poll(): void {
    if (document.hidden) return;
    const lines = this.frame.newLines();
    if (!this.control.running) for (const e of lines) this.control.record({ op: 'run', line: e.line });
    this.polls += 1;
    if (lines.length > 0 || this.polls % 2 === 0) {
      this.frame.refresh();
      this.liveChanged();
    }
  }

  private liveChanged(): void {
    this.badge.textContent = `🛡 no damage · ${this.frame.live?.absorbedTotal ?? 0} absorbed`;
    this.inspector.liveChanged();
  }

  /** A step finished, or a run started or stopped. Lines the runner typed are not recorded. */
  private runChanged(): void {
    this.frame.newLines();
    this.drawScript();
    this.inspector.runChanged();
    this.frame.refresh();
    this.liveChanged();
  }

  say(text: string): void {
    this.notice = text;
    this.drawTop();
  }

  // ---- drawing -----------------------------------------------------------------------------------------------------

  private switchSelect(label: string, options: ReadonlyArray<readonly [string, string]>, onChange: (v: string) => void): HTMLSelectElement {
    const select = h('select', { 'aria-label': label, title: label }, ...options.map(([v, text]) => h('option', { value: v }, text)));
    select.addEventListener('change', () => onChange(select.value));
    return select;
  }

  private chromeDeps(): LabChromeDeps {
    const browser = new Set(listLabs().map((l) => l.id));
    return {
      model: this.model,
      labs: this.labIds().map((id) => ({ id, title: loadLab(id)?.title ?? this.fromRepo(id)?.title ?? id, repoOnly: !browser.has(id) })),
      levels: listImportableLevels(),
      writable: this.repo.writable,
      repoDir: this.repo.dir,
      stale: this.stale,
      status: this.notice || `${this.model.script.setup.length} object${this.model.script.setup.length === 1 ? '' : 's'} · autosaved in this browser`,
      workspace: this.workspace,
      extras: [this.clockSel, this.fireSel, this.badge],
      paletteOpen: this.paletteOpen,
      onPick: (id) => void this.open(this.resolve(id), 'push'),
      onRevert: () => this.revertToRepo(),
      onSave: () => void this.saveToRepo(),
      onReload: () => void this.openFromRepo(this.model.id),
      onSelect: (path) => this.select(path),
      onAdd: (entry) => this.add(entry),
      onRemove: (i) => this.removeSetup(i),
      onNew: () => this.newLab(),
      onDuplicate: () => this.duplicate(),
      onImport: (file) => void this.importFile(file),
      onExport: () => this.exportCurrent(),
      onDelete: () => this.deleteCurrent(),
      onOpenLevel: (ref) => void this.openChapterLevel(ref),
    };
  }

  private drawAll(): void {
    this.drawTop();
    this.drawScene();
    this.drawScript();
    this.inspector.draw();
    this.frame.shell.setSelectedReadout(this.model.selectionLabel());
    this.liveChanged();
  }

  drawTop(): void {
    this.clockSel.value = this.model.script.clock;
    this.fireSel.value = this.model.script.enemyFire;
    redrawKeepingFocus(this.top, () => renderLabTopBar(this.top, this.chromeDeps()));
  }

  private drawScene(): void {
    redrawKeepingFocus(this.sideBody, () => renderSceneDock(this.sideBody, this.chromeDeps()));
  }

  private drawScript(focusKey?: string): void {
    const c = this.control;
    redrawKeepingFocus(
      this.scriptEl,
      () =>
        renderScriptPanel(this.scriptEl, {
          steps: this.model.script.steps,
          results: c.results,
          cursor: c.cursor,
          selected: this.model.selectedStep,
          breakpoints: c.breakpoints,
          recording: c.recording,
          running: c.running,
          issueCounts: (where) => ({ errors: this.model.issues.filter((i) => i.where === where && i.severity === 'error').length, warns: this.model.issues.filter((i) => i.where === where && i.severity === 'warn').length }),
          onSelect: (i) => this.select(`steps[${i}]`),
          onToggleBreakpoint: (i) => c.toggleBreakpoint(i),
          onRunTo: (i) => void c.runTo(i),
          onRemove: (i) => this.removeStep(i),
          onMove: (i, d) => this.moveStep(i, d),
          onAdd: (op) => this.addStep(op),
          onReset: () => void c.reset(),
          onStep: () => void c.step(),
          onRunAll: () => void c.runAll(),
          onPause: () => c.pause(),
          onToggleRecord: () => c.toggleRecord(),
        }),
      focusKey,
    );
  }

  private buildConsole(): HTMLElement {
    const bar = h(
      'div',
      { class: 'pv-bar' },
      h('button', { type: 'button', class: 'btn small primary', title: 'Advance the world one tick', onclick: () => this.tick() }, '⏱ Tick'),
      this.frame.shell.statusEl,
    );
    return buildConsoleDock({
      label: 'Script and Console',
      bar,
      logEl: this.frame.shell.logEl,
      play: this.frame.shell.play,
      onStatus: (msg) => this.frame.shell.setStatus(msg),
      onToggleLog: () => this.workspace.toggle('log'),
      onHide: () => this.workspace.toggle('timeline'),
      lead: this.scriptEl,
    });
  }
}

export function startLab(root: HTMLElement): void {
  void new LabApp(root).start();
}
