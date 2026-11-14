/**
 * Declarative 3D Comix runtime (`src/cinematic/`).
 *
 * Plays any animated comix pack compiled from `comix/<slug>/` (or an unsaved editor draft from `localStorage`).
 * No comix, page, or scene is hardcoded here:
 *   - `playComix(id, host, opts, stats, debug)` plays any comix by slug and returns playback completion metadata.
 *   - `findComixByRole(role)` resolves playable sequences declaratively by manifest `role`.
 *
 * Preview / freeze-frame studio: `/cinematic.html?play=<slug>&t=<seconds>&muted=1`.
 */
import { suspendComicLight } from '../shaders/comic-material.js';
import { COMIX_MANIFESTS, findComixByRole, getComixPack } from './catalog.js';
import { readDraftComixPack } from './draft.js';
import { startComix, type ComixPlayResult, type DebugOptions } from './play-pack.js';
import type { ComixStats } from './reel.js';
import type { ComixRole } from './spec-types.js';

export { COMIX_MANIFESTS, findComixByRole, getComixPack };
export type { ComixPlayResult, ComixRole, ComixStats, DebugOptions };

export interface CinematicOptions {
  /** Allow Esc / Enter / SKIP button to skip. Default true. */
  skippable?: boolean;
  muted?: boolean;
}

/** Play any compiled (or draft) comix sequence by id inside `host`. */
export async function playComix(
  id: string,
  host: HTMLElement,
  opts: CinematicOptions = {},
  stats?: ComixStats,
  debug: DebugOptions = {},
): Promise<ComixPlayResult> {
  suspendComicLight(true);
  try {
    const pack = (debug.draft ? readDraftComixPack(id) : null) ?? getComixPack(id);
    return await startComix(host, pack, opts, debug, stats);
  } catch (err) {
    console.error(`[cinematic] comix "${id}" failed`, err);
    return { completed: false, finalTime: 0, showedOverlay: false };
  } finally {
    suspendComicLight(false);
  }
}
