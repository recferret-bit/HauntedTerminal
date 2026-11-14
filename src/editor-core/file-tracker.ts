/**
 * Tracks relative file paths, canonical baseline snapshots (for comparison-based dirty checking),
 * and disk etags (for optimistic 409 conflict detection and external edit polling).
 */
export class FileBaselineTracker<K extends string = string> {
  private readonly paths = new Map<K, string>();
  private readonly baselines = new Map<K, string>();
  private readonly etags = new Map<string, string>();

  constructor(private readonly stringifyValue: (value: unknown) => string = (v) => JSON.stringify(v)) {}

  reset(): void {
    this.paths.clear();
    this.baselines.clear();
    this.etags.clear();
  }

  register(key: K, relPath: string, initialValue: unknown, etag?: string): void {
    this.paths.set(key, relPath);
    this.baselines.set(key, this.stringifyValue(initialValue));
    if (etag) this.etags.set(relPath, etag);
  }

  pathOf(key: K): string | undefined {
    return this.paths.get(key);
  }

  etagOf(key: K): string | undefined {
    const relPath = this.paths.get(key);
    return relPath ? this.etags.get(relPath) || undefined : undefined;
  }

  isDirty(key: K, currentValue: unknown): boolean {
    const base = this.baselines.get(key);
    if (base === undefined) return false;
    return this.stringifyValue(currentValue) !== base;
  }

  markSaved(key: K, savedValue: unknown, etag?: string): void {
    this.baselines.set(key, this.stringifyValue(savedValue));
    const relPath = this.paths.get(key);
    if (relPath && etag) this.etags.set(relPath, etag);
  }

  parseBaseline<T = unknown>(key: K): T | undefined {
    const text = this.baselines.get(key);
    return text !== undefined ? (JSON.parse(text) as T) : undefined;
  }

  /** Returns registered (or newly added/removed) paths whose disk etag differs from this editor's snapshot. */
  changedDiskPaths(diskEtags: Record<string, string>, includeAddedAndRemoved = false): string[] {
    const changed = new Set<string>();
    if (includeAddedAndRemoved) {
      for (const [relPath, hash] of Object.entries(diskEtags)) {
        if (this.etags.get(relPath) !== hash) changed.add(relPath);
      }
      for (const relPath of this.etags.keys()) {
        if (!(relPath in diskEtags)) changed.add(relPath);
      }
      return [...changed];
    }
    for (const relPath of this.paths.values()) {
      const known = this.etags.get(relPath);
      if (known && diskEtags[relPath] !== undefined && diskEtags[relPath] !== known) changed.add(relPath);
    }
    return [...changed];
  }
}

/** Shared base model for pack-structured spec editors (`ChapterModel`, `ComixModel`). */
export abstract class BasePackModel<K extends string, P extends { manifest: { id: string } }> {
  draft!: P;
  protected readonly tracker: FileBaselineTracker<K>;

  constructor(readonly slug: string, stringifyValue?: (value: unknown) => string) {
    this.tracker = new FileBaselineTracker<K>(stringifyValue);
  }

  get id(): string {
    return this.draft.manifest.id;
  }

  etag(key: K): string | undefined {
    return this.tracker.etagOf(key);
  }
}
