#!/usr/bin/env node
// Runs Terminal Lab scripts (`*.lab.json`) headlessly on the real ChapterSession, validates them, or imports from a chapter level.
//   node scripts/harness/terminal-lab.mjs --all [--validate] [--transcript]
//   node scripts/harness/terminal-lab.mjs --run path/to/x.lab.json [--validate] [--transcript]
//   node scripts/harness/terminal-lab.mjs --from-level <chapter>/<level> [--validate] [--transcript]
// After the steps every lab gets 30 more ticks with the enemies free to fire. Exit 0 = every step and every `expect` passed and
// nothing hurt the player; 1 = a failure; 2 = bad arguments.
import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { stringifyLabJson } from './lib/lab-json.mjs';
import { committedLabs, loadLabModules, runLabText, SOAK_TICKS } from './lib/lab-run.mjs';
import { parseArgs, withProcgen } from './lib/load.mjs';

const args = parseArgs(process.argv.slice(2), ['--run', '--from-level']);
const all = args.flag('--all');
const one = args.val('--run', '');
const fromLevel = args.val('--from-level', '');
const validateOnly = args.flag('--validate');
if ([all, Boolean(one), Boolean(fromLevel)].filter(Boolean).length !== 1) {
  console.error('usage: terminal-lab.mjs (--all | --run <file.lab.json> | --from-level <chapter>/<level>) [--validate] [--transcript]');
  process.exit(2);
}

let failed = 0;
await withProcgen(async (_p, vite) => {
  const mods = await loadLabModules(vite);
  let labs;
  if (fromLevel) {
    const { importChapterLevelRef } = await vite.ssrLoadModule('/src/terminal-lab/level-import.ts');
    const res = importChapterLevelRef(fromLevel, [], false);
    if (!res.script) {
      console.error(`FAIL ${fromLevel}: ${res.problem ?? 'could not import level'}`);
      process.exit(1);
    }
    labs = [{ file: `${res.script.id}.lab.json`, text: stringifyLabJson(res.script) }];
  } else {
    labs = all ? committedLabs() : [{ file: basename(one), text: readFileSync(resolve(one), 'utf8') }];
  }

  for (const { file, text } of labs) {
    if (validateOnly) {
      const { script, problems } = mods.store.parseLabText(text);
      if (!script) {
        console.error(`FAIL ${file}: not a valid lab: ${problems.join('; ')}`);
        failed += 1;
        continue;
      }
      const issues = mods.check.checkLab(script);
      const errors = issues.filter((i) => i.severity === 'error');
      const warnings = issues.length - errors.length;
      for (const e of errors) console.error(`ERROR ${file} [${e.where}]: ${e.message}`);
      console.log(`${errors.length === 0 ? 'ok  ' : 'FAIL'} ${file}: ${script.setup.length} setup, ${script.steps.length} steps, ${errors.length} error(s), ${warnings} warning(s)`);
      if (errors.length > 0) failed += 1;
      continue;
    }

    const r = await runLabText(mods, text);
    if (r.problems.length > 0 || r.errors.length > 0) {
      console.error(`FAIL ${file}: ${r.problems.length ? `not a valid lab: ${r.problems.join('; ')}` : r.errors.map((e) => `[${e.where}] ${e.message}`).join('; ')}`);
      failed += 1;
      continue;
    }
    if (args.flag('--transcript')) console.log(r.transcript);
    const bad = r.results.filter((s) => !s.ok);
    for (const s of bad) console.error(`FAIL ${file} step ${s.index + 1} (${s.label}): ${s.failures.join('; ')}`);
    if (r.hurt) console.error(`FAIL ${file}: the player took damage (${r.hurt})`);
    const ok = bad.length === 0 && !r.hurt && r.reason === 'end';
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${file}: ${r.results.length} step${r.results.length === 1 ? '' : 's'} + ${SOAK_TICKS} soak ticks, absorbed ${r.absorbed} damage`);
    if (!ok) failed += 1;
  }

  if (failed > 0) {
    console.error(`\n${failed} lab(s) failed`);
    process.exit(1);
  }
  console.log(`\nterminal-lab: ${labs.length} lab(s) ${validateOnly ? 'validated' : 'passed'}`);
});
