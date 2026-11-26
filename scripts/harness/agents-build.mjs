#!/usr/bin/env node
// Writes the nine team agents (.kiro/agents/<name>.json) from one table, so their shape cannot drift.
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
  // Compare two outputs saved under the shared, git-ignored output folder (e.g. the fingerprint before and after a change).
  'diff scripts/harness/out/*',
];
/**
 * The dev server on 5174, for when 5400 belongs to another project on the machine (qa then had no page for its browser
 * tools). Exact strings: a `STACK_PORT=*` pattern would also match `STACK_PORT=$(...) npm start`.
 */
const ALT_STACK = ['STACK_PORT=5174 npm start', 'STACK_PORT=5174 npm stop', 'STACK_PORT=5174 npm run status'];
/**
 * `npx tsc --noEmit`, exactly: CLAUDE.md and the asset skills cite it after a TypeScript edit in src/. No other `npx`.
 * `npm run test` chains only `node scripts/...` suites (package.json), so it is the AGENTS.md gate in one command.
 */
const GATE_SHELL = ['npm run quality', 'npm run quality:*', 'npm run test', 'npm run build', 'npm start', 'npm stop', 'npm restart', 'npm run status', ...ALT_STACK, 'node scripts/*', 'node .kiro/skills/*', 'npx tsc --noEmit'];
/** Only the lead writes git history, and only on agent/<task> branches (the guard hook enforces the branch). */
const GIT_WRITES = ['git switch -c agent/*', 'git switch agent/*', 'git add -- *', 'git commit -m *', 'git push -u origin agent/*', 'git push origin agent/*'];
/**
 * Visual-audit baselines are approved by a person only (spec .kiro/specs/qa-visual-audit/, Q13): no agent runs `--update`,
 * names the baseline folder in a command, or copies along a `..` path (which could reach it from docs/qa/media/).
 */
const PERSON_ONLY = ['docs/qa/baselines/**'];
const PERSON_ONLY_SHELL = ['*visual-audit*--update*', '*docs/qa/baselines*', 'cp *..*'];
/** Denied for everyone even if a future edit adds a matching allow: they bypass the write fence or rewrite history. */
/**
 * The user's commands (deploy, release, native builds, installing the agents) and the ways around `node scripts/*`,
 * `node .kiro/skills/*` and `cd *`: a `..` segment or a `cd` into `.kiro/powers` would reach a power's script, and command
 * substitution would hide a command inside an allowed one. The script names are denied after `node` only, so reading them
 * (`cat`, `grep`, `git log -- <path>`) and naming them in a commit message stay allowed. The guard hook also refuses
 * `node` after a `cd` and a glob in a script path (shell rules cannot see either).
 */
const USER_ONLY_SHELL = [
  'node *..*', 'cd *..*', 'node *.kiro/powers*', 'cd *.kiro/powers*', '*$(*', '*`*',
  'node *ship.mjs*', 'node *release.mjs*', 'node *tauri-local.mjs*', 'node *build-tauri-steam*', 'node *agents-install*',
  // mcp-probe spawns kiro-cli with --trust-all-tools and spends model credits: the user runs it.
  'node *mcp-probe*',
];
const DENY_WORDS = ['*--output*', 'git reset*', 'git checkout*', 'git stash*', 'git clean*', 'git branch -D*', 'rm *', 'sudo *', 'npm install*', 'npm i *', 'npm uninstall*', 'npm publish*', ...PERSON_ONLY_SHELL, ...USER_ONLY_SHELL];
/**
 * Files that hold secrets: the Crew gateway keeps its channel tokens in ~/.kiro/crew/.env; `netlify login` writes
 * ~/Library/Preferences/netlify/config.json (macOS), `gh auth login` ~/.config/gh/hosts.yml.
 */
const SECRET_READS = ['**/.env', '**/.env.*', '**/*.pem', '**/*.key', '~/.kiro/crew/.env', '~/.kiro/crew/auth*', '~/.ssh/**', '~/.aws/**', '~/Library/Preferences/netlify/**', '~/.config/gh/**'];
const SECRET_SHELL = ['*.env*', '*.pem*', '*/.ssh/*', '*/.aws/*', '*.kiro/crew/.env*', '*netlify/config.json*', '*/.config/gh/*', '*.netrc*'];
/** Compiled output: the compilers write it, no agent edits it by hand. */
const GENERATED = ['src/chapters/generated/**', 'src/cinematic/generated/**', 'chapters/*/story/out/**'];
/** The visual audit of qa (spec .kiro/specs/qa-visual-audit/, Q11): the lead owns it, so qa cannot change its own checks. */
const VISUAL_AUDIT = ['scripts/harness/visual-audit.mjs', 'scripts/harness/lib/visual-*.mjs', 'scripts/harness/visual/**'];
/**
 * The ElevenLabs wrapper and its credit cap (spec .kiro/specs/audio-agent/, Q11): the lead owns it, so the agent that
 * spends credits (sound-designer) cannot raise its own cap.
 */
const AUDIO_GEN = ['scripts/harness/audio-gen.mjs', 'scripts/harness/audio-gen-unit.mjs', 'scripts/harness/lib/audio-gen-*.mjs'];
/** The declarative social media harness and its ElevenLabs credit cap (spec .kiro/specs/social-smm-agent/): lead-dev owns it. */
const SOCIAL_MEDIA = ['scripts/harness/social-media.mjs', 'scripts/harness/social-unit.mjs', 'scripts/harness/lib/social-*.mjs'];

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
    writes: ['.kiro/specs/**', '.kiro/steering/**', 'AGENTS.md', 'CLAUDE.md', 'README.md', 'docs/*.md', 'docs/media/**', 'docs/reviews/**', 'scripts/harness/property-tests.mjs', 'scripts/harness/props/{kit,arbitraries}.mjs', 'src/contracts/**', 'src/editor-core/**', 'src/play/**', 'src/pages/**', 'src/hub/**', 'src/styles/**', 'src/sandbox/**', 'src/main.ts', 'src/style.css', 'src/game/{session,session-shell,play,runtime,types,floors,sfx,view,view-layouts}.ts', 'scripts/harness/{hub-unit,classic-unit,architecture-unit}.mjs', ...VISUAL_AUDIT, ...AUDIO_GEN, ...SOCIAL_MEDIA],
    // Nothing beyond the shared base: the skill map is in AGENTS.md, and the agent-team spec (12,600 characters) is read
    // on demand (its prompt says when). The lead carries the most context of the team; check-agents.mjs keeps at least
    // LEAD_HEADROOM of the CLI's 100,000 characters free for it, so the next doc edit cannot silently push it over.
    resources: [],
    skills: ['feature-spec-grill'],
    subagents: ['terminal-designer', 'laptop-designer', 'comix-designer', 'chapters-designer', 'artist', 'sound-designer', 'smm-agent', 'qa'],
    gitWrites: true,
    welcome: 'lead-dev: what should change in the game? I will route it to the team, have qa check it, and push a branch.',
  },
  'terminal-designer': {
    description: 'Designs and tunes the terminal: the shell, its commands, the virtual file system, man pages, terminal UI and the Terminal Lab (src/game shell files, src/ui, src/terminal-lab, lab scripts).',
    writes: ['src/game/{shell,commands-fs,commands-move,commands-proc,commands-text,unix-applets,tree,tree-links,manual,manual-types,manual-cmds-nav,manual-cmds-text,manual-cmds-meta,manual-guides,manual-catalog,lab-checks,lab-riddle,lab-support,lab-types}.ts', 'src/ui/**', 'src/terminal-lab/**', 'scripts/harness/terminal-lab/**', 'scripts/harness/props/terminal*.mjs', 'scripts/harness/{manual-unit,manual-smoke}.mjs'],
    // The manual's spec (done) is left out, read it when needed: the resources must keep >= 8,000 of the CLI's 100,000 characters free.
    resources: [steer('terminal-lab-rules'), 'file://.kiro/specs/inventory/items/terminal/requirements.md', 'file://.kiro/specs/inventory/items/terminal/design.md'],
    skills: ['chapter-level-generator'],
    welcome: 'terminal-designer: which command, output or terminal behaviour should change?',
  },
  'laptop-designer': {
    description: "Designs and tunes the developer's laptop (src/laptop, props/laptop.mjs): state-machine lifecycle, desktop and apps, coding tasks and checks, sandboxed code runner, AppBus sound cues, keyboard, boot.",
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
    writes: ['chapters/**', 'src/chapters/**', 'src/chapter-editor/**', 'src/game/{entities,entities-combat,entities-types,bestiary,puzzle,inventory,kiro,kiro-commands,dialogue,agents,battle}.ts', 'scripts/harness/props/{chapters,gameplay,gameplay-fsm,sessions}.mjs', 'scripts/harness/battle-unit.mjs'],
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
  'sound-designer': {
    description: "Owns the game's sound: sound effects, music beds and robot voice lines in public/sfx and public/music, their prompt lists (docs/audio) and manifests, and which app event or scene plays which cue (src/audio). Generates with the ElevenLabs CLI only through audio-gen.mjs, under a credit cap.",
    writes: ['public/sfx/**', 'public/music/**', 'docs/audio/*.md', 'src/audio/**', 'scripts/harness/{audio-unit,audio-smoke}.mjs'],
    // Not skills-map (AGENTS.md carries the AUDIO pipeline) nor app-events-audio/design.md (spec done): read them when
    // needed. Keeps >= 8,000 of the CLI's 100,000 characters free.
    resources: ['file://.kiro/specs/app-events-audio/requirements.md', 'file://.kiro/specs/audio-agent/requirements.md'],
    skills: ['sfx-and-music-pipeline', ...['shared', 'text-to-sound-effects', 'music', 'text-to-speech', 'voices', 'audio-effects', 'usage', 'models'].map((s) => `elevenlabs-${s}`)],
    welcome: 'sound-designer: which sound effect, music bed or voice line should I write, generate or map?',
  },
  'smm-agent': {
    description: 'Owns social media growth, Steam/social comparable research, campaigns for X, YouTube and TikTok, and declarative gameplay video, screenshot, infographic and ElevenLabs social audio specs (social/, docs/marketing/) targeting $1M gross revenue.',
    writes: ['social/*.md', 'social/campaigns/**', 'social/research/**', 'social/media/README.md', 'social/media/specs/**', 'docs/marketing/**'],
    resources: ['file://docs/STEAM_RELEASE_PLAYBOOK.md', 'file://.kiro/specs/social-smm-agent/requirements.md'],
    skills: ['smm-revenue-playbook', 'social-video-harness', 'credits-art-direction', 'sfx-and-music-pipeline', ...['shared', 'text-to-speech', 'music', 'text-to-sound-effects', 'usage'].map((s) => `elevenlabs-${s}`)],
    welcome: 'smm-agent: which X thread, YouTube trailer, TikTok vertical hook or Steam wishlist campaign should I build?',
  },
  qa: {
    description: 'Plays Out Of Credits and tests every part of it: the chapter in real Chrome, the terminal, laptop, comixes, editors, labs and assets, through the harness suites and screenshots. Writes a report to docs/qa/ and changes no game file.',
    // Not docs/qa/baselines/: a person approves baselines (spec .kiro/specs/qa-visual-audit/, Q13).
    writes: ['docs/qa/*.md', 'docs/qa/media/**', 'docs/qa/labs/**'],
    shellExtra: ['mkdir -p docs/qa/media', 'cp scripts/harness/out/* docs/qa/media/*'],
    // Not skills-map (AGENTS.md carries the same map; read it when needed): keeps >= 8,000 of 100,000 characters free.
    resources: [steer('declarative-chapters'), steer('declarative-comix'), steer('terminal-lab-rules')],
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
