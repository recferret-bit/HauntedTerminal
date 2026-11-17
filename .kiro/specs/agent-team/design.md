# Agent team: design

Follows `requirements.md` (approved 2026-11-17). Kiro CLI 3.3.0 (V3 agent schema).

## Pieces

```
.kiro/agents/
  lead-dev.json            orchestrator: routes to the six agents, calls qa, commits on agent/<task>
  terminal-designer.json   shell, commands, VFS, terminal UI, Terminal Lab
  laptop-designer.json     src/laptop
  comix-designer.json      comix/, cinematic runtime, comix editor
  chapters-designer.json   chapters/, chapter runtime and editor, gameplay elements in src/game
  artist.json              ASSET PCG: procgen, shaders, renderer, storybook, public/assets
  qa.json                  plays and tests everything, writes docs/qa/ reports
  prompts/<name>.md        one prompt per agent: role, owned paths, skills, gates, report format
scripts/quality/check-agents.mjs   gate (npm run quality:agents, inside npm run quality)
scripts/hooks/agent-scope.mjs      Stop hook of every agent: changed files vs that agent's write paths
scripts/harness/agents-install.mjs npm run agents:install [-- --remove]
docs/AGENTS_CREW.md                CLI and phone (Kiro Crew + Telegram) guide
docs/qa/README.md                  QA report template; reports land next to it
```

## Agent file shape

All seven use the same shape (V3 schema). Example, `laptop-designer.json`:

```json
{
  "name": "laptop-designer",
  "description": "Designs and tunes the developer's laptop (src/laptop): lifecycle, desktop, apps, coding tasks and checks. Writes only src/laptop.",
  "prompt": "file://./prompts/laptop-designer.md",
  "model": "auto",
  "tools": ["read", "write", "shell"],
  "resources": [
    "file://../../AGENTS.md",
    "file://../steering/{product,tech,structure,architecture,glossary,skills-map,spec-first}.md",
    "file://../specs/inventory/items/laptop/*.md"
  ],
  "hooks": [{ "name": "scope", "trigger": "Stop", "action": { "type": "command", "command": "node scripts/hooks/agent-scope.mjs laptop-designer" } }],
  "permissions": { "rules": [
    { "capability": "fs_write", "match": ["**"], "exclude": ["src/laptop/**"], "effect": "deny" },
    { "capability": "fs_write", "match": ["src/laptop/**"], "effect": "allow" },
    { "capability": "shell", "match": ["npm run *", "node scripts/*", "node .kiro/skills/*", "git status*", "git diff*", "git log*"], "effect": "allow" },
    { "capability": "shell", "match": ["git commit*", "git push*", "git reset*", "git checkout*", "git switch*", "rm -rf*"], "effect": "deny" }
  ]},
  "welcomeMessage": "Laptop designer. What should the laptop do differently?"
}
```

The exact `file://` relative-path and brace-glob behaviour is confirmed in task 1 with `/context show`. If a pattern does not resolve, the file lists it path by path.

## Resources, write paths and gates per agent

| Agent | Feature steering and specs (beyond AGENTS.md + 7 always-on) | Skills (`skill://`) | Writes | Gates it runs |
|---|---|---|---|---|
| `lead-dev` | all spec `requirements.md` files | `feature-spec-grill` | `.kiro/specs/**`; cross-cutting `src/{contracts,editor-core,play,pages,hub,styles}/**` | `npm run quality`, `check-specs.mjs` |
| `terminal-designer` | `terminal-lab-rules.md`, `specs/inventory/items/terminal/` | `chapter-level-generator` | `src/game/{shell,commands-*,tree*,manual,lab-*}.ts`, `src/ui/**`, `src/terminal-lab/**`, `scripts/harness/terminal-lab/**` | quality, `terminal-lab-unit`, `terminal-lab.mjs --all`, `terminal-lab-api-test`, `terminal-lab-smoke`, `generate-chapter.mjs --verify`, `property-tests.mjs --only terminal` |
| `laptop-designer` | `specs/inventory/items/laptop/` | none | `src/laptop/**` | quality, `laptop-unit`, `laptop-lab-smoke`, `property-tests --only laptop` |
| `comix-designer` | `declarative-comix.md`, `comix-editor-rules.md` | the 4 comix skills | `comix/**`, `src/cinematic/**` and `src/comix-editor/**` except `generated/` | `generate-comix.mjs --verify`, `validate-comix`, `verify-comix.mjs`, `editor-unit-test`, `comix-editor-smoke`, `property-tests --only comix` |
| `chapters-designer` | `level-gen-rules.md`, `declarative-chapters.md`, `chapter-editor-rules.md` | the 5 chapter skills | `chapters/**`, `src/chapters/**` except `generated/`, `src/chapter-editor/**`, `src/game/{entities*,bestiary,puzzle,inventory,kiro,dialogue,agents}.ts` | `generate-chapter --verify`, `verify-chapter.mjs`, `editor-unit-test`, `editor-smoke`, `terminal-lab-unit`, `play-browser.mjs`, `property-tests --only chapters,gameplay` |
| `artist` | `asset-pcg-rules.md` | the 14 ASSET PCG skills | `src/{procgen,shaders,renderer,storybook,assets}/**`, `public/assets/**` | `validate-model --all --strict`, `check-tags --all`, `screenshot-lab --selftest`, `quality:fingerprint` (diff and explain) |
| `qa` | all steering | `comic-panel-viewport-auditor`, `chapter-implementer`, `comix-implementer` | `docs/qa/**` | every suite of the affected features; full pass = all gates in `architecture.md` + `play-browser.mjs` |

`src/game` files not listed (`session.ts`, `play.ts`, `runtime.ts`, `types.ts`, `floors.ts`, `sfx.ts`, `selfcheck.ts`, `view*.ts`, `tree-links.ts`) and `src/sandbox`, `src/main.ts`, `src/style.css` go to `lead-dev` as cross-cutting, under the same "task recorded in a spec" rule. `check-agents.mjs` fails until every file under `src/`, `chapters/`, `comix/`, `public/assets/` has exactly one owner, so the table and the agent files cannot drift.

## Decisions

- **JSON plus a prompt file, not `.md` agents.** The Crew Agents page documents JSON, `kiro-cli agent validate` checks JSON, and the prompt stays readable as Markdown. (Req 1, Q2.)
- **Deny-everything-except as the first rule.** Kiro uses deny-overrides: one `deny` on `**` with `exclude` = own paths blocks every other write, whatever other scopes allow. (Req 6-7.)
- **Shell writes are checked after the fact.** `fs_write` rules do not see `sed -i` or a script writing a file. `agent-scope.mjs` runs at `Stop`, lists `git status --porcelain` paths outside the agent's write paths, and prints them so the agent reverts or hands off to the owner. Generated files written by the compilers (`src/chapters/generated/`, `src/cinematic/generated/`) and `scripts/harness/out/` are allowed for everyone. (Req 7-8.)
- **No ownership table file.** The agents' own `fs_write` allow rules are the table; `check-agents.mjs` derives ownership from them. One source of truth. (Req 6.)
- **`check-agents.mjs` validates what `kiro-cli agent validate` does not.** Validate only checks JSON types: a wrong capability or effect passes. The gate checks: known capabilities and effects; prompt files exist; `model` is `auto`; `file://` resources resolve and stay under 32 files and 100,000 characters; the lead's tools are exactly `subagent/<the six>` with no `subagent`, `@builtin` or `*`; non-lead agents deny `git commit` and `git push`; every owned file has one owner. (Req 1-3, 6, 9.)
- **Sub-agent calls are pre-allowed.** In headless runs (Crew, Telegram) an approval prompt is denied, so the lead has `{ capability: subagent, match: [the six], effect: allow }`, and each agent's shell allow list covers its gates. Anything else stays `ask`, which is denied on the phone by design. (Req 9, 17.)
- **Branch first, then delegate.** The lead runs `git switch -c agent/<task>` before any work. If the tree has uncommitted changes it did not make, it stops and asks. After QA passes: `git add` of the changed paths only, `git commit`, `git push -u origin agent/<task>`. Its shell rules deny `git push*main*`, `git push --force*`, `git push -f*`, `git reset --hard*`. (Req 15-16.)
- **Lead loop.** Classify spec-first; split the request by owner; delegate; call `qa` with the affected features; send failing findings back to the owner, at most two rounds; then commit, or report what is still failing. (Req 2, 9-10.)
- **QA report.** `docs/qa/<YYYY-MM-DD>-<scope>.md`: commands run with exit codes, screenshots looked at, findings as a table (severity, feature, owner, repro, evidence). Screenshots of failures are copied to `docs/qa/media/`. (Req 13-14.)
- **Install by symlink.** `agents-install.mjs` links `~/.kiro/agents/<name>.json` to the repo file and `~/.kiro/agents/prompts/<name>.md` to the repo prompt (relative `file://` paths resolve from the link's folder, so the prompts are linked too; confirmed in task 4). It refuses to replace a file it did not create, and `--remove` only deletes links that point into this repo. (Req 4-5.)
- **Phone path.** `docs/AGENTS_CREW.md`: start the gateway from the repo folder (`kiro-cli crew gateway`), Telegram bot token and `allowed_user_ids` in `~/.kiro/crew/`, select `lead-dev` in the dashboard (Customize, Agents) or as the default agent. The Crew docs do not say how a Telegram chat picks a custom agent; task 6 finds out and the guide records what works. (Req 17.)

## Found while building (Kiro CLI 3.3.0)

- **`permissions` needs `allowedTools`.** A profile with a `permissions` block and no `allowedTools` is silently dropped (`Mode '<name>' not found`), even with empty rules. Every agent carries `"allowedTools": []`; `agents-build.mjs` writes it and `check-agents.mjs` requires it.
- **`kiro-cli agent validate` checks JSON types only.** A misspelled capability or effect passes; `check-agents.mjs` checks them.
- **Write rules work, with prompts.** Without `--trust-all-tools`, every write in a `--no-interactive` run is denied ("approval not supported"), even inside the agent's own paths. With `--trust-all-tools`, the agent's `deny` rule still blocks writes outside its paths (verified with a probe agent: `src/laptop/a.txt` written, `docs/b.txt` refused). Crew and phone runs therefore need the agent's own allow rules plus the gateway's trust setting; the guide says so.
- **Skills are inherited.** Every workspace agent sees all 24 workspace skills, whatever its `skill://` list says. The per-agent lists stay as documentation of each agent's focus and as resources the prompt names; they are not a boundary.
- **Shared rules file.** `.kiro/agents/prompts/team-rules.md` (ownership table, spec-first, report format) is loaded by every agent through `resources`; each prompt only adds its own area.
- **One table writes all seven files.** `scripts/harness/agents-build.mjs` holds the team table (write paths, resources, skills, sub-agents, shell rules) and writes `.kiro/agents/*.json`; `--check` fails when a file was hand-edited.

## Found by the independent review (2026-11-17) and fixed

Probed with scratch agents on Kiro CLI 3.3.0, under `--trust-all-tools` (the analog of Kiro Crew's Automatic mode):

- **A command that matches no shell rule just runs.** With only allow rules, `printf`, `find -delete` and `git diff --output=f` all ran and wrote files outside the `fs_write` fence. Fix: the allow list is also a catch-all `deny *` with the list as `exclude`; probed to refuse `find`, `printf`, `node -e`, `git push origin HEAD:main`, and to allow `cat`, `git status`.
- **Shell rules see command words only.** `echo x > docs/f` ran under a `deny *>*` rule. Fix: the `agent-shell-guard.mjs` `PreToolUse` hook (event: `tool_name: execute_bash`, `tool_input.command`, `cwd`; exit 2 blocks, probed) parses redirects and git arguments.
- **`deny` with `exclude` works as "everything except".** `git push*` denied except `git push -u origin agent/*` let `agent/maintenance-x` through and refused `HEAD:main`; this replaced the old `git push*main*` pattern that also blocked branches containing "main".
- **A commit on `main` cannot be matched by a rule.** The guard hook reads `git branch --show-current`.
- **`SessionStart` and `Stop` hooks both fire** (probed), so the scope hook takes a baseline and reports only what changed in the session, with owners, instead of remembering paths it already reported.
- **A sub-agent's shell command is also checked against the lead's rules,** so the lead's allow list includes the sub-agents' extra commands (`qa`: `mkdir -p docs/qa/media`, `cp scripts/harness/out/* docs/qa/media/*`).
- **Residual risk, stated plainly.** Redirects and git arguments are checked only by a hook, and the Crew docs do not say that an agent's own hooks run in a Telegram session; `node scripts/*` runs any harness script. The fence is a guard against an agent's mistakes, not a sandbox against a hostile one. The barrier that holds regardless of hooks is branch protection on `main` in GitHub (user setting), and the pushes are only to `agent/*` branches.

## Found while preparing Kiro Crew (2026-11-17, Crew 0.12.1, Kiro CLI 3.4.0)

- **The agent profile's rules are honoured by the gateway.** A subagent started with `--agent qa` was refused `printf` by `deny shell *` and ran an allowed script with no prompt.
- **`kirocrew spawn run` does not run in the repo.** It starts the agent in `~/workplace/kirocrew-workspace/subagent_<id>`, an empty folder; `--crew <member>` did not change that. Only a member's own chat (dashboard, Telegram) uses the member's workspace.
- **`kirocrew chat -m` cannot approve** ("this invocation cannot ask"), so even allowed calls are denied there.
- **The Crew CLI creates members only from its built-in template,** but `kirocrew agent update <member> --kiro-agent lead-dev` accepts a custom agent once it is in `~/.kiro/agents`. A running gateway rewrote it back once, so config is edited with the gateway stopped.
- **`autoApprove` lists skip `PreToolUse` hooks** (Crew security docs), so `crew:check` fails on them.
- Not verifiable without a signed-in dashboard session or a Telegram bot: whether a member chat runs an agent's own hooks. The guide's first test answers it in two minutes and says what each outcome means.

## Layers and gates

- No `src/` code changes, no layer rule, no page, no vocabulary change. Fingerprint unaffected.
- New gate `quality:agents` added to `npm run quality`.
- `check-root.mjs` unaffected (`docs/qa/` is under `docs/`).
- New npm script `agents:install`.
