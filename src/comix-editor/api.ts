import { ConflictError } from '../chapter-editor/api.js';
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

async function callComixApi<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = (await res.json()) as T & { error?: string };
  if (res.status === 409) throw new ConflictError(data.error ?? 'comix file changed on disk');
  if (!res.ok) throw new Error(data.error ?? `${res.status} ${res.statusText}`);
  return data;
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
    return await callComixApi<ComixLoadResult>('/api/comix');
  } catch {
    return loadCompiledComixes();
  }
}

export async function saveComixFile(slug: string, relPath: string, payload: unknown, baseEtag?: string): Promise<ComixSaveResult> {
  const endpoint = `/api/comix/${encodeURIComponent(slug)}/file`;
  const reqBody = JSON.stringify({ path: relPath, json: payload, baseEtag });
  return callComixApi<ComixSaveResult>(endpoint, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: reqBody,
  });
}

export interface ComixDiskState {
  etags: Record<string, string>;
  slugs?: string[];
}

export async function fetchComixDiskState(slug: string): Promise<ComixDiskState> {
  const endpoint = `/api/comix/${encodeURIComponent(slug)}/etags`;
  return callComixApi<ComixDiskState>(endpoint);
}
