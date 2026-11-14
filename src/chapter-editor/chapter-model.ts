import type { ChapterDialogs, ChapterManifest, ChapterPack, ComixStorySpec, LevelSpec } from '../chapters/types.js';
import { clone } from '../editor-core/dom.js';
import { BasePackModel } from '../editor-core/file-tracker.js';
import type { ChapterFiles } from './api.js';

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
 * The editable copy of one chapter. `draft` is what the forms change; `tracker` holds canonical baselines
 * and disk etags so "dirty" is a comparison, not a flag someone has to remember to set.
 */
export class ChapterModel extends BasePackModel<FileKey, ChapterPack> {
  comixPages: string[] = [];
  private readonly paths = new Map<FileKey, string>();

  constructor(files: ChapterFiles) {
    super(files.slug);
    this.reloadFrom(files);
  }

  level(id: string): LevelSpec | undefined {
    return this.draft.levels.find((l) => l.id === id);
  }

  /** The draft as the game consumes it. */
  pack(): ChapterPack {
    return clone({
      manifest: this.draft.manifest,
      levels: this.draft.levels,
      dialogs: this.draft.dialogs,
      comix: this.draft.comix,
    });
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
    return e !== undefined && this.tracker.isDirty(key, e.value);
  }

  dirtyKeys(): FileKey[] {
    return this.entries().filter((e) => this.tracker.isDirty(e.key, e.value)).map((e) => e.key);
  }

  markSaved(key: FileKey, etag?: string): void {
    const e = this.entry(key);
    if (e) this.tracker.markSaved(key, e.value, etag);
  }

  /** Spec files whose hash on disk differs from what this editor last read or wrote. */
  changedOnDisk(disk: Record<string, string>): string[] {
    return this.tracker.changedDiskPaths(disk, true);
  }

  /** Throws the edits of one file away. */
  revert(key: FileKey): void {
    const orig = this.tracker.parseBaseline(key);
    if (orig !== undefined) this.replace(key, orig);
  }

  /** Swaps in a whole file (revert, or the raw JSON tab). */
  replace(key: FileKey, saved: unknown): void {
    if (key === 'manifest') {
      this.draft.manifest = { ...(saved as ChapterManifest), id: this.draft.manifest.id };
    } else if (key === 'dialogs') {
      this.draft.dialogs = saved as ChapterDialogs;
    } else if (key === 'comix') {
      this.draft.comix = saved as ComixStorySpec;
    } else {
      const i = this.draft.levels.findIndex((l) => levelKey(l.id) === key);
      if (i >= 0) {
        const prev = this.draft.levels[i]!;
        this.draft.levels[i] = { ...(saved as LevelSpec), id: prev.id, index: prev.index };
      }
    }
  }

  /** Replaces the entire chapter snapshot and baselines with a fresh disk payload. */
  reloadFrom(files: ChapterFiles): void {
    this.comixPages = [...files.comixPages];
    this.draft = {
      manifest: clone(files.manifest),
      levels: files.levels.map((l) => clone(l.spec)),
      dialogs: files.dialogs ? clone(files.dialogs) : undefined,
      comix: files.comix ? clone(files.comix) : undefined,
    };
    this.paths.clear();
    this.paths.set('manifest', 'chapter.manifest.json');
    if (files.dialogsPath) this.paths.set('dialogs', files.dialogsPath);
    if (files.comixPath) this.paths.set('comix', files.comixPath);
    files.levels.forEach((l) => this.paths.set(levelKey(l.spec.id), l.path));
    this.tracker.reset();
    for (const e of this.entries()) {
      this.tracker.register(e.key, e.path, e.value, files.etags[e.path]);
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
