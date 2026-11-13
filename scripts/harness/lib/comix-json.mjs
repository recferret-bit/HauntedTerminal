// Canonical JSON text for comix specs. The editor writes through this, so a save that changes
// nothing changes zero bytes. Keep in step with src/comix-editor/json.ts.
export function stringifyComixJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}
