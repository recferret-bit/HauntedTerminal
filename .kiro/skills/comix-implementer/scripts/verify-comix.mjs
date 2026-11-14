#!/usr/bin/env node
// Master QA gate for comix-implementer:
//   1. Validates connected comix/<slug>/ specs and folder cleanliness
//   2. Verifies src/cinematic/generated/catalog-data.ts is in sync and passes 60fps simulation
//   3. Runs the declarative architecture gate (no hardcoded comix/page/level IDs in src/)
//   4. Runs comix-architect-intake and comix-sequence-generator self-tests
//   5. Verifies Kiro Comix specs exist and guard-chapter-files hook enforces generated/vocabulary rules
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs, projectRoot } from '../../../../scripts/harness/lib/load.mjs';

const args = parseArgs(process.argv.slice(2), ['--comix']);
const filterComix = args.val('--comix', '');

function runNode(relScript, extraArgs = []) {
  const full = resolve(projectRoot, relScript);
  const out = execFileSync(process.execPath, [full, ...extraArgs], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
  process.stdout.write(out);
}

console.log('=== [1/5] Validating connected comix specs ===');
runNode('.kiro/skills/comix-architect-intake/scripts/validate-comix-specs.mjs', filterComix ? ['--comix', filterComix] : []);

console.log('=== [2/5] Checking compiled catalog sync & 60fps timeline simulation ===');
runNode('scripts/harness/generate-comix.mjs', ['--check']);
runNode('scripts/harness/generate-comix.mjs', ['--verify', ...(filterComix ? ['--comix', filterComix] : [])]);

console.log('=== [3/5] Checking declarative runtime gate ===');
runNode('scripts/quality/check-declarative.mjs');

console.log('=== [4/5] Running Comix skill self-tests ===');
runNode('.kiro/skills/comix-architect-intake/scripts/self-test.mjs');
runNode('.kiro/skills/comix-sequence-generator/scripts/self-test.mjs');

console.log('=== [5/5] Verifying Kiro Comix specs & guard hooks ===');
for (const specDir of ['declarative-comix-runtime', 'comix-editor']) {
  for (const doc of ['requirements.md', 'design.md', 'tasks.md']) {
    const p = resolve(projectRoot, `.kiro/specs/${specDir}/${doc}`);
    if (!existsSync(p)) throw new Error(`Missing Kiro Comix spec file: ${p}`);
  }
}
const guardScript = resolve(projectRoot, 'scripts/hooks/guard-chapter-files.mjs');
const genGuard = spawnSync(process.execPath, [guardScript], {
  cwd: projectRoot,
  input: JSON.stringify({ tool_input: { file_path: 'src/cinematic/generated/catalog-data.ts' } }),
  encoding: 'utf8',
});
if (genGuard.status !== 2) {
  throw new Error(`Expected guard hook exit 2 on src/cinematic/generated/catalog-data.ts, got ${genGuard.status}`);
}
const vocabGuard = spawnSync(process.execPath, [guardScript], {
  cwd: projectRoot,
  input: JSON.stringify({ tool_input: { file_path: 'src/cinematic/spec-types.ts' } }),
  encoding: 'utf8',
});
const vocabDecision = JSON.parse(vocabGuard.stdout || '{}')?.hookSpecificOutput?.permissionDecision;
if (vocabGuard.status !== 0 || vocabDecision !== 'ask') {
  throw new Error(`Expected guard hook ask on src/cinematic/spec-types.ts, got status=${vocabGuard.status} decision=${vocabDecision}`);
}
console.log('Kiro specs & guard-chapter-files hook verified OK.');

console.log(`=== comix-implementer verification PASS${filterComix ? ` (${filterComix})` : ''} ===`);
