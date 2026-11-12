#!/usr/bin/env node
// Dummy run for newly created assets. Usage: node scripts/hooks/asset-dryrun.mjs <type>
// Reads the hook event JSON from stdin, reports the asset, and exits 0.
// Placeholder: replace the "would run" lines with real validators once src/procgen is ported.

const TYPES = {
  character: ['model-geometry-validator', 'procedural-animation-3d check-tags'],
  model: ['model-geometry-validator'],
  texture: ['procedural-texture-synthesis validate-textures'],
  effect: ['particle-effect-validator'],
};

const type = process.argv[2];
if (!TYPES[type]) {
  console.error(`asset-dryrun: unknown type "${type}" (expected: ${Object.keys(TYPES).join(', ')})`);
  process.exit(0);
}

let raw = '';
for await (const chunk of process.stdin) raw += chunk;

let file = '(unknown file)';
try {
  const event = JSON.parse(raw);
  const found = [];
  (function walk(v) {
    if (typeof v === 'string' && /\.(ts|png|glb|json)$/.test(v)) found.push(v);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  })(event);
  if (found.length) file = found[0];
} catch {
  // stdin was empty or not JSON; keep the placeholder name
}

console.log(`[dry-run] new ${type} asset: ${file}`);
for (const check of TYPES[type]) console.log(`[dry-run]   would run: ${check}`);
console.log('[dry-run] no checks executed (dummy hook).');
