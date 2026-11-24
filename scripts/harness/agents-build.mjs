#!/usr/bin/env node
// Writes the seven team agents (.kiro/agents/<name>.json) from one table, so their shape cannot drift.
//   node scripts/harness/agents-build.mjs           write the files (canonical JSON, 2-space indent)
//   node scripts/harness/agents-build.mjs --check   exit 1 when a file differs from the table (part of check-agents.mjs)
// The prompts are hand-written Markdown in .kiro/agents/prompts/. Spec: .kiro/specs/agent-team/.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { projectRoot } from './lib/load.mjs';

const ALWAYS = ['product', 'tech', 'structure', 'architecture', 'glossary', 'spec-first'].map((f) => `file://.kiro/steering/${f}.md`);
const BASE = ['file://AGENTS.md', 'file://.kiro/agents/prompts/team-rules.md', ...ALWAYS];
const skill = (name) => `skill://.kiro/skills/${name}/SKILL.md`;
const steer = (name) => `file://.kiro/steering/${name}.md`;

/**
 * Shell policy, probed against Kiro CLI 3.3.0 (see the spec's "Found while building"):
 *  - Under Kiro Crew's Automatic mode (CLI: --trust-all-tools) a command that matches no rule just runs, so an allow-list
 *    alone restricts nothing. The allow-list is therefore also written as a catch-all `deny *` that excludes it.
 *  - Shell rules see command words only. Redirects (`> file`) and git refspecs are checked by the PreToolUse hook
 *    scripts/hooks/agent-shell-guard.mjs, which also keeps git history off main.
 */
const READ_SHELL = [
  'pwd', 'ls', 'ls *', 'cat *', 'head *', 'tail *', 'wc *', 'grep *', 'which *', 'echo *', 'cd *', 'sleep *',
  'git status', 'git status *', 'git log', 'git log *', 'git show *', 'git branch --show-current', 'git rev-parse *', 'git ls-files', 'git ls-files *',
  'git diff', 'git diff --stat*', 'git diff --name-only*', 'git diff --cached --stat*', 'git diff -- *',
];
/**
 * The dev server on 5174, for when 5173 belongs to another project on the machine (qa then had no page for its browser
 * tools). Exact strings: a `STACK_PORT=*` pattern would also match `STACK_PORT=$(...) npm start`.
 */
const ALT_STACK = ['STACK_PORT=5174 npm start', 'STACK_PORT=5174 npm stop', 'STACK_PORT=5174 npm run status'];
const GATE_SHELL = ['npm run quality', 'npm run quality:*', 'npm run build', 'npm start', 'npm stop', 'npm restart', 'npm run status', ...ALT_STACK, 'node scripts/*', 'node .kiro/skills/*'];
/** Only the lead writes git history, and only on agent/<task> branches (the guard hook enforces the branch). */
const GIT_WRITES = ['git switch -c agent/*', 'git switch agent/*', 'git add -- *', 'git commit -m *', 'git push -u origin agent/*', 'git push origin agent/*'];
/**
 * Visual-audit baselines are approved by a person only (spec .kiro/specs/qa-visual-audit/, Q13): no agent runs `--update`,
 * names the baseline folder in a command, or copies along a `..` path (which could reach it from docs/qa/media/).
 */
const PERSON_ONLY = ['docs/qa/baselines/**'];
const PERSON_ONLY_SHELL = ['*visual-audit*--update*', '*docs/qa/baselines*', 'cp *..*'];
/** Denied for everyone even if a future edit adds a matching allow: they bypass the write fence or rewrite history. */
const DENY_WORDS = ['*--output*', 'git reset*', 'git checkout*', 'git stash*', 'git clean*', 'git branch -D*', 'rm *', 'sudo *', 'npm install*', 'npm i *', 'npm uninstall*', 'npm publish*', ...PERSON_ONLY_SHELL];
/** Files that hold secrets: the Crew gateway keeps its channel tokens in ~/.kiro/crew/.env. */
const SECRET_READS = ['**/.env', '**/.env.*', '**/*.pem', '**/*.key', '~/.kiro/crew/.env', '~/.kiro/crew/auth*', '~/.ssh/**', '~/.aws/**'];
const SECRET_SHELL = ['*.env*', '*.pem*', '*/.ssh/*', '*/.aws/*', '*.kiro/crew/.env*'];
/** Compiled output: the compilers write it, no agent edits it by hand. */
const GENERATED = ['src/chapters/generated/**', 'src/cinematic/generated/**', 'chapters/*/story/out/**'];
/** The visual audit of qa (spec .kiro/specs/qa-visual-audit/, Q11): the lead owns it, so qa cannot change its own checks. */
const VISUAL_AUDIT = ['scripts/harness/visual-audit.mjs', 'scripts/harness/lib/visual-*.mjs', 'scripts/harness/visual/**'];

/**
 * MCP servers an agent may declare (spec .kiro/specs/mcp-devtools-and-forge/). Each agent lists the tools it may call in
 * its `mcp` field below; `.kiro/settings/mcp.json` stays empty so a person's own session never loads these by accident.
 * Chrome DevTools MCP: headless, isolated profile, no telemetry, no JavaScript evaluation, no file: URLs, and Chrome itself
 * refuses every site but the local dev servers and Netlify (--allowedUrlPattern, Chrome 149+). Screenshots written with
 * `filePath` may only go under scripts/harness/out (--workspace), which is git-ignored.
 */
export const MCP_SERVERS = {
  // Run from node_modules (devDependency pinned to 1.13.0), not `npx -y`: the npx lookup took ~1 s, and Kiro CLI 3.4 starts
  // the agent's first turn with the servers connected by then, so qa saw no browser tools (probed, see the spec).
  'chrome-devtools': {
    command: 'node',
    args: [
      'node_modules/chrome-devtools-mcp/out/Default/gen/src/bin/chrome-devtools-mcp.js', '--headless', '--isolated', '--viewport', '1280x800',
      '--no-usage-statistics', '--no-performance-crux', '--no-javascript-evaluation', '--no-file-navigations',
      '--workspace', 'scripts/harness/out',
      '--allowedUrlPattern', 'http://localhost:*/*', '--allowedUrlPattern', 'http://127.0.0.1:*/*', '--allowedUrlPattern', 'https://*.netlify.app/*',
    ],
    // Node's compile cache (git-ignored) cuts the server's start by ~20%: Kiro fixes an agent's tools when its first turn
    // starts (~450 ms after the prompt) and does not wait for a slower MCP server (probed, see the spec).
    env: { CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: '1', NODE_COMPILE_CACHE: 'scripts/harness/out/.node-compile-cache' },
    timeout: 120000,
  },
  'credits-forge': { command: 'node', args: ['scripts/mcp/credits-forge/server.mjs'] },
};
/**
 * What qa may use of Chrome DevTools MCP: look, read the console and network, drive the page's own inputs, throttle the CPU
 * (`emulate`, CPU only: devtools-url-guard refuses every other field) and record performance traces (spec
 * .kiro/specs/qa-visual-audit/, Q5). No uploads, recordings or JavaScript evaluation.
 */
const DEVTOOLS_LOOK = [
  'list_pages', 'new_page', 'select_page', 'navigate_page', 'close_page', 'resize_page', 'wait_for',
  'take_screenshot', 'take_snapshot', 'list_console_messages', 'get_console_message', 'list_network_requests', 'get_network_request',
  'click', 'hover', 'fill', 'type_text', 'press_key',
  'emulate', 'performance_start_trace', 'performance_stop_trace', 'performance_analyze_insight',
];
const FORGE_READ = ['list_levels', 'get_level', 'validate_level', 'solve_level'];

const TEAM = {
  'lead-dev': {
    description: 'Lead game developer and orchestrator of the Out Of Credits team. Takes any tuning request, routes each part to the owning designer or the artist, has qa check every change, and commits finished work on an agent/<task> branch. Start here; also the member that Kiro Crew runs.',
    writes: ['.kiro/specs/**', '.kiro/steering/**', 'AGENTS.md', 'CLAUDE.md', 'README.md', 'docs/*.md', 'docs/media/**', 'docs/reviews/**', 'scripts/harness/property-tests.mjs', 'scripts/harness/props/{kit,arbitraries}.mjs', 'src/contracts/**', 'src/editor-core/**', 'src/play/**', 'src/pages/**', 'src/hub/**', 'src/styles/**', 'src/sandbox/**', 'src/main.ts', 'src/style.css', 'src/game/{session,play,runtime,types,floors,sfx,selfcheck,view,view-layouts}.ts', ...VISUAL_AUDIT],
    resources: [steer('skills-map'), 'file://.kiro/specs/agent-team/requirements.md', 'file://.kiro/specs/agent-team/design.md'],
    skills: ['feature-spec-grill'],
    subagents: ['terminal-designer', 'laptop-designer', 'comix-designer', 'chapters-designer', 'artist', 'qa'],
    gitWrites: true,
    welcome: 'lead-dev: what should change in the game? I will route it to the team, have qa check it, and push a branch.',
  },
  'terminal-designer': {
    description: 'Designs and tunes the terminal: the shell, its commands, the virtual file system, man pages, terminal UI and the Terminal Lab (src/game shell files, src/ui, src/terminal-lab, lab scripts).',
    writes: ['src/game/{shell,commands-fs,commands-move,commands-proc,commands-text,tree,tree-links,manual,lab-checks,lab-riddle,lab-support,lab-types}.ts', 'src/ui/**', 'src/terminal-lab/**', 'scripts/harness/terminal-lab/**', 'scripts/harness/props/terminal.mjs'],
    resources: [steer('terminal-lab-rules'), 'file://.kiro/specs/inventory/items/terminal/requirements.md', 'file://.kiro/specs/inventory/items/terminal/design.md'],
    skills: ['chapter-level-generator'],
    welcome: 'terminal-designer: which command, output or terminal behaviour should change?',
  },
  'laptop-designer': {
    description: "Designs and tunes the developer's laptop (src/laptop): lifecycle, desktop and apps, coding tasks and their checks, sandboxed code runner, keyboard, boot. Writes only src/laptop.",
    writes: ['src/laptop/**', 'scripts/harness/props/laptop.mjs'],
    resources: ['file://.kiro/specs/inventory/items/laptop/requirements.md', 'file://.kiro/specs/inventory/items/laptop/design.md'],
    skills: [],
    welcome: 'laptop-designer: what should the laptop do differently?',
  },
  'comix-designer': {
    description: 'Designs and tunes the animated 3D comixes (intro, outro, interludes): page specs in comix/, the cinematic runtime and the comix editor. Uses the comix LEVEL GEN skills.',
    writes: ['comix/**', 'src/cinematic/**', 'src/comix-editor/**', 'scripts/harness/props/comix.mjs'],
    resources: [steer('declarative-comix'), steer('comix-editor-rules'), steer('skills-map')],
    skills: ['comix-architect-intake', 'comix-sequence-generator', 'comix-implementer', 'comix-editor'],
    mcp: { 'credits-forge': ['list_assets'] },
    mcpNames: ['credits-forge', 'list_assets'],
    welcome: 'comix-designer: which comix, page or beat should change?',
  },
  'chapters-designer': {
    description: 'Designs and tunes the Kiroween chapter: its levels, story, dialogs and comic issue (chapters/), the chapter runtime and editor, and the gameplay elements levels place (enemies, pickups, puzzles, inventory, Kiro cores). Uses the chapter LEVEL GEN skills.',
    writes: ['chapters/**', 'src/chapters/**', 'src/chapter-editor/**', 'src/game/{entities,entities-combat,bestiary,puzzle,inventory,kiro,dialogue,agents}.ts', 'scripts/harness/props/{chapters,gameplay,sessions}.mjs'],
    resources: [steer('level-gen-rules'), steer('declarative-chapters'), steer('chapter-editor-rules'), steer('skills-map')],
    skills: ['chapter-architect-intake', 'comix-story-drawer', 'chapter-level-generator', 'chapter-implementer', 'chapter-editor'],
    mcp: { 'credits-forge': ['list_assets', ...FORGE_READ, 'write_level'] },
    mcpNames: ['credits-forge', 'list_assets', 'validate_level', 'solve_level', 'write_level'],
    welcome: 'chapters-designer: which level, enemy, pickup, puzzle or line of dialogue should change?',
  },
  artist: {
    description: 'Creates and updates every game asset through the ASSET PCG skills: procedural models, rooms, textures, shaders, lighting, animation and particle effects, with their validators and a visual QA pass (src/procgen, src/shaders, src/renderer, src/storybook, public/assets).',
    writes: ['src/procgen/**', 'src/shaders/**', 'src/renderer/**', 'src/storybook/**', 'src/assets/**', 'public/assets/**'],
    resources: [steer('asset-pcg-rules'), steer('skills-map')],
    skills: [
      'credits-art-direction', 'procedural-kitbash-3d', 'procedural-malware-3d', 'procedural-rooms-3d', 'procedural-texture-synthesis', 'shader-texture-tuning',
      'comic-lighting-and-lightning', 'procedural-animation-3d', 'procedural-malware-animation', 'procedural-particles-3d', 'ai-mesh-pipeline',
      'model-geometry-validator', 'particle-effect-validator', 'comic-panel-viewport-auditor',
    ],
    welcome: 'artist: which model, room, texture, effect or animation should I make or change?',
  },
  qa: {
    description: 'Plays Out Of Credits and tests every part of it: the chapter in real Chrome, the terminal, laptop, comixes, editors, labs and assets, through the harness suites and screenshots. Writes a report to docs/qa/ and changes no game file.',
    // Not docs/qa/baselines/: a person approves baselines (spec .kiro/specs/qa-visual-audit/, Q13).
    writes: ['docs/qa/*.md', 'docs/qa/media/**', 'docs/qa/labs/**'],
    shellExtra: ['mkdir -p docs/qa/media', 'cp scripts/harness/out/* docs/qa/media/*'],
    resources: [steer('skills-map'), steer('declarative-chapters'), steer('declarative-comix'), steer('terminal-lab-rules')],
    skills: ['comic-panel-viewport-auditor', 'chapter-implementer', 'comix-implementer', 'model-geometry-validator', 'particle-effect-validator'],
    mcp: { 'chrome-devtools': DEVTOOLS_LOOK, 'credits-forge': ['list_assets', ...FORGE_READ] },
    mcpNames: ['chrome-devtools', 'take_screenshot', 'list_console_messages', 'credits-forge', 'validate_level'],
    welcome: 'qa: which features should I play and test? (default: a full pass)',
  },
};

/**
 * Paths the session of an orchestrator must allow. Kiro checks a sub-agent's write against the parent session too (the
 * stricter wins), so the lead's fence covers the union of its own and its sub-agents' paths; each sub-agent's own fence
 * still keeps it in its lane. The lead's own writes are held to its `writes` by the agent-scope Stop hook.
 */
function sessionWrites(a) {
  return [...new Set([...a.writes, ...(a.subagents ?? []).flatMap((s) => TEAM[s].writes)])];
}

/** What each agent's MCP use is, for check-agents.mjs: the tools it lists, and the words its prompt must contain (Req 15). */
export function mcpTable() {
  return Object.fromEntries(Object.entries(TEAM).map(([name, a]) => [name, { mcp: a.mcp ?? {}, mustName: a.mcpNames ?? [], subagents: a.subagents ?? [] }]));
}

/** `server/tool` names (the form permission rules use) of the MCP tools an agent lists, in table order. */
export function mcpTools(a) {
  return Object.entries(a.mcp ?? {}).flatMap(([server, tools]) => tools.map((t) => `${server}/${t}`));
}

/** MCP tools a session must allow: its own, and (for an orchestrator) its sub-agents', because Kiro checks a sub-agent's call against the parent too. */
function sessionMcp(a) {
  return [...new Set([...mcpTools(a), ...(a.subagents ?? []).flatMap((s) => mcpTools(TEAM[s]))])];
}

/** The agent file for one table entry. Key order is fixed, so `--check` can compare text. */
export function agentFile(name, a) {
  // Kiro checks a sub-agent's command against the parent session too (the stricter wins), so the lead also allows the
  // sub-agents' extra commands; each sub-agent's own deny still keeps the others out of them.
  const subExtra = (a.subagents ?? []).flatMap((s) => TEAM[s].shellExtra ?? []);
  const allow = [...READ_SHELL, ...GATE_SHELL, ...(a.shellExtra ?? []), ...subExtra, ...(a.gitWrites ? GIT_WRITES : [])];
  const tools = ['read', 'write', 'shell', ...(a.subagents ?? []).map((s) => `subagent/${s}`), ...mcpTools(a).map((t) => `@${t}`)];
  const servers = Object.keys(a.mcp ?? {});
  const mcpAllow = sessionMcp(a);
  const fence = sessionWrites(a);
  const rules = [
    { capability: 'fs_write', match: ['**'], exclude: fence, effect: 'deny' },
    { capability: 'fs_write', match: fence, effect: 'allow' },
    { capability: 'fs_write', match: GENERATED, effect: 'deny' },
    { capability: 'fs_write', match: PERSON_ONLY, effect: 'deny' },
    { capability: 'fs_read', match: SECRET_READS, effect: 'deny' },
    { capability: 'shell', match: allow, effect: 'allow' },
    { capability: 'shell', match: ['*'], exclude: allow, effect: 'deny' },
    { capability: 'shell', match: DENY_WORDS, effect: 'deny' },
    { capability: 'shell', match: SECRET_SHELL, effect: 'deny' },
    ...(a.subagents?.length ? [{ capability: 'subagent', match: a.subagents, effect: 'allow' }] : []),
    // MCP: exactly the listed tools run; everything else is refused, also where Kiro would auto-approve an unmatched call.
    ...(mcpAllow.length ? [{ capability: 'mcp', match: mcpAllow, effect: 'allow' }] : []),
    { capability: 'mcp', match: ['*'], ...(mcpAllow.length ? { exclude: mcpAllow } : {}), effect: 'deny' },
  ];
  const hook = (hookName, trigger, command, matcher) => ({ name: hookName, trigger, ...(matcher ? { matcher } : {}), action: { type: 'command', command } });
  return {
    name,
    description: a.description,
    prompt: `file://./prompts/${name}.md`,
    model: 'auto',
    tools,
    // Kiro CLI 3.3.0 drops a profile with `permissions` and no `allowedTools` ("Mode not found"); the empty list keeps it.
    allowedTools: [],
    ...(servers.length ? { mcpServers: Object.fromEntries(servers.map((s) => [s, MCP_SERVERS[s]])) } : {}),
    includeMcpJson: false,
    // Installed powers bring their own MCP servers (credits-ship's Netlify server loaded into every agent in the probe).
    includePowers: false,
    resources: [...BASE, ...a.resources, ...a.skills.map(skill)],
    hooks: [
      hook('agent-baseline', 'SessionStart', `node scripts/hooks/agent-scope.mjs ${name} --snapshot`),
      hook('agent-shell-guard', 'PreToolUse', `node scripts/hooks/agent-shell-guard.mjs ${name}`, '^execute_bash$'),
      ...(servers.includes('chrome-devtools') ? [hook('devtools-url-guard', 'PreToolUse', `node scripts/hooks/devtools-url-guard.mjs ${name}`, '@chrome-devtools')] : []),
      hook('agent-scope', 'Stop', `node scripts/hooks/agent-scope.mjs ${name}`),
    ],
    permissions: { rules },
    welcomeMessage: a.welcome,
  };
}

export const TEAM_NAMES = Object.keys(TEAM);

/** The shell commands an agent may run (its allow rule), for the rule self-test in check-agents.mjs. */
export const SHELL_DENY_WORDS = DENY_WORDS;
export const GENERATED_PATHS = GENERATED;
export const PERSON_ONLY_PATHS = PERSON_ONLY;

/** The paths a team agent writes itself (not what its session allows for its sub-agents); null for an unknown name. */
export function ownWrites(name) {
  return TEAM[name]?.writes ?? null;
}
export const LEAD = 'lead-dev';

/** `{ name: text }` for every agent, in canonical form. */
export function agentTexts() {
  return Object.fromEntries(Object.entries(TEAM).map(([name, a]) => [name, `${JSON.stringify(agentFile(name, a), null, 2)}\n`]));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const check = process.argv.includes('--check');
  let stale = 0;
  for (const [name, text] of Object.entries(agentTexts())) {
    const path = join(projectRoot, '.kiro/agents', `${name}.json`);
    const now = existsSync(path) ? readFileSync(path, 'utf8') : '';
    if (now === text) continue;
    if (check) {
      console.error(`stale: .kiro/agents/${name}.json differs from scripts/harness/agents-build.mjs (run it)`);
      stale++;
    } else {
      writeFileSync(path, text);
      console.log(`wrote .kiro/agents/${name}.json`);
    }
  }
  process.exit(stale ? 1 : 0);
}
