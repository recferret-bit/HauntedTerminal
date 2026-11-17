#!/usr/bin/env node
// Property-based tests (fast-check) for the major features: terminal, laptop, comix, chapters, gameplay elements.
//   node scripts/harness/property-tests.mjs                      all suites, gate seed, 100 runs per property
//   node scripts/harness/property-tests.mjs --only terminal,laptop
//   node scripts/harness/property-tests.mjs --seed 42 --runs 1000 (explore further)
//   node scripts/harness/property-tests.mjs --list               property names only
//   --hang-ms 20000   a property running longer than this is reported as a hang and the run is killed (exit != 0)
// Suites live in scripts/harness/props/<feature>.mjs and load the TypeScript sources through Vite SSR.
// Exit 1 when a property fails: it prints the shrunk counterexample and the seed that replays it.
// Spec: .kiro/specs/property-based-tests/.
import { parseArgs, withProcgen } from './lib/load.mjs';
import { DEFAULT_RUNS, DEFAULT_SEED, quietly, runProperty, startWatchdog } from './props/kit.mjs';

const FEATURES = ['terminal', 'laptop', 'comix', 'chapters', 'gameplay'];
const args = parseArgs(process.argv.slice(2), ['--seed', '--runs', '--only', '--hang-ms']);
const seed = Number(args.val('--seed', DEFAULT_SEED));
const runs = Number(args.val('--runs', DEFAULT_RUNS));
const only = String(args.val('--only', FEATURES.join(','))).split(',').map((s) => s.trim()).filter(Boolean);
const hangMs = Number(args.val('--hang-ms', 20_000));
const unknown = only.filter((f) => !FEATURES.includes(f));
if (unknown.length || !Number.isInteger(seed) || !Number.isInteger(runs) || runs < 1) {
  console.error(`usage: property-tests.mjs [--only ${FEATURES.join(',')}] [--seed <int>] [--runs <int >= 1>] [--list]`);
  if (unknown.length) console.error(`unknown feature(s): ${unknown.join(', ')}`);
  process.exit(2);
}

const t0 = performance.now();
const failures = [];
const watchdog = startWatchdog(hangMs);
let total = 0;
await withProcgen(async (_p, vite) => {
  const ctx = { load: (m) => vite.ssrLoadModule(m) };
  for (const feature of only) {
    watchdog.arm(`loading the ${feature} suite`);
    const suite = await import(`./props/${feature}.mjs`);
    const properties = await suite.default(ctx);
    watchdog.arm(null);
    console.log(`=== ${feature} (${properties.length} properties) ===`);
    for (const prop of properties) {
      if (args.flag('--list')) {
        console.log(`  -   ${prop.name}`);
        continue;
      }
      watchdog.arm(`${feature}: ${prop.name}`);
      const r = quietly(() => runProperty(prop, { seed, runs, feature }));
      watchdog.arm(null);
      total += 1;
      const time = `${(r.ms / 1000).toFixed(2)}s`.padStart(7);
      console.log(`  ${r.ok ? 'ok  ' : 'FAIL'} ${time}  ${prop.name} (${r.runs} runs)`);
      if (!r.ok) {
        failures.push(`${feature}: ${prop.name}`);
        console.log(r.message.replace(/^/gm, '        '));
      }
    }
  }
});
watchdog.stop();
const secs = ((performance.now() - t0) / 1000).toFixed(1);
if (args.flag('--list')) process.exit(0);
if (failures.length) {
  console.error(`\nproperty-tests FAILED: ${failures.length} of ${total} properties (seed ${seed}, ${secs}s)`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`\nproperty-tests PASS: ${total} properties, seed ${seed}, ${runs} runs max each, ${secs}s`);
