/** Builds the view of each desktop app. The code apps are one workbench with two configs. */
import { h } from '../../../editor-core/dom.js';
import { APPS, type AppId } from '../../domain/apps.js';
import type { Progress } from '../../domain/progress.js';
import { TASKS } from '../../domain/tasks.js';
import { LOGO } from '../boot-view.js';
import type { AppView, LaptopContext } from './app-types.js';
import { createWorkbench } from './workbench.js';

const JS_SCRATCH = '// JS Pad: write JavaScript and press Run (Ctrl+Enter).\nconst who = "dev";\nconsole.log(`Hello from inside the machine, ${who}!`);\n';
const PAGE_SCRATCH = {
  html: '<h1>Web Weaver</h1>\n<p>Edit the HTML, CSS and JS tabs. The page redraws as you type.</p>\n<button id="boo">Boo!</button>\n',
  css: 'body { font-family: sans-serif; background: #f4f1ea; color: #110e1b; }\nh1 { color: #1f7a5c; }\n',
  js: 'document.getElementById("boo").onclick = () => console.log("AAAH!");\n',
};

function questsApp(ctx: LaptopContext): AppView {
  const head = h('div', { class: 'lt-quest-head' });
  const list = h('ol', { class: 'lt-quests' });
  const draw = (p: Progress): void => {
    head.textContent = `${p.done.length} / ${TASKS.length} quests solved`;
    list.replaceChildren(...TASKS.map((t) => {
      const done = p.done.includes(t.id);
      return h('li', { class: done ? 'done' : '' },
        h('span', { class: 'lt-quest-app' }, APPS[t.app].glyph),
        h('span', { class: 'lt-quest-text' }, h('b', {}, `${done ? '[x] ' : ''}${t.title}`), h('small', {}, t.brief)),
        h('button', { class: 'lt-btn95', 'data-task': t.id, onclick: () => ctx.startTask(t.id) }, done ? 'Redo' : 'Start'));
    }));
  };
  draw(ctx.progress());
  ctx.onProgress(draw);
  return { el: h('div', { class: 'lt-questbox' }, head, list) };
}

function sysinfoApp(ctx: LaptopContext): AppView {
  const rows: [string, string][] = [['Machine', 'HAUNTED BOOK 486'], ['Memory', '16384K'], ['Disk', '540 MB'], ['System', 'HAUNTED/OS 3.1'], ['Owner', 'dev']];
  return {
    el: h('div', { class: 'lt-sysinfo' },
      h('pre', { class: 'lt-logo small' }, LOGO),
      h('dl', {}, ...rows.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])),
      h('button', { class: 'lt-btn95', onclick: () => ctx.shutdown() }, 'Shut down...')),
  };
}

export function createApp(id: AppId, ctx: LaptopContext): AppView {
  switch (id) {
    case 'quests': return questsApp(ctx);
    case 'sysinfo': return sysinfoApp(ctx);
    case 'jspad': return createWorkbench(ctx, { app: 'jspad', files: ['js'], scratch: { html: '', css: '', js: JS_SCRATCH }, autoRunMs: 0 });
    case 'weaver': return createWorkbench(ctx, { app: 'weaver', files: ['html', 'css', 'js'], scratch: PAGE_SCRATCH, autoRunMs: 700 });
  }
}
