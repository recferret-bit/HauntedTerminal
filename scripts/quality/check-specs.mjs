#!/usr/bin/env node
// Spec-first gate. Every Kiro spec in .kiro/specs/<name>/ carries a `Status:` line, has no open questions once
// past `draft`, records the user's answers under `## Decisions`, and has the files its status needs. design.md and
// tasks.md carry no status of their own ("Status: see requirements.md", or the same state); an `approved` spec
// whose tasks are all ticked must be closed (`done`); `[ ]`, `[-]` and `[~]` boxes are unticked, in any list form
// (`-`, `*`, `+`, `1.`), for tasks and open questions alike. "Status: see" must name the spec's own requirements file. Every new
// source area or HTML page on disk (`src/<area>/`, `pages/<name>.html` not committed yet) must be named by a
// spec whose status allows code (`approved` or `done`).
//   node scripts/quality/check-specs.mjs            gate: exit 1 on any problem
//   node scripts/quality/check-specs.mjs --report   report only (Stop hook): always exit 0, silent when clean
// Rules: .kiro/steering/spec-first.md. Procedure: skill `feature-spec-grill`.
import { CODE_ALLOWED, STATUSES, loadSpecs, pointsToRequirements, specsNaming, statusOf, untrackedFootprints } from './spec-status.mjs';

const report = process.argv.includes('--report');
const root = process.cwd();
const specs = loadSpecs(root);
const problems = [];
const rank = (status) => STATUSES.indexOf(status);

for (const s of specs) {
  const where = `.kiro/specs/${s.name}`;
  if (!s.requirements) {
    problems.push(`${where}: no requirements.md (or bugfix.md)`);
    continue;
  }
  if (!STATUSES.includes(s.status)) {
    problems.push(`${where}/${s.reqFile}: needs a "Status: <${STATUSES.join(' | ')}>" line near the top`);
    continue;
  }
  if (rank(s.status) > 0 && s.open.length) {
    problems.push(`${where}: status ${s.status} but ${s.open.length} open question(s) under "## Open questions"; the user answers them first`);
  }
  if (rank(s.status) > 0 && !s.hasDecisions && !s.legacy) {
    problems.push(`${where}: status ${s.status} needs a "## Decisions" section with the user's answers`);
  }
  if (rank(s.status) >= rank('design-approved') && !s.design) problems.push(`${where}: status ${s.status} needs design.md`);
  if (rank(s.status) >= rank('approved') && !s.tasks) problems.push(`${where}: status ${s.status} needs tasks.md`);
  if (s.status === 'done' && s.openTasks.length) problems.push(`${where}: status done but ${s.openTasks.length} task(s) are unchecked`);
  if (s.status === 'approved' && s.taskCount && !s.openTasks.length) {
    problems.push(`${where}: status approved but every task is ticked; run the gates and set Status: done`);
  }
  for (const [file, line] of Object.entries(s.ownStatus)) {
    if (!line || pointsToRequirements(line, s.reqFile) || statusOf(line) === s.status) continue;
    problems.push(`${where}/${file}: "${line}" disagrees with ${s.reqFile} (${s.status}); write "Status: see ${s.reqFile}"`);
  }
}

for (const footprint of untrackedFootprints(root)) {
  const named = specsNaming(specs, footprint);
  if (named.some((s) => CODE_ALLOWED.has(s.status))) continue;
  problems.push(
    named.length
      ? `${footprint} is new code, but its spec ${named.map((s) => `${s.name} (${s.status})`).join(', ')} is not approved yet`
      : `${footprint} is new code with no Kiro spec naming it (create one with the feature-spec-grill skill)`,
  );
}

const waiting = specs.filter((s) => s.open.length);
if (report) {
  if (problems.length || waiting.length) {
    console.log('Spec-first report (report-only):');
    for (const p of problems) console.log(`  - ${p}`);
    for (const s of waiting) console.log(`  - .kiro/specs/${s.name}: ${s.open.length} question(s) wait for the user`);
  }
  process.exit(0);
}
if (problems.length) {
  console.error(`spec gate FAILED (${problems.length}):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`spec gate OK (${specs.length} specs)`);
