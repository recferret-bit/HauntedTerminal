#!/usr/bin/env node
// Report-only check for a newly created asset file. Usage: node scripts/hooks/asset-dryrun.mjs <model|character|texture|effect>
// Reads the hook event JSON from stdin (if any) for the file name, prints the validators of that asset kind, runs them
// (each takes 1-4 s: model ~4 s, anim tags ~1 s, textures ~1 s, effects ~1 s) and prints a summary. Always exits 0:
// the blocking gates are the validators themselves and `npm run quality:fingerprint`.
import { spawnSync } from 'node:child_process';

const MODEL = 'node .kiro/skills/model-geometry-validator/scripts/validate-model.mjs --all --strict';
const ANIM = 'node .kiro/skills/procedural-animation-3d/scripts/check-tags.mjs --all';
const TYPES = {
  model: [MODEL, ANIM],
  character: [MODEL, ANIM],
  texture: ['node .kiro/skills/procedural-texture-synthesis/scripts/validate-textures.mjs --all'],
  effect: ['node .kiro/skills/particle-effect-validator/scripts/validate-particles.mjs --all'],
};
const STEP_TIMEOUT_MS = 15_000;
const TAIL_LINES = 40;

const type = process.argv[2];
if (!Object.hasOwn(TYPES, type)) {
  console.log(`asset-dryrun: unknown type "${type}" (expected: ${Object.keys(TYPES).join(', ')})`);
  process.exit(0);
}

let raw = '';
if (!process.stdin.isTTY) for await (const chunk of process.stdin) raw += chunk;

let file = '(unknown file)';
try {
  const event = JSON.parse(raw);
  const input = event?.tool_input ?? event;
  const named = [input?.path, input?.file_path, input?.filePath].find((p) => typeof p === 'string' && p);
  if (named) file = named;
} catch {
  // stdin was empty or not JSON; keep the placeholder name
}

console.log(`[asset-check] new ${type} asset: ${file}`);
console.log(`[asset-check] validators: ${TYPES[type].join('  ;  ')}`);
let failed = 0;
for (const cmd of TYPES[type]) {
  const [, ...args] = cmd.split(' ');
  const started = Date.now();
  const res = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: STEP_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 });
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  const lines = `${res.stdout ?? ''}${res.stderr ?? ''}`.trimEnd().split('\n');
  if (res.status === 0) {
    console.log(`[asset-check] ok (${secs} s): ${cmd}\n  ${lines.at(-1)}`);
    continue;
  }
  failed += 1;
  const why = res.error ? res.error.message : `exit ${res.status ?? res.signal}`;
  console.log(lines.slice(-TAIL_LINES).join('\n'));
  console.log(`[asset-check] FAILED (report-only, ${why}, ${secs} s): run ${cmd}`);
}
console.log(failed ? `[asset-check] ${failed} validator(s) FAILED (report-only).` : '[asset-check] all validators passed.');
process.exit(0);
