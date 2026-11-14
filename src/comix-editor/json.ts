/** Canonical JSON text for comix specs (must match `scripts/harness/lib/comix-json.mjs`). */
export function stringifyComixJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
