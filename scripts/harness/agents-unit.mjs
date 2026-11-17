#!/usr/bin/env node
// Unit tests for the team-agent tooling (part of `npm run quality:agents`): the shell guard hook, the scope hook's baseline,
// the shell rule evaluator and the installer. No Kiro CLI, no network; temporary folders only.
//   node scripts/harness/agents-unit.mjs
// Spec: .kiro/specs/agent-team/.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { changedSince, ownerOf, outOfScope } from '../hooks/agent-scope.mjs';
import { redirectTargets, tokenize, violation } from '../hooks/agent-shell-guard.mjs';
import { globToRegExp, loadAgents, shellVerdict } from '../quality/agent-rules.mjs';
import { LEAD, TEAM_NAMES, ownWrites } from './agents-build.mjs';
import { projectRoot } from './lib/load.mjs';
import { testRunner } from './lib/test-kit.mjs';

const { test, count } = testRunner();
const agents = Object.fromEntries(loadAgents(projectRoot).map((a) => [a.name, a.agent]));

await test('globs: ** spans folders, * stays in one, braces expand', () => {
  const m = (g, p) => globToRegExp(g).test(p);
  assert.ok(m('src/laptop/**', 'src/laptop/domain/tasks.ts') && m('src/laptop/**', 'src/laptop/a.ts'));
  assert.ok(!m('src/laptop/**', 'src/laptops/a.ts') && !m('docs/*.md', 'docs/qa/README.md') && m('docs/*.md', 'docs/AGENTS_CREW.md'));
  assert.ok(m('src/game/{shell,tree}.ts', 'src/game/tree.ts') && !m('src/game/{shell,tree}.ts', 'src/game/play.ts'));
  assert.ok(m('chapters/*/story/out/**', 'chapters/chapter-01-kiroween/story/out/page-01.png'));
});

await test('guard tokenizer: quotes keep `>` literal; redirects, fd copies and `&>` are told apart', () => {
  assert.deepEqual(redirectTargets(tokenize('echo hi > docs/a.txt')), ['docs/a.txt']);
  assert.deepEqual(redirectTargets(tokenize('echo "a > b" ls')), []);
  assert.deepEqual(redirectTargets(tokenize('npm run quality 2>&1 | tail -5')), []);
  assert.deepEqual(redirectTargets(tokenize('cmd >> log.txt 2> err.txt')), ['log.txt', 'err.txt']);
  assert.deepEqual(redirectTargets(tokenize('cmd &> all.txt')), ['all.txt']);
  assert.deepEqual(redirectTargets(tokenize("cat 'x>y' >/dev/null")), ['/dev/null']);
});

await test('guard: a redirect outside the agent\'s paths is blocked, inside or /dev/null is not', () => {
  const ctx = { globs: ownWrites('laptop-designer'), branch: 'agent/x', isLead: false };
  assert.match(violation('echo x > docs/b.txt', ctx), /outside this agent's write paths/);
  assert.match(violation('cat a && echo x >> src/ui/a.ts', ctx), /src\/ui\/a\.ts/);
  assert.equal(violation('echo x > src/laptop/a.txt', ctx), null);
  assert.equal(violation('npm run quality > /dev/null 2>&1', ctx), null);
  assert.equal(violation('node scripts/harness/property-tests.mjs --only laptop 2>&1 | tail -20', ctx), null);
});

await test('guard: git history is the lead\'s, only on agent/<task>, never on main, never forced or amended', () => {
  const lead = { globs: ownWrites(LEAD), branch: 'agent/tune', isLead: true };
  for (const ok of ['git switch -c agent/tune', 'git add -- src/a.ts docs/qa/r.md', 'git commit -m "x: y"', 'git push -u origin agent/tune', 'git push origin agent/maintenance-x', 'git status', 'git diff --stat'])
    assert.equal(violation(ok, lead), null, ok);
  for (const bad of ['git add -A', 'git add .', 'git add -u', 'git add src/a.ts', 'git commit --amend -m x', 'git commit -am x', 'git push origin HEAD:main', 'git push origin +agent/tune', 'git push origin --delete agent/tune', 'git push --mirror', 'git push origin v1', 'git push --force origin agent/tune', 'git push origin agent/tune extra', 'git -c core.x=1 push origin main', 'git -C . push origin master'])
    assert.ok(violation(bad, lead), `should block: ${bad}`);
  for (const w of ['commit -m x', 'merge agent/x', 'push -u origin agent/tune', 'rebase main', 'cherry-pick abc']) assert.match(violation(`git ${w}`, { ...lead, branch: 'main' }), /main|master|agent\//, `main: ${w}`);
  assert.match(violation('git commit -m x', { globs: ownWrites('qa'), branch: 'agent/x', isLead: false }), /lead-dev only/);
});

await test('shell rules: an allow-list that also refuses everything else, per agent, evaluated like Kiro does', () => {
  const lead = agents[LEAD];
  const want = { deny: ['find . -delete', 'printf x', 'node -e 1', 'rm f', 'git push origin HEAD:main', 'git push origin +agent/x', 'git checkout main', 'git reset --hard', 'git diff --output=x', 'cat .env', 'echo hi && printf x'], allow: ['git status', 'ls src', 'cat package.json', 'node scripts/harness/property-tests.mjs', 'git push -u origin agent/maintenance-x', 'npm run quality 2>&1 | tail -3', 'cd src && ls'] };
  for (const c of want.deny) assert.equal(shellVerdict(lead, c), 'deny', c);
  for (const c of want.allow) assert.equal(shellVerdict(lead, c), 'allow', c);
  assert.equal(shellVerdict(agents['artist'], 'git commit -m x'), 'deny');
  assert.equal(shellVerdict(agents['qa'], 'cp scripts/harness/out/play-1.png docs/qa/media/a.png'), 'allow');
  assert.equal(shellVerdict(agents[LEAD], 'cp scripts/harness/out/play-1.png docs/qa/media/a.png'), 'allow', 'the lead session must cover its sub-agents');
  assert.equal(shellVerdict(agents['artist'], 'cp scripts/harness/out/play-1.png docs/qa/media/a.png'), 'deny');
});

await test('ownership: one owner per path in the table, designers cannot write compiled output', () => {
  const owners = (p) => TEAM_NAMES.filter((n) => ownWrites(n).some((g) => globToRegExp(g).test(p)));
  for (const p of ['src/laptop/domain/tasks.ts', 'src/game/shell.ts', 'src/game/session.ts', 'src/chapters/session-fs.ts', 'comix/intro/comix.manifest.json', 'src/procgen/index.ts', 'docs/qa/README.md', 'docs/AGENTS_CREW.md', 'AGENTS.md', '.kiro/specs/agent-team/design.md', 'scripts/harness/props/laptop.mjs', 'scripts/harness/props/kit.mjs']) assert.equal(owners(p).length, 1, `${p}: ${owners(p)}`);
  for (const p of ['.kiro/agents/qa.json', '.kiro/hooks/x.json', 'package.json', 'scripts/hooks/agent-scope.mjs']) assert.equal(owners(p).length, 0, `${p} must be nobody's`);
  for (const name of TEAM_NAMES.filter((n) => n !== LEAD)) {
    const deny = agents[name].permissions.rules.find((r) => r.capability === 'fs_write' && r.effect === 'deny' && r.match.includes('src/chapters/generated/**'));
    assert.ok(deny, `${name} must deny the compiled output`);
  }
});

await test('scope hook: only changes since the baseline count, owners are named, shared output is ignored', () => {
  const before = { 'a.ts': 'h1', 'b.ts': 'h2' };
  const now = { 'a.ts': 'h1', 'b.ts': 'CHANGED', 'c.ts': 'h3' };
  assert.deepEqual(changedSince(before, now), ['b.ts', 'c.ts']);
  assert.deepEqual(changedSince({ 'x.ts': 'h' }, {}), ['x.ts']);
  assert.deepEqual(outOfScope(['src/laptop/a.ts', 'src/chapters/generated/catalog-data.ts', 'scripts/harness/out/p.png', 'src/ui/a.ts'], ownWrites('laptop-designer')), ['src/ui/a.ts']);
  const table = Object.fromEntries(TEAM_NAMES.map((n) => [n, ownWrites(n)]));
  assert.equal(ownerOf('src/ui/a.ts', table), 'terminal-designer');
  assert.equal(ownerOf('package.json', table), null);
});

await test('scope hook end to end: snapshot, then a change outside the paths is reported with its owner (exit 1 only with --strict)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-scope-'));
  try {
    const run = (args) => spawnSync('node', [join(projectRoot, 'scripts/hooks/agent-scope.mjs'), ...args], { cwd: dir, encoding: 'utf8' });
    execFileSync('git', ['init', '-q'], { cwd: dir });
    for (const d of ['src/laptop', 'src/ui', 'docs']) mkdirSync(join(dir, d), { recursive: true });
    writeFileSync(join(dir, 'docs/old.md'), 'dirty before the session');
    assert.equal(run(['laptop-designer', '--snapshot']).status, 0);
    writeFileSync(join(dir, 'src/laptop/in.ts'), 'a');
    assert.equal(run(['laptop-designer']).stdout, '', 'in scope and pre-existing dirt are silent');
    writeFileSync(join(dir, 'src/ui/out.ts'), 'b');
    assert.equal(run(['laptop-designer', '--strict']).status, 1, '--strict exits 1 (and keeps the baseline)');
    const report = run(['laptop-designer']);
    assert.match(report.stdout, /src\/ui\/out\.ts.*owned by terminal-designer/);
    assert.doesNotMatch(report.stdout, /old\.md|in\.ts/);
    assert.equal(report.status, 0, 'a hook never fails the turn');
    assert.equal(run(['laptop-designer']).stdout, '', 'reported once, then the baseline moves on');
    assert.equal(run(['nobody']).status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

await test('installer: links agents and prompts, is idempotent, refuses to overwrite, removes only its own links', () => {
  const home = mkdtempSync(join(tmpdir(), 'agent-home-'));
  try {
    const run = (...args) => spawnSync('node', [join(projectRoot, 'scripts/harness/agents-install.mjs'), ...args], { env: { ...process.env, HOME: home }, encoding: 'utf8' });
    const target = join(home, '.kiro/agents');
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, 'qa.json'), '{}');
    const clash = run();
    assert.equal(clash.status, 1);
    assert.match(clash.stdout, /CLASH.*qa\.json/);
    assert.equal(lstatSync(join(target, 'qa.json')).isSymbolicLink(), false, 'a foreign file is never replaced');
    rmSync(join(target, 'qa.json'));
    assert.equal(run().status, 0);
    assert.equal(run().status, 0, 'a second run is harmless');
    assert.ok(readdirSync(target).filter((f) => lstatSync(join(target, f)).isSymbolicLink()).length >= TEAM_NAMES.length + 1);
    symlinkSync('/tmp', join(target, 'other.json'));
    assert.equal(run('--remove').status, 0);
    assert.deepEqual(readdirSync(target), ['other.json'], 'only our links go');
    assert.equal(existsSync(join(projectRoot, '.kiro/agents/qa.json')), true, 'the repo files stay');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

console.log(`\nagents unit: ${count()} tests passed`);
