import { ConflictError, putEditorSpecFile, requestEditorJson } from '../editor-core/http.js';
import type { ComixManifest, ComixPageSpec } from '../cinematic/spec-types.js';

export { ConflictError };

export interface ComixFiles {
  slug: string;
  manifest: ComixManifest;
  pages: Array<{ path: string; spec: ComixPageSpec }>;
  etags: Record<string, string>;
}

export interface ComixLoadResult {
  writable: boolean;
  comixes: ComixFiles[];
}

export interface ComixSaveResult {
  regenerated: boolean;
  etag: string;
  warning?: string;
}

async function loadCompiledComixes(): Promise<ComixLoadResult> {
  const catalog = await import('../cinematic/catalog.js');
  const comixes: ComixFiles[] = catalog.COMIX_MANIFESTS.map((m) => ({
    slug: m.id,
    manifest: structuredClone(m),
    pages: catalog.getComixPages(m.id)
      .map((spec) => ({
        path: m.pages.find((s) => s.id === spec.id)?.specPath ?? `pages/${spec.id}/page.spec.json`,
        spec: structuredClone(spec),
      }))
      .sort((a, b) => a.spec.index - b.spec.index),
    etags: {},
  }));
  return { writable: false, comixes };
}

export async function loadComixes(): Promise<ComixLoadResult> {
  try {
    return await requestEditorJson<ComixLoadResult>('/api/comix');
  } catch {
    return loadCompiledComixes();
  }
}

export async function saveComixFile(slug: string, relPath: string, payload: unknown, baseEtag?: string): Promise<ComixSaveResult> {
  const endpoint = `/api/comix/${encodeURIComponent(slug)}/file`;
  return putEditorSpecFile<ComixSaveResult>(endpoint, relPath, payload, baseEtag, 'comix file changed on disk');
}

export interface ComixDiskState {
  etags: Record<string, string>;
  slugs?: string[];
}

export async function fetchComixDiskState(slug: string): Promise<ComixDiskState> {
  const endpoint = `/api/comix/${encodeURIComponent(slug)}/etags`;
  return requestEditorJson<ComixDiskState>(endpoint);
}
