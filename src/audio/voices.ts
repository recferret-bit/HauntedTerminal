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
