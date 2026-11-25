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

export function createWorkbench(ctx: LaptopContext, cfg: WorkbenchConfig): Workbench {
  let files: CodeFiles = { ...cfg.scratch };
  let tab: CodeFile = cfg.files[0]!;
  let task: LaptopTask | null = null;
  let timer = 0;
  const mode = modeOf(cfg.app);
  const consolePane = createConsolePane();
  const strip = taskStrip();
  const preview: PreviewSlot | null = mode === 'page' ? { frame: h('iframe', { class: 'lt-preview', title: 'Page preview', sandbox: 'allow-scripts' }) } : null;

  const editor = createCodeEditor({
    label: `${cfg.app} code`,
    onRun: () => void bench.run(),
    onChange: (text) => {
      files = { ...files, [tab]: text };
      if (task) ctx.setProgress(saveDraft(ctx.progress(), task.id, files));
      if (cfg.autoRunMs > 0) {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => void bench.run(), cfg.autoRunMs);
      }
    },
  });

  const resetCode = (): void => {
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

  const tabs = h('div', { class: 'lt-tabs', role: 'tablist', 'aria-label': `${cfg.app} files` }, ...cfg.files.map((f) =>
    h('button', { class: 'lt-tab', role: 'tab', 'aria-selected': f === tab ? 'true' : 'false', 'data-file': f, onclick: () => select(f) }, TAB_LABEL[f])));
  const select = (f: CodeFile): void => {
    tab = f;
    editor.value = files[f];
    tabs.querySelectorAll<HTMLButtonElement>('.lt-tab').forEach((b) => {
      const on = b.dataset.file === f;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  };
  const toolbar = h('div', { class: 'lt-toolbar' },
    h('button', { class: 'lt-btn95', onclick: () => void bench.run(), title: 'Run (Ctrl+Enter)' }, 'Run'),
    h('button', { class: 'lt-btn95', onclick: () => void bench.check(), title: 'Check the quest' }, 'Check'),
    h('button', { class: 'lt-btn95', onclick: () => resetCode(), title: 'Reset code to starter' }, 'Reset'),
    h('button', { class: 'lt-btn95', onclick: () => consolePane.clear() }, 'Clear'),
    h('span', { class: 'lt-grow' }),
    h('button', { class: 'lt-btn95', onclick: () => ctx.open('quests') }, 'Quests'),
  );
  const code = h('div', { class: 'lt-codecol' }, cfg.files.length > 1 ? tabs : null, editor.el);
  const work = h('div', { class: `lt-work${preview ? ' split' : ''}` }, code, preview?.frame);
  const el = h('div', { class: `lt-bench ${cfg.app}` }, toolbar, strip.el, work, consolePane.el);

  const exec = async (report: Promise<RunReport>): Promise<RunReport> => {
    ctx.sound.note('run');
    const r = await report;
    consolePane.finish(r);
    if (r.timedOut) ctx.sound.note('loop-guard');
    return r;
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
      task = next;
      strip.show(next);
      bench.setFiles(saved);
      select(cfg.files.find((f) => saved[f].trim()) ?? cfg.files[0]!);
      consolePane.clear();
      void bench.run();
    },
    run() {
      consolePane.clear();
      return exec(runCode(plainRequest(mode, files), preview, consolePane.add));
    },
    async check() {
      if (!task) return [];
      const current = task;
      consolePane.clear();
      const report = await exec(runCode(requestFor(mode, files, current.checks, current.actions ?? []), preview, consolePane.add));
      const results = judge(current.checks, report, files);
      strip.results(results);
      if (allPassed(results)) {
        ctx.setProgress(markDone(ctx.progress(), current.id));
        ctx.sound.beep();
        ctx.pow('SOLVED!');
      } else {
        ctx.sound.note('check-fail');
      }
      return results;
    },
    dispose() {
      window.clearTimeout(timer);
      preview?.cancel?.();
    },
  };
  select(tab);
  if (mode === 'page') void bench.run();
  return bench;
}
