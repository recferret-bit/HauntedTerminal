import type { PackIssue } from '../chapters/validate-pack.js';
import type { LevelSpec } from '../chapters/types.js';
import { renderDataTable, renderIssueList, renderJsonFilePane } from '../editor-core/chrome.js';
import { clear, h, type Rec } from '../editor-core/dom.js';
import { renderFields, type FormCtx } from '../editor-core/form.js';
import { renderComix } from './api.js';
import type { ChapterModel, FileKey } from './chapter-model.js';
import { runSolve } from './check.js';
import type { Preview } from './preview.js';
import { COMIX_PAGE, DIALOG_CAST, DIALOG_ENTRY, ENTITIES, FILES, MANIFEST, OVERVIEW, RULES, SCRIPT, type Field } from './schema.js';

export interface Sel {
  slug: string;
  target: 'level' | 'chapter';
  levelId: string;
  tab: string;
}

/** Everything a pane needs from the app. */
export interface Env {
  model: ChapterModel;
  writable: boolean;
  ctx: FormCtx;
  preview: Preview;
  issues: PackIssue[];
  select(next: Partial<Sel>): void;
  /** Draw the whole editor again (after a structural edit made outside the form). */
  redraw(): void;
  /** Re-run the checks and refresh the sidebar marks. */
  changed(): void;
}

export const LEVEL_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'files', label: 'Files' },
  { id: 'entities', label: 'Enemies & items' },
  { id: 'rules', label: 'Rules & solution' },
  { id: 'script', label: 'Script' },
  { id: 'dialogs', label: 'Dialogs' },
  { id: 'json', label: 'JSON' },
  { id: 'check', label: 'Check' },
] as const;

export const CHAPTER_TABS = [
  { id: 'manifest', label: 'Chapter' },
  { id: 'cast', label: 'Speakers' },
  { id: 'comic', label: 'Comic' },
  { id: 'json', label: 'JSON' },
  { id: 'check', label: 'Check' },
] as const;

const LEVEL_FORMS: Record<string, Field[]> = { overview: OVERVIEW, files: FILES, entities: ENTITIES, rules: RULES, script: SCRIPT };
const comicPage = new Map<string, number>();
let comicBust = Date.now();

function note(text: string, cls = 'note'): HTMLElement {
  return h('p', { class: cls }, text);
}

function issueList(env: Env, issues: PackIssue[], jump: boolean): HTMLElement {
  return renderIssueList(issues, {
    okText: '✓ no issues',
    onJump: jump
      ? (i) => {
          const isLevel = env.model.draft.levels.some((l) => l.id === i.where);
          env.select(isLevel ? { target: 'level', levelId: i.where, tab: i.tab } : { target: 'chapter', tab: i.tab });
        }
      : undefined,
  });
}

function form(env: Env, obj: Rec, fields: Field[], path: string): HTMLElement {
  const box = h('div', { class: 'form' });
  renderFields(box, obj, fields, env.ctx, path);
  return box;
}

/** `script` is optional on a level: edit a detached object and attach it to the level as soon as it holds something. */
function scriptForm(env: Env, level: LevelSpec): HTMLElement {
  const target = (level.script ?? {}) as Rec;
  const attach = (): void => {
    if (!level.script && Object.keys(target).length > 0) level.script = target;
  };
  const ctx: FormCtx = {
    ...env.ctx,
    changed: () => { attach(); env.ctx.changed(); },
    restructure: () => { attach(); env.ctx.restructure(); },
  };
  const box = h('div', { class: 'form' });
  renderFields(box, target, SCRIPT, ctx, `${level.id}.script`);
  return box;
}

function levelForm(env: Env, level: LevelSpec, tab: string): HTMLElement {
  const box = h('div', {});
  const mine = env.issues.filter((i) => i.where === level.id && i.tab === tab);
  if (mine.length > 0) box.append(issueList(env, mine, false));
  if (tab === 'overview') box.append(note(`id ${level.id} · index ${level.index} (set by the folder and the manifest; not editable here)`, 'note dim'));
  box.append(tab === 'script' ? scriptForm(env, level) : form(env, level as unknown as Rec, LEVEL_FORMS[tab] ?? [], `${level.id}.${tab}`));
  return box;
}

function dialogsPane(env: Env, level: LevelSpec): HTMLElement {
  const dialogs = env.model.draft.dialogs;
  if (!dialogs) return note('This chapter has no dialogs.json (set comix.dialogsPath in the manifest).');
  const entry = dialogs.levels[level.id];
  if (!entry) {
    const make = h('button', { type: 'button', class: 'btn primary' }, 'Create the dialog entry for this level');
    make.addEventListener('click', () => {
      dialogs.levels[level.id] = { banner: level.title, hankRungs: ['', '', ''] };
      env.changed();
      env.redraw();
    });
    return h('div', {}, note('No entry in dialogs.json for this level.'), make);
  }
  const box = h('div', {});
  const mine = env.issues.filter((i) => i.where === level.id && i.tab === 'dialogs');
  if (mine.length > 0) box.append(issueList(env, mine, false));
  box.append(form(env, entry as unknown as Rec, DIALOG_ENTRY, `${level.id}.dialog`));
  return box;
}

function manifestPane(env: Env): HTMLElement {
  const m = env.model.draft.manifest;
  const box = h('div', {}, form(env, m as unknown as Rec, MANIFEST, 'manifest'));
  const rows = m.levels.map((s) =>
    h(
      'tr',
      {},
      h('td', {}, String(s.index)),
      h('td', {}, s.title),
      h('td', {}, s.mechanic),
      h('td', {}, s.roomKind),
      h('td', { class: 'mono' }, s.cwd),
      h(
        'td',
        {},
        h(
          'button',
          { type: 'button', class: 'btn small', onclick: () => env.select({ target: 'level', levelId: s.id, tab: 'overview' }) },
          'Open →',
        ),
      ),
    ),
  );
  const sync = h('button', { type: 'button', class: 'btn small' }, 'Refresh from level specs');
  sync.addEventListener('click', () => {
    env.model.syncSummaries();
    env.changed();
    env.redraw();
  });
  box.append(
    h('h4', {}, 'Level summaries (copied from each spec on save)'),
    renderDataTable(['#', 'Title', 'Mechanic', 'Room', 'CWD', ''], rows),
    sync,
  );
  return box;
}

function castPane(env: Env): HTMLElement {
  const d = env.model.draft.dialogs;
  return d ? form(env, d as unknown as Rec, DIALOG_CAST, 'cast') : note('No dialogs.json for this chapter.');
}

function comicPane(env: Env): HTMLElement {
  const comix = env.model.draft.comix;
  if (!comix || comix.pages.length === 0) return note('This chapter has no comic pages.');
  const slug = env.model.slug;
  const index = Math.min(comicPage.get(slug) ?? 0, comix.pages.length - 1);
  const page = comix.pages[index]!;
  const nav = h('div', { class: 'page-nav' });
  comix.pages.forEach((p, i) => {
    const b = h('button', { type: 'button', class: `btn small${i === index ? ' primary' : ''}` }, String(p.pageNumber));
    b.addEventListener('click', () => { comicPage.set(slug, i); env.redraw(); });
    nav.append(b);
  });
  const log = h('pre', { class: 'log' });
  const render = h('button', { type: 'button', class: 'btn', disabled: !env.writable }, 'Render pages (draw-comix)');
  render.addEventListener('click', () => {
    log.textContent = 'rendering… (saves are not needed: it draws from the file on disk)';
    renderComix(slug)
      .then((r) => { log.textContent = r.log || (r.ok ? 'done' : 'failed'); comicBust = Date.now(); env.redraw(); })
      .catch((e: Error) => { log.textContent = e.message; });
  });
  const png = `/comix/${env.model.id}/page-${String(page.pageNumber).padStart(2, '0')}.png?v=${comicBust}`;
  const side = h('div', { class: 'comic-side' }, h('img', { src: png, alt: `page ${page.pageNumber}`, class: 'comic-img' }), note('Rendered from the saved file. Save, then render.', 'note dim'), render, log);
  return h('div', { class: 'comic' }, h('div', {}, nav, form(env, page as unknown as Rec, COMIX_PAGE, `comic.${index}`)), side);
}

function jsonPane(env: Env, sel: Sel): HTMLElement {
  const keys: FileKey[] = sel.target === 'level' ? [`level:${sel.levelId}`] : env.model.entries().filter((e) => !e.key.startsWith('level:')).map((e) => e.key);
  return renderJsonFilePane({
    files: keys.map((k) => ({ key: k, path: env.model.entry(k)?.path ?? k })),
    initialKey: keys[0] ?? 'manifest',
    readText: (k) => JSON.stringify(env.model.entry(k)?.value ?? null, null, 2),
    applyObject: (k, parsed) => {
      env.model.replace(k, parsed);
      env.changed();
      env.redraw();
    },
    applyButtonLabel: 'Apply JSON to the draft',
  });
}

function solveRows(report: ReturnType<typeof runSolve>): HTMLElement {
  const list = h('ul', { class: 'issues' });
  for (const l of report.levels) {
    list.append(h('li', { class: l.ok ? 'okrow' : 'error' }, h('b', { 'aria-hidden': 'true' }, l.ok ? '✓ ' : '✕ '), h('span', { class: 'sr' }, l.ok ? 'Passed: ' : 'Failed: '), h('span', { class: 'where' }, l.levelId), ` ${l.commands} cmds, ${l.deaths} deaths${l.problem ? ` — ${l.problem}` : ''}`));
  }
  return h('div', {}, h('p', { class: report.ok ? 'ok' : 'error' }, report.ok ? `✓ cleared headlessly: ${report.commands} commands, 0 deaths` : '✕ the solution does not clear'), list);
}

function checkPane(env: Env, sel: Sel): HTMLElement {
  const out = h('div', { class: 'solve-out' });
  const solve = (levelId?: string): void => {
    clear(out);
    try {
      out.append(solveRows(runSolve(env.model.pack(), levelId)));
    } catch (err) {
      out.append(note(`the headless run threw: ${(err as Error).message}`, 'note error'));
    }
  };
  const buttons = h('div', { class: 'row' });
  if (sel.target === 'level') {
    const one = h('button', { type: 'button', class: 'btn primary' }, 'Solve this level headlessly');
    one.addEventListener('click', () => solve(sel.levelId));
    buttons.append(one);
  }
  const all = h('button', { type: 'button', class: 'btn' }, 'Solve the whole chapter');
  all.addEventListener('click', () => solve());
  buttons.append(all);
  const shown = sel.target === 'level' ? env.issues.filter((i) => i.where === sel.levelId || i.where === 'chapter') : env.issues;
  return h('div', {}, h('h4', {}, `Static checks (${shown.length})`), issueList(env, shown, true), h('h4', {}, 'Headless playthrough'), note('Types the canonical solution under enemy tick pressure, on the unsaved draft.', 'note dim'), buttons, out);
}

export function renderPane(env: Env, sel: Sel): HTMLElement {
  const level = env.model.level(sel.levelId);
  if (sel.tab === 'check') return checkPane(env, sel);
  if (sel.tab === 'json') return jsonPane(env, sel);
  if (sel.target === 'chapter') {
    if (sel.tab === 'cast') return castPane(env);
    if (sel.tab === 'comic') return comicPane(env);
    return manifestPane(env);
  }
  if (!level) return note('Pick a level on the left.');
  if (sel.tab === 'dialogs') return dialogsPane(env, level);
  return levelForm(env, level, sel.tab in LEVEL_FORMS ? sel.tab : 'overview');
}

