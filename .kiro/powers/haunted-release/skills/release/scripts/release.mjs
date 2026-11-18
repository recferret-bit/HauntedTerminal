#!/usr/bin/env node
// Tag-driven release for Haunted Terminal (power `haunted-release`, spec .kiro/specs/release-tags-power/).
//
//   node .kiro/powers/haunted-release/skills/release/scripts/release.mjs release <version>          print the plan, change nothing
//   node .../release.mjs release <version> --dry-run                                                checks and gates, no tag
//   node .../release.mjs release <version> --yes                                                    checks, gates, tag, push, watch, Netlify preview
//   node .../release.mjs release <version> --yes --no-netlify                                       same, without the Netlify preview
//   node .../release.mjs --selftest                                                                 pure checks, no git, no network
//
// The pushed tag `v<version>` starts desktop-release.yml (Tauri installers on a GitHub Release). Netlify production is never promoted here: after the preview
// the user says yes and runs `ship.mjs prod` (the haunted-ship rule: prod gets exactly the played preview).
// Credentials: `gh auth login` and `netlify login`; this script never reads or prints a token.
// Exit codes: 0 ok, 1 a check, gate or push failed (or a refusal), 2 setup needed.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../..');
const SHIP = '.kiro/powers/haunted-ship/skills/ship/scripts/ship.mjs';
const SEMVER = /^\d+\.\d+\.\d+$/;
const GATES = [
  ['npm', ['run', 'quality']],
  ['node', ['scripts/harness/generate-chapter.mjs', '--verify']],
];

/** Parse argv into a command and options. Pure. */
export function parseCli(argv) {
  const o = { command: null, version: null, yes: false, dryRun: false, netlify: true, problems: [] };
  for (const a of argv) {
    if (a === 'release') o.command = 'release';
    else if (a === '--selftest') o.command = 'selftest';
    else if (a === '--yes') o.yes = true;
    else if (a === '--dry-run') o.dryRun = true;
    else if (a === '--no-netlify') o.netlify = false;
    else if (o.command === 'release' && o.version === null && !a.startsWith('-')) o.version = a.replace(/^v/, '');
    else o.problems.push(`unknown argument: ${a}`);
  }
  if (!o.command) o.problems.push('missing command: release <version> or --selftest');
  if (o.command === 'release' && !SEMVER.test(o.version ?? '')) o.problems.push('release needs a version like 1.2.0 (MAJOR.MINOR.PATCH)');
  return o;
}

/** The checks that must hold before a tag. `s` is the repository state; returns the failed checks. Pure. */
export function failedChecks(s) {
  const f = [];
  if (s.branch !== 'main') f.push(`branch is "${s.branch}", not main`);
  if (s.dirty) f.push('working tree has uncommitted changes');
  if (s.ahead > 0 || s.behind > 0) f.push(`main differs from origin/main (ahead ${s.ahead}, behind ${s.behind})`);
  if (s.tagLocal || s.tagRemote) f.push(`tag v${s.version} already exists (${s.tagLocal ? 'local' : 'origin'})`);
  if (s.pkgVersion !== s.version) f.push(`package.json version is ${s.pkgVersion}, not ${s.version}`);
  return f;
}

/** The plan printed before anything changes. Pure. */
export function planText(version, sha, netlify) {
  return [
    `Release plan for v${version}`,
    `  commit        ${sha}`,
    '  gates         npm run quality, generate-chapter.mjs --verify',
    `  tag           v${version} (annotated), pushed to origin`,
    '  GitHub        desktop-release.yml builds the installers and the Release',
    `  Netlify       ${netlify ? 'ship.mjs preview (draft, played in Chrome); prod stays your second yes' : 'skipped (--no-netlify)'}`,
    'Nothing changed. Add --yes to run it.',
  ].join('\n');
}

function sh(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { cwd: root, encoding: 'utf8', ...opts });
}
const out = (cmd, args) => {
  const r = sh(cmd, args);
  return r.status === 0 ? r.stdout.trim() : '';
};

function readState(version) {
  sh('git', ['fetch', 'origin', '--tags', '--quiet']);
  const [ahead, behind] = (out('git', ['rev-list', '--left-right', '--count', 'main...origin/main']) || '0\t0').split(/\s+/).map(Number);
  return {
    version,
    branch: out('git', ['branch', '--show-current']),
    dirty: out('git', ['status', '--porcelain']) !== '',
    ahead,
    behind,
    tagLocal: out('git', ['tag', '-l', `v${version}`]) !== '',
    tagRemote: out('git', ['ls-remote', '--tags', 'origin', `refs/tags/v${version}`]) !== '',
    pkgVersion: JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version,
  };
}

function step(label, cmd, args) {
  console.log(`\n== ${label}`);
  return sh(cmd, args, { stdio: 'inherit' }).status === 0;
}

function release(o) {
  const state = readState(o.version);
  const sha = out('git', ['rev-parse', '--short', 'HEAD']);
  const failures = failedChecks(state);
  if (failures.length > 0) {
    console.error(`refused:\n${failures.map((x) => `  - ${x}`).join('\n')}`);
    return 1;
  }
  if (!o.yes && !o.dryRun) {
    console.log(planText(o.version, sha, o.netlify));
    return 0;
  }
  for (const [cmd, args] of GATES) if (!step(`${cmd} ${args.join(' ')}`, cmd, args)) return 1;
  if (o.dryRun) {
    console.log(`\ndry run OK: v${o.version} would be tagged at ${sha}. No tag created.`);
    return 0;
  }
  if (!step(`tag v${o.version}`, 'git', ['tag', '-a', `v${o.version}`, '-m', `Haunted Terminal v${o.version}`])) return 1;
  if (!step(`push v${o.version}`, 'git', ['push', 'origin', `v${o.version}`])) return 1;
  console.log('\nTag pushed. Workflows: https://github.com/recferret-bit/HauntedTerminal/actions');
  if (sh('gh', ['--version']).status === 0) step('watch the latest run', 'gh', ['run', 'watch', '--exit-status']);
  else console.log('gh is not installed: open the Actions URL above to follow the builds.');
  if (o.netlify && !step('Netlify preview', 'node', [SHIP, 'preview'])) return 1;
  console.log(`\nDone. Netlify production is not promoted: after you say yes, run  node ${SHIP} prod`);
  return 0;
}

function selftest() {
  const eq = (a, b, what) => {
    if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
  };
  eq(parseCli(['release', 'v1.2.0']).version, '1.2.0', 'leading v is dropped');
  eq(parseCli(['release']).problems.length, 1, 'version required');
  eq(parseCli(['release', '1.2']).problems.length, 1, 'semver required');
  eq(parseCli(['release', '1.2.0', '--yes']).yes, true, '--yes');
  eq(parseCli(['release', '1.2.0']).yes, false, 'no --yes by default');
  eq(parseCli(['--selftest']).command, 'selftest', 'selftest');
  eq(parseCli(['release', '1.2.0', '--force']).problems.length, 1, 'unknown flag');
  const ok = { version: '1.2.0', branch: 'main', dirty: false, ahead: 0, behind: 0, tagLocal: false, tagRemote: false, pkgVersion: '1.2.0' };
  eq(failedChecks(ok), [], 'a clean main passes');
  eq(failedChecks({ ...ok, branch: 'agent/x' }).length, 1, 'not main');
  eq(failedChecks({ ...ok, dirty: true }).length, 1, 'dirty tree');
  eq(failedChecks({ ...ok, ahead: 1 }).length, 1, 'ahead of origin');
  eq(failedChecks({ ...ok, behind: 2 }).length, 1, 'behind origin');
  eq(failedChecks({ ...ok, tagRemote: true }).length, 1, 'tag exists on origin');
  eq(failedChecks({ ...ok, tagLocal: true }).length, 1, 'tag exists locally');
  eq(failedChecks({ ...ok, pkgVersion: '1.1.0' }).length, 1, 'package.json mismatch');
  eq(failedChecks({ ...ok, branch: 'x', dirty: true }).length, 2, 'every failure is listed');
  const plan = planText('1.2.0', 'abc1234', true);
  eq(plan.includes('Nothing changed'), true, 'plan states it changed nothing');
  eq(plan.includes('v1.2.0'), true, 'plan names the tag');
  console.log('release selftest OK');
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const o = parseCli(process.argv.slice(2));
  if (o.command === 'selftest') process.exit(selftest());
  if (o.problems.length > 0) {
    for (const p of o.problems) console.error(p);
    process.exit(1);
  }
  process.exit(release(o));
}
