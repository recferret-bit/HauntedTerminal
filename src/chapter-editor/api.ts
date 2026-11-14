import type { ChapterDialogs, ChapterManifest, ComixStorySpec, LevelSpec } from '../chapters/types.js';
import { ConflictError, putEditorSpecFile, requestEditorJson, type EditorSaveResult } from '../editor-core/http.js';

export { ConflictError };

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

export interface LoadResult {
  /** False when the page runs without the dev API (a built site): the editor is read-only. */
  writable: boolean;
  chapters: ChapterFiles[];
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
    const live = await requestEditorJson<{ chapters: ChapterFiles[] }>('/api/chapters');
    return { writable: true, chapters: live.chapters };
  } catch {
    return loadCompiled();
  }
}

export type SaveResult = EditorSaveResult;

/** Writes one spec file. Throws `ConflictError` when `baseEtag` is no longer the file's hash on disk. */
export async function saveFile(slug: string, path: string, json: unknown, baseEtag: string | undefined): Promise<SaveResult> {
  return putEditorSpecFile<SaveResult>(
    `/api/chapters/${encodeURIComponent(slug)}/file`,
    path,
    json,
    baseEtag,
    'the file changed on disk',
  );
}

/** Current hash of every spec file on disk, to notice edits made outside the editor (an agent, git). */
export async function fetchChapterDiskState(slug: string): Promise<{ etags: Record<string, string>; slugs?: string[] }> {
  return requestEditorJson(`/api/chapters/${encodeURIComponent(slug)}/etags`);
}

export async function fetchEtags(slug: string): Promise<Record<string, string>> {
  return (await fetchChapterDiskState(slug)).etags;
}

export async function renderComix(slug: string): Promise<{ ok: boolean; log: string }> {
  return requestEditorJson(`/api/chapters/${encodeURIComponent(slug)}/render-comix`, { method: 'POST' });
}
