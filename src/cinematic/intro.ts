import { loadComixPack } from './load-pack.js';
import { startComix } from './play-pack.js';
import type { DebugOptions } from './reel.js';

export type { DebugOptions };

/**
 * The opening, played from `comix/intro`. Skips at once when WebGL is missing.
 * Esc / Enter / click resolves immediately (`skip: "end"`). Input in the first
 * `inputGraceMs` is ignored.
 */
export function startIntro(host: HTMLElement, opts: { skippable?: boolean; muted?: boolean } = {}, debug: DebugOptions = {}): Promise<void> {
  return startComix(host, loadComixPack('intro', !!debug.draft), opts, debug);
}
