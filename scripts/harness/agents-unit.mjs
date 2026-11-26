#!/usr/bin/env node
// Unit tests for the team-agent tooling (part of `npm run quality:agents`): the shell guard hook, the scope hook's baseline,
// the shell rule evaluator and the installer. No Kiro CLI, no network; temporary folders only.
//   node scripts/harness/agents-unit.mjs
// Spec: .kiro/specs/agent-team/.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { changedSince, ownerOf, outOfScope } from '../hooks/agent-scope.mjs';
import { redirectTargets, tokenize, violation } from '../hooks/agent-shell-guard.mjs';
import { emulateProblem, urlProblem, violation as urlViolation } from '../hooks/devtools-url-guard.mjs';
import { mcpProblems } from '../quality/agent-mcp.mjs';
import { globToRegExp, loadAgents, mcpVerdict, shellVerdict } from '../quality/agent-rules.mjs';
import { LEAD, TEAM_NAMES, mcpTable, ownWrites } from './agents-build.mjs';
import { assess } from './crew-doctor.mjs';
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

await test('guard: every agent may redirect into the shared scripts/harness/out/, never through a `..` segment', () => {
  const ctx = { globs: ownWrites('artist'), branch: 'agent/x', isLead: false };
  assert.equal(violation('npm run quality:fingerprint > scripts/harness/out/fp-before.txt', ctx), null);
  assert.equal(violation('node scripts/harness/visual-audit.mjs --selftest 2> ./scripts/harness/out/va.log', ctx), null);
  assert.match(violation('echo x > scripts/harness/out/../../hooks/agent-scope.mjs', ctx), /outside this agent's write paths/);
  assert.match(violation('echo x > src/procgen/../../package.json', ctx), /outside this agent's write paths/);
  assert.match(violation('echo x > scripts/harness/outside.txt', ctx), /outside this agent's write paths/);
});

await test('guard: the shared output allows only relative top-level *.txt|*.log, never its subfolders or a script', () => {
  for (const name of TEAM_NAMES) {
    const ctx = { globs: ownWrites(name), branch: 'agent/x', isLead: name === LEAD };
    for (const ok of ['npm run quality:fingerprint > scripts/harness/out/fp-before.txt', 'npm run quality:fingerprint > scripts/harness/out/fp-after.txt', 'npm run build 2>&1 > scripts/harness/out/build.log'])
      assert.equal(violation(ok, ctx), null, `${name}: ${ok}`);
    for (const bad of [
      'echo x > scripts/harness/out/x.mjs', 'echo x > scripts/harness/out/x.js', 'echo {} > scripts/harness/out/ship/last-preview.json', 'echo {} > scripts/harness/out/ship/site.json',
      'echo {} >> scripts/harness/out/stack/stack.json', 'echo x > scripts/harness/out/sub/a.txt', `echo x > ${projectRoot}/scripts/harness/out/a.txt`,
    ]) assert.match(violation(bad, ctx) ?? '', /outside this agent's write paths/, `${name}: ${bad}`);
    for (const bad of ['node scripts/harness/out/x.mjs', 'node ./scripts/harness/out/x.txt', 'node --test scripts/harness/out/a.log'])
      assert.match(violation(bad, ctx) ?? '', /scripts\/harness\/out/, `${name}: ${bad}`);
  }
});

await test('guard: in a line with cd or pushd, only /dev/null|stdout|stderr may be a redirect target', () => {
  const ctx = { globs: ownWrites('artist'), branch: 'agent/x', isLead: false };
  for (const ok of ['cd src && ls > /dev/null', 'pushd src; ls 2> /dev/stderr', 'cd src && ls 2>&1 | tail -3'])
    assert.equal(violation(ok, ctx), null, ok);
  for (const bad of ['cd src && ls > scripts/harness/out/a.txt', 'cd scripts && echo x > harness/out/a.txt', 'cd src/procgen && echo x > a.txt', 'ls > scripts/harness/out/a.txt && cd src', 'pushd .kiro && echo x >> hooks/a.json', 'cd src/procgen && echo x > src/procgen/a.ts'])
    assert.match(violation(bad, ctx) ?? '', /line with cd/, bad);
});

await test('guard: node runs from the repo root with a script path written out (no cd before it, no globs, no `..`)', () => {
  const ctx = { globs: ownWrites('qa'), branch: 'agent/x', isLead: false };
  for (const ok of ['node scripts/harness/property-tests.mjs --only terminal', 'node scripts/harness/visual-audit.mjs --screens hub,level-* --sizes 1280x820', 'node .kiro/skills/chapter-implementer/scripts/verify-chapter.mjs', 'cd src && ls', 'ls && node scripts/harness/hub-unit.mjs'])
    assert.equal(violation(ok, ctx), null, ok);
  for (const bad of ['cd .kiro/powers/credits-ship/skills/ship && node scripts/ship.mjs prod', 'cd .k*o/p*s/credits-ship/skills/ship; node scripts/sh?p.mjs prod', 'cd src && ls && node scripts/x.mjs', 'node scripts/desktop/build-t*.mjs', 'node scripts/harness/agents-inst{all,x}.mjs', 'node scripts/../.kiro/powers/credits-ship/skills/ship/scripts/ship.mjs prod', 'node "scripts/$X.mjs"'])
    assert.ok(violation(bad, ctx), `should block: ${bad}`);
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
  // The user's commands stay out of reach through `..`, a cd into a power, or command substitution; SKILL.md reads do not.
  for (const name of TEAM_NAMES) {
    for (const c of ['node scripts/../.kiro/powers/credits-ship/skills/ship/scripts/ship.mjs prod', 'node .kiro/skills/../powers/credits-release/skills/release/scripts/release.mjs release 0.1.0 --yes', 'cd .kiro/powers/credits-ship/skills/ship && node scripts/ship.mjs prod', 'node scripts/desktop/build-tauri-steam.mjs', 'node scripts/harness/agents-install.mjs', 'echo $(node x)'])
      assert.equal(shellVerdict(agents[name], c), 'deny', `${name}: ${c}`);
    for (const c of ['node scripts/desktop/desktop-unit.mjs', 'diff scripts/harness/out/a.txt scripts/harness/out/b.txt', 'cat .kiro/powers/credits-ship/skills/ship/SKILL.md'])
      assert.equal(shellVerdict(agents[name], c), 'allow', `${name}: ${c}`);
    // The script names are denied after `node` only: reading them and naming them in a log query stay allowed.
    for (const c of ['cat scripts/desktop/build-tauri-steam.mjs', 'git log -- .kiro/powers/credits-ship/skills/ship/scripts/ship.mjs', 'grep -n yes .kiro/powers/credits-release/skills/release/scripts/release.mjs', 'head -20 scripts/harness/agents-install.mjs', 'npx tsc --noEmit'])
      assert.equal(shellVerdict(agents[name], c), 'allow', `${name}: ${c}`);
    for (const c of ['cd .kiro/powers/credits-tauri-local/skills/tauri-local && node scripts/tauri-local.mjs', 'node scripts/release.mjs release 1.0.0 --yes', 'npx tsc --noEmit -p x', 'npx tsc', 'npx eslint .', 'npx -y netlify-cli@27.20.0 status'])
      assert.equal(shellVerdict(agents[name], c), 'deny', `${name}: ${c}`);
    // Credentials of the user's CLIs (netlify login, gh auth login, ~/.netrc) are never read.
    for (const c of ['cat ~/Library/Preferences/netlify/config.json', 'grep token ~/.config/gh/hosts.yml', 'cat ~/.netrc', 'tail -5 /Users/x/.config/gh/hosts.yml'])
      assert.equal(shellVerdict(agents[name], c), 'deny', `${name}: ${c}`);
    const reads = agents[name].permissions.rules.filter((r) => r.capability === 'fs_read' && r.effect === 'deny').flatMap((r) => r.match);
    for (const secret of ['~/Library/Preferences/netlify/**', '~/.config/gh/**']) assert.ok(reads.includes(secret), `${name}: fs_read must deny ${secret}`);
  }
  assert.equal(shellVerdict(agents[LEAD], 'git commit -m "docs: release.mjs checks the Netlify login first"'), 'allow', 'a commit message may name a power script');
});

await test('ownership: one owner per path in the table, designers cannot write compiled output', () => {
  const owners = (p) => TEAM_NAMES.filter((n) => ownWrites(n).some((g) => globToRegExp(g).test(p)));
  for (const p of ['src/laptop/domain/tasks.ts', 'src/game/shell.ts', 'src/game/session.ts', 'src/chapters/session-fs.ts', 'comix/intro/comix.manifest.json', 'src/procgen/index.ts', 'docs/qa/README.md', 'docs/AGENTS_CREW.md', 'AGENTS.md', '.kiro/specs/agent-team/design.md', 'scripts/harness/props/laptop.mjs', 'scripts/harness/props/kit.mjs']) assert.equal(owners(p).length, 1, `${p}: ${owners(p)}`);
  for (const [p, who] of [['scripts/harness/manual-unit.mjs', 'terminal-designer'], ['scripts/harness/manual-smoke.mjs', 'terminal-designer'], ['scripts/harness/audio-unit.mjs', LEAD], ['scripts/harness/audio-smoke.mjs', LEAD], ['scripts/harness/hub-unit.mjs', LEAD], ['scripts/harness/battle-unit.mjs', 'chapters-designer'], ['scripts/harness/terminal-lab/skin.lab.json', 'terminal-designer']])
    assert.deepEqual(owners(p), [who], p);
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

await test('crew doctor: a ready machine passes; each missing piece is a named FAIL with a fix; secrets are never printed', () => {
  const links = Object.fromEntries(TEAM_NAMES.map((n) => [n, 'ours']));
  const ready = {
    repo: '/r', kiroCli: '3.4.0', kirocrew: '0.12.1', agentLinks: links, promptsLink: 'ours', agentsValid: [...TEAM_NAMES], autoApproveListed: false, gateway: true, branch: 'main', dirty: 0, remote: 'git@github.com:a/b.git', protection: 'yes',
    crewConfig: { workspaces: { w: { dir: '/r' } }, agents: { m: { kiro_agent: 'lead-dev', workspace: 'w' } }, agent: { approval_mode: 'auto' } },
  };
  assert.deepEqual(assess(ready).filter((r) => r.level !== 'ok'), []);
  const bad = (patch, what) => {
    const r = assess({ ...ready, ...patch }).filter((x) => x.level === 'fail');
    assert.ok(r.some((x) => what.test(x.what)) && r.every((x) => x.fix), `${what}: ${JSON.stringify(r)}`);
  };
  bad({ agentLinks: { ...links, qa: 'none' } }, /not linked.*qa/);
  bad({ agentsValid: [] }, /validate fails/);
  bad({ crewConfig: { ...ready.crewConfig, workspaces: { w: { dir: '/old' } } } }, /no Crew workspace points/);
  bad({ crewConfig: { ...ready.crewConfig, agents: {} } }, /no Crew member runs lead-dev/);
  bad({ crewConfig: { ...ready.crewConfig, agents: { m: { kiro_agent: 'lead-dev', workspace: 'other' } } } }, /not in the repo workspace/);
  bad({ autoApproveListed: true }, /autoApprove/);
  bad({ remote: null }, /origin/);
  bad({ protection: 'no' }, /not protected/);
  const warns = assess({ ...ready, gateway: false, dirty: 3, protection: 'unknown' }).filter((x) => x.level === 'warn').map((x) => x.what);
  assert.equal(warns.length, 3);
  assert.ok(!JSON.stringify(assess({ ...ready, remote: 'git@github.com:a/SECRET-123.git'.replace('SECRET-123', 'b') })).includes('TOKEN'), 'no token is ever read, so none can be printed');
});

// ---- MCP (spec .kiro/specs/mcp-devtools-and-forge/) ----------------------------------------------------------------

await test('devtools url guard: only the local dev servers and https Netlify sites open; credentials and other schemes never', () => {
  for (const ok of ['http://localhost:5173/play?nointro=1', 'http://127.0.0.1:5342/', 'https://out-of-credits.netlify.app/play', 'about:blank', 'https://abc--def.netlify.app/']) assert.equal(urlProblem(ok), '', ok);
  for (const bad of ['https://example.com', 'http://localhost@evil.test/', 'https://netlify.app.evil.test/', 'http://abc.netlify.app/', 'https://localhost.evil.test/', 'ftp://localhost/', 'localhost:5173', '']) assert.notEqual(urlProblem(bad), '', bad);
  assert.equal(urlViolation({ type: 'url', url: 'http://localhost:5173/' }), '');
  assert.notEqual(urlViolation({ url: 'https://example.com' }), '');
  assert.notEqual(urlViolation({ urls: ['http://localhost:5173/', 'https://example.com'] }), '');
  assert.notEqual(urlViolation({ nested: { deeper: [{ text: 'file:///etc/passwd' }] } }), '');
  assert.notEqual(urlViolation({ text: 'javascript:alert(1)' }), '');
  assert.equal(urlViolation({ text: 'kill -9 1011', submitKey: 'Enter' }), '');
  assert.equal(urlViolation({ text: 'curl http://example.com' }), '', 'typed text is not a navigation');
  // emulate: CPU throttling only (spec qa-visual-audit, Q5).
  for (const name of ['emulate', '@chrome-devtools/emulate', 'chrome-devtools_emulate']) {
    assert.equal(emulateProblem(name, { cpuThrottlingRate: 4 }), '', name);
    assert.equal(emulateProblem(name, { cpuThrottlingRate: 4, pageId: 1 }), '', `${name} with pageId`);
    assert.notEqual(emulateProblem(name, { pageId: 1, geolocation: { latitude: 1, longitude: 1 } }), '', `${name} pageId does not excuse other fields`);
    assert.notEqual(emulateProblem(name, { cpuThrottlingRate: 4, userAgent: 'x' }), '', name);
    assert.notEqual(emulateProblem(name, { extraHttpHeaders: { a: 'b' } }), '', name);
  }
  assert.equal(emulateProblem('take_screenshot', { userAgent: 'x' }), '');
});

await test('devtools url guard hook end to end: exit 0 for the game, exit 2 and a reason for another site, 0 for an unreadable event', () => {
  const run = (input) => spawnSync('node', ['scripts/hooks/devtools-url-guard.mjs', 'qa'], { cwd: projectRoot, input, encoding: 'utf8' });
  const ok = run(JSON.stringify({ tool_name: 'navigate_page', tool_input: { type: 'url', url: 'http://localhost:5173/play' } }));
  assert.equal(ok.status, 0);
  const bad = run(JSON.stringify({ tool_name: 'new_page', tool_input: { url: 'https://example.com/steal' } }));
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /devtools-url-guard: blocked for qa/);
  assert.match(bad.stderr, /example\.com/);
  assert.equal(run('not json').status, 0);
  assert.equal(run(JSON.stringify({ tool_name: 'take_screenshot', tool_input: {} })).status, 0);
});

/** The real agents, table and prompts, with `mutate(agents)` applied to a copy; the problems the MCP gate finds. */
function mcpWith(mutate = () => {}, { mcpJsonText = '{"mcpServers":{}}', promptOf } = {}) {
  const real = loadAgents(projectRoot);
  const copy = structuredClone(real);
  mutate(Object.fromEntries(copy.map((a) => [a.name, a.agent])));
  return mcpProblems({
    agents: copy,
    table: mcpTable(),
    mcpJsonText,
    promptText: (name) => (promptOf ? promptOf(name) : readFileSync(join(projectRoot, '.kiro/agents/prompts', `${name}.md`), 'utf8')),
    fileExists: (rel) => existsSync(join(projectRoot, rel)),
    pinned: (({ dependencies = {}, devDependencies = {} }) => ({ ...dependencies, ...devDependencies }))(JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'))),
  });
}

await test('mcp gate: the real agents pass; each planted-bad change is named', () => {
  assert.deepEqual(mcpWith(), []);
  const planted = {
    'a wildcard selector': [(a) => a.qa.tools.push('@chrome-devtools'), /wildcard|must be @server\/tool|differ/],
    'the @mcp selector': [(a) => a.qa.tools.push('@mcp'), /wildcard|differ/],
    'write_level for a second agent': [(a) => { a['comix-designer'].tools.push('@credits-forge/write_level'); a['comix-designer'].permissions.rules.find((r) => r.capability === 'mcp' && r.effect === 'allow').match.push('credits-forge/write_level'); }, /only chapters-designer may hold/],
    'an unpinned npx server': [(a) => { a.qa.mcpServers['chrome-devtools'] = { ...a.qa.mcpServers['chrome-devtools'], command: 'npx', args: ['-y', 'chrome-devtools-mcp@latest', ...a.qa.mcpServers['chrome-devtools'].args.slice(1)] }; }, /pinned to an exact version/],
    'a server script that does not exist': [(a) => { a.qa.mcpServers['credits-forge'] = { command: 'node', args: ['scripts/mcp/missing.mjs'] }; }, /which does not exist/],
    'includePowers on': [(a) => { a.qa.includePowers = true; }, /includePowers must be false/],
    'JavaScript evaluation switched on': [(a) => { const args = a.qa.mcpServers['chrome-devtools'].args; args.splice(args.indexOf('--no-javascript-evaluation'), 1); }, /--no-javascript-evaluation/],
    'a site outside the allowed list': [(a) => a.qa.mcpServers['chrome-devtools'].args.push('--allowedUrlPattern', 'https://evil.test/*'), /may list only localhost/],
    'the browser server for a second agent': [(a) => { a.artist.mcpServers = { 'chrome-devtools': a.qa.mcpServers['chrome-devtools'] }; }, /only qa may hold chrome-devtools|mcpServers/],
    'a server on the lead': [(a) => { a['lead-dev'].mcpServers = { 'credits-forge': a.qa.mcpServers['credits-forge'] }; }, /orchestrator holds permissions/],
    'includeMcpJson on': [(a) => { a.artist.includeMcpJson = true; }, /includeMcpJson must be false/],
    'no catch-all deny': [(a) => { a.artist.permissions.rules = a.artist.permissions.rules.filter((r) => r.capability !== 'mcp'); }, /mcp needs a deny/],
    'a looser allow list': [(a) => a.qa.permissions.rules.find((r) => r.capability === 'mcp' && r.effect === 'allow').match.push('credits-forge/write_level'), /mcp allow rules must be exactly|mcp rule self-test/],
    'no devtools hook': [(a) => { a.qa.hooks = a.qa.hooks.filter((h) => h.name !== 'devtools-url-guard'); }, /devtools-url-guard/],
    'a server the table does not list': [(a) => { a.terminal_designer = undefined; a['terminal-designer'].mcpServers = { 'credits-forge': a.qa.mcpServers['credits-forge'] }; }, /mcpServers/],
  };
  for (const [what, [mutate, expected]] of Object.entries(planted)) {
    const found = mcpWith(mutate);
    assert.ok(found.some((p) => expected.test(p)), `${what}: expected ${expected}, got ${JSON.stringify(found)}`);
  }
  assert.ok(mcpWith(() => {}, { mcpJsonText: '{"mcpServers":{"x":{"command":"y"}}}' }).some((p) => /must stay empty/.test(p)));
  assert.ok(mcpWith(() => {}, { mcpJsonText: '{' }).some((p) => /not valid JSON/.test(p)));
  assert.ok(mcpWith(() => {}, { promptOf: () => '' }).some((p) => /must name "take_screenshot"/.test(p)));
});

await test('mcp rules, as Kiro reads them: qa looks and reads, chapters-designer alone writes, the rest and the lead follow the table', () => {
  const v = (name, tool) => mcpVerdict(agents[name], tool);
  assert.equal(v('qa', 'chrome-devtools/take_screenshot'), 'allow');
  assert.equal(v('qa', 'chrome-devtools/evaluate_script'), 'deny');
  assert.equal(v('qa', 'chrome-devtools/upload_file'), 'deny');
  assert.equal(v('qa', 'credits-forge/validate_level'), 'allow');
  assert.equal(v('qa', 'credits-forge/write_level'), 'deny');
  assert.equal(v('chapters-designer', 'credits-forge/write_level'), 'allow');
  assert.equal(v('chapters-designer', 'chrome-devtools/take_screenshot'), 'deny');
  assert.equal(v('comix-designer', 'credits-forge/list_assets'), 'allow');
  assert.equal(v('comix-designer', 'credits-forge/validate_level'), 'deny');
  for (const name of ['terminal-designer', 'laptop-designer', 'artist']) assert.equal(v(name, 'credits-forge/list_assets'), 'deny', name);
  // The lead holds no tool of its own, but allows its sub-agents' calls (Kiro checks them against the parent session).
  assert.equal(agents['lead-dev'].tools.filter((t) => t.startsWith('@')).length, 0);
  assert.equal(v('lead-dev', 'credits-forge/write_level'), 'allow');
  assert.equal(v('lead-dev', 'chrome-devtools/take_screenshot'), 'allow');
  assert.equal(v('lead-dev', 'chrome-devtools/evaluate_script'), 'deny');
});

console.log(`\nagents unit: ${count()} tests passed`);
