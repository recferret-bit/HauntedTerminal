import type { ComixManifest, ComixPack, ComixPageSpec } from '../cinematic/spec-types.js';
import { clone } from '../editor-core/dom.js';
import { BasePackModel } from '../editor-core/file-tracker.js';
import type { ComixFiles } from './api.js';
import { stringifyComixJson } from './json.js';

export type ComixFileKey = 'manifest' | `page:${string}`;

export interface ComixFileEntry {
  key: ComixFileKey;
  path: string;
  value: ComixManifest | ComixPageSpec;
}

export class ComixModel extends BasePackModel<ComixFileKey, ComixPack> {
  private pagePaths = new Map<string, string>();

  constructor(files: ComixFiles) {
    super(files.slug, stringifyComixJson);
    this.reloadFrom(files);
  }

  pack(): ComixPack {
    return this.draft;
  }

  page(pageId: string): ComixPageSpec | undefined {
    return this.draft.pages.find((p) => p.id === pageId);
  }

  entries(): ComixFileEntry[] {
    return [
      { key: 'manifest', path: 'comix.manifest.json', value: this.draft.manifest },
      ...this.draft.pages.map((p): ComixFileEntry => ({
        key: `page:${p.id}`,
        path: this.pagePaths.get(p.id) ?? `pages/${p.id}/page.spec.json`,
        value: p,
      })),
    ];
  }

  entry(key: ComixFileKey): ComixFileEntry | undefined {
    return this.entries().find((e) => e.key === key);
  }

  dirty(key: ComixFileKey): boolean {
    const found = this.entry(key);
    return found ? this.tracker.isDirty(key, found.value) : false;
  }

  dirtyEntries(): ComixFileEntry[] {
    return this.entries().filter((e) => this.dirty(e.key));
  }

  anyDirty(): boolean {
    return this.dirtyEntries().length > 0;
  }

  accept(key: ComixFileKey, etag: string): void {
    const found = this.entry(key);
    if (found) this.tracker.markSaved(key, found.value, etag);
  }

  revert(key: ComixFileKey): void {
    if (key === 'manifest') {
      const orig = this.tracker.parseBaseline<ComixManifest>('manifest');
      if (orig) this.draft.manifest = orig;
      return;
    }
    const id = key.slice(5);
    const orig = this.tracker.parseBaseline<ComixPageSpec>(key);
    const idx = this.draft.pages.findIndex((p) => p.id === id);
    if (orig && idx >= 0) this.draft.pages[idx] = orig;
  }

  replace(key: ComixFileKey, next: Record<string, unknown>): void {
    if (key === 'manifest') {
      this.draft.manifest = { ...(next as unknown as ComixManifest), id: this.draft.manifest.id };
      return;
    }
    const id = key.slice(5);
    const idx = this.draft.pages.findIndex((p) => p.id === id);
    if (idx >= 0) {
      const prev = this.draft.pages[idx]!;
      this.draft.pages[idx] = { ...(next as unknown as ComixPageSpec), id, index: prev.index };
    }
  }

  /** Keep `manifest.pages` summaries synchronized with each page spec's title, window, and panel count. */
  syncSummaries(): void {
    for (const summary of this.draft.manifest.pages) {
      const page = this.draft.pages.find((p) => p.id === summary.id || p.index === summary.index);
      if (!page) continue;
      summary.title = page.title;
      summary.from = page.from;
      summary.until = page.until;
      summary.panelCount = page.panels.length;
    }
  }

  changedPaths(diskEtags: Record<string, string>): string[] {
    return this.tracker.changedDiskPaths(diskEtags, true);
  }

  reloadFrom(files: ComixFiles): void {
    const sorted = [...files.pages].sort((a, b) => a.spec.index - b.spec.index);
    this.pagePaths = new Map(sorted.map((p) => [p.spec.id, p.path]));
    const manifestCopy = clone(files.manifest);
    const pageCopies = sorted.map((p) => clone(p.spec));
    this.draft = { manifest: manifestCopy, pages: pageCopies };
    this.tracker.reset();
    this.tracker.register('manifest', 'comix.manifest.json', manifestCopy, files.etags['comix.manifest.json']);
    for (let i = 0; i < sorted.length; i++) {
      const src = sorted[i]!;
      this.tracker.register(`page:${src.spec.id}`, src.path, pageCopies[i]!, files.etags[src.path]);
    }
  }
}
