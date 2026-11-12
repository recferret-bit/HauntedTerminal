import type { ChapterDialogs, ChapterManifest, ChapterPack, ComixStorySpec, LevelSpec } from '../chapters/types.js';
import type { ChapterFiles } from './api.js';
import { clone } from './dom.js';

/** Keys of the files a chapter is made of: `manifest`, `dialogs`, `comix`, `level:<id>`. */
export type FileKey = string;

export interface FileEntry {
  key: FileKey;
  /** Path inside the chapter folder, the one the dev API writes. */
  path: string;
  value: unknown;
}

const levelKey = (id: string): FileKey => `level:${id}`;

/**
 * The editable copy of one chapter. `draft` is what the forms change; `baseline` is the JSON text of every file as
 * last loaded or saved, so "dirty" is a comparison, not a flag someone has to remember to set.
 */
export class ChapterModel {
  readonly slug: string;
  readonly comixPages: string[];
  draft: { manifest: ChapterManifest; levels: LevelSpec[]; dialogs?: ChapterDialogs; comix?: ComixStorySpec };
  private readonly paths = new Map<FileKey, string>();
  private baseline = new Map<FileKey, string>();
  private readonly etags = new Map<FileKey, string>();

  constructor(files: ChapterFiles) {
    this.slug = files.slug;
    this.comixPages = files.comixPages;
    this.draft = {
      manifest: clone(files.manifest),
      levels: files.levels.map((l) => clone(l.spec)),
      dialogs: files.dialogs ? clone(files.dialogs) : undefined,
      comix: files.comix ? clone(files.comix) : undefined,
    };
    this.paths.set('manifest', 'chapter.manifest.json');
    if (files.dialogsPath) this.paths.set('dialogs', files.dialogsPath);
    if (files.comixPath) this.paths.set('comix', files.comixPath);
    files.levels.forEach((l) => this.paths.set(levelKey(l.spec.id), l.path));
    for (const e of this.entries()) {
      this.baseline.set(e.key, JSON.stringify(e.value));
      this.etags.set(e.key, files.etags[e.path] ?? '');
    }
  }

  get id(): string {
    return this.draft.manifest.id;
  }

  level(id: string): LevelSpec | undefined {
    return this.draft.levels.find((l) => l.id === id);
  }

  /** The draft as the game consumes it. */
  pack(): ChapterPack {
    return clone({ manifest: this.draft.manifest, levels: this.draft.levels, dialogs: this.draft.dialogs, comix: this.draft.comix });
  }

  entries(): FileEntry[] {
    const out: FileEntry[] = [{ key: 'manifest', path: this.paths.get('manifest')!, value: this.draft.manifest }];
    if (this.draft.dialogs && this.paths.has('dialogs')) out.push({ key: 'dialogs', path: this.paths.get('dialogs')!, value: this.draft.dialogs });
    if (this.draft.comix && this.paths.has('comix')) out.push({ key: 'comix', path: this.paths.get('comix')!, value: this.draft.comix });
    for (const l of this.draft.levels) {
      const path = this.paths.get(levelKey(l.id));
      if (path) out.push({ key: levelKey(l.id), path, value: l });
    }
    return out;
  }

  entry(key: FileKey): FileEntry | undefined {
    return this.entries().find((e) => e.key === key);
  }

  isDirty(key: FileKey): boolean {
    const e = this.entry(key);
    return e !== undefined && JSON.stringify(e.value) !== this.baseline.get(key);
  }

  dirtyKeys(): FileKey[] {
    return this.entries().filter((e) => JSON.stringify(e.value) !== this.baseline.get(e.key)).map((e) => e.key);
  }

  markSaved(key: FileKey, etag?: string): void {
    const e = this.entry(key);
    if (!e) return;
    this.baseline.set(key, JSON.stringify(e.value));
    if (etag) this.etags.set(key, etag);
  }

  /** Hash of the file as this editor last read or wrote it (the `baseEtag` of the next save). */
  etag(key: FileKey): string | undefined {
    return this.etags.get(key) || undefined;
  }

  /** Spec files whose hash on disk differs from what this editor last read or wrote. */
  changedOnDisk(disk: Record<string, string>): string[] {
    return this.entries().filter((e) => disk[e.path] !== undefined && this.etags.get(e.key) && disk[e.path] !== this.etags.get(e.key)).map((e) => e.path);
  }

  /** Throws the edits of one file away. */
  revert(key: FileKey): void {
    const text = this.baseline.get(key);
    if (text !== undefined) this.replace(key, JSON.parse(text) as unknown);
  }

  /** Swaps in a whole file (revert, or the raw JSON tab). */
  replace(key: FileKey, saved: unknown): void {
    if (key === 'manifest') this.draft.manifest = saved as ChapterManifest;
    else if (key === 'dialogs') this.draft.dialogs = saved as ChapterDialogs;
    else if (key === 'comix') this.draft.comix = saved as ComixStorySpec;
    else {
      const i = this.draft.levels.findIndex((l) => levelKey(l.id) === key);
      if (i >= 0) this.draft.levels[i] = saved as LevelSpec;
    }
  }

  /** Copies title, cwd, room, floor, mechanic and enemy types from each spec into the manifest's level summary. */
  syncSummaries(): void {
    for (const summary of this.draft.manifest.levels) {
      const spec = this.level(summary.id);
      if (!spec) continue;
      summary.title = spec.title;
      summary.cwd = spec.cwd;
      summary.roomKind = spec.roomKind;
      summary.floorTheme = spec.floorTheme;
      summary.mechanic = spec.mechanic;
      summary.enemies = [...new Set(spec.enemies.map((e) => e.type))];
    }
  }
}
