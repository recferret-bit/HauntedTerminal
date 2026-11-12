import { ModelCatalog, TextureCatalog } from '../../procgen/core/catalog.js';
import { MODEL_CATEGORIES } from '../../procgen/core/types.js';
import { FxCatalog } from '../../procgen/fx/catalog.js';
import type { LabOptions, TabId } from '../domain/options.js';

export interface GalleryItem {
  kind: 'model' | 'texture' | 'fx';
  id: string;
  label: string;
  category: string;
}

export const CATEGORY_ORDER: readonly string[] = MODEL_CATEGORIES;

function categoryRank(category: string): number {
  const i = CATEGORY_ORDER.indexOf(category);
  return i < 0 ? CATEGORY_ORDER.length : i;
}

export function modelItems(category: string): GalleryItem[] {
  return ModelCatalog.list()
    .filter((e) => category === 'all' || e.category === category)
    .map((e) => ({ kind: 'model' as const, id: e.id, label: e.label, category: e.category }))
    .sort((a, b) => categoryRank(a.category) - categoryRank(b.category));
}

export function textureItems(): GalleryItem[] {
  return TextureCatalog.list().map((e) => ({ kind: 'texture' as const, id: e.id, label: e.label, category: e.usage }));
}

export function fxItems(): GalleryItem[] {
  return FxCatalog.list()
    .map((p) => ({ kind: 'fx' as const, id: p.id, label: p.label, category: p.family }))
    .sort((a, b) => a.category.localeCompare(b.category));
}

/** The items of the tab the options select. */
export function itemsFor(opts: Pick<LabOptions, 'tab' | 'category'>): GalleryItem[] {
  if (opts.tab === 'textures') return textureItems();
  if (opts.tab === 'fx') return fxItems();
  return modelItems(opts.category);
}

export function tabCount(tab: TabId): number {
  if (tab === 'models') return ModelCatalog.list().length;
  return tab === 'textures' ? TextureCatalog.list().length : FxCatalog.list().length;
}

/** Model categories present in the catalog, in display order, with their model counts. */
export function modelCategories(): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const e of ModelCatalog.list()) counts.set(e.category, (counts.get(e.category) ?? 0) + 1);
  const known = CATEGORY_ORDER.filter((c) => counts.has(c));
  const extra = [...counts.keys()].filter((c) => !CATEGORY_ORDER.includes(c));
  return [...known, ...extra].map((name) => ({ name, count: counts.get(name)! }));
}

/** Which tab an id belongs to, or null when no catalog has it. */
export function tabOf(id: string): TabId | null {
  if (ModelCatalog.has(id)) return 'models';
  if (TextureCatalog.has(id)) return 'textures';
  return FxCatalog.has(id) ? 'fx' : null;
}
