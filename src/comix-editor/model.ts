import { stringifyComixJson } from './json.js';

export interface SpecFile {
  path: string;
  value: unknown;
  etag: string;
  /** Canonical text last loaded or saved. Dirty means the draft stringifies to something else. */
  saved: string;
}

export interface ComixSource {
  id: string;
  title: string;
  files: Array<{ path: string; json: unknown; etag: string }>;
}

function rank(path: string): number {
  if (path.startsWith('pages/')) return 4;
  const order = ['manifest.json', 'marks.json', 'cast.json', 'set.json', 'letters.json', 'beats.json', 'camera.json', 'poses.json', 'splash.json'];
  const index = order.indexOf(path);
  if (index === -1) return 200;
  return index < 4 ? index : index + 1;
}

/** One comix folder. Forms mutate `value` in place; dirty compares canonical JSON text. */
export class ComixModel {
  readonly id: string;
  readonly title: string;
  readonly files: SpecFile[];

  constructor(source: ComixSource) {
    this.id = source.id;
    this.title = source.title;
    this.files = source.files.map((file) => ({
      path: file.path,
      value: file.json,
      etag: file.etag,
      saved: stringifyComixJson(file.json),
    }));
    this.files.sort((a, b) => rank(a.path) - rank(b.path) || a.path.localeCompare(b.path));
  }

  file(path: string): SpecFile | undefined {
    return this.files.find((file) => file.path === path);
  }

  isDirty(path: string): boolean {
    const file = this.file(path);
    return file !== undefined && stringifyComixJson(file.value) !== file.saved;
  }

  dirtyPaths(): string[] {
    return this.files.filter((file) => this.isDirty(file.path)).map((file) => file.path);
  }

  markSaved(path: string, etag: string): void {
    const file = this.file(path);
    if (!file) return;
    file.etag = etag;
    file.saved = stringifyComixJson(file.value);
  }

  /** Paths whose hash on disk is no longer the one this editor loaded or wrote. */
  changedOnDisk(disk: Record<string, string>): string[] {
    return this.files.filter((file) => file.etag !== '' && disk[file.path] !== undefined && disk[file.path] !== file.etag).map((file) => file.path);
  }

  drafts(): Record<string, unknown> {
    return Object.fromEntries(this.files.map((file) => [file.path, file.value]));
  }
}
