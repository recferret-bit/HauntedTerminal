import type { ComixPack } from './spec-types.js';

export const COMIX_DRAFT_KEY = 'ht-comix-draft';

export function writeDraftComixPack(pack: ComixPack): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(COMIX_DRAFT_KEY, JSON.stringify(pack));
  } catch {
    /* private mode or quota full */
  }
}

export function readDraftComixPack(id: string): ComixPack | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(COMIX_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ComixPack> | null;
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.manifest?.id !== id || !Array.isArray(parsed.pages)) return null;
    return parsed as ComixPack;
  } catch {
    return null;
  }
}
