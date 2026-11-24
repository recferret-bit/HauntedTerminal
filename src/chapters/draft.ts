import { isRec } from './record.js';
import type { ChapterPack } from './types.js';

function isValidDraftLevel(v: unknown): boolean {
  return (
    isRec(v) &&
    typeof v.id === 'string' &&
    v.id.length > 0 &&
    typeof v.cwd === 'string' &&
    Array.isArray(v.files) &&
    Array.isArray(v.enemies) &&
    Array.isArray(v.pickups) &&
    Array.isArray(v.winRules) &&
    Array.isArray(v.solutionCommands)
  );
}

/**
 * Unsaved chapter edits travel from the chapter editor to the game through localStorage.
 * The game reads them only when the URL says `?draft=1`, so a stale draft never shadows the compiled chapter.
 */
const KEY = 'credits.editor.draft:';

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
    return isRec(pack) &&
      isRec(pack.manifest) &&
      pack.manifest.id === chapterId &&
      Array.isArray(pack.levels) &&
      pack.levels.length > 0 &&
      pack.levels.every(isValidDraftLevel)
      ? (pack as unknown as ChapterPack)
      : null;
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
