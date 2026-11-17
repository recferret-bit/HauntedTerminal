#!/usr/bin/env node
// Is this Mac ready to run the Haunted Terminal agent team through Kiro Crew (desktop app, dashboard)?
//   npm run crew:check            (node scripts/harness/crew-doctor.mjs)
// Read-only: it reads files, runs `kiro-cli`, `kirocrew`, `git` and (if installed) `gh`, and changes nothing. It never prints a token.
// Exit 1 when something blocks the setup, 0 otherwise (warnings are things to look at). Spec: .kiro/specs/agent-team/ (req 17, 24).
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, readlinkSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { TEAM_NAMES } from './agents-build.mjs';
import { projectRoot } from './lib/load.mjs';

/** Pure: the list of `{ level: 'ok'|'warn'|'fail', what, fix? }` for the gathered `facts` (see `gather`). */
export function assess(f) {
  const out = [];
  const add = (level, what, fix) => out.push({ level, what, ...(fix ? { fix } : {}) });
  f.kiroCli ? add('ok', `kiro-cli ${f.kiroCli}`) : add('fail', 'kiro-cli not found', 'install Kiro CLI');
  f.kirocrew ? add('ok', `kirocrew ${f.kirocrew}`) : add('fail', 'kirocrew not found', 'install Kiro Crew (kiro.dev/docs/crew)');
  const missing = TEAM_NAMES.filter((n) => f.agentLinks[n] !== 'ours');
  if (!missing.length && f.promptsLink === 'ours') add('ok', `all ${TEAM_NAMES.length} agents and the prompts folder are linked into ~/.kiro/agents`);
  else add('fail', `not linked to this repo: ${[...missing, ...(f.promptsLink === 'ours' ? [] : ['prompts'])].join(', ')}`, 'npm run agents:install');
  f.agentsValid.length === TEAM_NAMES.length ? add('ok', 'kiro-cli agent validate passes for every agent') : add('fail', `kiro-cli agent validate fails for: ${TEAM_NAMES.filter((n) => !f.agentsValid.includes(n)).join(', ')}`, 'node scripts/harness/agents-build.mjs, then npm run quality:agents');
  if (!f.crewConfig) add('fail', 'no Kiro Crew config (~/.kiro/crew/config.json)', 'run kirocrew setup');
  else {
    const ws = Object.entries(f.crewConfig.workspaces ?? {}).find(([, w]) => resolveDir(w?.dir) === f.repo);
    if (ws) add('ok', `Crew workspace "${ws[0]}" points at this repo`);
    else add('fail', 'no Crew workspace points at this repo', `kirocrew config set workspaces.<name>.dir ${f.repo}   (or add one in the dashboard: Settings -> Workspaces)`);
    const members = Object.entries(f.crewConfig.agents ?? {}).filter(([, m]) => m?.kiro_agent === 'lead-dev');
    const bound = ws ? members.find(([, m]) => m.workspace === ws[0]) : null;
    if (bound) add('ok', `Crew member "${bound[0]}" runs lead-dev in that workspace`);
    else if (members.length) add('fail', 'a Crew member runs lead-dev, but not in the repo workspace', `kirocrew agent update ${members[0][0]} --workspace ${ws?.[0] ?? '<workspace>'}`);
    else add('fail', 'no Crew member runs lead-dev', 'kirocrew agent create --name haunted-lead --workspace <workspace>; kirocrew agent update haunted-lead --kiro-agent lead-dev');
    f.crewConfig.agent?.approval_mode === 'auto' ? add('ok', 'Crew approval mode is Automatic (rules decide, nothing waits for a prompt)') : add('warn', `Crew approval mode is "${f.crewConfig.agent?.approval_mode}": nobody is there to answer prompts, so work would stall`, 'Settings -> Security -> Automatic');
    f.autoApproveListed ? add('fail', 'an autoApprove list is set in an agent or mcp.json: it skips Crew\'s tool gate AND PreToolUse hooks, which disables the shell guard', 'remove autoApprove') : add('ok', 'no autoApprove list (the shell guard hook is not bypassed)');
  }
  f.gateway ? add('ok', 'the Crew gateway is running') : add('warn', 'the Crew gateway is not running', `cd ${f.repo} && kirocrew gateway   (or kirocrew service install to keep it running)`);
  f.branch === 'main' ? add('ok', 'on main (lead-dev creates its own agent/<task> branch)') : add('ok', `on branch ${f.branch}`);
  f.dirty === 0 ? add('ok', 'the working tree is clean (lead-dev stops on changes it did not make)') : add('warn', `${f.dirty} uncommitted path(s): lead-dev will stop and ask`, 'commit or stash them first');
  f.remote ? add('ok', `origin: ${f.remote}`) : add('fail', 'no git remote "origin": lead-dev cannot push', 'git remote add origin <url>');
  if (f.protection === 'yes') add('ok', 'GitHub branch protection is on for main');
  else if (f.protection === 'no') add('fail', 'main is not protected on GitHub: the one barrier that holds even if a hook does not run', 'GitHub -> Settings -> Branches -> require a pull request, block force pushes');
  else add('warn', 'could not check branch protection (gh missing, not logged in, or no access)', 'check GitHub -> Settings -> Branches by hand');
  return out;
}

const resolveDir = (dir) => (typeof dir === 'string' ? resolve(dir.startsWith('~') ? join(homedir(), dir.slice(1)) : dir) : '');

const run = (cmd, args, opts = {}) => {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 20000, ...opts }).trim();
  } catch {
    return null;
  }
};

/** Everything `assess` needs, read from this machine. */
export function gather() {
  const home = homedir();
  const crewHome = process.env.KIROCREW_HOME || join(home, '.kiro/crew');
  const repo = realpathSync(projectRoot);
  const agentsDir = join(home, '.kiro/agents');
  const linkState = (name, source) => {
    const p = join(agentsDir, name);
    if (!existsSync(p) && !(() => { try { return lstatSync(p).isSymbolicLink(); } catch { return false; } })()) return 'none';
    try {
      return lstatSync(p).isSymbolicLink() && realpathSync(resolve(agentsDir, readlinkSync(p))) === realpathSync(source) ? 'ours' : 'other';
    } catch {
      return 'other';
    }
  };
  const agentLinks = Object.fromEntries(TEAM_NAMES.map((n) => [n, linkState(`${n}.json`, join(repo, '.kiro/agents', `${n}.json`))]));
  const agentsValid = TEAM_NAMES.filter((n) => run('kiro-cli', ['agent', 'validate', '--path', join(repo, '.kiro/agents', `${n}.json`)]) !== null);
  let crewConfig = null;
  try {
    crewConfig = JSON.parse(readFileSync(join(crewHome, 'config.json'), 'utf8'));
  } catch { /* reported by assess */ }
  const autoApproveListed = TEAM_NAMES.some((n) => JSON.stringify(JSON.parse(readFileSync(join(repo, '.kiro/agents', `${n}.json`), 'utf8'))).includes('autoApprove')) || (existsSync(join(repo, '.kiro/settings/mcp.json')) && readFileSync(join(repo, '.kiro/settings/mcp.json'), 'utf8').includes('autoApprove'));
  const remote = run('git', ['remote', 'get-url', 'origin'], { cwd: repo });
  let protection = 'unknown';
  const slug = remote?.match(/github\.com[:/]([^/]+\/[^/.]+)/)?.[1];
  if (slug && run('gh', ['auth', 'status']) !== null) {
    const r = run('gh', ['api', `repos/${slug}/branches/main/protection`, '--silent']);
    protection = r !== null ? 'yes' : run('gh', ['api', `repos/${slug}`, '--jq', '.permissions.admin']) === 'true' ? 'no' : 'unknown';
  }
  return {
    repo,
    kiroCli: run('kiro-cli', ['--version'])?.replace(/^kiro-cli\s*/, ''),
    kirocrew: run('kirocrew', ['--version'])?.replace(/^\D*/, ''),
    agentLinks,
    promptsLink: linkState('prompts', join(repo, '.kiro/agents/prompts')),
    agentsValid,
    crewConfig,
    autoApproveListed,
    gateway: !/not running/i.test(run('kirocrew', ['status']) ?? 'not running'),
    branch: run('git', ['branch', '--show-current'], { cwd: repo }) ?? '?',
    dirty: (run('git', ['status', '--porcelain'], { cwd: repo }) ?? '').split('\n').filter(Boolean).length,
    remote,
    protection,
  };
}

if (import.meta.url === `file://${resolve(process.argv[1] ?? '')}`) {
  const results = assess(gather());
  const mark = { ok: 'ok  ', warn: 'WARN', fail: 'FAIL' };
  for (const r of results) console.log(`${mark[r.level]} ${r.what}${r.fix ? `\n       -> ${r.fix}` : ''}`);
  const fails = results.filter((r) => r.level === 'fail').length;
  const warns = results.filter((r) => r.level === 'warn').length;
  console.log(fails ? `\n${fails} blocking problem(s), ${warns} warning(s). Fix the FAIL lines, then run npm run crew:check again.` : `\nReady for Kiro Crew${warns ? ` (${warns} warning(s) above are worth a look)` : ''}. First test: docs/AGENTS_CREW.md, "First test from the dashboard".`);
  process.exit(fails ? 1 : 0);
}
