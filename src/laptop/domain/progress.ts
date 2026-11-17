/** Which tasks are done and the code last written for each: plain data, saved as JSON by the UI. */
import type { CodeFiles } from './run.js';

export interface Progress {
  done: readonly string[];
  drafts: Readonly<Record<string, CodeFiles>>;
}

export const emptyProgress = (): Progress => ({ done: [], drafts: {} });

const isFiles = (v: unknown): v is CodeFiles =>
  !!v && typeof v === 'object' && ['html', 'css', 'js'].every((k) => typeof (v as Record<string, unknown>)[k] === 'string');

/** Reads saved progress; anything malformed is dropped, never thrown. */
export function parseProgress(raw: string | null): Progress {
  if (!raw) return emptyProgress();
  try {
    const v = JSON.parse(raw) as { done?: unknown; drafts?: unknown };
    const done = Array.isArray(v.done) ? v.done.filter((d): d is string => typeof d === 'string') : [];
    const drafts: Record<string, CodeFiles> = {};
    if (v.drafts && typeof v.drafts === 'object') {
      for (const [id, files] of Object.entries(v.drafts as Record<string, unknown>)) if (isFiles(files)) drafts[id] = files;
    }
    return { done, drafts };
  } catch {
    return emptyProgress();
  }
}

export function markDone(p: Progress, id: string): Progress {
  return p.done.includes(id) ? p : { ...p, done: [...p.done, id] };
}

export function saveDraft(p: Progress, id: string, files: CodeFiles): Progress {
  return { ...p, drafts: { ...p.drafts, [id]: files } };
}
