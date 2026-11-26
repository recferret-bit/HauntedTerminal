#!/usr/bin/env node
// Team-agent gate (npm run quality:agents). Checks what `kiro-cli agent validate` does not: the seven agents in
// .kiro/agents/ match the team table, use known capabilities and effects, load within the CLI limits, keep git writes
// to the lead, and together give every source file exactly one owner. Spec: .kiro/specs/agent-team/.
//   node scripts/quality/check-agents.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { GENERATED_PATHS, LEAD, PERSON_ONLY_PATHS, TEAM_NAMES, agentTexts, mcpTable, ownWrites } from '../harness/agents-build.mjs';
import { violation } from '../hooks/agent-shell-guard.mjs';
import { mcpProblems } from './agent-mcp.mjs';
import { globToRegExp, loadAgents, shellVerdict, writeRules } from './agent-rules.mjs';

const root = process.cwd();
const problems = [];
const CAPABILITIES = new Set(['fs_read', 'fs_write', 'shell', 'web_fetch', 'web_search', 'mcp', 'subagent', 'skill', 'power', 'context', 'diagnostics', 'sandbox_network', 'all', 'builtin', 'filesystem']);
const EFFECTS = new Set(['allow', 'ask', 'deny', 'evaluate']);
const TRIGGERS = new Set(['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop', 'SessionEnd', 'PreCompact', 'PostCompact', 'PermissionRequest']);
/** Kiro CLI 3.1+ limits on `file://` resources. */
const MAX_FILES = 32;
const MAX_CHARS = 100_000;
/** Paths that must have exactly one owner: source, content, assets, property suites, docs and the files agents keep current. */
const OWNED = /^(src\/|chapters\/|comix\/|public\/assets\/|scripts\/harness\/props\/|scripts\/harness\/terminal-lab\/|scripts\/harness\/(?:battle-unit|manual-unit|manual-smoke|audio-unit|audio-smoke|hub-unit)\.mjs$|scripts\/harness\/property-tests\.mjs$|scripts\/harness\/visual-audit\.mjs$|scripts\/harness\/lib\/visual-[^/]+\.mjs$|scripts\/harness\/visual\/|docs\/|\.kiro\/specs\/|\.kiro\/steering\/|(AGENTS|CLAUDE|README)\.md$)/;
/** Infrastructure no agent writes (it holds their own fences, the harness and the build): a change is the user's. */
const INFRA = /^(scripts\/|\.github\/|\.kiro\/(agents|hooks|skills|settings|powers)\/|pages\/|public\/_redirects$|public\/comix\/|public\/fonts\/|public\/(?:music|sfx)\/|package(-lock)?\.json$|tsconfig\.json$|vite\.config\.ts$|LICENSE$|\.gitignore$)/;
/** Compiled output: written by the compilers for whoever ran them, owned by nobody. */
const UNOWNED = [/^src\/chapters\/generated\//, /^src\/cinematic\/generated\//, /^chapters\/[^/]+\/story\/out\//, /^docs\/qa\/baselines\//];

const agents = loadAgents(root);
const byName = new Map(agents.map((a) => [a.name, a.agent]));

// 1. The files are exactly the table's output (no hand edits, nothing missing or extra).
const texts = agentTexts();
for (const name of TEAM_NAMES) {
  const path = join(root, '.kiro/agents', `${name}.json`);
  if (!existsSync(path)) problems.push(`.kiro/agents/${name}.json is missing (run node scripts/harness/agents-build.mjs)`);
  else if (readFileSync(path, 'utf8') !== texts[name]) problems.push(`.kiro/agents/${name}.json differs from scripts/harness/agents-build.mjs (edit the table, then run it)`);
}
for (const { name } of agents) if (!TEAM_NAMES.includes(name)) problems.push(`.kiro/agents/${name}.json is not in the team table`);

for (const { file, name, agent } of agents) {
  // 2. Shape and values the validator does not check.
  if (agent.name !== name) problems.push(`${file}: name "${agent.name}" must equal the file name`);
  if (agent.model !== 'auto') problems.push(`${file}: model must be "auto" (a pinned model can be unavailable in an unattended Crew session)`);
  if (!Array.isArray(agent.allowedTools)) problems.push(`${file}: needs "allowedTools": [] (Kiro CLI 3.3 drops a profile with permissions and no allowedTools)`);
  if (typeof agent.description !== 'string' || agent.description.length < 40) problems.push(`${file}: description too short for routing`);
  const prompt = String(agent.prompt ?? '');
  const promptPath = prompt.startsWith('file://./') ? join(root, '.kiro/agents', prompt.slice('file://./'.length)) : null;
  if (!promptPath || !existsSync(promptPath)) problems.push(`${file}: prompt must be file://./prompts/<name>.md and exist`);
  for (const rule of agent.permissions?.rules ?? []) {
    if (!CAPABILITIES.has(rule.capability)) problems.push(`${file}: unknown capability "${rule.capability}"`);
    if (!EFFECTS.has(rule.effect)) problems.push(`${file}: unknown effect "${rule.effect}"`);
    if (!Array.isArray(rule.match) || !rule.match.length) problems.push(`${file}: a ${rule.capability} rule has no match list`);
  }
  for (const hook of Array.isArray(agent.hooks) ? agent.hooks : []) if (!TRIGGERS.has(hook.trigger)) problems.push(`${file}: unknown hook trigger "${hook.trigger}"`);

  // 3. Resources resolve and stay within the CLI limits.
  let files = 0;
  let chars = 0;
  for (const res of agent.resources ?? []) {
    const m = /^(file|skill):\/\/(.+)$/.exec(res);
    if (!m) continue;
    const path = join(root, m[2]);
    if (!existsSync(path) || !statSync(path).isFile()) {
      problems.push(`${file}: resource ${res} does not exist`);
      continue;
    }
    if (m[1] === 'file') {
      files += 1;
      chars += readFileSync(path, 'utf8').length;
    }
  }
  if (files > MAX_FILES) problems.push(`${file}: ${files} file:// resources (limit ${MAX_FILES})`);
  if (chars > MAX_CHARS) problems.push(`${file}: ${chars} characters of file:// resources (limit ${MAX_CHARS})`);
  const hooks = Array.isArray(agent.hooks) ? agent.hooks : [];
  const hookCmd = (trigger) => hooks.filter((h) => h.trigger === trigger).map((h) => h.action?.command ?? '').join(' ');
  if (!hookCmd('Stop').includes(`agent-scope.mjs ${name}`) || hookCmd('Stop').includes('--snapshot')) problems.push(`${file}: needs the Stop hook "node scripts/hooks/agent-scope.mjs ${name}"`);
  if (!hookCmd('SessionStart').includes(`agent-scope.mjs ${name} --snapshot`)) problems.push(`${file}: needs the SessionStart hook "node scripts/hooks/agent-scope.mjs ${name} --snapshot"`);
  if (!hookCmd('PreToolUse').includes(`agent-shell-guard.mjs ${name}`)) problems.push(`${file}: needs the PreToolUse hook "node scripts/hooks/agent-shell-guard.mjs ${name}" (redirects and git refspecs are invisible to shell rules)`);

  // 4. The shell is an allow-list written twice (allow, and a catch-all deny that excludes it), so a command that matches
  //    no rule is refused even where Kiro auto-approves (Crew Automatic mode). Git history writes belong to the lead.
  const shellRules = (agent.permissions?.rules ?? []).filter((r) => r.capability === 'shell');
  const allowShell = shellRules.filter((r) => r.effect === 'allow').flatMap((r) => r.match);
  const catchAll = shellRules.find((r) => r.effect === 'deny' && r.match.length === 1 && r.match[0] === '*');
  if (!catchAll || JSON.stringify([...(catchAll.exclude ?? [])].sort()) !== JSON.stringify([...allowShell].sort())) problems.push(`${file}: shell needs a deny on "*" whose exclude list equals the shell allow list`);
  for (const bad of ['find *', 'node -e*', 'sed *', 'tee *', 'xargs *', 'curl *', 'git diff*', 'git push*', 'git checkout*', 'git reset*']) if (allowShell.includes(bad)) problems.push(`${file}: shell allow list must not contain "${bad}"`);
  if (name !== LEAD) {
    if (allowShell.some((p) => /^git (commit|push|add|switch|merge|tag)/.test(p))) problems.push(`${file}: only ${LEAD} may write git history`);
    if ((agent.tools ?? []).some((t) => String(t).startsWith('subagent'))) problems.push(`${file}: only ${LEAD} may start sub-agents`);
  }
  const must = (cmd, want) => {
    const got = shellVerdict(agent, cmd);
    if (got !== want && !(want === 'deny' && got === 'run')) problems.push(`${file}: shell rule self-test: \`${cmd}\` should be ${want}, rules say ${got}`);
  };
  for (const cmd of ['find . -delete', 'printf x', 'node -e 1', 'sed -i s/a/b/ f', 'rm file', 'git push origin HEAD:main', 'git push origin +agent/x', 'git push --force origin agent/x', 'git add -A', 'git add .', 'git commit --amend -m x', 'git reset --hard', 'git checkout main', 'git diff --stat --output=x', 'cat ~/.kiro/crew/.env', 'cat .env']) must(cmd, 'deny');
  // Deploys are the user's (power credits-ship, .kiro/specs/netlify-deploy-power/): no agent may run them.
  for (const cmd of ['node .kiro/powers/credits-ship/skills/ship/scripts/ship.mjs preview', 'node .kiro/powers/credits-ship/skills/ship/scripts/ship.mjs prod', 'npx -y netlify-cli@27.20.0 deploy --prod --dir dist', 'netlify deploy --prod']) must(cmd, 'deny');
  // Releases and local native builds are the user's too (powers credits-release and credits-tauri-local, .kiro/specs/release-tags-power/).
  for (const cmd of ['node .kiro/powers/credits-release/skills/release/scripts/release.mjs release 1.0.0 --yes', 'node .kiro/powers/credits-release/skills/release/scripts/release.mjs release 1.0.0', 'node .kiro/powers/credits-tauri-local/skills/tauri-local/scripts/tauri-local.mjs', 'git tag v1.0.0', 'git push origin v1.0.0']) must(cmd, 'deny');
  // Ways around `node scripts/*`, `node .kiro/skills/*` and `cd *` to the user's commands (a `..` segment, a `cd` into a
  // power, command substitution, the native build and the installer). The guard hook also refuses node after cd.
  for (const cmd of [
    'node scripts/../.kiro/powers/credits-ship/skills/ship/scripts/ship.mjs prod', 'node .kiro/skills/../powers/credits-release/skills/release/scripts/release.mjs release 0.1.0 --yes',
    'cd .kiro/powers/credits-ship/skills/ship && node scripts/ship.mjs prod', 'cd .kiro/powers/credits-tauri-local/skills/tauri-local && node scripts/tauri-local.mjs',
    'node scripts/desktop/build-tauri-steam.mjs', 'node scripts/desktop/build-tauri-steam.mjs --steam --app-id 1', 'node scripts/harness/agents-install.mjs', 'node scripts/harness/agents-install.mjs --remove',
    'cd scripts/.. && ls', 'echo $(node .kiro/powers/credits-ship/skills/ship/scripts/ship.mjs prod)', 'echo `ls`', 'node scripts/harness/stack.mjs "$(cat x)"',
  ]) must(cmd, 'deny');
  // ...while every gate and the reads of a power's SKILL.md stay allowed.
  for (const cmd of [
    'node scripts/harness/generate-chapter.mjs --verify', 'node .kiro/skills/chapter-implementer/scripts/verify-chapter.mjs', 'node .kiro/skills/model-geometry-validator/scripts/validate-model.mjs --all --strict',
    'node scripts/desktop/desktop-unit.mjs', 'node scripts/desktop/landing-smoke.mjs', 'node scripts/harness/audio-unit.mjs', 'node scripts/harness/manual-smoke.mjs', 'node scripts/harness/playthrough.mjs --ticks 3',
    'node scripts/quality/check-agents.mjs', 'npm run quality:fingerprint > scripts/harness/out/fp-before.txt', 'diff scripts/harness/out/fp-before.txt scripts/harness/out/fp-after.txt',
    'cat .kiro/powers/credits-ship/skills/ship/SKILL.md', 'grep -n prod .kiro/powers/credits-release/skills/release/SKILL.md',
  ]) must(cmd, 'allow');
  for (const cmd of ['git status', 'git diff --stat', 'ls src', 'cat package.json', 'grep -rn x src', 'npm run quality 2>&1 | tail -20', 'node scripts/harness/property-tests.mjs --only terminal', 'cd src && ls', 'STACK_PORT=5174 npm start', 'STACK_PORT=5174 npm stop', 'npx tsc --noEmit']) must(cmd, 'allow');
  // The power script names are denied after `node` only: reading them stays allowed (a commit message may name them too).
  for (const cmd of ['cat scripts/desktop/build-tauri-steam.mjs', 'git log -- .kiro/powers/credits-ship/skills/ship/scripts/ship.mjs', 'grep -n yes .kiro/powers/credits-release/skills/release/scripts/release.mjs']) must(cmd, 'allow');
  // No other npx, and the credentials of the user's CLIs (netlify login, gh auth login, ~/.netrc) are never read.
  for (const cmd of ['npx tsc --noEmit -p x', 'npx eslint .', 'cat ~/Library/Preferences/netlify/config.json', 'grep token ~/.config/gh/hosts.yml', 'cat ~/.netrc']) must(cmd, 'deny');
  // What the shell rules cannot see, the guard hook refuses: redirects outside the top-level *.txt|*.log of the shared
  // output (its subfolders hold the deploy stamp and the stack state), any redirect in a line with cd, scripts under it.
  const guard = (cmd) => violation(cmd, { globs: ownWrites(name) ?? [], branch: 'agent/x', isLead: name === LEAD });
  for (const cmd of [
    'echo x > scripts/harness/out/x.mjs', 'echo {} > scripts/harness/out/ship/last-preview.json', 'echo {} > scripts/harness/out/ship/site.json', 'echo {} > scripts/harness/out/stack/stack.json',
    'node scripts/harness/out/x.mjs', 'cd src && ls > scripts/harness/out/a.txt', 'cd docs && echo x > qa/a.md', 'cd .kiro/powers/credits-ship/skills/ship && node scripts/ship.mjs prod',
  ]) if (!guard(cmd)) problems.push(`${file}: guard self-test: \`${cmd}\` should be blocked by agent-shell-guard`);
  for (const cmd of ['npm run quality:fingerprint > scripts/harness/out/fp-before.txt', 'npm run quality:fingerprint > scripts/harness/out/fp-after.txt', 'cd src && ls > /dev/null'])
    if (guard(cmd)) problems.push(`${file}: guard self-test: \`${cmd}\` should pass agent-shell-guard, it says: ${guard(cmd)}`);
  for (const cmd of ['STACK_PORT=$(curl x) npm start', 'STACK_PORT=5175 npm start', 'STACK_PORT=5174 rm -rf x', 'NODE_OPTIONS=--require=x npm start']) must(cmd, 'deny');
  if (name === LEAD) for (const cmd of ['git push -u origin agent/maintenance-x', 'git switch -c agent/x', 'git add -- src/a.ts', 'git commit -m "x"', 'git commit -m "docs: release.mjs checks the login"']) must(cmd, 'allow');
  else for (const cmd of ['git commit -m x', 'git push origin agent/x', 'git switch -c agent/x']) must(cmd, 'deny');
  // Visual-audit baselines are a person's (spec .kiro/specs/qa-visual-audit/, Q13): no agent updates or touches them.
  for (const cmd of ['node scripts/harness/visual-audit.mjs --update hub', 'node scripts/harness/visual-audit.mjs --screens hub --update hub@1600x950', 'node scripts/harness/visual-audit.mjs --out docs/qa/baselines', 'cp scripts/harness/out/visual/hub@1600x950.png docs/qa/baselines/hub@1600x950.png', 'cp scripts/harness/out/a.png docs/qa/media/../baselines/a.png']) must(cmd, 'deny');
  for (const cmd of ['node scripts/harness/visual-audit.mjs', 'node scripts/harness/visual-audit.mjs --screens hub,level-* --sizes 1280x820', 'node scripts/harness/visual-audit.mjs --selftest']) must(cmd, 'allow');
  // qa copies screenshots; the lead's session must allow that too (a sub-agent's command is checked against it).
  if (name === 'qa' || name === LEAD) for (const cmd of ['mkdir -p docs/qa/media', 'cp scripts/harness/out/play-1.png docs/qa/media/a.png']) must(cmd, 'allow');
  else must('cp scripts/harness/out/play-1.png docs/qa/media/a.png', 'deny');

  // 5. The write rules are one deny-all-but-these rule plus the matching allow. A designer's fence is exactly its own
  //    paths; the lead's also covers its sub-agents' (Kiro checks their writes against its session) and nothing more.
  const { allow, deny } = writeRules(agent);
  const fence = deny.find((r) => r.match?.length === 1 && r.match[0] === '**');
  const sorted = (xs) => JSON.stringify([...xs].sort());
  const generatedDeny = deny.find((r) => JSON.stringify([...(r.match ?? [])].sort()) === JSON.stringify([...GENERATED_PATHS].sort()));
  const personDeny = deny.find((r) => sorted(r.match ?? []) === sorted(PERSON_ONLY_PATHS));
  if (!personDeny) problems.push(`${file}: fs_write must deny ${PERSON_ONLY_PATHS.join(', ')} (baselines are approved by a person)`);
  if (!generatedDeny) problems.push(`${file}: fs_write must deny the compiled output (${GENERATED_PATHS.join(', ')}): the compilers write it, agents do not`);
  const reads = (agent.permissions?.rules ?? []).filter((r) => r.capability === 'fs_read' && r.effect === 'deny').flatMap((r) => r.match);
  for (const secret of ['~/.kiro/crew/.env', '**/.env', '~/Library/Preferences/netlify/**', '~/.config/gh/**']) if (!reads.includes(secret)) problems.push(`${file}: fs_read must deny ${secret}`);
  if (!fence || sorted(fence.exclude ?? []) !== sorted(allow)) problems.push(`${file}: fs_write needs a deny on "**" whose exclude list equals its allow list`);
  const subs = (agent.tools ?? []).filter((t) => String(t).startsWith('subagent/')).map((t) => String(t).slice('subagent/'.length));
  const want = [...new Set([...(ownWrites(name) ?? []), ...subs.flatMap((s) => ownWrites(s) ?? [])])];
  if (sorted(allow) !== sorted(want)) problems.push(`${file}: fs_write allow must be its own paths${subs.length ? ' plus its sub-agents\' paths' : ''}`);
}

// 6. The lead may start exactly the other six agents, by name, and nothing generic.
const lead = byName.get(LEAD);
if (lead) {
  const subs = (lead.tools ?? []).filter((t) => String(t).startsWith('subagent'));
  const want = TEAM_NAMES.filter((n) => n !== LEAD).map((n) => `subagent/${n}`);
  if (JSON.stringify([...subs].sort()) !== JSON.stringify([...want].sort())) problems.push(`${LEAD}: tools must list exactly ${want.join(', ')}`);
  for (const t of lead.tools ?? []) if (t === 'subagent' || t === '*' || t === '@builtin') problems.push(`${LEAD}: tool "${t}" would let it start any agent`);
}

// 7. Every tracked file that agents may change has exactly one owner; everything else is infrastructure or flagged.
const tracked = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean)
  .filter((p) => existsSync(join(root, p))); // a deletion not committed yet is not a file to own
const owners = agents.map(({ name, agent }) => ({ name, res: (ownWrites(name) ?? writeRules(agent).allow).map(globToRegExp) }));
let unowned = 0;
for (const path of tracked) {
  if (UNOWNED.some((re) => re.test(path))) continue;
  const who = owners.filter((o) => o.res.some((re) => re.test(path))).map((o) => o.name);
  if (!OWNED.test(path)) {
    if (INFRA.test(path)) continue;
    if (unowned++ < 20) problems.push(`${path}: not classified (add it to OWNED or INFRA in check-agents.mjs, so a new top-level folder is never silently unowned)`);
    continue;
  }
  if (who.length === 0 && unowned++ < 20) problems.push(`${path}: no agent owns it (add it to one agent's writes in agents-build.mjs)`);
  if (who.length > 1) problems.push(`${path}: owned by ${who.join(' and ')} (one owner per file)`);
}
if (unowned > 20) problems.push(`... and ${unowned - 20} more unowned or unclassified files`);

// 8. The prompts the agents load exist next to their files.
if (!existsSync(join(root, '.kiro/agents/prompts/team-rules.md'))) problems.push('.kiro/agents/prompts/team-rules.md is missing');

// 9. MCP: exact tool lists, pinned and fenced servers, nothing in the workspace settings, prompts that name their tools.
const readIfThere = (rel) => (existsSync(join(root, rel)) ? readFileSync(join(root, rel), 'utf8') : '');
problems.push(...mcpProblems({
  agents,
  table: mcpTable(),
  mcpJsonText: readIfThere('.kiro/settings/mcp.json'),
  promptText: (name) => readIfThere(`.kiro/agents/prompts/${name}.md`),
  fileExists: (rel) => existsSync(join(root, rel)),
  pinned: (({ dependencies = {}, devDependencies = {} }) => ({ ...dependencies, ...devDependencies }))(JSON.parse(readIfThere('package.json') || '{}')),
}));

if (problems.length) {
  console.error(`agent gate FAILED (${problems.length}):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`agent gate OK (${agents.length} agents, every source file has one owner)`);
