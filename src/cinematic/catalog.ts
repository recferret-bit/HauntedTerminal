import { GENERATED_COMIX_MANIFESTS, GENERATED_COMIX_PAGES_BY_ID } from './generated/catalog-data.js';
import type * as GeneratedComixMod from './generated/catalog-data.js';
import type { ComixManifest, ComixPack, ComixPageSpec, ComixRole } from './spec-types.js';

const manifests: ComixManifest[] = [...GENERATED_COMIX_MANIFESTS];
let pagesById: Record<string, ComixPageSpec[]> = GENERATED_COMIX_PAGES_BY_ID;

export const COMIX_MANIFESTS: readonly ComixManifest[] = manifests;

if (import.meta.hot) {
  import.meta.hot.accept('./generated/catalog-data.js', (next) => {
    if (!next) return;
    const mod = next as unknown as typeof GeneratedComixMod;
    manifests.splice(0, manifests.length, ...mod.GENERATED_COMIX_MANIFESTS);
    pagesById = mod.GENERATED_COMIX_PAGES_BY_ID;
  });
}

function getComixManifest(id: string): ComixManifest | undefined {
  return COMIX_MANIFESTS.find((m) => m.id === id);
}

export function findComixByRole(role: ComixRole): ComixManifest | undefined {
  return COMIX_MANIFESTS.find((m) => m.status === 'playable' && m.role === role);
}

export function getComixPages(id: string): ComixPageSpec[] {
  return pagesById[id] ?? [];
}

export function getComixPack(id: string): ComixPack {
  const manifest = getComixManifest(id);
  if (!manifest) throw new Error(`unknown comix "${id}"`);
  const pages = [...getComixPages(id)].sort((a, b) => a.index - b.index);
  return { manifest, pages };
}

export function listComixPacks(): ComixPack[] {
  return COMIX_MANIFESTS.map((m) => getComixPack(m.id));
}
