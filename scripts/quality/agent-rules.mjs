// Shared reading of the team agents (.kiro/agents/*.json) for check-agents.mjs, the agent-scope Stop hook and the
// installer. Spec: .kiro/specs/agent-team/.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const AGENTS_DIR = '.kiro/agents';

/**
 * A path glob as Kiro permission rules write it: `**` any depth (including none), `*` within one segment, `?` one
 * character, `{a,b}` alternatives. Matches the whole repository-relative path.
 */
export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      const slash = glob[i + 2] === '/';
      re += slash ? '(?:.*/)?' : '.*';
      i += slash ? 2 : 1;
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else if (c === '{') {
      const end = glob.indexOf('}', i);
      re += `(?:${glob.slice(i + 1, end).split(',').map((p) => p.replace(/[.+^$()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')).join('|')})`;
      i = end;
    } else re += c.replace(/[.+^$()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

/** Every agent file in the repo, as `{ file, name, agent }` (the JSON parsed), sorted by name. */
export function loadAgents(root) {
  const dir = join(root, AGENTS_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => ({ file: `${AGENTS_DIR}/${f}`, name: f.replace(/\.json$/, ''), agent: JSON.parse(readFileSync(join(dir, f), 'utf8')) }));
}

/** The `fs_write` allow globs and the deny rule's `exclude` globs of an agent. */
export function writeRules(agent) {
  const rules = agent.permissions?.rules ?? [];
  const allow = rules.filter((r) => r.capability === 'fs_write' && r.effect === 'allow').flatMap((r) => r.match ?? []);
  const deny = rules.filter((r) => r.capability === 'fs_write' && r.effect === 'deny');
  return { allow, deny };
}

/**
 * How Kiro matches a shell rule: `*` is any run of characters, nothing else is special. Matched against one
 * sub-command at a time (Kiro splits `;`, `&&`, `||` and `|` and judges each part on its own).
 */
export function shellGlob(pattern) {
  return new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\?]/g, '\\$&').replace(/\*/g, '.*')}$`);
}

/** Splits a command line into the sub-commands Kiro judges (quote-unaware: good enough for the rule self-test). */
export function splitSubcommands(line) {
  return line.split(/&&|\|\||;|\|/).map((p) => p.trim().replace(/\s+\d*>>?\s*\S+|\s+\d*>&\d+/g, '').trim()).filter(Boolean);
}

/** `deny` when an agent's shell rules refuse `command` (any sub-command), else `allow` (matched) or `run` (matched nothing). */
export function shellVerdict(agent, command) {
  const rules = (agent.permissions?.rules ?? []).filter((r) => r.capability === 'shell');
  const hits = (rule, sub) => rule.match.some((m) => shellGlob(m).test(sub)) && !(rule.exclude ?? []).some((m) => shellGlob(m).test(sub));
  let verdict = 'allow';
  for (const sub of splitSubcommands(command)) {
    if (rules.some((r) => r.effect === 'deny' && hits(r, sub))) return 'deny';
    if (!rules.some((r) => r.effect === 'allow' && hits(r, sub))) verdict = 'run';
  }
  return verdict;
}
