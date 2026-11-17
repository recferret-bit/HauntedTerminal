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
const GATE_SHELL = ['npm run quality', 'npm run quality:*', 'npm run build', 'npm start', 'npm stop', 'npm restart', 'npm run status', 'node scripts/*', 'node .kiro/skills/*'];
/** Only the lead writes git history, and only on agent/<task> branches (the guard hook enforces the branch). */
const GIT_WRITES = ['git switch -c agent/*', 'git switch agent/*', 'git add -- *', 'git commit -m *', 'git push -u origin agent/*', 'git push origin agent/*'];
/** Denied for everyone even if a future edit adds a matching allow: they bypass the write fence or rewrite history. */
const DENY_WORDS = ['*--output*', 'git reset*', 'git checkout*', 'git stash*', 'git clean*', 'git branch -D*', 'rm *', 'sudo *', 'npm install*', 'npm i *', 'npm uninstall*', 'npm publish*'];
/** Files that hold secrets: the Crew gateway keeps the Telegram bot token in ~/.kiro/crew/.env. */
const SECRET_READS = ['**/.env', '**/.env.*', '**/*.pem', '**/*.key', '~/.kiro/crew/.env', '~/.kiro/crew/auth*', '~/.ssh/**', '~/.aws/**'];
const SECRET_SHELL = ['*.env*', '*.pem*', '*/.ssh/*', '*/.aws/*', '*.kiro/crew/.env*'];
/** Compiled output: the compilers write it, no agent edits it by hand. */
const GENERATED = ['src/chapters/generated/**', 'src/cinematic/generated/**', 'chapters/*/story/out/**'];

const TEAM = {
  'lead-dev': {
    description: 'Lead game developer and orchestrator of the Haunted Terminal team. Takes any tuning request, routes each part to the owning designer or the artist, has qa check every change, and commits finished work on an agent/<task> branch. Start here, also from the phone.',
    writes: ['.kiro/specs/**', '.kiro/steering/**', 'AGENTS.md', 'CLAUDE.md', 'README.md', 'docs/*.md', 'docs/media/**', 'docs/reviews/**', 'scripts/harness/property-tests.mjs', 'scripts/harness/props/{kit,arbitraries}.mjs', 'src/contracts/**', 'src/editor-core/**', 'src/play/**', 'src/pages/**', 'src/hub/**', 'src/styles/**', 'src/sandbox/**', 'src/main.ts', 'src/style.css', 'src/game/{session,play,runtime,types,floors,sfx,selfcheck,view,view-layouts}.ts'],
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
    welcome: 'comix-designer: which comix, page or beat should change?',
  },
  'chapters-designer': {
    description: 'Designs and tunes the Kiroween chapter: its levels, story, dialogs and comic issue (chapters/), the chapter runtime and editor, and the gameplay elements levels place (enemies, pickups, puzzles, inventory, Kiro cores). Uses the chapter LEVEL GEN skills.',
    writes: ['chapters/**', 'src/chapters/**', 'src/chapter-editor/**', 'src/game/{entities,entities-combat,bestiary,puzzle,inventory,kiro,dialogue,agents}.ts', 'scripts/harness/props/{chapters,gameplay,sessions}.mjs'],
    resources: [steer('level-gen-rules'), steer('declarative-chapters'), steer('chapter-editor-rules'), steer('skills-map')],
    skills: ['chapter-architect-intake', 'comix-story-drawer', 'chapter-level-generator', 'chapter-implementer', 'chapter-editor'],
    welcome: 'chapters-designer: which level, enemy, pickup, puzzle or line of dialogue should change?',
  },
  artist: {
    description: 'Creates and updates every game asset through the ASSET PCG skills: procedural models, rooms, textures, shaders, lighting, animation and particle effects, with their validators and a visual QA pass (src/procgen, src/shaders, src/renderer, src/storybook, public/assets).',
    writes: ['src/procgen/**', 'src/shaders/**', 'src/renderer/**', 'src/storybook/**', 'src/assets/**', 'public/assets/**'],
    resources: [steer('asset-pcg-rules'), steer('skills-map')],
    skills: [
      'haunted-art-direction', 'procedural-kitbash-3d', 'procedural-malware-3d', 'procedural-rooms-3d', 'procedural-texture-synthesis', 'shader-texture-tuning',
      'comic-lighting-and-lightning', 'procedural-animation-3d', 'procedural-malware-animation', 'procedural-particles-3d', 'ai-mesh-pipeline',
      'model-geometry-validator', 'particle-effect-validator', 'comic-panel-viewport-auditor',
    ],
    welcome: 'artist: which model, room, texture, effect or animation should I make or change?',
  },
  qa: {
    description: 'Plays Haunted Terminal and tests every part of it: the chapter in real Chrome, the terminal, laptop, comixes, editors, labs and assets, through the harness suites and screenshots. Writes a report to docs/qa/ and changes no game file.',
    writes: ['docs/qa/**'],
    shellExtra: ['mkdir -p docs/qa/media', 'cp scripts/harness/out/* docs/qa/media/*'],
    resources: [steer('skills-map'), steer('declarative-chapters'), steer('declarative-comix'), steer('terminal-lab-rules')],
    skills: ['comic-panel-viewport-auditor', 'chapter-implementer', 'comix-implementer', 'model-geometry-validator', 'particle-effect-validator'],
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

/** The agent file for one table entry. Key order is fixed, so `--check` can compare text. */
export function agentFile(name, a) {
  // Kiro checks a sub-agent's command against the parent session too (the stricter wins), so the lead also allows the
  // sub-agents' extra commands; each sub-agent's own deny still keeps the others out of them.
  const subExtra = (a.subagents ?? []).flatMap((s) => TEAM[s].shellExtra ?? []);
  const allow = [...READ_SHELL, ...GATE_SHELL, ...(a.shellExtra ?? []), ...subExtra, ...(a.gitWrites ? GIT_WRITES : [])];
  const tools = ['read', 'write', 'shell', ...(a.subagents ?? []).map((s) => `subagent/${s}`)];
  const fence = sessionWrites(a);
  const rules = [
    { capability: 'fs_write', match: ['**'], exclude: fence, effect: 'deny' },
    { capability: 'fs_write', match: fence, effect: 'allow' },
    { capability: 'fs_write', match: GENERATED, effect: 'deny' },
    { capability: 'fs_read', match: SECRET_READS, effect: 'deny' },
    { capability: 'shell', match: allow, effect: 'allow' },
    { capability: 'shell', match: ['*'], exclude: allow, effect: 'deny' },
    { capability: 'shell', match: DENY_WORDS, effect: 'deny' },
    { capability: 'shell', match: SECRET_SHELL, effect: 'deny' },
    ...(a.subagents?.length ? [{ capability: 'subagent', match: a.subagents, effect: 'allow' }] : []),
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
    resources: [...BASE, ...a.resources, ...a.skills.map(skill)],
    hooks: [
      hook('agent-baseline', 'SessionStart', `node scripts/hooks/agent-scope.mjs ${name} --snapshot`),
      hook('agent-shell-guard', 'PreToolUse', `node scripts/hooks/agent-shell-guard.mjs ${name}`, '^execute_bash$'),
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
