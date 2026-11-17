#!/usr/bin/env node
// PreToolUse hook of every team agent, on the shell tool (`execute_bash`). Kiro's shell permission rules look at the
// command words only: a redirect (`> file`) or a git refspec is not seen by them (probed with Kiro CLI 3.3.0). This
// hook reads the command from the event on stdin and blocks (exit 2) what the rules cannot:
//   - a redirect into a path outside the agent's write paths (`/dev/null` and fd copies like `2>&1` are fine);
//   - `git commit`, `merge`, `push`, `cherry-pick`, `revert` or `rebase` while the branch is main or master;
//   - `git add` without `--` and explicit paths (`-A`, `.`, `-u`), `git commit --amend`;
//   - a push that is not a plain `agent/<task>` branch (`+refspec`, `--delete`, `--mirror`, `--tags`, `HEAD:main`).
//   node scripts/hooks/agent-shell-guard.mjs <agent-name>        (event JSON on stdin)
// Spec: .kiro/specs/agent-team/. Exit 0 when the command is fine, 2 with a reason on stderr when it is not.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { globToRegExp } from '../quality/agent-rules.mjs';

/** Splits a command line into words and operators, honouring single and double quotes. Good enough to find redirects. */
export function tokenize(line) {
  const tokens = [];
  let cur = '';
  let quote = '';
  const flush = () => {
    if (cur !== '') tokens.push(cur);
    cur = '';
  };
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === quote) quote = '';
      else if (c === '\\' && quote === '"' && i + 1 < line.length) cur += line[++i];
      else cur += c;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '\\' && i + 1 < line.length) cur += line[++i];
    else if (/\s/.test(c)) flush();
    else if (c === ';' || c === '|' || c === '&') {
      flush();
      let op = c;
      while (line[i + 1] === c || (c === '&' && line[i + 1] === '>')) op += line[++i];
      tokens.push({ op });
    } else if (c === '>' || c === '<') {
      // `2>file`, `&>file`, `>>file`: keep the digit or `&` with the operator.
      const lead = /^\d+$/.test(cur) || cur === '&' ? cur : '';
      if (lead) cur = '';
      else flush();
      let op = lead + c;
      while (line[i + 1] === c) op += line[++i];
      if (line[i + 1] === '&') op += line[++i];
      tokens.push({ op });
    } else cur += c;
  }
  flush();
  return tokens;
}

/** Targets of output redirects in `tokens`: `> f`, `>> f`, `2> f`, `&> f`, `>|f`; fd copies (`2>&1`) have none. */
export function redirectTargets(tokens) {
  const out = [];
  tokens.forEach((t, i) => {
    if (typeof t === 'string' || !/^(\d*|&)>>?\|?$/.test(t.op.replace(/&\d*$/, '').replace(/^&$/, '&')) || !t.op.includes('>')) return;
    if (/>&\d*-?$/.test(t.op)) return; // 2>&1, >&2: a file descriptor, not a file
    const next = tokens[i + 1];
    if (typeof next === 'string') out.push(next);
  });
  return out;
}

/** Sub-commands: runs of words between operators, as arrays. Redirect operators and their targets are dropped. */
export function subcommands(tokens) {
  const subs = [[]];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (typeof t === 'string') subs.at(-1).push(t);
    else if (t.op.includes('>') || t.op.includes('<')) {
      if (typeof tokens[i + 1] === 'string' && !/>&\d*-?$/.test(t.op)) i += 1;
    } else subs.push([]);
  }
  return subs.filter((s) => s.length);
}

const GIT_WRITING = new Set(['commit', 'merge', 'push', 'cherry-pick', 'revert', 'rebase', 'pull']);
const AGENT_BRANCH = /^agent\/[A-Za-z0-9._-]+$/;

/** Git subcommand and its args, skipping global options (`git -C dir -c k=v push ...`). */
function gitParts(words) {
  let i = 1;
  while (i < words.length && words[i].startsWith('-')) i += ['-C', '-c', '--git-dir', '--work-tree'].includes(words[i]) ? 2 : 1;
  return { sub: words[i], rest: words.slice(i + 1) };
}

/** Why `command` must not run for `agentName` on `branch`, or null. `globs` are the agent's write globs. */
export function violation(command, { globs, branch, isLead }) {
  const tokens = tokenize(command);
  const allowed = [...globs, '/dev/null'].map((g) => globToRegExp(g));
  for (const target of redirectTargets(tokens)) {
    if (target === '/dev/null' || target === '/dev/stderr' || target === '/dev/stdout') continue;
    const rel = target.startsWith('/') ? target : target.replace(/^\.\//, '');
    if (!allowed.some((re) => re.test(rel))) return `redirect into ${target}, which is outside this agent's write paths. Use the write tool (and hand the change to its owner if it is not yours).`;
  }
  for (const words of subcommands(tokens)) {
    const cmd = words[0].replace(/^.*\//, '');
    if (cmd !== 'git') continue;
    const { sub, rest } = gitParts(words);
    if (GIT_WRITING.has(sub) && !isLead) return `git ${sub} is for lead-dev only.`;
    if (GIT_WRITING.has(sub) && /^(main|master)$/.test(branch)) return `git ${sub} on ${branch}: work on a branch agent/<task> (git switch -c agent/<task>).`;
    if (sub === 'add' && !(rest[0] === '--' && rest.length > 1 && !rest.slice(1).some((p) => p === '.' || p === '-A' || p.startsWith('-')))) return 'git add needs `--` and explicit paths (no -A, -u or .).';
    if (sub === 'commit' && rest.some((a) => a === '--amend' || /^-[a-z]*a[a-z]*$/.test(a))) return 'git commit: no --amend and no -a; add explicit paths, then commit.';
    if (sub === 'push') {
      const args = rest.filter((a) => a !== '-u' && a !== '--set-upstream');
      const bad = args.find((a) => a.startsWith('-')) ?? args.find((a) => a.startsWith('+'));
      if (bad) return `git push ${bad}: only \`git push [-u] origin agent/<task>\` is allowed.`;
      const [remote, ref, ...extra] = args;
      if (remote !== 'origin' || !AGENT_BRANCH.test(ref ?? '') || extra.length) return 'git push: only `git push [-u] origin agent/<task>` is allowed.';
    }
  }
  return null;
}

function currentBranch(cwd) {
  try {
    return execFileSync('git', ['branch', '--show-current'], { cwd, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function main() {
  const name = process.argv[2];
  let event;
  try {
    event = JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    process.exit(0);
  }
  const command = event?.tool_input?.command;
  if (typeof command !== 'string') process.exit(0);
  const cwd = event.cwd ?? process.cwd();
  return import('../harness/agents-build.mjs').then(({ LEAD, ownWrites }) => {
    const globs = ownWrites(name);
    if (!globs) process.exit(0);
    const reason = violation(command, { globs, branch: currentBranch(cwd), isLead: name === LEAD });
    if (!reason) process.exit(0);
    console.error(`agent-shell-guard: blocked for ${name}: ${reason}`);
    process.exit(2);
  });
}

if (import.meta.url === `file://${resolve(process.argv[1] ?? '')}`) main();
