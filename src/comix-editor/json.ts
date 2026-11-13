/** Canonical comix JSON. Matches `scripts/harness/lib/comix-json.mjs`: a no-op save changes zero bytes. */
export function stringifyComixJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
