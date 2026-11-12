export interface ActiveTween {
  elapsed: number;
  durationMs: number;
  onUpdate: (t: number) => void;
  onComplete?: () => void;
}

export const easeOutBack = (x: number): number => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};

/** Comic motion: `t` cut into `steps` held poses (no in-betweens). */
export const stepped = (t: number, steps: number): number => {
  const k = Math.min(1, Math.max(0, t));
  return k >= 1 ? 1 : Math.floor(k * Math.max(1, steps)) / Math.max(1, steps);
};

/**
 * Tweens never throw out of `update`: a callback that throws is dropped and reported to `onError`,
 * and `clear()` from inside a callback (a room change mid-effect) is safe.
 */
export class TweenManager {
  private tweens: ActiveTween[] = [];
  onError: ((err: unknown) => void) | null = null;

  add(durationMs: number, onUpdate: (t: number) => void, onComplete?: () => void): void {
    this.tweens.push({ elapsed: 0, durationMs: Math.max(16, durationMs), onUpdate, onComplete });
  }

  /** Run `fn` after `ms`. Cancelled by `clear()`, unlike setTimeout. */
  delay(ms: number, fn: () => void): void {
    if (ms <= 0) {
      this.safe(fn);
      return;
    }
    this.add(ms, () => {}, fn);
  }

  clear(): void {
    this.tweens = [];
  }

  get size(): number {
    return this.tweens.length;
  }

  update(deltaMs: number): void {
    const list = this.tweens;
    for (let i = list.length - 1; i >= 0; i--) {
      const tw = list[i];
      if (!tw) continue;
      tw.elapsed += deltaMs;
      const raw = Math.min(1, tw.elapsed / tw.durationMs);
      let ok = this.safe(() => tw.onUpdate(raw));
      if (raw >= 1 || !ok) {
        const at = list.indexOf(tw);
        if (at >= 0) list.splice(at, 1);
        if (ok && tw.onComplete) ok = this.safe(tw.onComplete);
      }
      // clear() swapped the array: stop walking the stale one.
      if (list !== this.tweens) return;
      if (i > list.length) i = list.length;
    }
  }

  private safe(fn: () => void): boolean {
    try {
      fn();
      return true;
    } catch (err) {
      this.onError?.(err);
      return false;
    }
  }
}
