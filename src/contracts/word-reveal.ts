/**
 * Shared, layer-safe word-by-word dialog reveal primitive (`src/ui` + `src/renderer`).
 * Reserves the full final box size via a hidden ghost span so containers and balloon tails never jump.
 */
import { el } from './dom.js';

/** Default ms elapsed per revealed word (~8.3 words/s). */
export const WORD_REVEAL_STEP_MS = 120;
/** Minimum reading hold kept after the final word appears on gameplay-duration lines. */
export const MIN_POST_REVEAL_HOLD_MS = 900;

export interface WordRevealPlan {
  readonly stepMs: number;
  readonly holdMs: number;
  readonly revealMs: number;
}

export interface WordRevealHandle {
  readonly wordCount: number;
  showWords(count: number): void;
  atMs(elapsedMs: number, stepMs: number): void;
  showAll(): void;
}

/** Collects character end offsets for each non-whitespace word token so slices keep spaces and newlines exact. */
export function wordRevealEnds(text: string): number[] {
  const ends: number[] = [];
  for (const m of text.matchAll(/\S+/g)) {
    ends.push((m.index ?? 0) + m[0].length);
  }
  return ends;
}

/** Computes progressive reveal cadence and total hold duration for a word count and authored hold budget. */
export function planWordReveal(
  wordCount: number,
  holdMs: number,
  opts: { instant?: boolean; maxHoldMs?: number } = {},
): WordRevealPlan {
  const safeHold = Math.max(0, holdMs);
  if (opts.instant || wordCount <= 1 || safeHold === 0) {
    return { stepMs: 0, holdMs: safeHold, revealMs: 0 };
  }
  const gaps = wordCount - 1;
  if (safeHold < 1000) {
    const stepMs = Math.min(WORD_REVEAL_STEP_MS, Math.max(10, Math.floor((safeHold * 0.6) / gaps)));
    return { stepMs, holdMs: safeHold, revealMs: gaps * stepMs };
  }
  let stepMs = WORD_REVEAL_STEP_MS;
  if (opts.maxHoldMs !== undefined && opts.maxHoldMs > MIN_POST_REVEAL_HOLD_MS) {
    const maxReveal = opts.maxHoldMs - MIN_POST_REVEAL_HOLD_MS;
    if (gaps * stepMs > maxReveal) {
      stepMs = Math.max(12, Math.floor(maxReveal / gaps));
    }
  }
  const revealMs = gaps * stepMs;
  const minTotal = revealMs + MIN_POST_REVEAL_HOLD_MS;
  const totalHold = opts.maxHoldMs !== undefined
    ? Math.min(opts.maxHoldMs, Math.max(safeHold, minTotal))
    : Math.max(safeHold, minTotal);
  return { stepMs, holdMs: totalHold, revealMs };
}

/** Checks OS `prefers-reduced-motion: reduce` safely in both browser and headless Node environments. */
export function isReducedMotionPreferred(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? Boolean(window.matchMedia('(prefers-reduced-motion: reduce)')?.matches)
    : false;
}

/**
 * Mounts `.word-reveal-shown` and hidden `.word-reveal-ghost` inside `host`.
 * Setting `host.textContent = text` before `replaceChildren` keeps plain-property DOM stubs aligned with live DOM.
 */
export function mountWordReveal(host: HTMLElement, text: string): WordRevealHandle {
  const ends = wordRevealEnds(text);
  const shown = el('span', 'word-reveal-shown');
  const ghost = el('span', 'word-reveal-ghost');
  ghost.setAttribute('aria-hidden', 'true');
  ghost.style.visibility = 'hidden';
  host.textContent = text;
  host.replaceChildren(shown, ghost);

  let lastCount = -1;
  const showWords = (count: number): void => {
    const n = Math.max(0, Math.min(ends.length, Math.floor(count)));
    if (n === lastCount) return;
    lastCount = n;
    const cut = ends.length === 0 || n >= ends.length ? text.length : n <= 0 ? 0 : ends[n - 1]!;
    shown.textContent = text.slice(0, cut);
    ghost.textContent = text.slice(cut);
  };
  showWords(0);

  return {
    wordCount: ends.length,
    showWords,
    atMs(elapsedMs: number, stepMs: number): void {
      if (!Number.isFinite(elapsedMs) || stepMs <= 0) {
        showWords(ends.length);
        return;
      }
      showWords(1 + Math.floor(Math.max(0, elapsedMs) / stepMs));
    },
    showAll(): void {
      showWords(ends.length);
    },
  };
}
