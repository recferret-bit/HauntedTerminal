import { clear, h } from '../chapter-editor/dom.js';
import type { FormCtx } from '../chapter-editor/form.js';
import { ConflictError, fetchComixEtags, loadComixes, saveComixFile } from './api.js';
import { checkComix, type ComixIssue } from './check.js';
import { ComixModel } from './model.js';
import { renderCheckPane, renderFormPane, renderJsonPane, type Holder } from './panes.js';
import { ComixPreview } from './preview.js';
import { suggestions } from './suggest.js';

const TABS = [
  { id: 'form', label: 'Form' },
  { id: 'json', label: 'JSON' },
  { id: 'check', label: 'Check' },
] as const;

type Tab = (typeof TABS)[number]['id'];

interface Sel {
  id: string;
  file: string;
  tab: Tab;
}

const CHECK_DELAY_MS = 250;
const DISK_POLL_MS = 5000;

/** Sidebar of comixes and spec files, a schema form or JSON, and the cinematic draft preview. */
class ComixEditor {
  private models: ComixModel[] = [];
  private writable = false;
  private sel: Sel = { id: '', file: '', tab: 'form' };
  private issues: ComixIssue[] = [];
  private readonly open = new Set<string>();
  private holder: Holder | null = null;
  private status = '';
  private conflict = false;
  private stale: string[] = [];
  private checkTimer = 0;
  private checkPending = false;
  private readonly top = h('header', { class: 'ed-top' });
  private readonly side = h('nav', { class: 'ed-side', 'aria-label': 'Comixes and spec files' });
  private readonly tabs = h('div', { class: 'ed-tabs', role: 'tablist', 'aria-label': 'Comix file' });
  private readonly pane = h('div', { class: 'ed-pane', role: 'tabpanel' });
  private readonly preview: ComixPreview;

  constructor(private readonly root: HTMLElement) {
    this.preview = new ComixPreview(() => ({ id: this.model.id, files: this.model.drafts() }));
    const main = h('main', { class: 'ed-main' }, this.tabs, this.pane);
    root.append(h('div', { class: 'ed' }, this.top, this.side, main, h('aside', { class: 'ed-pv' }, this.preview.root)));
    window.addEventListener('keydown', (ev) => {
      if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 's') {
        ev.preventDefault();
        void this.save();
      }
    });
    window.addEventListener('beforeunload', (ev) => {
      if (this.models.some((model) => model.dirtyPaths().length > 0)) ev.preventDefault();
    });
  }

  private get model(): ComixModel {
    return this.models.find((model) => model.id === this.sel.id) ?? this.models[0]!;
  }

  async start(): Promise<void> {
    let loaded;
    try {
      loaded = await loadComixes();
    } catch (err) {
      this.root.replaceChildren(h('p', { class: 'note error' }, (err as Error).message));
      return;
    }
    this.writable = loaded.writable;
    this.models = loaded.comixes.map((comix) => new ComixModel(comix));
    if (this.models.length === 0) {
      this.root.replaceChildren(h('p', { class: 'note error' }, 'No comixes found in comix/.'));
      return;
    }
    this.sel = this.readRoute();
    this.refresh();
    this.draw();
    this.syncUrl();
    this.preview.load();
    this.armDiskWatch();
  }

  /** Poll etags while the tab is open, and again when it regains focus. */
  private armDiskWatch(): void {
    if (!this.writable) return;
    const ping = (): void => { void this.checkDisk(); };
    window.setInterval(ping, DISK_POLL_MS);
    window.addEventListener('focus', ping);
  }

  private readRoute(): Sel {
    const parts = location.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    const model = this.models.find((comix) => comix.id === parts[1]) ?? this.models[0]!;
    const requested = parts.slice(2).join('/');
    const file = model.file(requested)?.path ?? (model.file('manifest.json') ? 'manifest.json' : model.files[0]?.path ?? '');
    const tab = new URLSearchParams(location.search).get('tab');
    return { id: model.id, file, tab: TABS.some((item) => item.id === tab) ? tab as Tab : 'form' };
  }

  private syncUrl(): void {
    const file = this.sel.file.split('/').map(encodeURIComponent).join('/');
    const path = `/comix-editor/${encodeURIComponent(this.sel.id)}/${file}`;
    history.replaceState(null, '', `${path}?tab=${this.sel.tab}`);
  }

  private select(next: Partial<Sel>): void {
    const prev = this.sel.id;
    const model = this.models.find((comix) => comix.id === (next.id ?? this.sel.id)) ?? this.model;
    let file = next.file ?? (next.id && next.id !== prev ? '' : this.sel.file);
    if (!model.file(file)) file = model.file('manifest.json') ? 'manifest.json' : (model.files[0]?.path ?? '');
    const tab = next.tab ?? this.sel.tab;
    this.sel = { id: model.id, file, tab: TABS.some((item) => item.id === tab) ? tab : 'form' };
    this.syncUrl();
    this.draw();
    if (model.id !== prev) this.preview.load();
  }

  private ctx(): FormCtx {
    return {
      suggest: (name) => suggestions(this.model, name),
      changed: () => { this.syncHolder(); this.onChanged(); },
      restructure: () => { this.syncHolder(); this.drawPane(); this.onChanged(); },
      open: this.open,
    };
  }

  private syncHolder(): void {
    const file = this.model.file(this.sel.file);
    if (this.holder && file) file.value = this.holder.box[this.holder.key];
  }

  private onChanged(): void {
    this.scheduleCheck();
    this.drawTop();
    this.drawSide();
    this.preview.loadSoon();
  }

  private scheduleCheck(): void {
    window.clearTimeout(this.checkTimer);
    this.checkPending = true;
    this.checkTimer = window.setTimeout(() => {
      this.refresh();
      this.drawTop();
      this.drawSide();
    }, CHECK_DELAY_MS);
  }

  private refresh(): void {
    window.clearTimeout(this.checkTimer);
    this.checkPending = false;
    this.issues = checkComix(this.model);
  }

  private async save(): Promise<void> {
    if (!this.writable) {
      this.setStatus('read-only: run the dev server (npm start) to save');
      return;
    }
    const file = this.model.file(this.sel.file);
    if (!file || !this.model.isDirty(file.path)) {
      this.setStatus('nothing to save');
      return;
    }
    try {
      const res = await saveComixFile(this.model.id, file.path, file.value, file.etag);
      this.model.markSaved(file.path, res.etag);
      this.conflict = false;
      this.setStatus(`saved ${file.path}`);
    } catch (err) {
      if (err instanceof ConflictError) {
        this.conflict = true;
        this.setStatus('This file changed on disk. Nothing was overwritten.', true);
      } else this.setStatus(`save failed: ${(err as Error).message}`, true);
    }
    this.drawTop();
    this.drawSide();
  }

  private async checkDisk(): Promise<void> {
    if (document.hidden || !this.writable) return;
    let etags: Record<string, string>;
    try {
      etags = await fetchComixEtags(this.model.id);
    } catch {
      return;
    }
    const stale = this.model.changedOnDisk(etags);
    if (stale.join() === this.stale.join()) return;
    this.stale = stale;
    this.drawTop();
  }

  private async reloadFromDisk(): Promise<void> {
    const current = this.model;
    const dirty = current.dirtyPaths().length > 0;
    if (dirty && !window.confirm('Discard your unsaved edits and reload this comix from disk?')) return;
    const loaded = await loadComixes();
    const fresh = loaded.writable ? loaded.comixes.find((comix) => comix.id === current.id) : undefined;
    if (!fresh) {
      this.setStatus('reload failed: the dev API did not answer', true);
      return;
    }
    this.models = this.models.map((model) => (model.id === fresh.id ? new ComixModel(fresh) : model));
    if (!this.model.file(this.sel.file)) this.sel.file = this.model.files[0]?.path ?? '';
    this.stale = [];
    this.conflict = false;
    this.refresh();
    this.setStatus('reloaded from disk');
    this.draw();
    this.preview.load();
  }

  private setStatus(text: string, bad = false): void {
    this.status = `${bad ? '✕ ' : ''}${text}`;
    this.drawTop();
  }

  private draw(): void {
    if (this.checkPending) this.refresh();
    for (const paint of [this.drawTop, this.drawSide, this.drawTabs, this.drawPane]) paint.call(this);
  }

  private drawTop(): void {
    const dirty = this.model.isDirty(this.sel.file);
    const offerReload = this.conflict || this.stale.length > 0;
    const save = h('button', { type: 'button', class: 'btn primary', disabled: !this.writable || !dirty, onclick: () => void this.save() }, dirty ? 'Save ●' : 'Save');
    const reload = h('button', { type: 'button', class: 'btn warn', onclick: () => void this.reloadFromDisk() }, 'Reload');
    clear(this.top);
    this.top.append(
      h('a', { class: 'ed-brand', href: '/' }, h('b', {}, 'COMIX'), ' EDITOR'),
      h('span', {}, `${this.model.id} — ${this.model.title}`),
      save,
      ...(offerReload ? [reload] : []),
      h('span', { class: 'ed-status', role: 'status', 'aria-live': 'polite' }, this.writable ? this.status : 'READ-ONLY — start the dev server (npm start) to edit comix specs on disk'),
    );
  }

  private drawSide(): void {
    const count = (file: string): number => this.issues.filter((issue) => issue.file === file && issue.severity === 'error').length;
    clear(this.side);
    this.side.append(h('h3', {}, 'Comixes'));
    for (const model of this.models) {
      const on = model.id === this.model.id;
      this.side.append(h('button', {
        type: 'button',
        class: `ed-item${on ? ' on' : ''}`,
        'aria-current': on ? 'true' : undefined,
        onclick: () => this.select({ id: model.id, tab: 'form' }),
      }, h('span', { class: 'lbl' }, `${model.id} — ${model.title}`)));
      if (!on) continue;
      for (const file of model.files) {
        const active = file.path === this.sel.file;
        const errors = count(file.path);
        this.side.append(h('button', {
          type: 'button',
          class: `ed-item ed-file${active ? ' on' : ''}`,
          'aria-current': active ? 'page' : undefined,
          onclick: () => this.select({ file: file.path }),
        }, h('span', { class: 'lbl' }, file.path), model.isDirty(file.path) ? h('i', { class: 'dot', title: 'unsaved' }, '●', h('span', { class: 'sr' }, ' unsaved')) : null, errors ? h('i', { class: 'bad', title: 'errors' }, `✕${errors}`, h('span', { class: 'sr' }, ' errors')) : null));
      }
    }
  }

  private drawTabs(): void {
    const errors = this.issues.filter((issue) => issue.severity === 'error').length;
    clear(this.tabs);
    for (const tab of TABS) {
      const on = tab.id === this.sel.tab;
      const badge = tab.id === 'check' && errors ? h('i', { class: 'bad' }, ` ✕${errors}`) : null;
      this.tabs.append(h('button', {
        type: 'button',
        role: 'tab',
        id: `comix-tab-${tab.id}`,
        'aria-selected': on ? 'true' : 'false',
        'aria-controls': 'comix-panel',
        class: `ed-tab${on ? ' on' : ''}`,
        onclick: () => this.select({ tab: tab.id }),
      }, tab.label, badge));
    }
    this.pane.id = 'comix-panel';
    this.pane.setAttribute('aria-labelledby', `comix-tab-${this.sel.tab}`);
  }

  private drawPane(): void {
    const scroll = this.pane.scrollTop;
    clear(this.pane);
    this.holder = null;
    const file = this.model.file(this.sel.file);
    if (!file) this.pane.append(h('p', { class: 'note' }, 'Pick a file.'));
    else if (this.sel.tab === 'json') this.pane.append(renderJsonPane(file, () => this.onChanged()));
    else if (this.sel.tab === 'check') this.pane.append(renderCheckPane(this.issues));
    else this.pane.append(renderFormPane(file, this.ctx(), (holder) => { this.holder = holder; }));
    this.pane.scrollTop = scroll;
  }
}

export async function startComixEditor(root: HTMLElement): Promise<void> {
  await new ComixEditor(root).start();
}
