#!/usr/bin/env node
// Runs Terminal Lab scripts (`*.lab.json`) headlessly on the real ChapterSession: no browser, no clock, nobody takes damage.
//   node scripts/harness/terminal-lab.mjs --all                     every lab in scripts/harness/terminal-lab/
//   node scripts/harness/terminal-lab.mjs --run path/to/x.lab.json  one lab
//   add --transcript to print what each step printed.
// After the steps every lab gets 30 more ticks with the enemies free to fire. Exit 0 = every step and every `expect` passed and
// nothing hurt the player; 1 = a failure; 2 = bad arguments.
import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { committedLabs, loadLabModules, runLabText, SOAK_TICKS } from './lib/lab-run.mjs';
import { parseArgs, withProcgen } from './lib/load.mjs';

const args = parseArgs(process.argv.slice(2), ['--run']);
const all = args.flag('--all');
const one = args.val('--run');
if (all === Boolean(one)) {
  console.error('usage: terminal-lab.mjs --all | --run <file.lab.json> [--transcript]');
  process.exit(2);
}
const labs = all ? committedLabs() : [{ file: basename(one), text: readFileSync(resolve(one), 'utf8') }];

let failed = 0;
await withProcgen(async (_p, vite) => {
  const mods = await loadLabModules(vite);
  for (const { file, text } of labs) {
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
});

if (failed > 0) {
  console.error(`\n${failed} lab(s) failed`);
  process.exit(1);
}
console.log(`\nterminal-lab: ${labs.length} lab(s) passed`);
