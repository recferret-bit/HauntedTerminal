import type { LabGoal, LabInspect } from '../chapters/session-lab-types.js';
import type { PackIssue } from '../chapters/validate-pack.js';
import { createWorkstationHookApi, type WorkstationHook } from '../editor-core/workspace.js';
import type { LabApp } from './app.js';
import { paletteGroups } from './catalog.js';
import type { LabDockId } from './chrome.js';
import { isInspectorTab } from './inspector-panel.js';
import type { AddSetupOptions } from './lab-model.js';
import type { LabDriverKind, LabScript, LabStep, LabStepKind } from './lab-types.js';
import type { StepResult } from './runner.js';

/** `window.__terminalLab`: the lab for tests and tools, like `window.__chapterEditor`. */
interface TerminalLabHook extends WorkstationHook<LabDockId> {
  ready: boolean;
  state(): {
    labId: string;
    driver: LabDriverKind;
    phase: string;
    setupCount: number;
    /** The selection as an item path (`setup[i]`, `steps[i]`), or null for the lab settings. */
    selectedPath: string | null;
    issueCount: number;
    hp: number | null;
    absorbedTotal: number | null;
    tab: string;
    repo: { writable: boolean; state: 'new' | 'dirty' | 'clean'; stale: boolean; labs: string[] };
  };
  /** Labs in this browser and in the repo. */
  labs(): string[];
  script(): LabScript;
  load(script: LabScript): Promise<void>;
  openChapterLevel(ref: string): Promise<void>;
  /** Places a palette entry by id and returns its setup index. */
  add(paletteId: string, opts?: AddSetupOptions): number;
  remove(index: number): void;
  select(path: string | null): void;
  issues(): PackIssue[];
  /** Types a line in the game terminal and presses Enter / types without Enter. */
  submit(line: string): void;
  insert(text: string): void;
  tick(): void;
  inspect(): LabInspect | null;
  goals(): LabGoal[];
  reload(): Promise<void>;
  setTab(tab: string): void;
  setDriver(driver: LabDriverKind): void;
  setClock(clock: 'manual' | 'live'): void;
  setEnemyFire(fire: 'live' | 'hold'): void;
  saveToRepo(): Promise<void>;
  openFromRepo(id: string): Promise<void>;
  steps(): LabStep[];
  addStep(op: LabStepKind): number;
  toggleBreakpoint(index: number): void;
  setRecording(on: boolean): void;
  control(): { cursor: number; running: boolean; recording: boolean; breakpoints: number[] };
  results(): StepResult[];
  transcript(): string;
  /** Runs the next step. */
  step(): Promise<void>;
  runTo(index: number): Promise<void>;
  /** A fresh level and back to step 1. */
  reset(): Promise<void>;
  /** A fresh level, then every step. */
  runAll(): Promise<{ ok: boolean; results: StepResult[]; transcript: string }>;
}

declare global {
  interface Window {
    __terminalLab?: TerminalLabHook;
  }
}

/** Puts the hook on the window. Everything goes through the app, so the hook drives exactly what a click would. */
export function installLabHook(app: LabApp): void {
  const c = app.control;
  window.__terminalLab = {
    ready: true,
    state: () => ({
      labId: app.model.id,
      driver: app.model.script.driver ?? 'chapter',
      phase: app.frame.shell.phase,
      setupCount: app.model.script.setup.length,
      selectedPath: app.model.selectedPath,
      issueCount: app.model.issues.length,
      hp: app.frame.live?.hp ?? null,
      absorbedTotal: app.frame.live?.absorbedTotal ?? null,
      tab: app.inspector.current,
      repo: { writable: app.repo.writable, state: app.model.repoState(), stale: app.stale, labs: app.repo.ids },
    }),
    labs: () => app.labIds(),
    script: () => structuredClone(app.model.script),
    load: (script) => app.open(structuredClone(script), 'push'),
    openChapterLevel: (ref) => app.openChapterLevel(ref),
    add: (paletteId, opts) => {
      const entry = paletteGroups().flatMap((g) => g.entries).find((e) => e.id === paletteId);
      if (!entry) throw new Error(`no palette entry "${paletteId}"`);
      return app.add(entry, opts);
    },
    remove: (index) => app.removeSetup(index),
    select: (path) => app.select(path),
    issues: () => app.model.issues,
    submit: (line) => app.frame.shell.play.submit(line),
    insert: (text) => app.frame.shell.play.win?.__term?.input(text),
    tick: () => app.tick(),
    inspect: () => app.frame.refresh(),
    goals: () => app.frame.refresh()?.goals ?? [],
    reload: () => app.rebuild(false),
    setTab: (tab) => {
      if (isInspectorTab(tab)) app.inspector.setTab(tab);
    },
    setDriver: (driver) => app.setDriver(driver),
    setClock: (clock) => {
      app.setRun({ clock });
      app.drawTop();
    },
    setEnemyFire: (enemyFire) => {
      app.setRun({ enemyFire });
      app.drawTop();
    },
    saveToRepo: () => app.saveToRepo(),
    openFromRepo: (id) => app.openFromRepo(id),
    steps: () => structuredClone(app.model.script.steps),
    addStep: (op) => app.addStep(op),
    toggleBreakpoint: (index) => c.toggleBreakpoint(index),
    setRecording: (on) => {
      if (c.recording !== on) c.toggleRecord();
    },
    control: () => ({ cursor: c.cursor, running: c.running, recording: c.recording, breakpoints: [...c.breakpoints] }),
    results: () => c.sorted(),
    transcript: () => app.transcript(),
    step: () => c.step(),
    runTo: (index) => c.runTo(index),
    reset: () => c.reset(),
    runAll: async () => {
      const results = await c.runFresh();
      return { ok: results.length === app.model.script.steps.length && results.every((r) => r.ok), results, transcript: app.transcript() };
    },
    ...createWorkstationHookApi(app.workspace, app.frame.shell.stage),
  };
}
