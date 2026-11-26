#!/usr/bin/env node
// Tag-driven release for Out Of Credits (power `credits-release`, spec .kiro/specs/release-tags-power/).
//
//   node .kiro/powers/credits-release/skills/release/scripts/release.mjs release <version>          print the plan, change nothing
//   node .../release.mjs release <version> --dry-run                                                checks and gates, no tag
//   node .../release.mjs release <version> --yes                                                    checks, gates, tag, push, watch, Netlify preview
//   node .../release.mjs release <version> --yes --no-netlify                                       same, without the Netlify preview
//   node .../release.mjs --selftest                                                                 pure checks, no git, no network
//
// The pushed tag `v<version>` starts desktop-release.yml (Tauri installers on a GitHub Release). Netlify production is never promoted here: after the preview
// the user says yes and runs `ship.mjs prod` (the credits-ship rule: prod gets exactly the played preview).
// Credentials: `gh auth login` and `netlify login`; this script never reads or prints a token.
// With --yes and the Netlify preview step on, the Netlify login is checked before the gates and the tag (the same
// `netlify status` check as ship.mjs), so a missing login never shows up after the irreversible push.
// Exit codes: 0 ok, 1 a check failed or a refusal (also when fetch, origin/main, rev-list or ls-remote cannot be read),
// 2 the Netlify login is missing (before anything changed), otherwise the exit status of the failing child is passed
// through (a gate, git, or ship.mjs preview).
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loggedInWith } from '../../../../credits-ship/skills/ship/scripts/ship.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../..');
const SHIP = '.kiro/powers/credits-ship/skills/ship/scripts/ship.mjs';
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

/** `git rev-list --left-right --count` output as [ahead, behind], or null when it is not two whole numbers. Pure. */
export function parseAheadBehind(text) {
  const parts = String(text ?? '').trim().split(/\s+/);
  if (parts.length !== 2 || !parts.every((p) => /^\d+$/.test(p))) return null;
  const nums = parts.map(Number);
  return nums.every(Number.isFinite) ? nums : null;
}

/**
 * The repository state for `version`, read with `exec(cmd, args) -> { status, stdout }`. A git or remote read that
 * fails is a problem, never a default: `{ state }` or `{ problems }`. Pure given `exec`.
 */
export function readStateWith(exec, version, pkgVersion) {
  const problems = [];
  const read = (args, what) => {
    const r = exec('git', args);
    if (r.status !== 0) problems.push(`${what} failed (git ${args.join(' ')}, exit ${r.status})`);
    return r.status === 0 ? String(r.stdout ?? '').trim() : null;
  };
  read(['fetch', 'origin', '--tags', '--quiet'], 'fetching origin');
  read(['rev-parse', '--verify', '--quiet', 'origin/main'], 'finding origin/main');
  const counts = read(['rev-list', '--left-right', '--count', 'main...origin/main'], 'comparing main with origin/main');
  const aheadBehind = counts === null ? null : parseAheadBehind(counts);
  if (counts !== null && !aheadBehind) problems.push(`cannot read ahead/behind of main from "${counts}"`);
  const branch = read(['branch', '--show-current'], 'reading the branch');
  const status = read(['status', '--porcelain'], 'reading the working tree');
  const tagLocal = read(['tag', '-l', `v${version}`], 'listing local tags');
  const tagRemote = read(['ls-remote', '--tags', 'origin', `refs/tags/v${version}`], 'listing the tags on origin');
  if (problems.length > 0) return { problems };
  const [ahead, behind] = aheadBehind;
  return { state: { version, branch, dirty: status !== '', ahead, behind, tagLocal: tagLocal !== '', tagRemote: tagRemote !== '', pkgVersion } };
}

function readState(version) {
  const pkgVersion = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
  return readStateWith((cmd, args) => sh(cmd, args), version, pkgVersion);
}

/** Run one step with inherited output; returns its exit status (a missing or killed process counts as 1). */
function step(label, cmd, args) {
  console.log(`\n== ${label}`);
  const r = sh(cmd, args, { stdio: 'inherit' });
  return typeof r.status === 'number' ? r.status : 1;
}

/** The `gh` arguments that find the run a tag started. Pure. */
export function runListArgs(version) {
  return ['run', 'list', '--workflow', 'desktop-release.yml', '--branch', `v${version}`, '--limit', '1', '--json', 'databaseId', '--jq', '.[0].databaseId'];
}

/** Wait for the run of tag v<version> (it can take a few seconds to appear) and return whether it succeeded. */
function watchTagRun(version, io) {
  for (let i = 0; i < 12; i++) {
    const id = io.out('gh', runListArgs(version));
    if (id) return io.step(`watch run ${id} of v${version}`, 'gh', ['run', 'watch', id, '--exit-status']) === 0;
    io.sleep();
  }
  console.error(`no workflow run found for v${version}`);
  return false;
}

/**
 * Exit status of the Netlify login preflight: 2 when `--yes` will run the Netlify preview step and `netlify status`
 * (read with `exec`) is not logged in, else 0. Runs before the gates and the tag. Pure given `exec`.
 */
export function netlifyPreflight(o, exec, log = console.error) {
  if (!o.yes || o.dryRun || !o.netlify) return 0;
  if (loggedInWith(exec)) return 0;
  log('SETUP    not logged in to Netlify, so the preview step after the tag would fail. Run once:  npx netlify-cli@27.20.0 login   (or set NETLIFY_AUTH_TOKEN), or add --no-netlify. Nothing was tagged.');
  return 2;
}

/** The real side effects of a release; the selftest passes fakes. */
const REAL_IO = {
  readState,
  out,
  step,
  exec: (cmd, args) => sh(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] }),
  sleep: () => spawnSync('sleep', ['5']),
};

function release(o, io = REAL_IO) {
  const read = io.readState(o.version);
  if (read.problems) {
    console.error(`refused: cannot read the repository state\n${read.problems.map((x) => `  - ${x}`).join('\n')}`);
    return 1;
  }
  const sha = io.out('git', ['rev-parse', '--short', 'HEAD']);
  const failures = failedChecks(read.state);
  if (failures.length > 0) {
    console.error(`refused:\n${failures.map((x) => `  - ${x}`).join('\n')}`);
    return 1;
  }
  if (!o.yes && !o.dryRun) {
    console.log(planText(o.version, sha, o.netlify));
    return 0;
  }
  const login = netlifyPreflight(o, io.exec);
  if (login !== 0) return login;
  for (const [cmd, args] of GATES) {
    const code = io.step(`${cmd} ${args.join(' ')}`, cmd, args);
    if (code !== 0) return code;
  }
  if (o.dryRun) {
    console.log(`\ndry run OK: v${o.version} would be tagged at ${sha}. No tag created.`);
    return 0;
  }
  for (const [label, args] of [[`tag v${o.version}`, ['tag', '-a', `v${o.version}`, '-m', `Out Of Credits v${o.version}`]], [`push v${o.version}`, ['push', 'origin', `v${o.version}`]]]) {
    const code = io.step(label, 'git', args);
    if (code !== 0) return code;
  }
  console.log('\nTag pushed. Workflows: https://github.com/recferret-bit/OutOfCredits/actions');
  if (io.exec('gh', ['--version']).status === 0) {
    if (!watchTagRun(o.version, io)) {
      console.error(`\nThe desktop build for v${o.version} did not succeed. The tag stays pushed; see the Actions URL above. Netlify preview skipped.`);
      return 1;
    }
  } else console.log('gh is not installed: open the Actions URL above to follow the builds.');
  if (o.netlify) {
    const code = io.step('Netlify preview', 'node', [SHIP, 'preview']);
    if (code !== 0) return code;
  }
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
  eq(runListArgs('1.2.0').includes('v1.2.0'), true, 'the run is found by its tag');
  eq(runListArgs('1.2.0').includes('--branch'), true, 'gh run list filters by ref');
  eq(parseAheadBehind('0\t0'), [0, 0], 'even with origin');
  eq(parseAheadBehind('3\t1\n'), [3, 1], 'ahead and behind');
  eq(parseAheadBehind(''), null, 'empty rev-list output is not 0/0');
  eq(parseAheadBehind('x\ty'), null, 'non-numeric counts');
  eq(parseAheadBehind('1'), null, 'one count only');
  const fake = (fail = {}, stdout = {}) => (cmd, args) => {
    const key = args[0];
    if (fail[key] !== undefined) return { status: fail[key], stdout: '' };
    return { status: 0, stdout: stdout[key] ?? { 'rev-list': '0\t0', branch: 'main' }[key] ?? '' };
  };
  eq(readStateWith(fake(), '1.2.0', '1.2.0').state, ok, 'a clean read gives the state');
  eq(readStateWith(fake({ fetch: 128 }), '1.2.0', '1.2.0').problems.length, 1, 'refuses when fetch fails');
  eq(readStateWith(fake({ 'rev-parse': 1 }), '1.2.0', '1.2.0').problems.length, 1, 'refuses without origin/main');
  eq(readStateWith(fake({ 'ls-remote': 2 }), '1.2.0', '1.2.0').problems.length, 1, 'a failed ls-remote is not "no tag"');
  eq(readStateWith(fake({ 'rev-list': 128 }), '1.2.0', '1.2.0').problems.length, 1, 'a failed rev-list is not 0/0');
  eq(readStateWith(fake({}, { 'rev-list': 'garbage' }), '1.2.0', '1.2.0').problems.length, 1, 'refuses unreadable ahead/behind');
  eq(readStateWith(fake({}, { 'ls-remote': 'abc\trefs/tags/v1.2.0' }), '1.2.0', '1.2.0').state.tagRemote, true, 'a remote tag is seen');
  // The Netlify login is checked before the gates and the tag, only when --yes will run the preview step.
  const netlifyExec = (loggedIn, calls) => (cmd, args) => {
    calls.push([cmd, ...args].join(' '));
    if (cmd === 'npx') return { status: loggedIn ? 0 : 1, stdout: `{"loggedIn":${loggedIn}}` };
    return { status: 1, stdout: '' };
  };
  const quiet = () => {};
  const calls = [];
  eq(netlifyPreflight(parseCli(['release', '1.2.0', '--yes']), netlifyExec(false, calls), quiet), 2, 'no Netlify login refuses with exit 2');
  eq(calls, ['npx -y netlify-cli@27.20.0 status --json'], 'the login is read with the pinned netlify status');
  eq(netlifyPreflight(parseCli(['release', '1.2.0', '--yes']), netlifyExec(true, []), quiet), 0, 'a Netlify login passes');
  const untouched = [];
  eq(netlifyPreflight(parseCli(['release', '1.2.0', '--yes', '--no-netlify']), netlifyExec(false, untouched), quiet), 0, '--no-netlify skips the login check');
  eq(netlifyPreflight(parseCli(['release', '1.2.0']), netlifyExec(false, untouched), quiet), 0, 'the plan needs no login');
  eq(netlifyPreflight(parseCli(['release', '1.2.0', '--yes', '--dry-run']), netlifyExec(false, untouched), quiet), 0, 'a dry run needs no login');
  eq(untouched, [], 'no login read when the preview step will not run');
  const fakeRun = (loggedIn, extra = []) => {
    const steps = [];
    const io = { readState: () => ({ state: ok }), out: () => 'abc1234', step: (label) => { steps.push(label); return 0; }, exec: netlifyExec(loggedIn, []), sleep: quiet };
    const log = console.log;
    const err = console.error;
    console.log = quiet;
    console.error = quiet;
    try {
      return { code: release(parseCli(['release', '1.2.0', '--yes', ...extra]), io), steps };
    } finally {
      console.log = log;
      console.error = err;
    }
  };
  const refused = fakeRun(false);
  eq([refused.code, refused.steps], [2, []], 'no login: exit 2 before any gate, tag or push');
  const full = fakeRun(true);
  eq([full.code, full.steps.at(0), full.steps.at(-1)], [0, 'npm run quality', 'Netlify preview'], 'logged in: gates first, the preview last');
  eq(full.steps.includes('push v1.2.0'), true, 'logged in: the tag is pushed');
  const noNetlify = fakeRun(false, ['--no-netlify']);
  eq([noNetlify.code, noNetlify.steps.includes('Netlify preview')], [0, false], '--no-netlify releases without a login and without the preview');
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
