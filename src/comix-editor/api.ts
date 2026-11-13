import { ConflictError } from '../chapter-editor/api.js';
import { bundledComixes } from './data/bundled.js';
import type { ComixSource } from './model.js';

export { ConflictError };

export interface LoadResult {
  writable: boolean;
  comixes: ComixSource[];
}

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? `${res.status} ${res.statusText}`;
  } catch {
    return `${res.status} ${res.statusText}`;
  }
}

/** Live specs from the dev API, or the bundled JSON when that API 404s. */
export async function loadComixes(): Promise<LoadResult> {
  try {
    const res = await fetch('/api/comix');
    if (res.status === 404) return { writable: false, comixes: bundledComixes() };
    if (!res.ok) throw new Error(await readError(res));
    const body = (await res.json()) as { comixes?: ComixSource[] };
    return { writable: true, comixes: body.comixes ?? [] };
  } catch (err) {
    if (err instanceof TypeError) return { writable: false, comixes: bundledComixes() };
    throw err;
  }
}

export async function saveComixFile(id: string, path: string, json: unknown, baseEtag: string): Promise<{ etag: string }> {
  const res = await fetch(`/api/comix/${encodeURIComponent(id)}/file`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path, json, baseEtag }),
  });
  if (res.status === 409) throw new ConflictError(await readError(res));
  if (!res.ok) throw new Error(await readError(res));
  const body = (await res.json()) as { etag?: string };
  return { etag: body.etag ?? '' };
}

export async function fetchComixEtags(id: string): Promise<Record<string, string>> {
  const res = await fetch(`/api/comix/${encodeURIComponent(id)}/etags`);
  if (!res.ok) throw new Error(await readError(res));
  const body = (await res.json()) as { etags?: Record<string, string> };
  return body.etags ?? {};
}
