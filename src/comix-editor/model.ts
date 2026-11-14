import { clone } from '../chapter-editor/dom.js';
import type { ComixManifest, ComixPack, ComixPageSpec } from '../cinematic/spec-types.js';
import type { ComixFiles } from './api.js';
import { stringifyComixJson } from './json.js';

export type ComixFileKey = 'manifest' | `page:${string}`;

export interface ComixFileEntry {
  key: ComixFileKey;
  path: string;
  value: ComixManifest | ComixPageSpec;
}

export class ComixModel {
  readonly slug: string;
  draft!: ComixPack;
  private saved!: ComixPack;
  private pagePaths = new Map<string, string>();
  private etags: Record<string, string> = {};

  constructor(files: ComixFiles) {
    this.slug = files.slug;
    this.reloadFrom(files);
  }

  get id(): string {
    return this.draft.manifest.id;
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

  private savedValue(key: ComixFileKey): unknown {
    if (key === 'manifest') return this.saved.manifest;
    const id = key.slice(5);
    return this.saved.pages.find((p) => p.id === id);
  }

  dirty(key: ComixFileKey): boolean {
    const cur = this.entry(key)?.value;
    const base = this.savedValue(key);
    return stringifyComixJson(cur) !== stringifyComixJson(base);
  }

  dirtyEntries(): ComixFileEntry[] {
    return this.entries().filter((e) => this.dirty(e.key));
  }

  anyDirty(): boolean {
    return this.dirtyEntries().length > 0;
  }

  etag(key: ComixFileKey): string | undefined {
    const path = this.entry(key)?.path;
    return path ? this.etags[path] : undefined;
  }

  accept(key: ComixFileKey, etag: string): void {
    const found = this.entry(key);
    if (!found) return;
    this.etags[found.path] = etag;
    if (key === 'manifest') {
      this.saved.manifest = clone(this.draft.manifest);
    } else {
      const id = key.slice(5);
      const idx = this.saved.pages.findIndex((p) => p.id === id);
      if (idx >= 0) this.saved.pages[idx] = clone(found.value as ComixPageSpec);
    }
  }

  revert(key: ComixFileKey): void {
    if (key === 'manifest') {
      this.draft.manifest = clone(this.saved.manifest);
      return;
    }
    const id = key.slice(5);
    const orig = this.saved.pages.find((p) => p.id === id);
    const idx = this.draft.pages.findIndex((p) => p.id === id);
    if (orig && idx >= 0) this.draft.pages[idx] = clone(orig);
  }

  replace(key: ComixFileKey, next: Record<string, unknown>): void {
    if (key === 'manifest') {
      this.draft.manifest = next as unknown as ComixManifest;
      return;
    }
    const id = key.slice(5);
    const idx = this.draft.pages.findIndex((p) => p.id === id);
    if (idx >= 0) this.draft.pages[idx] = next as unknown as ComixPageSpec;
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
    const out: string[] = [];
    for (const [path, hash] of Object.entries(diskEtags)) {
      if (this.etags[path] !== hash) out.push(path);
    }
    for (const path of Object.keys(this.etags)) {
      if (!(path in diskEtags)) out.push(path);
    }
    return out;
  }

  reloadFrom(files: ComixFiles): void {
    const sorted = [...files.pages].sort((a, b) => a.spec.index - b.spec.index);
    this.pagePaths = new Map(sorted.map((p) => [p.spec.id, p.path]));
    this.saved = {
      manifest: clone(files.manifest),
      pages: sorted.map((p) => clone(p.spec)),
    };
    this.draft = clone(this.saved);
    this.etags = { ...files.etags };
  }
}
