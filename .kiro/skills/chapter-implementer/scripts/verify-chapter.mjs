#!/usr/bin/env node
// End-to-end verification gate for chapter-implementer:
// Runs spec validation, generated catalog sync check, Comix PNG existence checks,
// all 3 skill self-tests, and a full 0-death headless playthrough under --ticks 3.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs, projectRoot } from '../../../../scripts/harness/lib/load.mjs';

const args = parseArgs(process.argv.slice(2), ['--chapter']);
const chapterId = args.val('--chapter', 'chapter-01-kiroween');

function runNode(relScript, extraArgs = []) {
  const full = resolve(projectRoot, relScript);
  const out = execFileSync(process.execPath, [full, ...extraArgs], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
  process.stdout.write(out);
}

console.log(`=== [1/5] Validating chapter specs ===`);
runNode('.kiro/skills/chapter-architect-intake/scripts/validate-chapter-specs.mjs');

console.log(`=== [2/5] Checking generated catalog-data.ts sync & 0-death playthrough ===`);
runNode('scripts/harness/generate-chapter.mjs', ['--check']);
runNode('scripts/harness/generate-chapter.mjs', ['--verify', '--ticks', '3', '--chapter', chapterId]);

console.log(`=== [3/5] Verifying rendered Comix PNG artifacts for ${chapterId} ===`);
const manifest = JSON.parse(
  readFileSync(resolve(projectRoot, `chapters/${chapterId}/chapter.manifest.json`), 'utf8'),
);
if (manifest.comix) {
  for (let p = 1; p <= manifest.comix.pageCount; p++) {
    const fname = `page-${String(p).padStart(2, '0')}.png`;
    const chapterPng = resolve(projectRoot, `chapters/${chapterId}/story/out/${fname}`);
    const publicPng = resolve(projectRoot, `public/comix/${chapterId}/${fname}`);
    if (!existsSync(chapterPng)) throw new Error(`Missing ${chapterPng} (run draw-comix.mjs)`);
    if (!existsSync(publicPng)) throw new Error(`Missing ${publicPng} (run draw-comix.mjs)`);
  }
  const sheet = resolve(projectRoot, `chapters/${chapterId}/story/out/contact-sheet.png`);
  if (!existsSync(sheet)) throw new Error(`Missing ${sheet}`);
  console.log(`comix artifacts OK (${manifest.comix.pageCount} pages + contact-sheet.png in chapter & public/)`);
}

console.log(`=== [4/5] Running skill self-tests ===`);
runNode('.kiro/skills/chapter-architect-intake/scripts/self-test.mjs');
runNode('.kiro/skills/comix-story-drawer/scripts/self-test.mjs');
runNode('.kiro/skills/chapter-level-generator/scripts/self-test.mjs');

console.log(`=== [5/5] chapter-implementer verification PASS (${chapterId}) ===`);
