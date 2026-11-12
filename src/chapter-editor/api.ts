import type { ChapterDialogs, ChapterManifest, ComixStorySpec, LevelSpec } from '../chapters/types.js';

/** One chapter folder as the dev API returns it (paths are relative to the chapter folder). */
export interface ChapterFiles {
  slug: string;
  manifest: ChapterManifest;
  levels: Array<{ path: string; spec: LevelSpec }>;
  dialogs?: ChapterDialogs;
  dialogsPath?: string;
  comix?: ComixStorySpec;
  comixPath?: string;
  comixPages: string[];
  /** Hash of each spec file (by chapter-relative path) as it was on disk when this was read. */
  etags: Record<string, string>;
}

/** The file on disk is no longer the one the editor loaded. */
export class ConflictError extends Error {}

export interface LoadResult {
  /** False when the page runs without the dev API (a built site): the editor is read-only. */
  writable: boolean;
  chapters: ChapterFiles[];
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = (await res.json()) as T & { error?: string };
  if (res.status === 409) throw new ConflictError(body.error ?? 'the file changed on disk');
  if (!res.ok) throw new Error(body.error ?? `${res.status} ${res.statusText}`);
  return body;
}

/** From the compiled catalog, for builds that have no dev API. */
async function loadCompiled(): Promise<LoadResult> {
  const catalog = await import('../chapters/catalog.js');
  const chapters = catalog.CHAPTER_MANIFESTS.map((manifest): ChapterFiles => ({
    slug: manifest.id,
    manifest: structuredClone(manifest),
    levels: catalog.getChapterLevels(manifest.id).map((spec) => ({
      path: manifest.levels.find((l) => l.id === spec.id)?.specPath ?? `levels/${spec.id}/level.spec.json`,
      spec: structuredClone(spec),
    })),
    dialogs: structuredClone(catalog.getChapterDialogs(manifest.id)),
    dialogsPath: manifest.comix?.dialogsPath,
    comix: structuredClone(catalog.getChapterComix(manifest.id)),
    comixPath: manifest.comix?.specPath,
    comixPages: [],
    etags: {},
  }));
  return { writable: false, chapters };
}

export async function loadChapters(): Promise<LoadResult> {
  try {
    const live = await request<{ chapters: ChapterFiles[] }>('/api/chapters');
    return { writable: true, chapters: live.chapters };
  } catch {
    return loadCompiled();
  }
}

export interface SaveResult {
  regenerated: boolean;
  /** Hash of the file just written: the base for the next save. */
  etag: string;
  warning?: string;
}

/** Writes one spec file. Throws `ConflictError` when `baseEtag` is no longer the file's hash on disk. */
export async function saveFile(slug: string, path: string, json: unknown, baseEtag: string | undefined): Promise<SaveResult> {
  return request(`/api/chapters/${encodeURIComponent(slug)}/file`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path, json, baseEtag }),
  });
}

/** Current hash of every spec file on disk, to notice edits made outside the editor (an agent, git). */
export async function fetchEtags(slug: string): Promise<Record<string, string>> {
  return (await request<{ etags: Record<string, string> }>(`/api/chapters/${encodeURIComponent(slug)}/etags`)).etags;
}

export async function renderComix(slug: string): Promise<{ ok: boolean; log: string }> {
  return request(`/api/chapters/${encodeURIComponent(slug)}/render-comix`, { method: 'POST' });
}
