#!/usr/bin/env node
// Self-test for chapter-architect-intake:
// 1. Validates all real chapters/ in the repository.
// 2. Scaffolds a brand-new 7-level multi-mechanic chapter (hub, terminal, html-css, terminal-code, docker-image, docker-compose, boss)
//    in a temp dir, verifies 0 schema errors, and confirms every requested mechanic generated its genuine LevelSpec!
// 3. Injects broken ModelCatalog IDs, HUMAN_ZONE_MISUSE, invalid panel rects, and unknown enemies,
//    and asserts that validate-chapter-specs.mjs rejects every bad case.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { projectRoot } from '../../../../scripts/harness/lib/load.mjs';

const scaffoldScript = resolve(projectRoot, '.kiro/skills/chapter-architect-intake/scripts/scaffold-chapter-specs.mjs');
const validateScript = resolve(projectRoot, '.kiro/skills/chapter-architect-intake/scripts/validate-chapter-specs.mjs');

// 1. Real chapters/ must pass
execFileSync(process.execPath, [validateScript], { cwd: projectRoot, stdio: 'pipe' });

// 2. Scaffold multi-mechanic chapter into temp root & validate
const tmp = mkdtempSync(resolve(tmpdir(), 'ht-intake-test-'));
try {
  execFileSync(
    process.execPath,
    [
      scaffoldScript,
      '--id',
      'chapter-99-self-test',
      '--issue',
      '99',
      '--title',
      'SELF TEST',
      '--levels',
      '7',
      '--pages',
      '2',
      '--mechanics',
      'hub,terminal,html-css,terminal-code,docker-image,docker-compose,boss',
      '--out-root',
      tmp,
    ],
    { cwd: projectRoot, stdio: 'pipe' },
  );

  execFileSync(process.execPath, [validateScript, '--root', tmp], { cwd: projectRoot, stdio: 'pipe' });

  const manifestPath = resolve(tmp, 'chapter-99-self-test/chapter.manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const actualMechanics = manifest.levels.map((l) => {
    const spec = JSON.parse(readFileSync(resolve(tmp, 'chapter-99-self-test', l.specPath), 'utf8'));
    return spec.mechanic;
  });
  assert.deepEqual(
    actualMechanics,
    ['hub', 'terminal', 'html-css', 'terminal-code', 'docker-image', 'docker-compose', 'boss'],
    'scaffold-chapter-specs.mjs must generate real per-mechanic LevelSpec templates instead of generic terminal stubs',
  );

  // 3. Mutate with invalid specs and assert failure + diagnostic messages
  const comixPath = resolve(tmp, 'chapter-99-self-test/story/comix.spec.json');
  const levelPath = resolve(tmp, 'chapter-99-self-test/levels/level-02-terminal/level.spec.json');

  manifest.allyNpc.model = 'hero.dev'; // triggers HUMAN_ZONE_MISUSE
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  const comix = JSON.parse(readFileSync(comixPath, 'utf8'));
  comix.pages[0].panels[0].rect = [0.2, 0.2, 0.95, 0.5]; // out-of-bounds > 1.0
  comix.pages[0].panels[0].cast[0].model = 'malware.nonexistent_dragon';
  writeFileSync(comixPath, JSON.stringify(comix, null, 2));

  const level = JSON.parse(readFileSync(levelPath, 'utf8'));
  level.enemies[0].type = 'imaginary_goblin';
  level.solutionCommands = [];
  writeFileSync(levelPath, JSON.stringify(level, null, 2));

  let failedAsExpected = false;
  let stderr = '';
  try {
    execFileSync(process.execPath, [validateScript, '--root', tmp], { cwd: projectRoot, stdio: 'pipe' });
  } catch (err) {
    failedAsExpected = true;
    stderr = String(err.stderr || '');
  }

  if (!failedAsExpected) {
    throw new Error('Expected validate-chapter-specs.mjs to fail on malformed specs, but it exited 0!');
  }
  for (const expectedSubstring of [
    'HUMAN_ZONE_MISUSE',
    'out-of-bounds rect',
    'malware.nonexistent_dragon',
    'imaginary_goblin',
    'solutionCommands[] must be non-empty',
  ]) {
    if (!stderr.includes(expectedSubstring)) {
      throw new Error(`Expected validator output to mention "${expectedSubstring}", got:\n${stderr}`);
    }
  }

  console.log('chapter-architect-intake self-test PASS');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
