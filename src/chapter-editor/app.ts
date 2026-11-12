import { writeDraftPack } from '../chapters/draft.js';
import type { ScriptStep } from '../chapters/types.js';
import { ConflictError, fetchEtags, loadChapters, saveFile } from './api.js';
import { ChapterModel, type FileKey } from './chapter-model.js';
import { checkPack } from './check.js';
import { clear, h, type Rec } from './dom.js';
import type { FormCtx } from './form.js';
import { CHAPTER_TABS, LEVEL_TABS, renderPane, type Env, type Sel } from './panes.js';
import { Preview } from './preview.js';
import { makeSuggest } from './suggest.js';

const CHECK_DELAY_MS = 250;
const PREVIEW_DELAY_MS = 500;
const DISK_POLL_MS = 5000;

/** The whole editor: sidebar of levels, tabbed forms driven by schema.ts, and the live game preview. */
class EditorApp {
  private models: ChapterModel[] = [];
  private writable = false;
  private sel: Sel = { slug: '', target: 'level', levelId: '', tab: 'overview' };
  private issues = [] as ReturnType<typeof checkPack>;
  private readonly open = new Set<string>();
  private readonly top = h('header', { class: 'ed-top' });
  private readonly side = h('nav', { class: 'ed-side', 'aria-label': 'Chapter and levels' });
  private readonly tabs = h('div', { class: 'ed-tabs', role: 'tablist', 'aria-label': 'Editor sections' });
  private readonly pane = h('div', { class: 'ed-pane', role: 'tabpanel' });
  private readonly pv: Preview;
  private status = '';
  /** Spec files that changed on disk since this editor read them (an agent, git, another tab). */
  private stale: string[] = [];
  private checkTimer = 0;
  private checkPending = false;
  private previewTimer = 0;

  constructor(private readonly root: HTMLElement) {
    this.pv = new Preview(() => this.model.pack());
    const main = h('main', { class: 'ed-main' }, this.tabs, this.pane);
    root.append(h('div', { class: 'ed' }, this.top, this.side, main, h('aside', { class: 'ed-pv' }, this.pv.root)));
    window.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void this.save(this.currentKeys());
      }
    });
    window.addEventListener('beforeunload', (e) => {
      if (this.models.some((m) => m.dirtyKeys().length > 0)) e.preventDefault();
    });
  }

  private get model(): ChapterModel {
    return this.models.find((m) => m.slug === this.sel.slug) ?? this.models[0]!;
  }

  private get ctx(): FormCtx {
    return {
      suggest: makeSuggest(() => this.model.level(this.sel.levelId)),
      changed: () => this.onChanged(),
      restructure: () => this.drawPane(),
      playStep: (step: Rec) => this.pv.playStep(step as unknown as ScriptStep),
      open: this.open,
    };
  }

  private get env(): Env {
    return {
      model: this.model,
      writable: this.writable,
      ctx: this.ctx,
      preview: this.pv,
      issues: this.issues,
      select: (next) => this.select(next),
      redraw: () => this.draw(),
      changed: () => this.onChanged(),
    };
  }

  async start(): Promise<void> {
    const loaded = await loadChapters();
    this.writable = loaded.writable;
    this.models = loaded.chapters.map((c) => new ChapterModel(c));
    if (this.models.length === 0) {
      this.root.replaceChildren(h('p', { class: 'note error' }, 'No chapters found in chapters/.'));
      return;
    }
    this.sel = this.readRoute();
    this.issues = checkPack(this.model.pack());
    this.draw();
    this.loadPreview();
    window.setInterval(() => void this.checkDisk(), DISK_POLL_MS);
    window.addEventListener('focus', () => void this.checkDisk());
  }

  // ---- routing ----------------------------------------------------------------------------------------------------

  private readRoute(): Sel {
    const parts = location.pathname.split('/').filter(Boolean);
    const m = this.models.find((c) => c.slug === decodeURIComponent(parts[1] ?? '')) ?? this.models[0]!;
    const level = m.level(decodeURIComponent(parts[2] ?? '')) ?? m.draft.levels[0];
    const tab = new URLSearchParams(location.search).get('tab') ?? 'overview';
    return { slug: m.slug, target: parts[1] !== undefined && parts[2] === undefined ? 'chapter' : 'level', levelId: level?.id ?? '', tab };
  }

  private syncUrl(): void {
    const s = this.sel;
    const path = s.target === 'level' ? `/editor/${encodeURIComponent(s.slug)}/${encodeURIComponent(s.levelId)}` : `/editor/${encodeURIComponent(s.slug)}`;
    history.replaceState(null, '', `${path}?tab=${s.tab}`);
  }

  private select(next: Partial<Sel>): void {
    const levelChanged = (next.levelId !== undefined && next.levelId !== this.sel.levelId) || (next.slug !== undefined && next.slug !== this.sel.slug);
    const prevTarget = this.sel.target;
    this.sel = { ...this.sel, ...next };
    const tabs = this.sel.target === 'level' ? LEVEL_TABS : CHAPTER_TABS;
    if (!tabs.some((t) => t.id === this.sel.tab)) this.sel.tab = tabs[0].id;
    if (next.target && next.target !== prevTarget && next.tab === undefined) this.sel.tab = tabs[0].id;
    this.syncUrl();
    this.draw();
    if (levelChanged && this.sel.target === 'level') this.loadPreviewSoon();
  }

  // ---- preview ----------------------------------------------------------------------------------------------------

  private loadPreview(): void {
    const level = this.model.level(this.sel.levelId);
    if (level) this.pv.load(level);
  }

  private loadPreviewSoon(): void {
    window.clearTimeout(this.previewTimer);
    this.previewTimer = window.setTimeout(() => this.loadPreview(), PREVIEW_DELAY_MS);
  }

  // ---- changes and saving -----------------------------------------------------------------------------------------

  private onChanged(): void {
    window.clearTimeout(this.checkTimer);
    this.checkPending = true;
    this.checkTimer = window.setTimeout(() => {
      this.refreshIssues();
      this.drawTop();
      this.drawSide();
    }, CHECK_DELAY_MS);
    this.drawTop();
    this.drawSide();
  }

  /** Runs the static checks on the draft now and hands the draft to the game preview. */
  private refreshIssues(): void {
    window.clearTimeout(this.checkTimer);
    this.checkPending = false;
    const pack = this.model.pack();
    writeDraftPack(pack);
    this.issues = checkPack(pack);
  }

  private currentKeys(): FileKey[] {
    return this.sel.target === 'level' ? [`level:${this.sel.levelId}`] : ['manifest', 'dialogs', 'comix'].filter((k) => this.model.entry(k));
  }

  private async save(keys: FileKey[]): Promise<void> {
    if (!this.writable) {
      this.setStatus('read-only: run the dev server (npm start) to save');
      return;
    }
    const m = this.model;
    const todo = new Set(keys.filter((k) => m.isDirty(k)));
    if ([...todo].some((k) => k.startsWith('level:'))) {
      m.syncSummaries();
      if (m.isDirty('manifest')) todo.add('manifest');
    }
    if (todo.size === 0) {
      this.setStatus('nothing to save');
      return;
    }
    try {
      for (const key of todo) {
        const entry = m.entry(key);
        if (!entry) continue;
        const res = await saveFile(m.slug, entry.path, entry.value, m.etag(key));
        m.markSaved(key, res.etag);
        if (res.warning) this.setStatus(res.warning, true);
      }
      this.setStatus(`saved ${todo.size} file${todo.size > 1 ? 's' : ''}; src/chapters/generated recompiled`);
    } catch (err) {
      if (err instanceof ConflictError) {
        this.setStatus(`${err.message}. Nothing was overwritten: use "Reload from disk".`, true);
        await this.checkDisk();
      } else {
        this.setStatus(`save failed: ${(err as Error).message}`, true);
      }
    }
    this.drawTop();
    this.drawSide();
  }

  /** Notices spec files that were edited outside this editor and offers a reload instead of a silent overwrite. */
  private async checkDisk(): Promise<void> {
    if (!this.writable || document.hidden) return;
    try {
      const stale = this.model.changedOnDisk(await fetchEtags(this.model.slug));
      if (stale.join() !== this.stale.join()) {
        this.stale = stale;
        this.drawTop();
      }
    } catch {
      /* dev server restarting: try again on the next poll */
    }
  }

  /** Replaces this chapter's draft with the files as they are on disk now. */
  private async reloadFromDisk(): Promise<void> {
    const m = this.model;
    if (m.dirtyKeys().length > 0 && !window.confirm('Discard your unsaved edits and reload this chapter from disk?')) return;
    const loaded = await loadChapters();
    const fresh = loaded.chapters.find((c) => c.slug === m.slug);
    if (!fresh) return;
    this.models = this.models.map((c) => (c.slug === m.slug ? new ChapterModel(fresh) : c));
    if (!this.model.level(this.sel.levelId)) this.sel.levelId = this.model.draft.levels[0]?.id ?? '';
    this.stale = [];
    this.issues = checkPack(this.model.pack());
    this.setStatus('reloaded from disk');
    this.draw();
    this.loadPreview();
  }

  private setStatus(text: string, bad = false): void {
    this.status = bad ? `✕ ${text}` : text;
    this.drawTop();
  }

  // ---- drawing ----------------------------------------------------------------------------------------------------

  draw(): void {
    // An edit made a moment ago must show in the Check tab and the sidebar marks, not after the typing delay.
    if (this.checkPending) this.refreshIssues();
    this.drawTop();
    this.drawSide();
    this.drawTabs();
    this.drawPane();
  }

  private drawTop(): void {
    const m = this.model;
    const dirtyAll = m.dirtyKeys().length;
    const chapter = h('select', { class: 'ed-chapter' }, ...this.models.map((c) => h('option', { value: c.slug, selected: c.slug === m.slug }, `#${c.draft.manifest.issueNumber} ${c.draft.manifest.title}`)));
    chapter.addEventListener('change', () => {
      const next = this.models.find((c) => c.slug === chapter.value);
      if (next) this.select({ slug: next.slug, target: 'level', levelId: next.draft.levels[0]?.id ?? '', tab: 'overview' });
    });
    const keys = this.currentKeys();
    const fileDirty = keys.filter((k) => m.isDirty(k)).length;
    const btn = (label: string, cls: string, run: () => void, disabled = false): HTMLElement => h('button', { type: 'button', class: `btn ${cls}`, disabled, onclick: run }, label);
    clear(this.top);
    this.top.append(
      h('a', { class: 'ed-brand', href: '/' }, h('b', {}, 'CHAPTER'), ' EDITOR'),
      chapter,
      btn(fileDirty ? `Save file ●` : 'Save file', 'primary', () => void this.save(keys), !this.writable || fileDirty === 0),
      btn(`Save all (${dirtyAll})`, '', () => void this.save(m.dirtyKeys()), !this.writable || dirtyAll === 0),
      btn('Revert file', '', () => { keys.forEach((k) => m.revert(k)); this.onChanged(); this.draw(); }, fileDirty === 0),
      ...(this.stale.length > 0 ? [btn(`Reload from disk (${this.stale.length} changed)`, 'warn', () => void this.reloadFromDisk())] : []),
      h('span', { class: 'ed-status', role: 'status', 'aria-live': 'polite' }, this.writable ? this.status : 'READ-ONLY — start the dev server (npm start) to edit chapters on disk'),
      h('a', { class: 'ed-link', href: this.pv.playUrl(), target: '_blank', rel: 'noopener' }, 'Play in tab ↗'),
      h('a', { class: 'ed-link', href: '/chapters.html' }, 'Level select'),
    );
  }

  private drawSide(): void {
    const m = this.model;
    const count = (where: string): number => this.issues.filter((i) => i.where === where && i.severity === 'error').length;
    const warn = (where: string): number => this.issues.filter((i) => i.where === where && i.severity === 'warn').length;
    const mark = (keys: FileKey[], where: string): HTMLElement => h('span', { class: 'marks' }, keys.some((k) => m.isDirty(k)) ? h('i', { class: 'dot', title: 'unsaved' }, '●', h('span', { class: 'sr' }, ' unsaved')) : null, count(where) ? h('i', { class: 'bad', title: 'errors' }, `✕${count(where)}`, h('span', { class: 'sr' }, ' errors')) : warn(where) ? h('i', { class: 'warnmark', title: 'warnings' }, `⚠${warn(where)}`, h('span', { class: 'sr' }, ' warnings')) : null);
    const entry = (label: string, active: boolean, run: () => void, extra: HTMLElement | null): HTMLElement => h('button', { type: 'button', class: `ed-item${active ? ' on' : ''}`, 'aria-current': active ? 'true' : undefined, onclick: run }, h('span', { class: 'lbl' }, label), extra);
    clear(this.side);
    this.side.append(
      h('h3', {}, 'Chapter'),
      entry('Settings, speakers & comic', this.sel.target === 'chapter', () => this.select({ target: 'chapter', tab: 'manifest' }), mark(['manifest', 'dialogs', 'comix'], 'chapter')),
      h('h3', {}, `Levels (${m.draft.levels.length})`),
    );
    for (const l of m.draft.levels) {
      const sub = h('small', {}, `${l.mechanic} · ${l.roomKind}`);
      const on = this.sel.target === 'level' && this.sel.levelId === l.id;
      const item = entry(`${String(l.index).padStart(2, '0')} ${l.title}`, on, () => this.select({ target: 'level', levelId: l.id }), mark([`level:${l.id}`], l.id));
      item.append(sub);
      this.side.append(item);
    }
  }

  private drawTabs(): void {
    const tabs = this.sel.target === 'level' ? LEVEL_TABS : CHAPTER_TABS;
    clear(this.tabs);
    for (const t of tabs) {
      const bad = this.issues.filter((i) => i.tab === t.id && (this.sel.target === 'level' ? i.where === this.sel.levelId : i.where === 'chapter' || i.where === 'comix') && i.severity === 'error').length;
      this.tabs.append(h('button', { type: 'button', role: 'tab', 'aria-selected': t.id === this.sel.tab ? 'true' : 'false', class: `ed-tab${t.id === this.sel.tab ? ' on' : ''}`, onclick: () => this.select({ tab: t.id }) }, t.label, bad ? h('i', { class: 'bad' }, ` ✕${bad}`, h('span', { class: 'sr' }, ' errors')) : null));
    }
  }

  private drawPane(): void {
    const scroll = this.pane.scrollTop;
    clear(this.pane);
    this.pane.append(renderPane(this.env, this.sel));
    this.pane.scrollTop = scroll;
  }
}

export async function startEditor(root: HTMLElement): Promise<void> {
  await new EditorApp(root).start();
}
