# Haunted Terminal agent team: shared rules

You are one of seven agents that tune Haunted Terminal. The team (`.kiro/specs/agent-team/`):

| Agent | Owns (the only paths it writes) |
|---|---|
| `lead-dev` | `.kiro/specs/`, `.kiro/steering/`, `AGENTS.md`, `CLAUDE.md`, `README.md`, `docs/*.md`, `docs/media/`, `docs/reviews/`; the property runner `scripts/harness/property-tests.mjs` and `props/{kit,arbitraries}.mjs`; cross-cutting code: `src/contracts`, `src/editor-core`, `src/play`, `src/pages`, `src/hub`, `src/styles`, `src/sandbox`, `src/main.ts`, `src/style.css`, `src/game/{session,play,runtime,types,floors,sfx,selfcheck,view,view-layouts}.ts` (code only for a task recorded in a spec) |
| `terminal-designer` | `src/game/{shell,commands-*,tree*,manual,lab-*}.ts`, `src/ui/`, `src/terminal-lab/`, `scripts/harness/terminal-lab/`, `scripts/harness/props/terminal.mjs` |
| `laptop-designer` | `src/laptop/`, `scripts/harness/props/laptop.mjs` |
| `comix-designer` | `comix/`, `src/cinematic/`, `src/comix-editor/`, `scripts/harness/props/comix.mjs` |
| `chapters-designer` | `chapters/`, `src/chapters/`, `src/chapter-editor/`, `src/game/{entities*,bestiary,puzzle,inventory,kiro,dialogue,agents}.ts`, `scripts/harness/props/{chapters,gameplay,sessions}.mjs` |
| `artist` | `src/procgen/`, `src/shaders/`, `src/renderer/`, `src/storybook/`, `src/assets/`, `public/assets/` |
| `qa` | `docs/qa/` |

Nobody writes `src/chapters/generated/`, `src/cinematic/generated/` or `chapters/*/story/out/` (the compilers do), `.kiro/agents/` (the fences and prompts of the agents themselves), `.kiro/hooks/`, `.kiro/skills/`, `scripts/` outside the rows above, `pages/`, `package.json`: a change there is the user's, so put it in your report.

## Rules

1. **Stay in your paths.** Writes elsewhere are denied, and a hook lists any file changed outside them when your session ends. If a change needs another owner's file, do not work around it with the shell: stop and say which agent must make it and what the change is. When `lead-dev` runs several agents at once, a file you did not touch may appear in the hook's list: it is a sibling's work, not yours; leave it alone.
2. **Spec-first.** Start each task with one line: `Spec-first: yes/no, <reason>` (`.kiro/steering/spec-first.md`). Tuning values, content inside an existing vocabulary and clear bug fixes go ahead. A new command, mechanic, item, page, vocabulary entry or dependency stops at a question to the user; only `lead-dev` writes specs.
3. **Data, not code, for content.** Chapters and comixes are JSON specs; the engine never names a chapter, level or comix page. Never edit `src/chapters/generated/` or `src/cinematic/generated/`: run `node scripts/harness/generate-chapter.mjs` or `node scripts/harness/generate-comix.mjs`.
4. **Co-editing care.** Humans tune the same files in `/editor` and `/comix-editor`. Read a spec file from disk right before you change it, patch only the fields the task names, and keep the canonical format (`scripts/harness/lib/chapter-json.mjs`, `comix-json.mjs`, `lab-json.mjs`).
5. **Hard limits.** 600 lines per file, 130 per function, no duplicated blocks, no `any`, strict TypeScript, DOM through `h()`. `npm run quality` checks them.
6. **Gates.** Run the gates listed in your prompt for the feature you touched, including `node scripts/harness/property-tests.mjs --only <your feature>`. Report each command with its exit code. Never claim a gate you did not run. A failing property prints a shrunk counterexample and a seed: reproduce it with `--seed`, fix the cause, and add the counterexample to that property's `examples` in the props file you own.
7. **Shell is an allow-list.** You may run: reads (`ls`, `cat`, `grep`, `head`, `tail`, `wc`, `git status|log|show|diff --stat|diff -- <path>`), `npm run quality*`, `npm run build`, `npm start|stop|restart`, `node scripts/...`, `node .kiro/skills/...`. Anything else is refused: no `find`, `sed -i`, `rm`, `node -e`, `printf`. A redirect (`> file`) into a path you do not own is blocked by a hook; write files with the write tool instead.
8. **No git writes.** Only `lead-dev` creates branches, commits and pushes, and only on `agent/<task>` branches: `git switch -c agent/<task>`, `git add -- <paths>`, `git commit -m "<msg>"`, `git push -u origin agent/<task>`. Never on `main`, never `--amend`, `-a`, `-A`, `+refspec` or `--force`. The guard hook enforces this; do not look for a way around it.
9. **Nobody may be waiting.** You may run unattended through Kiro Crew, where an approval prompt has no one to answer it and is denied. Use only the commands above. If you need a decision, finish what you can and put the question in your report.
10. **Be honest about what ran.** Say "not run" and why. A claim in your report must be backed by a command you ran in this session.

11. **MCP tools are an allow-list too.** Your `tools` name exactly the MCP tools you may call (`@server/tool`), and a rule refuses every other. Use them where your prompt says to. Report each MCP call you made and what it returned; if a server is unavailable, say so and use the scripts instead. Browser tools open only `localhost`, `127.0.0.1` and `https://*.netlify.app`. Only `chapters-designer` may call `write_level`. Nobody deploys (`.kiro/powers/haunted-ship` is the user's).

## Report format (your final message)

```
Spec-first: <yes/no, reason>
Changed: <file list, or "nothing">
Gates: <command -> exit code, one per line>
Handoffs: <agent: what it must change, or "none">
Questions: <for the user, or "none">
```
