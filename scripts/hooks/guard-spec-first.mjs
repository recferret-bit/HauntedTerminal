#!/usr/bin/env node
// PreToolUse guard for spec-first work. Reads the hook event JSON from stdin, finds every file path in it, and:
//
//   a new source area (src/<area>/, nothing of it committed)   exit 2 (block) unless a Kiro spec with status
//   or a new page (pages/<name>.html, not committed)           `approved` or `done` names that path
//   scripts/quality/check-layers.mjs, vite.config.ts           ask: a new layer or page is a feature footprint
//   anything else                                              exit 0, no output
//
// It is a backstop. The rule itself (feature or big refactor -> grilled, approved spec before code) is
// .kiro/steering/spec-first.md, and the procedure is skill `feature-spec-grill`.
// Usage (see .kiro/hooks/guard-spec-first.json):  node scripts/hooks/guard-spec-first.mjs
import { readFileSync } from 'node:fs';
import { isAbsolute, relative } from 'node:path';
import { CODE_ALLOWED, footprintOf, loadSpecs, specsNaming, trackedFiles } from '../quality/spec-status.mjs';

const STRUCTURAL = /^(scripts\/quality\/check-layers\.mjs|vite\.config\.ts)$/;

let event;
try {
  event = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}
const root = typeof event?.cwd === 'string' && event.cwd ? event.cwd : process.cwd();

const paths = new Set();
(function walk(v) {
  if (typeof v === 'string') {
    // A path, not file content: one short line with a file extension.
    if (v.length < 400 && !v.includes('\n') && /\.[a-z]{1,5}$/i.test(v)) {
      const p = v.replace(/\\/g, '/');
      paths.add(isAbsolute(p) ? relative(root, p).replace(/\\/g, '/') : p.replace(/^\.\//, ''));
    }
  } else if (v && typeof v === 'object') {
    Object.values(v).forEach(walk);
  }
})(event?.tool_input ?? event);

const tracked = trackedFiles(root);
const specs = loadSpecs(root);

for (const path of paths) {
  const footprint = footprintOf(path, tracked);
  if (!footprint) continue;
  const named = specsNaming(specs, footprint);
  if (named.some((s) => CODE_ALLOWED.has(s.status))) continue;
  const why = named.length
    ? `Its Kiro spec ${named.map((s) => `.kiro/specs/${s.name} (status ${s.status}, ${s.open.length} open question(s))`).join(', ')} is not approved yet.`
    : 'No Kiro spec names it.';
  console.error(
    `Blocked: ${path} starts new code (${footprint}). ${why} New features and big refactors are spec-first ` +
      '(.kiro/steering/spec-first.md): activate the feature-spec-grill skill, grill the user until every open ' +
      'question is answered, get requirements, design and tasks approved, set "Status: approved", then write code.',
  );
  process.exit(2);
}

const structural = [...paths].find((p) => STRUCTURAL.test(p));
if (structural) {
  const reason =
    `${structural} adds a layer, a page or a route: that is the footprint of a feature. Confirm this edit ` +
    'implements a task of an approved Kiro spec in .kiro/specs/ (spec-first.md).';
  console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: reason } }));
}
process.exit(0);
