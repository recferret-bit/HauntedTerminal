// The MCP half of the team-agent gate (check-agents.mjs): what each agent may call, how its servers are pinned and
// fenced, and that its prompt tells it to use them. Pure: the caller passes what it read from disk, so agents-unit.mjs can
// feed it planted-bad files. Spec: .kiro/specs/mcp-devtools-and-forge/ (Req 1, 2, 12, 13, 15).
import { mcpVerdict } from './agent-rules.mjs';

const SELECTOR = /^@([\w-]+)\/([\w-]+)$/;
const WRITER_TOOLS = {
  'credits-forge/write_level': 'chapters-designer',
  'credits-forge/write_chapter_file': 'chapters-designer',
  'credits-forge/write_comix': 'comix-designer',
  'credits-forge/write_lab': 'terminal-designer',
};
const BROWSER_SERVER = 'chrome-devtools';
const BROWSER_USER = 'qa';
/** Flags that keep Chrome DevTools MCP headless, private and on the local sites (the --allowedUrlPattern values are checked separately). */
const BROWSER_FLAGS = ['--headless', '--isolated', '--no-usage-statistics', '--no-javascript-evaluation', '--no-file-navigations', '--allowedUrlPattern'];

const sorted = (xs) => JSON.stringify([...xs].sort());

/** Exact, pinned `npx` package (`name@1.2.3`) or an existing local script; anything else is a floating or unknown server. */
function pinProblems(file, server, def, fileExists, pinned) {
  if (def.command === 'npx') {
    const pkg = (def.args ?? []).find((a) => !a.startsWith('-'));
    return pkg && /@\d+\.\d+\.\d+$/.test(pkg) ? [] : [`${file}: MCP server ${server} must be pinned to an exact version (npx name@1.2.3), found "${pkg ?? 'none'}"`];
  }
  if (def.command === 'node') {
    const script = (def.args ?? [])[0] ?? '';
    if (!fileExists(script)) return [`${file}: MCP server ${server} runs ${script || 'nothing'}, which does not exist`];
    const pkg = /^node_modules\/((?:@[\w.-]+\/)?[\w.-]+)\//.exec(script)?.[1];
    if (pkg && !/^\d+\.\d+\.\d+$/.test(pinned[pkg] ?? '')) return [`${file}: MCP server ${server} runs ${pkg} from node_modules, which package.json must pin to an exact version (found "${pinned[pkg] ?? 'none'}")`];
    return [];
  }
  return [`${file}: MCP server ${server} uses command "${def.command}"; only a pinned npx package or a local node script is allowed`];
}

function browserProblems(file, def, hooks) {
  const out = [];
  const args = def.args ?? [];
  for (const flag of BROWSER_FLAGS) if (!args.includes(flag)) out.push(`${file}: ${BROWSER_SERVER} must start with ${flag}`);
  const patterns = args.flatMap((a, i) => (args[i - 1] === '--allowedUrlPattern' ? [a] : []));
  if (!patterns.length || patterns.some((p) => !/^https?:\/\/(localhost|127\.0\.0\.1|\*\.netlify\.app)[:/]/.test(p))) {
    out.push(`${file}: ${BROWSER_SERVER} --allowedUrlPattern may list only localhost, 127.0.0.1 and *.netlify.app, found ${JSON.stringify(patterns)}`);
  }
  if (!hooks.some((h) => h.trigger === 'PreToolUse' && String(h.action?.command ?? '').includes('devtools-url-guard.mjs'))) out.push(`${file}: needs the PreToolUse hook devtools-url-guard.mjs (second fence for ${BROWSER_SERVER})`);
  return out;
}

/** Problems with one agent's MCP wiring. `want` is its table entry; `subTools` the MCP tools of its sub-agents. */
function agentProblems({ file, name, agent }, want, subTools, fileExists, pinned) {
  const out = [];
  const tools = agent.tools ?? [];
  const selectors = tools.filter((t) => String(t).startsWith('@'));
  const own = Object.entries(want.mcp).flatMap(([server, list]) => list.map((t) => `${server}/${t}`));
  if (agent.includeMcpJson !== false) out.push(`${file}: includeMcpJson must be false (MCP is declared per agent, never inherited from a settings file)`);
  if (agent.includePowers !== false) out.push(`${file}: includePowers must be false (an installed power would add its own MCP servers to the agent)`);
  for (const t of tools) if (t === '*' || t === '@mcp' || t === '@builtin') out.push(`${file}: tool selector "${t}" is a wildcard; list exact @server/tool selectors`);
  for (const t of selectors) if (t !== '@builtin' && t !== '@mcp' && !SELECTOR.test(t)) out.push(`${file}: MCP selector "${t}" must be @server/tool (no @server, no wildcard)`);
  if (sorted(selectors.map((t) => String(t).slice(1))) !== sorted(own)) out.push(`${file}: its @server/tool selectors differ from its MCP table entry`);
  const servers = Object.keys(agent.mcpServers ?? {});
  if (sorted(servers) !== sorted(Object.keys(want.mcp))) out.push(`${file}: mcpServers (${servers.join(', ') || 'none'}) must be exactly the servers of its table entry (${Object.keys(want.mcp).join(', ') || 'none'})`);
  for (const [server, def] of Object.entries(agent.mcpServers ?? {})) {
    out.push(...pinProblems(file, server, def, fileExists, pinned));
    if (server === BROWSER_SERVER) out.push(...browserProblems(file, def, Array.isArray(agent.hooks) ? agent.hooks : []));
  }
  if (servers.includes(BROWSER_SERVER) && name !== BROWSER_USER) out.push(`${file}: only ${BROWSER_USER} may hold ${BROWSER_SERVER}`);
  for (const [tool, owner] of Object.entries(WRITER_TOOLS)) {
    if (selectors.includes(`@${tool}`) && name !== owner) out.push(`${file}: only ${owner} may hold ${tool}`);
  }

  const session = [...new Set([...own, ...subTools])];
  const mcpRules = (agent.permissions?.rules ?? []).filter((r) => r.capability === 'mcp');
  const allow = mcpRules.filter((r) => r.effect === 'allow').flatMap((r) => r.match);
  const catchAll = mcpRules.find((r) => r.effect === 'deny' && r.match.length === 1 && r.match[0] === '*');
  if (!subTools.length) {
    for (const [tool, owner] of Object.entries(WRITER_TOOLS)) {
      if (allow.includes(tool) && name !== owner) out.push(`${file}: only ${owner} may hold ${tool} (its mcp allow rules list it)`);
    }
  }
  if (sorted(allow) !== sorted(session)) out.push(`${file}: mcp allow rules must be exactly ${session.length ? session.join(', ') : 'empty (no MCP tool)'}`);
  if (!catchAll || sorted(catchAll.exclude ?? []) !== sorted(allow)) out.push(`${file}: mcp needs a deny on "*" whose exclude list equals its allow list, so an unlisted tool is refused even under auto-approve`);
  for (const probe of [...Object.keys(WRITER_TOOLS), 'chrome-devtools/evaluate_script', 'chrome-devtools/upload_file', 'some-server/any_tool']) {
    const expected = session.includes(probe) ? 'allow' : 'deny';
    const got = mcpVerdict(agent, probe);
    if (got !== expected && !(expected === 'deny' && got === 'run')) out.push(`${file}: mcp rule self-test: ${probe} should be ${expected}, rules say ${got}`);
  }
  return out;
}

/**
 * `agents`: `{ file, name, agent }[]`; `table`: `mcpTable()` of agents-build.mjs; `mcpJsonText`: the workspace
 * `.kiro/settings/mcp.json` ('' when absent); `promptText(name)`: the agent's prompt file; `fileExists(path)`: repo-relative;
 * `pinned`: package.json's devDependencies and dependencies (name -> version spec).
 */
export function mcpProblems({ agents, table, mcpJsonText, promptText, fileExists, pinned = {} }) {
  const out = [];
  try {
    const servers = JSON.parse(mcpJsonText || '{"mcpServers":{}}').mcpServers ?? {};
    if (Object.keys(servers).length) out.push(`.kiro/settings/mcp.json must stay empty (MCP is declared per agent in agents-build.mjs), found ${Object.keys(servers).join(', ')}`);
  } catch {
    out.push('.kiro/settings/mcp.json is not valid JSON');
  }
  for (const entry of agents) {
    const want = table[entry.name] ?? { mcp: {}, mustName: [], subagents: [] };
    const subTools = want.subagents.flatMap((s) => Object.entries(table[s]?.mcp ?? {}).flatMap(([server, list]) => list.map((t) => `${server}/${t}`)));
    out.push(...agentProblems(entry, want, subTools, fileExists, pinned));
    if (want.subagents.length && (Object.keys(entry.agent.mcpServers ?? {}).length || (entry.agent.tools ?? []).some((t) => String(t).startsWith('@')))) out.push(`${entry.file}: the orchestrator holds permissions for its sub-agents' MCP tools, never a server or a tool of its own`);
    const prompt = promptText(entry.name);
    for (const word of want.mustName) if (!prompt.includes(word)) out.push(`.kiro/agents/prompts/${entry.name}.md must name "${word}" (tell the agent when to use its MCP tools)`);
  }
  return out;
}
