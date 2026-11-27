import type { SfxId } from './catalog.js';

/**
 * A loop id that is a playlist of takes: one take plays through, then another one starts (never the same twice in
 * a row), so a long stay in the room does not repeat one 5 s clip. The ids are the manifest names of the takes.
 */
export const LOOP_TAKES: Partial<Record<SfxId, readonly SfxId[]>> = {};

/** A random take of `takes` that is not `last` (the only take when there is just one). */
export function pickTake(takes: readonly SfxId[], last: string | undefined): SfxId {
  const rest = takes.filter((t) => t !== last);
  const from = rest.length > 0 ? rest : takes;
  return from[Math.floor(Math.random() * from.length)] as SfxId;
}
