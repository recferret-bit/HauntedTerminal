# The agent team: Kiro CLI and the phone

Seven Kiro custom agents tune Haunted Terminal. They live in [`.kiro/agents/`](../.kiro/agents/), written from one table by `scripts/harness/agents-build.mjs` and checked by `npm run quality:agents`. Spec: [`.kiro/specs/agent-team/`](../.kiro/specs/agent-team/).

| Agent | Tunes | Writes only |
|---|---|---|
| `lead-dev` | anything: routes the request, has `qa` check it, commits a branch | `.kiro/specs/`, cross-cutting code |
| `terminal-designer` | shell, commands, file system, man pages, terminal UI, Terminal Lab | shell files in `src/game`, `src/ui`, `src/terminal-lab`, lab scripts |
| `laptop-designer` | the laptop, its apps and coding tasks, Laptop Lab | `src/laptop` |
| `comix-designer` | intro, outro and other 3D comixes, comix editor | `comix/`, `src/cinematic`, `src/comix-editor` |
| `chapters-designer` | levels, story, dialog, comic issue, enemies, pickups, puzzles, inventory, Kiro cores, chapter editor | `chapters/`, `src/chapters`, `src/chapter-editor`, gameplay files in `src/game` |
| `artist` | models, rooms, textures, shaders, lighting, animation, effects | `src/procgen`, `src/shaders`, `src/renderer`, `src/storybook`, `src/assets`, `public/assets` |
| `qa` | plays and tests everything, writes a report | `docs/qa/` |

Every agent loads `AGENTS.md`, the always-on steering (including [`team.md`](../.kiro/steering/team.md)) and [`team-rules.md`](../.kiro/agents/prompts/team-rules.md) (ownership, spec-first, report format), plus its own prompt, steering and skills. Property-test suites belong to the designer of their feature; `docs/*.md`, steering and `AGENTS.md` belong to `lead-dev`; `.kiro/agents/`, `.kiro/hooks/`, `scripts/` and `package.json` belong to you.

## What keeps an agent in its lane

Probed on Kiro CLI 3.3.0, so the limits are stated as they are:

| Layer | What it does | Limit |
|---|---|---|
| `fs_write` deny rule | an agent's write tool can write only its own paths, never compiled output (`generated/`) | does not see what a shell command writes |
| shell allow-list | `ls`, `cat`, `grep`, reads of git, `npm run quality*`, `node scripts/*`, `node .kiro/skills/*`; everything else refused (`find`, `sed -i`, `rm`, `printf`, `node -e`) | `node scripts/*` runs any harness script |
| guard hook (`agent-shell-guard`) | blocks a redirect outside the agent's paths; any git history write by anyone but `lead-dev`; commit, merge or push on `main`; `git add -A`; `--amend`; any push that is not `origin agent/<task>` | needs the agent's hooks to run (see "Not verified") |
| scope hook (`agent-scope`) | at the end of a session lists files changed since it began outside the agent's paths, with their owners | advisory |
| `fs_read` deny | no reads of `.env`, `*.pem`, `~/.ssh`, `~/.aws`, the Crew bot token | `cat` of such a file is also denied by name |
| GitHub branch protection | the barrier that holds whatever the agents do | your setting: see below |

This is a guard against an agent's mistakes, not a sandbox against a hostile one. In Kiro Crew's Automatic mode (and `--trust-all-tools` on the CLI) a command that matches no rule simply runs; that is why the shell list is also written as a catch-all `deny *` that excludes it.

## From Kiro CLI (on the Mac)

```bash
cd ~/work/kiroween/HauntedTerminal
kiro-cli --agent lead-dev            # the usual entry point
kiro-cli --agent chapters-designer   # or talk to one owner directly
```

Inside a chat: `/agent swap lead-dev`, `/agent list`, `/context show` (what an agent loaded).

Before the first run, commit or stash your own work: `lead-dev` stops when the tree holds changes it did not make. What `lead-dev` does with a request such as "make the level 3 worm a bit slower and give its room a red tint":

1. Creates the branch `agent/<task>` (it stops if the tree has someone else's uncommitted work).
2. Sends the worm timing to `chapters-designer` and the tint to `artist`.
3. Calls `qa` on the features touched. `qa` writes `docs/qa/<date>-<scope>.md`.
4. Sends findings back to their owners (two rounds at most).
5. Commits the changed paths and pushes `agent/<task>`. Never `main`, never with force.
6. Answers in at most 12 lines: what changed, the branch, the QA verdict, any question.

Review the branch on GitHub, then merge it yourself.

## From the phone (Kiro Crew + Telegram)

Kiro Crew runs on this Mac; the phone only sends messages. The repo must be on the machine that runs the gateway.

### One-time setup

1. **Install the agents where Crew looks** (`~/.kiro/agents/`): `npm run agents:install`. It symlinks the seven files and the prompts folder, so later edits in the repo apply at once. It never replaces a file it did not create; a name clash is reported and nothing is overwritten. `npm run agents:install -- --remove` takes the links away.
2. **Point a Crew workspace at this repo.** The agents' resources, hooks and write rules are paths relative to the repo, so a session must run in it. If your Crew config already has a workspace for this project, check that its directory is the folder you cloned the repo into (`kirocrew workspace list`); fix it with `kirocrew workspace update <name> --dir <path>` (the path is relative to Crew's data home) or in the dashboard under **Settings → Workspaces**.
3. **Make `lead-dev` the agent for that workspace.** In the dashboard: **Customize → Agents**, create a member (for example "Haunted Lead") on the `hauntedterminal` workspace, and choose `lead-dev` as its agent. The Crew CLI (`kirocrew agent create`) accepts only its built-in template, so this step is done in the dashboard.
4. **Connect Telegram:** **Settings → Messaging Channels → Telegram**. Create a bot with @BotFather, paste the token, add your numeric user ID (from @userinfobot) to **Allowed users**, and save. Use the token only in that panel or in `~/.kiro/crew/.env`; it never goes into this repo.
5. **Approval mode.** Leave Crew on **Automatic** (the default). There a tool call that passes the deny rules runs without a prompt; deny rules apply in every mode, including Autopilot. That is the model the agents are built for: everything not allowed is denied, so nothing depends on a prompt you cannot answer on a phone.
6. **Protect `main` on GitHub** (repository Settings → Branches → add a rule for `main`: require a pull request, block force pushes and deletions). The agents only push `agent/<task>` branches, but this is the one barrier that holds even if a hook does not run.
7. **Start the gateway** from the repo folder: `kiro-cli crew gateway`, or `kirocrew service install` to keep it running in the background.

### Using it

Message the bot as you would message `lead-dev`. Short, concrete requests work best:

- "Boss level: Claude's taunt should come 2 seconds later."
- "qa: full pass, tell me the worst three problems."
- "Laptop: the JS Pad task about arrays is too hard, make the starter code closer to the answer."

Telegram commands: `/new` starts a fresh conversation, `/sessions` resumes one, `/steer <msg>` adds to a running turn, `/compact` frees context. The Telegram channel has no command to switch agents: talk to `lead-dev` and let it delegate.

### Not verified

- Whether Crew sessions started from Telegram run an agent's own hooks (guard, scope). The Crew docs say an agent's own hooks "stay with the harness that runs them". The permission rules (fence, shell allow-list, git deny) do not depend on hooks; the redirect check and the main-branch check do. Branch protection (step 6) covers the second.
- A full request from the phone to a pushed branch. TODO (you): send one, then note the result here. Until then treat the phone path as unproven; the CLI path (`kiro-cli --agent lead-dev`) is the tested one.

## Checks

```bash
npm run quality:agents                     # the gate and 9 unit tests: table, rules, hooks, git rights, one owner per file, installer
node scripts/harness/agents-build.mjs      # rewrite the agent files after editing the table
kiro-cli agent validate --path .kiro/agents/lead-dev.json
```
