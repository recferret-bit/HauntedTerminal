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
import { urlProblem, violation as urlViolation } from '../hooks/devtools-url-guard.mjs';
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
  for (const ok of ['http://localhost:5173/play?nointro=1', 'http://127.0.0.1:5342/', 'https://haunted-terminal.netlify.app/play', 'about:blank', 'https://abc--def.netlify.app/']) assert.equal(urlProblem(ok), '', ok);
  for (const bad of ['https://example.com', 'http://localhost@evil.test/', 'https://netlify.app.evil.test/', 'http://abc.netlify.app/', 'https://localhost.evil.test/', 'ftp://localhost/', 'localhost:5173', '']) assert.notEqual(urlProblem(bad), '', bad);
  assert.equal(urlViolation({ type: 'url', url: 'http://localhost:5173/' }), '');
  assert.notEqual(urlViolation({ url: 'https://example.com' }), '');
  assert.notEqual(urlViolation({ urls: ['http://localhost:5173/', 'https://example.com'] }), '');
  assert.notEqual(urlViolation({ nested: { deeper: [{ text: 'file:///etc/passwd' }] } }), '');
  assert.notEqual(urlViolation({ text: 'javascript:alert(1)' }), '');
  assert.equal(urlViolation({ text: 'kill -9 1011', submitKey: 'Enter' }), '');
  assert.equal(urlViolation({ text: 'curl http://example.com' }), '', 'typed text is not a navigation');
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
    'write_level for a second agent': [(a) => { a['comix-designer'].tools.push('@haunted-forge/write_level'); a['comix-designer'].permissions.rules.find((r) => r.capability === 'mcp' && r.effect === 'allow').match.push('haunted-forge/write_level'); }, /only chapters-designer may hold/],
    'an unpinned npx server': [(a) => { a.qa.mcpServers['chrome-devtools'] = { ...a.qa.mcpServers['chrome-devtools'], command: 'npx', args: ['-y', 'chrome-devtools-mcp@latest', ...a.qa.mcpServers['chrome-devtools'].args.slice(1)] }; }, /pinned to an exact version/],
    'a server script that does not exist': [(a) => { a.qa.mcpServers['haunted-forge'] = { command: 'node', args: ['scripts/mcp/missing.mjs'] }; }, /which does not exist/],
    'includePowers on': [(a) => { a.qa.includePowers = true; }, /includePowers must be false/],
    'JavaScript evaluation switched on': [(a) => { const args = a.qa.mcpServers['chrome-devtools'].args; args.splice(args.indexOf('--no-javascript-evaluation'), 1); }, /--no-javascript-evaluation/],
    'a site outside the allowed list': [(a) => a.qa.mcpServers['chrome-devtools'].args.push('--allowedUrlPattern', 'https://evil.test/*'), /may list only localhost/],
    'the browser server for a second agent': [(a) => { a.artist.mcpServers = { 'chrome-devtools': a.qa.mcpServers['chrome-devtools'] }; }, /only qa may hold chrome-devtools|mcpServers/],
    'a server on the lead': [(a) => { a['lead-dev'].mcpServers = { 'haunted-forge': a.qa.mcpServers['haunted-forge'] }; }, /orchestrator holds permissions/],
    'includeMcpJson on': [(a) => { a.artist.includeMcpJson = true; }, /includeMcpJson must be false/],
    'no catch-all deny': [(a) => { a.artist.permissions.rules = a.artist.permissions.rules.filter((r) => r.capability !== 'mcp'); }, /mcp needs a deny/],
    'a looser allow list': [(a) => a.qa.permissions.rules.find((r) => r.capability === 'mcp' && r.effect === 'allow').match.push('haunted-forge/write_level'), /mcp allow rules must be exactly|mcp rule self-test/],
    'no devtools hook': [(a) => { a.qa.hooks = a.qa.hooks.filter((h) => h.name !== 'devtools-url-guard'); }, /devtools-url-guard/],
    'a server the table does not list': [(a) => { a.terminal_designer = undefined; a['terminal-designer'].mcpServers = { 'haunted-forge': a.qa.mcpServers['haunted-forge'] }; }, /mcpServers/],
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
  assert.equal(v('qa', 'haunted-forge/validate_level'), 'allow');
  assert.equal(v('qa', 'haunted-forge/write_level'), 'deny');
  assert.equal(v('chapters-designer', 'haunted-forge/write_level'), 'allow');
  assert.equal(v('chapters-designer', 'chrome-devtools/take_screenshot'), 'deny');
  assert.equal(v('comix-designer', 'haunted-forge/list_assets'), 'allow');
  assert.equal(v('comix-designer', 'haunted-forge/validate_level'), 'deny');
  for (const name of ['terminal-designer', 'laptop-designer', 'artist']) assert.equal(v(name, 'haunted-forge/list_assets'), 'deny', name);
  // The lead holds no tool of its own, but allows its sub-agents' calls (Kiro checks them against the parent session).
  assert.equal(agents['lead-dev'].tools.filter((t) => t.startsWith('@')).length, 0);
  assert.equal(v('lead-dev', 'haunted-forge/write_level'), 'allow');
  assert.equal(v('lead-dev', 'chrome-devtools/take_screenshot'), 'allow');
  assert.equal(v('lead-dev', 'chrome-devtools/evaluate_script'), 'deny');
});

console.log(`\nagents unit: ${count()} tests passed`);
