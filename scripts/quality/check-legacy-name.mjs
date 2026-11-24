#!/usr/bin/env node
// Legacy name gate (npm run quality:legacy-name): the project is "Out Of Credits". The old name may appear
// only where the migration and legacy save import need it (ALLOWED) and in git history.
// Spec: .kiro/specs/rename-out-of-credits/ (Req 11).
//   node scripts/quality/check-legacy-name.mjs [--count]
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';

const BINARY_EXT = /\.(png|jpe?g|webp|gif|ico|glb|gltf|woff2?|ttf|otf|bin|mp3|wav|ogg|lock)$/i;
const OLD_NAME_RX = /haunted[\s_-]*terminal/i;
// Files that name the old project on purpose: the migration, the legacy save importer, their tests, this gate, the spec.
const ALLOWED = [
  'scripts/quality/check-legacy-name.mjs',
  '.kiro/specs/rename-out-of-credits/',
  'src/contracts/legacy-keys.ts',
  'src/contracts/brand.ts',
  'scripts/harness/legacy-keys-unit.mjs',
  'scripts/desktop/steam-bridge-rs-template.mjs',
  'scripts/desktop/landing-smoke.mjs',
  'scripts/harness/props/chapters.mjs',
  '.kiro/specs/agent-team/tasks.md', // the user's Crew workspace is still called `hauntedterminal` until they rename it
  'docs/AGENTS_CREW.md',
  'src/chapters/portable-save.ts',
  'src/chapters/steam-bridge.ts',
];

function trackedFiles() {
  const out = execFileSync('git', ['ls-files', '-co', '--exclude-standard'], { encoding: 'utf8', maxBuffer: 1 << 26 });
  return out.split('\n').filter(Boolean);
}

export function findLegacyNames(files = trackedFiles()) {
  const hits = [];
  for (const rel of files) {
    if (BINARY_EXT.test(rel) || ALLOWED.some((a) => rel === a || (a.endsWith('/') && rel.startsWith(a)))) continue;
    let text;
    try {
      if (!statSync(rel).isFile()) continue;
      text = readFileSync(rel, 'utf8');
    } catch {
      continue;
    }
    text.split('\n').forEach((line, i) => {
      if (OLD_NAME_RX.test(line)) hits.push(`${rel}:${i + 1}`);
    });
  }
  return hits;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const hits = findLegacyNames();
  if (process.argv.includes('--count')) {
    console.log(`${hits.length} lines in ${new Set(hits.map((h) => h.split(':')[0])).size} files`);
  } else if (hits.length) {
    console.error(`legacy name gate FAILED: ${hits.length} lines still name the old project`);
    for (const h of hits.slice(0, 40)) console.error('  ' + h);
    process.exit(1);
  } else {
    console.log('legacy name gate OK');
  }
}
