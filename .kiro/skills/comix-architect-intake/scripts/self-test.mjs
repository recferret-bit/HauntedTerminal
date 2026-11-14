#!/usr/bin/env node
// Self-test for comix-architect-intake:
// 1. Validates all real comix/ sequences in the repository.
// 2. Scaffolds a 3-page, 6-panel sequence into a temp directory and verifies 0 static or 60fps simulation issues.
// 3. Injects disconnected JSON files, unknown ModelCatalog/FxCatalog IDs, out-of-bounds rects, bad cues, and unknown keys,
//    and asserts validate-comix-specs.mjs catches every violation.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { projectRoot } from '../../../../scripts/harness/lib/load.mjs';

const scaffold = resolve(projectRoot, '.kiro/skills/comix-architect-intake/scripts/scaffold-comix-specs.mjs');
const validate = resolve(projectRoot, '.kiro/skills/comix-architect-intake/scripts/validate-comix-specs.mjs');

// 1. Repo comix/ must pass cleanly
execFileSync(process.execPath, [validate], { cwd: projectRoot, stdio: 'pipe' });

// 2. Scaffold into isolated temp directory and validate
const tmp = mkdtempSync(resolve(tmpdir(), 'ht-comix-intake-'));
try {
  execFileSync(
    process.execPath,
    [
      scaffold,
      '--id',
      'interlude-99-test',
      '--title',
      'INTERLUDE 99',
      '--room',
      'room.lab_hall',
      '--cast',
      'vibecoder.dev,npc.kiro_ghost,agent.clod',
      '--pages',
      '3',
      '--panels-per-page',
      '3,2,1',
      '--duration',
      '18',
      '--out-root',
      tmp,
    ],
    { cwd: projectRoot, stdio: 'pipe' },
  );

  const okOut = execFileSync(process.execPath, [validate, '--root', tmp], {
    cwd: projectRoot,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  assert.ok(okOut.includes('comix OK (1 sequences, 3 connected pages)'), `Unexpected output: ${okOut}`);

  // 2b. Scaffolder rejects invalid --role or --background flags cleanly
  let badRoleRejected = false;
  try {
    execFileSync(process.execPath, [scaffold, '--id', 'bad-role', '--role', 'custom', '--out-root', tmp], {
      cwd: projectRoot,
      stdio: 'pipe',
    });
  } catch {
    badRoleRejected = true;
  }
  assert.equal(badRoleRejected, true, 'scaffold-comix-specs.mjs must reject invalid --role');

  // 3. Inject broken specs and assert each error is reported
  const seqDir = resolve(tmp, 'interlude-99-test');
  writeFileSync(resolve(seqDir, 'marks.json'), '{"OLD": 1}\n');

  const manifestPath = resolve(seqDir, 'comix.manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.cast[0].model = 'malware.nonexistent_hydra';
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  const page1Path = resolve(seqDir, manifest.pages[0].specPath);
  const page1 = JSON.parse(readFileSync(page1Path, 'utf8'));
  page1.typoField = 123;
  page1.panels[0].layout.landscape = [0.2, 0.2, 0.95, 0.5];
  page1.panels[0].beats.push({
    kind: 'fx',
    at: 'MISSING_CUE+1.0',
    preset: 'fx.nonexistent_boom',
    point: 'center',
  });
  writeFileSync(page1Path, JSON.stringify(page1, null, 2));

  let failed = false;
  let stderr = '';
  try {
    execFileSync(process.execPath, [validate, '--root', tmp], { cwd: projectRoot, stdio: 'pipe' });
  } catch (err) {
    failed = true;
    stderr = String(err.stderr || '');
  }
  assert.equal(failed, true, 'validate-comix-specs.mjs must fail on broken comix specs');
  for (const needle of [
    'marks.json: disconnected JSON file',
    'malware.nonexistent_hydra',
    'typoField: unknown field',
    'must fit inside 0..1',
    'fx.nonexistent_boom',
    'MISSING_CUE',
  ]) {
    assert.ok(stderr.includes(needle), `Expected validator stderr to include "${needle}", got:\n${stderr}`);
  }

  console.log('comix-architect-intake self-test PASS');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
