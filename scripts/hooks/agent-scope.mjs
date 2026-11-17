#!/usr/bin/env node
// Scope hook of every team agent (.kiro/agents/*.json). `fs_write` permission rules cannot see everything a shell command
// writes, so this compares the git tree before and after the agent's session.
//   node scripts/hooks/agent-scope.mjs <agent> --snapshot   SessionStart: remember which files are dirty and their content hash
//   node scripts/hooks/agent-scope.mjs <agent>              Stop: list files changed SINCE the snapshot outside the agent's paths
//   node scripts/hooks/agent-scope.mjs <agent> --strict     same, exit 1 when any (tests); without a snapshot, all dirty files count
// Report-only as a hook: always exit 0, silent when clean. Files the compilers and harness write for everyone are ignored.
// Each out-of-scope file is reported with its owner; an owner that is another team agent usually means a sibling's work
// during a parallel delegation, which is not a violation by this agent. Spec: .kiro/specs/agent-team/.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { globToRegExp } from '../quality/agent-rules.mjs';

/** Written by compilers and harness runs on behalf of whichever agent ran them. */
export const SHARED_OUTPUTS = ['src/chapters/generated/**', 'src/cinematic/generated/**', 'scripts/harness/out/**', 'dist/**', 'public/comix/**', 'chapters/*/story/out/**'];

/** `git status --porcelain` paths (both sides of a rename), relative to the repository root. */
export function changedPaths(root) {
  const text = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: root, encoding: 'utf8' });
  return text
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => line.slice(3).split(' -> '))
    .map((p) => p.replace(/^"|"$/g, ''));
}

/** `{ path: hash }` of every dirty path; `-` for a deleted one. */
export function dirtyState(root) {
  const state = {};
  for (const p of changedPaths(root)) {
    const full = join(root, p);
    state[p] = existsSync(full) ? createHash('sha1').update(readFileSync(full)).digest('hex') : '-';
  }
  return state;
}

/** Paths whose state differs from `before` (new, changed or reverted-to-clean). */
export function changedSince(before, now) {
  const paths = new Set([...Object.keys(before), ...Object.keys(now)]);
  return [...paths].filter((p) => (before[p] ?? '=') !== (now[p] ?? '=')).sort();
}

/** Paths in `changed` that neither the globs nor the shared outputs cover. */
export function outOfScope(changed, globs) {
  const allowed = [...globs, ...SHARED_OUTPUTS].map(globToRegExp);
  return changed.filter((p) => !allowed.some((re) => re.test(p)));
}

/** The team agent that owns `path`, or null. `table` is `{ name: globs[] }`. */
export function ownerOf(path, table) {
  const hit = Object.entries(table).find(([, globs]) => globs.some((g) => globToRegExp(g).test(path)));
  return hit ? hit[0] : null;
}

async function main() {
  const name = process.argv[2];
  const strict = process.argv.includes('--strict');
  const snapshot = process.argv.includes('--snapshot');
  const root = resolve(process.cwd());
  const { TEAM_NAMES, ownWrites } = await import('../harness/agents-build.mjs');
  const globs = ownWrites(name);
  if (!globs) {
    console.log(`agent-scope: no team agent "${name}"`);
    process.exit(strict ? 1 : 0);
  }
  let now;
  try {
    now = dirtyState(root);
  } catch {
    process.exit(0); // not a git checkout: nothing to compare
  }
  const dir = join(root, '.git/agent-scope');
  const file = join(dir, `${name}.json`);
  if (snapshot) {
    if (existsSync(join(root, '.git'))) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(file, JSON.stringify(now));
    }
    process.exit(0);
  }
  const before = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  const outside = outOfScope(changedSince(before, now), globs);
  if (!strict && existsSync(join(root, '.git'))) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, JSON.stringify(now));
  }
  if (!outside.length) process.exit(0);
  const table = Object.fromEntries(TEAM_NAMES.map((n) => [n, ownWrites(n)]));
  console.log(`agent-scope: ${name} may write only ${globs.join(', ')}. This session changed files outside it:`);
  for (const p of outside) {
    const owner = ownerOf(p, table);
    console.log(`  - ${p}  (${owner ? (owner === name ? 'yours' : `owned by ${owner}: a sibling's work in a parallel delegation, or a handoff you skipped`) : 'owned by nobody: ask the user'})`);
  }
  console.log('If you made a change that belongs to another owner, revert your edit and hand it to that agent in your report. Do not touch work you did not do.');
  process.exit(strict ? 1 : 0);
}

if (import.meta.url === `file://${resolve(process.argv[1] ?? '')}`) await main();
