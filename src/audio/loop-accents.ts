import type { SfxId } from './catalog.js';
import type { LoopAccentSpec } from './config.js';
import { pickTake } from './loop-takes.js';

export interface AccentHandle {
  stop(): void;
}

export interface AccentPlayer {
  spec: LoopAccentSpec;
  play(cue: SfxId, gain: number, rate: number): void;
  still(): boolean;
}

/** Random delay in `[lo, hi]` ms (clamped to >= 50 ms). */
export function pickAccentDelay(minMs: number, maxMs: number, rng: () => number = Math.random): number {
  const lo = Math.max(50, minMs);
  const hi = Math.max(lo, maxMs);
  return Math.round(lo + rng() * (hi - lo));
}

/** Schedules random-interval ambient one-shot accents while an ambient loop is active. */
export function startLoopAccents(opts: AccentPlayer, rng: () => number = Math.random): AccentHandle {
  const { spec, play, still } = opts;
  let timer: ReturnType<typeof globalThis.setTimeout> | null = null;
  let stopped = false;
  let last: SfxId | undefined;

  const schedule = (first: boolean): void => {
    if (stopped || !still() || spec.cues.length === 0) return;
    const minMs = first ? Math.round(spec.minIntervalMs * 0.5) : spec.minIntervalMs;
    const maxMs = first ? Math.round(spec.maxIntervalMs * 0.6) : spec.maxIntervalMs;
    const delay = pickAccentDelay(minMs, maxMs, rng);
    timer = globalThis.setTimeout(() => {
      timer = null;
      if (stopped || !still()) return;
      const cue = pickTake(spec.cues, last);
      last = cue;
      const rate = 1 + (rng() * 2 - 1) * spec.rateJitter;
      play(cue, spec.gain, rate);
      schedule(false);
    }, delay);
  };

  schedule(true);

  return {
    stop() {
      stopped = true;
      if (timer !== null) globalThis.clearTimeout(timer);
      timer = null;
    },
  };
}
