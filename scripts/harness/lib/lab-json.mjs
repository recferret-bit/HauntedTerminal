// Canonical text of a Terminal Lab file (`scripts/harness/terminal-lab/<id>.lab.json`): 2-space JSON and a newline.
// The dev API writes through this, so a lab saved unchanged changes zero bytes. Keep in step with src/terminal-lab/store.ts.
export function stringifyLabJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}
