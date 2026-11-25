/** Index of a free slot, or the slot that started earliest. `startedAt` uses -1 for a free slot. */
export function pickSlot(startedAt: readonly number[]): number {
  let free = -1;
  let oldest = 0;
  for (let i = 0; i < startedAt.length; i++) {
    const at = startedAt[i] ?? -1;
    if (at < 0) return i;
    if (free < 0) free = i;
    if (at < (startedAt[oldest] ?? 0)) oldest = i;
  }
  return free < 0 ? 0 : oldest;
}

/**
 * Pick a voice slot with a per-group cap: when `wantTag` is true and at least `tagCap` active
 * slots already carry that tag, reuse the oldest tagged slot so that group never exceeds `tagCap`
 * simultaneous voices. Otherwise fall back to `pickSlot(startedAt)`.
 */
export function pickCappedSlot(
  startedAt: readonly number[],
  tagged: readonly boolean[],
  wantTag: boolean,
  tagCap: number,
): number {
  if (wantTag && tagCap > 0) {
    let activeTagged = 0;
    let oldestTagged = -1;
    for (let i = 0; i < startedAt.length; i++) {
      const at = startedAt[i] ?? -1;
      if (at < 0 || !tagged[i]) continue;
      activeTagged += 1;
      if (oldestTagged < 0 || at < (startedAt[oldestTagged] ?? 0)) oldestTagged = i;
    }
    if (activeTagged >= tagCap && oldestTagged >= 0) return oldestTagged;
  }
  return pickSlot(startedAt);
}
