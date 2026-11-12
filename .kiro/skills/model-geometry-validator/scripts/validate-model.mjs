#!/usr/bin/env node
// Validate procedural models against the art bible: geometry, grounding, palette families, 60/30/10, front read.
// Run from the project root.
//
//   node .kiro/skills/model-geometry-validator/scripts/validate-model.mjs --all
//   node .kiro/skills/model-geometry-validator/scripts/validate-model.mjs malware.worm door.usb
//   node .kiro/skills/model-geometry-validator/scripts/validate-model.mjs --category pickup --strict
//   node .kiro/skills/model-geometry-validator/scripts/validate-model.mjs --all --seeds 8 --quiet
//
//   --all             every model in ModelCatalog
//   --category <c>    hero | malware | boss | pickup | door | prop | room | fx
//   --seed <n>        build with this seed (default 1)
//   --seeds <n>       build and validate seeds 1..n: catches variation that breaks a model
//   --strict          warnings fail too
//   --geometry-only   structure and 3D geometry only (no 2D read, no palette / category rules)
//   --disable <a,b>   drop issue codes or groups (geometry, read, semantics)
//   --quiet           only failing models, only the issues that fail them
//   --json            machine-readable reports on stdout
//
// Exit code: 0 clean, 1 at least one model failed, 2 usage error.
import { withProcgen, parseArgs } from '../../../../scripts/harness/lib/load.mjs';

const VALUE_FLAGS = ['--category', '--seed', '--seeds', '--disable'];
const BOOL_FLAGS = ['--all', '--json', '--quiet', '--strict', '--geometry-only', '--help'];
const CATEGORIES = ['hero', 'malware', 'boss', 'pickup', 'door', 'prop', 'room', 'fx'];
const argv = process.argv.slice(2);
const args = parseArgs(argv, VALUE_FLAGS);

function usage(problem) {
  if (problem) console.error(`error: ${problem}`);
  console.error('usage: validate-model.mjs <model id>... | --category <c> | --all');
  console.error('       [--seed n | --seeds n] [--strict] [--geometry-only] [--disable CODE,group] [--quiet] [--json]');
  process.exit(2);
}

if (args.flag('--help')) usage();
const unknown = argv.filter((a) => a.startsWith('--') && !VALUE_FLAGS.includes(a) && !BOOL_FLAGS.includes(a));
if (unknown.length) usage(`unknown option ${unknown.join(', ')}`);
const category = args.val('--category');
if (category !== undefined && !CATEGORIES.includes(category)) usage(`--category must be one of ${CATEGORIES.join(', ')}`);
const positiveInt = (flag, fallback) => {
  const raw = args.val(flag);
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) usage(`${flag} needs a positive integer`);
  return n;
};
const seedCount = positiveInt('--seeds', 0);
const seeds = seedCount ? Array.from({ length: seedCount }, (_, i) => i + 1) : [positiveInt('--seed', 1)];
const strict = args.flag('--strict');
const quiet = args.flag('--quiet');
const json = args.flag('--json');
const disable = (args.val('--disable') ?? '').split(',').map((s) => s.trim()).filter(Boolean);

const exitCode = await withProcgen(async (p) => {
  const registered = p.ModelCatalog.list().map((e) => e.id);
  let ids = args.rest;
  if (args.flag('--all')) ids = registered;
  else if (category) ids = p.ModelCatalog.list(category).map((e) => e.id);
  else if (!ids.length) {
    console.error('error: name at least one model id, or use --all / --category');
    console.error(`registered: ${registered.join(', ') || '(none)'}`);
    return 2;
  }
  const missing = ids.filter((id) => !p.ModelCatalog.has(id));
  if (missing.length) {
    console.error(`error: unknown model id ${missing.join(', ')}`);
    console.error(`registered: ${registered.join(', ') || '(none)'}`);
    return 2;
  }
  if (!ids.length) {
    const what = category ? `no models registered in category "${category}"` : 'the model catalog is empty';
    if (json) console.log(JSON.stringify({ ok: true, models: 0, reports: [] }));
    else console.log(`${what}: nothing to validate`);
    return 0;
  }

  const started = performance.now();
  const reports = [];
  for (const id of ids) {
    for (const seed of seeds) {
      reports.push(p.validateModel(id, { seed, strict, geometryOnly: args.flag('--geometry-only'), disable }));
    }
  }
  const failed = reports.filter((r) => !r.ok);
  const sum = (key) => reports.reduce((n, r) => n + r[key], 0);

  if (json) {
    console.log(JSON.stringify({ ok: failed.length === 0, models: ids.length, seeds, failed: failed.length, errors: sum('errors'), warnings: sum('warnings'), reports }, null, 2));
  } else {
    for (const r of reports) {
      if (quiet && r.ok) continue;
      // Under --strict a warning is a failure, so --quiet must still show it.
      console.log(p.formatModelReport(r, { quiet: quiet && !strict }));
      if (!quiet) console.log('');
    }
    const codes = new Map();
    for (const r of reports) for (const i of r.issues) if (i.severity !== 'info') codes.set(i.code, (codes.get(i.code) ?? 0) + 1);
    const top = [...codes.entries()].sort((a, b) => b[1] - a[1]).map(([code, n]) => `${code} x${n}`).join(', ');
    const runs = seeds.length > 1 ? ` x ${seeds.length} seeds` : '';
    console.log(
      `${failed.length ? 'FAIL' : 'PASS'} ${ids.length} model${ids.length > 1 ? 's' : ''}${runs}: ` +
        `${reports.length - failed.length} ok, ${failed.length} failed, ${sum('errors')} errors, ${sum('warnings')} warnings` +
        `${strict ? ' (strict)' : ''} in ${((performance.now() - started) / 1000).toFixed(1)}s`,
    );
    if (top) console.log(`issues: ${top}`);
    if (failed.length) console.log(`failed: ${[...new Set(failed.map((r) => r.id))].join(', ')}`);
  }
  return failed.length ? 1 : 0;
});
process.exit(exitCode);
