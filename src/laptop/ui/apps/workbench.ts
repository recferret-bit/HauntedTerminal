/**
 * The shared body of the code apps (JS Pad, Web Weaver): a toolbar, a code editor with one tab per
 * file, an optional live page preview, the console and the task strip. The apps differ only by config.
 */
import { h } from '../../../editor-core/dom.js';
import { allPassed, judge, requestFor, type CheckResult } from '../../domain/checks.js';
import { markDone, saveDraft } from '../../domain/progress.js';
import { plainRequest, type CodeFile, type CodeFiles, type RunReport } from '../../domain/run.js';
import { modeOf, type LaptopTask, type TaskApp as TaskAppId } from '../../domain/tasks.js';
import { runCode, type PreviewSlot } from '../../runtime/runner.js';
import type { LaptopContext, TaskApp } from './app-types.js';
import { createCodeEditor } from './code-editor.js';
import { createConsolePane } from './console-pane.js';

export interface WorkbenchConfig {
  app: TaskAppId;
  files: readonly CodeFile[];
  /** Code shown when no task is loaded. */
  scratch: CodeFiles;
  /** Re-run the page this long after the last edit (ms); 0 runs on demand only. */
  autoRunMs: number;
}

export interface Workbench extends TaskApp {
  files(): CodeFiles;
  setFiles(files: CodeFiles): void;
  run(): Promise<RunReport>;
  /** Runs the loaded task's checks; [] without a task. */
  check(): Promise<CheckResult[]>;
}

const TAB_LABEL: Record<CodeFile, string> = { html: 'HTML', css: 'CSS', js: 'JS' };

function taskStrip(): { el: HTMLElement; show(task: LaptopTask | null): void; results(r: CheckResult[]): void } {
  const title = h('b');
  const brief = h('p');
  const list = h('ul', { class: 'lt-results' });
  const el = h('div', { class: 'lt-task', hidden: true }, title, brief, list);
  return {
    el,
    show(task) {
      el.hidden = !task;
      title.textContent = task ? `QUEST: ${task.title}` : '';
      brief.textContent = task ? `${task.brief}  Hint: ${task.hint}` : '';
      list.replaceChildren();
    },
    results(r) {
      list.replaceChildren(...r.map((c) => h('li', { class: c.ok ? 'ok' : 'bad' }, `${c.ok ? '[x]' : '[ ]'} ${c.label}${c.ok || !c.detail ? '' : `  (${c.detail})`}`)));
    },
  };
}

function buildToolbar(handlers: { run: () => void; check: () => void; reset: () => void; clear: () => void; quests: () => void }): HTMLElement {
  return h('div', { class: 'lt-toolbar' },
    h('button', { class: 'lt-btn95', onclick: handlers.run, title: 'Run (Ctrl+Enter)' }, 'Run'),
    h('button', { class: 'lt-btn95', onclick: handlers.check, title: 'Check the quest' }, 'Check'),
    h('button', { class: 'lt-btn95', onclick: handlers.reset, title: 'Reset code to starter' }, 'Reset'),
    h('button', { class: 'lt-btn95', onclick: handlers.clear }, 'Clear'),
    h('span', { class: 'lt-grow' }),
    h('button', { class: 'lt-btn95', onclick: handlers.quests }, 'Quests'),
  );
}

function buildFileTabs(app: WorkbenchConfig['app'], files: readonly CodeFile[], initial: CodeFile, onSelect: (f: CodeFile) => void): HTMLElement {
  return h('div', { class: 'lt-tabs', role: 'tablist', 'aria-label': `${app} files` }, ...files.map((f) =>
    h('button', { class: 'lt-tab', role: 'tab', 'aria-selected': f === initial ? 'true' : 'false', 'data-file': f, onclick: () => onSelect(f) }, TAB_LABEL[f])));
}

function markActiveTab(tabs: HTMLElement, active: CodeFile): void {
  tabs.querySelectorAll<HTMLButtonElement>('.lt-tab').forEach((b) => {
    const on = b.dataset.file === active;
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
}

export function createWorkbench(ctx: LaptopContext, cfg: WorkbenchConfig): Workbench {
  let files: CodeFiles = { ...cfg.scratch };
  let tab: CodeFile = cfg.files[0]!;
  let task: LaptopTask | null = null;
  let timer = 0;
  let initTimer = 0;
  let hasRun = false;
  const mode = modeOf(cfg.app);
  const consolePane = createConsolePane();
  const strip = taskStrip();
  const preview: PreviewSlot | null = mode === 'page' ? { frame: h('iframe', { class: 'lt-preview', title: 'Page preview', sandbox: 'allow-scripts' }) } : null;

  const cancelAutoRun = (): void => { window.clearTimeout(timer); timer = 0; };

  const editor = createCodeEditor({
    label: `${cfg.app} code`,
    onRun: () => void bench.run(),
    onChange: (text) => {
      files = { ...files, [tab]: text };
      if (task) ctx.setProgress(saveDraft(ctx.progress(), task.id, files));
      if (cfg.autoRunMs > 0) {
        cancelAutoRun();
        timer = window.setTimeout(() => void bench.run(), cfg.autoRunMs);
      }
    },
  });

  const resetCode = (): void => {
    cancelAutoRun();
    if (task) {
      files = { ...task.starter };
      ctx.setProgress(saveDraft(ctx.progress(), task.id, files));
    } else {
      files = { ...cfg.scratch };
    }
    editor.value = files[tab];
    consolePane.clear();
    void bench.run();
  };

  const tabs = buildFileTabs(cfg.app, cfg.files, tab, (f) => select(f));
  const select = (f: CodeFile): void => {
    tab = f;
    editor.value = files[f];
    markActiveTab(tabs, f);
  };
  const toolbar = buildToolbar({
    run: () => void bench.run(),
    check: () => void bench.check(),
    reset: resetCode,
    clear: () => consolePane.clear(),
    quests: () => ctx.open('quests'),
  });
  const code = h('div', { class: 'lt-codecol' }, cfg.files.length > 1 ? tabs : null, editor.el);
  const work = h('div', { class: `lt-work${preview ? ' split' : ''}` }, code, preview?.frame);
  const el = h('div', { class: `lt-bench ${cfg.app}` }, toolbar, strip.el, work, consolePane.el);

  let runSeq = 0;

  const startRun = async (req: ReturnType<typeof plainRequest>): Promise<{ r: RunReport; current: boolean }> => {
    cancelAutoRun();
    const seq = ++runSeq;
    hasRun = true;
    ctx.sound.note('run');
    consolePane.clear();
    const r = await runCode(req, preview, (line) => {
      if (seq === runSeq) consolePane.add(line);
    });
    const current = seq === runSeq;
    if (!current) return { r, current: false };
    consolePane.finish(r);
    if (r.timedOut) ctx.sound.note('loop-guard');
    return { r, current: true };
  };

  const bench: Workbench = {
    el,
    shown: () => editor.focus(),
    files: () => ({ ...files }),
    setFiles(next) {
      files = { ...next };
      select(tab);
    },
    loadTask(next, saved) {
      cancelAutoRun();
      task = next;
      strip.show(next);
      bench.setFiles(saved);
      select(cfg.files.find((f) => saved[f].trim()) ?? cfg.files[0]!);
      consolePane.clear();
      ctx.onInspect?.({ app: cfg.app, taskId: next.id, taskTitle: next.title, mode, report: null, checks: null });
      void bench.run();
    },
    async run() {
      const { r, current } = await startRun(plainRequest(mode, files));
      if (current) ctx.onInspect?.({ app: cfg.app, taskId: task?.id ?? null, taskTitle: task?.title ?? null, mode, report: r, checks: null });
      return r;
    },
    async check() {
      if (!task) return [];
      const activeTask = task;
      const req = requestFor(mode, files, activeTask.checks, activeTask.actions ?? []);
      const { r: report, current } = await startRun(req);
      const results = judge(activeTask.checks, report, files);
      if (!current) return results;
      strip.results(results);
      ctx.onInspect?.({ app: cfg.app, taskId: activeTask.id, taskTitle: activeTask.title, mode, report, checks: results });
      if (allPassed(results)) {
        ctx.setProgress(markDone(ctx.progress(), activeTask.id));
        ctx.sound.note('solved');
        ctx.pow('SOLVED!');
      } else {
        ctx.sound.note('check-fail');
      }
      return results;
    },
    dispose() {
      runSeq += 1;
      window.clearTimeout(timer);
      window.clearTimeout(initTimer);
      preview?.cancel?.();
    },
  };
  select(tab);
  if (mode === 'page') initTimer = window.setTimeout(() => { if (!hasRun) void bench.run(); }, 0);
  return bench;
}
