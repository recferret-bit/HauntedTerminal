import { putEditorSpecFile, requestEditorJson } from '../editor-core/http.js';
import type { LabScript } from './lab-types.js';

/**
 * The repo side of the lab: `scripts/harness/terminal-lab/*.lab.json` through the dev-only `/api/terminal-lab`.
 * Without the dev server (a built site) every call degrades to "not writable" and the lab keeps working from the browser.
 */
export interface DiskLab {
  file: string;
  id: string;
  /** The document as found on disk; null when the file is not valid JSON (see `problem`). */
  json: unknown;
  etag: string;
  problem?: string;
}

export interface DiskState {
  /** False when the dev API is absent. */
  writable: boolean;
  labs: DiskLab[];
}

export const DEFAULT_LAB_DIR = 'scripts/harness/terminal-lab';

export async function loadDiskLabs(): Promise<DiskState> {
  try {
    const live = await requestEditorJson<{ labs: DiskLab[] }>('/api/terminal-lab');
    return { writable: true, labs: live.labs };
  } catch {
    return { writable: false, labs: [] };
  }
}

/** Writes `<id>.lab.json`. Throws `ConflictError` when the file changed (or already exists) and `baseEtag` is not its hash. */
export function saveDiskLab(
  script: LabScript,
  baseEtag: string | undefined,
): Promise<{ etag: string; created: boolean; path?: string }> {
  return putEditorSpecFile<{ etag: string; created: boolean; path?: string }>(
    '/api/terminal-lab/file',
    `${script.id}.lab.json`,
    script,
    baseEtag,
    'the lab changed in the repo',
  );
}

export async function fetchDiskEtags(): Promise<Record<string, string>> {
  return (await requestEditorJson<{ etags: Record<string, string> }>('/api/terminal-lab/etags')).etags;
}

export async function fetchDiskDir(): Promise<string> {
  try {
    return (await requestEditorJson<{ dir?: string }>('/api/terminal-lab/etags')).dir ?? DEFAULT_LAB_DIR;
  } catch {
    return DEFAULT_LAB_DIR;
  }
}
