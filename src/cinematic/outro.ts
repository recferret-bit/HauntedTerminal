import type { OutroStats } from './index.js';
import { loadComixPack } from './load-pack.js';
import { startComix } from './play-pack.js';
import type { DebugOptions } from './reel.js';

/**
 * The ending, played from `comix/outro`. Without WebGL the splash card still shows.
 * Skip jumps along the manifest rules; a key after `acceptsKeyFrom` resolves the splash.
 */
export function startOutro(
  host: HTMLElement,
  stats: OutroStats,
  opts: { skippable?: boolean; muted?: boolean } = {},
  debug: DebugOptions = {},
): Promise<void> {
  return startComix(host, loadComixPack('outro', !!debug.draft), opts, debug, stats);
}
