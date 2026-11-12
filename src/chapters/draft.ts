import type { ChapterPack } from './types.js';

/**
 * Unsaved chapter edits travel from the chapter editor to the game through localStorage.
 * The game reads them only when the URL says `?draft=1`, so a stale draft never shadows the compiled chapter.
 */
const KEY = 'haunted.editor.draft:';

export function writeDraftPack(pack: ChapterPack): void {
  try {
    localStorage.setItem(KEY + pack.manifest.id, JSON.stringify(pack));
  } catch {
    /* storage blocked: the preview falls back to the compiled chapter */
  }
}

export function readDraftPack(chapterId: string): ChapterPack | null {
  try {
    const raw = localStorage.getItem(KEY + chapterId);
    if (!raw) return null;
    const pack = JSON.parse(raw) as Partial<ChapterPack>;
    // A stale or hand-edited draft must never take the game down: anything malformed is ignored.
    return pack.manifest?.id === chapterId && Array.isArray(pack.levels) && pack.levels.length > 0 ? (pack as ChapterPack) : null;
  } catch {
    return null;
  }
}

export function clearDraftPack(chapterId: string): void {
  try {
    localStorage.removeItem(KEY + chapterId);
  } catch {
    /* nothing to clear */
  }
}
