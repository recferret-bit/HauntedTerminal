import type { ModelCategory, ModelEntry, ModelSpec, PixelBuffer, TextureEntry } from './types.js';

class Catalog<E extends { id: string }> {
  private readonly entries = new Map<string, E>();

  constructor(private readonly noun: string) {}

  register(entry: E): E {
    if (this.entries.has(entry.id)) throw new Error(`${this.noun} "${entry.id}" is registered twice`);
    this.entries.set(entry.id, entry);
    return entry;
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  get(id: string): E {
    const entry = this.entries.get(id);
    if (!entry) throw new Error(`unknown ${this.noun} "${id}"`);
    return entry;
  }

  all(): E[] {
    return [...this.entries.values()];
  }
}

class ModelCatalogImpl extends Catalog<ModelEntry> {
  constructor() {
    super('model');
  }

  list(category?: ModelCategory): ModelEntry[] {
    return this.all().filter((e) => !category || e.category === category);
  }

  build(id: string, seed = 1): ModelSpec {
    const entry = this.get(id);
    const spec = entry.build(seed);
    if (spec.id !== id) throw new Error(`model "${id}" built a spec with id "${spec.id}"`);
    return spec;
  }
}

class TextureCatalogImpl extends Catalog<TextureEntry> {
  private readonly cache = new Map<string, PixelBuffer>();

  constructor() {
    super('texture');
  }

  list(): TextureEntry[] {
    return this.all();
  }

  /** Cached per (id, seed): generators are deterministic. */
  build(id: string, seed = 1): PixelBuffer {
    const key = `${id}#${seed}`;
    let buf = this.cache.get(key);
    if (!buf) {
      buf = this.get(id).build(seed);
      this.cache.set(key, buf);
    }
    return buf;
  }
}

export const ModelCatalog = new ModelCatalogImpl();
export const TextureCatalog = new TextureCatalogImpl();
