import { ModelCatalog } from '../../procgen/core/catalog.js';
import { type GalleryItem, tabOf } from './catalog-items.js';
import { buildFxSubject } from './fx-subject.js';
import { buildModelSubject } from './model-subject.js';
import { buildTextureSubject } from './texture-subject.js';
import type { Subject, SubjectOptions } from './types.js';

export type { Subject, SubjectInfo, SubjectOptions } from './types.js';

export function buildItemSubject(item: Pick<GalleryItem, 'kind' | 'id'>, opts: SubjectOptions): Subject {
  if (item.kind === 'model') return buildModelSubject(item.id, opts);
  if (item.kind === 'fx') return buildFxSubject(item.id, opts);
  return buildTextureSubject(item.id, opts);
}

/** Build whatever catalog entry has this id. An unknown id or a spec that throws becomes an error message, not an exception. */
export function buildSubjectById(id: string, opts: SubjectOptions): { subject: Subject | null; error: string | null } {
  const tab = tabOf(id);
  if (!tab) {
    const models = ModelCatalog.list().map((e) => e.id).join(', ') || '(no models)';
    return { subject: null, error: `"${id}" is not in ModelCatalog, TextureCatalog or FxCatalog. Registered models: ${models}` };
  }
  const kind = tab === 'models' ? 'model' : tab === 'textures' ? 'texture' : 'fx';
  try {
    return { subject: buildItemSubject({ kind, id }, opts), error: null };
  } catch (err) {
    return { subject: null, error: err instanceof Error ? err.message : String(err) };
  }
}
