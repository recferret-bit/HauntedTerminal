#!/usr/bin/env node
// Compiles all comix folders under comix/* into src/cinematic/generated/catalog-data.ts and checks them.
//
//   node scripts/harness/generate-comix.mjs              compile (writes src/cinematic/generated/catalog-data.ts)
//   node scripts/harness/generate-comix.mjs --check      read-only: is catalog-data.ts in sync with comix/*?
//   node scripts/harness/generate-comix.mjs --validate   read-only: static schema, cue, rect, and asset checks
//   node scripts/harness/generate-comix.mjs --verify     compile, validate, then simulate every comix at 60fps
//   node scripts/harness/generate-comix.mjs --format     canonicalize JSON formatting across comix/*
//
// Options: --comix <slug> limits --validate/--verify to one sequence. Exit 1 on any error.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { comixCatalogFile, comixDir, compileAllComix, writeComixCatalog } from './lib/comix-compile.mjs';
import { stringifyComixJson } from './lib/comix-json.mjs';
import { parseArgs, withProcgen } from './lib/load.mjs';

const args = parseArgs(process.argv.slice(2), ['--comix']);
const filterId = args.val('--comix', '');

if (args.flag('--format')) {
  const { comixes } = compileAllComix();
  for (const c of comixes) {
    writeFileSync(resolve(comixDir, c.slug, 'comix.manifest.json'), stringifyComixJson(c.manifest));
    for (const p of c.pages) {
      writeFileSync(resolve(comixDir, c.slug, p.path), stringifyComixJson(p.spec));
    }
  }
}

const { comixes, ts: generatedTs } = compileAllComix();
const readOnly = args.flag('--check') || args.flag('--validate');

if (args.flag('--check')) {
  const existing = existsSync(comixCatalogFile) ? readFileSync(comixCatalogFile, 'utf8') : '';
  if (existing !== generatedTs) {
    console.error('src/cinematic/generated/catalog-data.ts is out of sync with comix/*. Run: node scripts/harness/generate-comix.mjs');
    process.exit(1);
  }
  console.log('cinematic catalog-data.ts is in sync with comix/*');
} else if (!readOnly) {
  writeComixCatalog(generatedTs);
  const totalPages = comixes.reduce((sum, c) => sum + c.pages.length, 0);
  console.log(`generated ${comixCatalogFile} (${comixes.length} comix sequences, ${totalPages} pages)`);
}

if (args.flag('--validate') || args.flag('--verify')) {
  const runSim = args.flag('--verify');
  await withProcgen(async (_p, vite) => {
    const { checkComixPack, runComixSim } = await vite.ssrLoadModule('/src/comix-editor/check.ts');
    let failed = false;

    for (const c of comixes) {
      if (filterId && c.slug !== filterId) continue;
      const pack = {
        manifest: c.manifest,
        pages: c.pages.map((p) => p.spec).sort((a, b) => a.index - b.index),
      };
      const issues = checkComixPack(pack);
      for (const issue of issues) {
        console.log(`${issue.severity === 'error' ? 'ERROR' : 'warn '} [${c.slug}] ${issue.where}: ${issue.message}`);
      }
      const errors = issues.filter((i) => i.severity === 'error').length;
      if (errors > 0) failed = true;
      console.log(`checked [${c.slug}]: ${pack.pages.length} pages, ${errors} error(s), ${issues.length - errors} warning(s)`);

      if (!runSim) continue;
      const sim = runComixSim(pack);
      for (const err of sim.errors) console.error(`FAIL [${c.slug}] sim: ${err}`);
      if (!sim.ok) {
        failed = true;
      } else {
        console.log(
          `verified [${c.slug}]: ${sim.durationSec}s (${sim.frames} frames @ 60fps), cuts=${sim.panelCuts.length}, snapshots=${sim.snapshots.length}, turns=${sim.turnsCompleted}, beats=${sim.beatsFired}, peakTracks=${sim.activeTracksPeak}`,
        );
      }
    }
    if (failed) process.exit(1);
  });
}
