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

Kiro Crew runs on this Mac; the phone only sends messages. Check the whole setup at any time with:

```bash
npm run crew:check        # read-only; FAIL = blocks, WARN = look at it; it never prints a token
```

### What is already set up on this Mac (2026-11-17)

| Piece | State |
|---|---|
| Agents linked into `~/.kiro/agents/` | done (`npm run agents:install`; `--remove` undoes it) |
| Crew workspace `hauntedterminal` | pointed at this repo (was a stale path); your Crew config was backed up to `~/.kiro/crew/config.json.bak-haunted-<date>` |
| Crew member `haunted-lead` ("Haunted Terminal Lead") | runs `lead-dev` in that workspace |
| Approval mode | Automatic (the default): rules decide, nothing waits for a prompt |
| Gateway | **not running**: start it yourself (below) |
| Telegram | **not set up**: needs your bot token (below) |
| GitHub branch protection on `main` | **not set**: your decision (below) |

### What you do now

1. **Commit your own work first.** `lead-dev` stops when the tree holds changes it did not make (`npm run crew:check` warns about this).
2. **Protect `main`** (the one barrier that holds even if a hook does not run). In GitHub: Settings, Branches, add a rule for `main`: require a pull request, block force pushes and deletions. Or, with `gh` logged in as the owner:
   ```bash
   gh api -X PUT repos/<owner>/<repo>/branches/main/protection --input - <<'JSON'
   {"required_status_checks":null,"enforce_admins":false,"restrictions":null,
    "required_pull_request_reviews":{"required_approving_review_count":0},
    "allow_force_pushes":false,"allow_deletions":false}
   JSON
   ```
   With `enforce_admins: false` you can still push to `main` yourself; the agents, which only push `agent/*`, never need to.
3. **Start the gateway from the repo folder:** `cd <this repo> && kirocrew gateway` (foreground, Ctrl-C stops it) or `kirocrew service install` (background, survives logout). The folder matters: a Crew session inherits the repo's steering only when the gateway launches from it or the member's workspace is the repo (it is).
4. **Open the dashboard** (`kirocrew token` prints a sign-in link, `http://localhost:5476`) and run the first test below.
5. **Connect Telegram:** dashboard, Settings, Messaging Channels, Telegram. In Telegram message @BotFather, send `/newbot`, copy the token; message @userinfobot for your numeric user id. Paste the token (it goes to `~/.kiro/crew/.env`, never to this repo) and add your id under Allowed users. Save: the gateway restarts and the badge turns green. Then `npm run crew:check` again.
6. **Pick the agent for the chat.** In the dashboard, open the member "Haunted Terminal Lead" and chat with it. Telegram has no command to switch agents; make `haunted-lead` the bot's agent in the channel settings (or set it as the default agent) so a message there reaches `lead-dev`.

### First test from the dashboard (2 minutes, nothing is committed)

Chat with "Haunted Terminal Lead" and send:

> Configuration test, no real work, do not create branches or push. Run these shell commands one per call and report ran or refused with the exact reason, never retrying a refused one another way: 1) git branch --show-current  2) echo probe > docs/zz-probe.txt  3) git commit -m probe  4) node scripts/harness/property-tests.mjs --only laptop --runs 5  5) printf hi

Expected: 1 and 4 run (branch `main`, 6 laptop properties pass); 5 is refused by `deny shell *`; 3 is refused (by the guard hook: "git commit on main", or at worst git says "nothing to commit" on a clean tree); 2 is refused by the guard hook (a redirect outside `lead-dev`'s paths). If 2 is **not** refused, a file `docs/zz-probe.txt` now exists: delete it, and know that the Crew gateway does not run an agent's own hooks, which means the redirect and `main` checks are not active there. Everything else (the fence, the shell allow-list, the git deny list) still is, and branch protection (step 2) covers `main`. Write the result in "Verified" below.

### Using it

Message the bot as you would message `lead-dev`. Short, concrete requests work best. Ready to paste:

- "Boss level: make Claude's taunt come 2 seconds later." (chapters-designer)
- "The laptop JS Pad task about arrays is too hard: make the starter code closer to the answer." (laptop-designer)
- "The `ls -l` output should show the owner column the way real ls does." (terminal-designer)
- "Give the intro comix a longer pause before the lightning strike." (comix-designer)
- "The worm enemy should look slimier; keep its silhouette." (artist)
- "qa: full pass, tell me the worst three problems." (qa; writes `docs/qa/`, changes nothing else)

`lead-dev` answers in at most 12 lines: what changed, the branch `agent/<task>`, the QA verdict, any question. Review and merge on GitHub (the GitHub mobile app is enough). A request that is a new feature or a big refactor ends with a question instead of code (spec-first).

Telegram commands: `/new` starts a fresh conversation, `/sessions` resumes one, `/steer <msg>` adds to a running turn, `/compact` frees context.

### What I verified, and what that means for you

- **Verified, on Kiro Crew 0.12.1 with Kiro CLI 3.4.0:** all seven agents validate and load; the agent's permission rules are honoured by the gateway (a command outside the allow-list was refused with the profile's `deny shell *`; an allowed command ran with no prompt in the gateway path); the agent files, prompts and `AGENTS.md` load in the repo workspace.
- **A gateway "spawned subagent" is not your repo.** `kirocrew spawn run` starts the agent in an empty scratch folder (`~/workplace/kirocrew-workspace/subagent_<id>`), so it cannot see the project. Use the member's chat (dashboard, Telegram), not `spawn`.
- **`kirocrew chat -m "..."` cannot approve anything** (it has no one to ask), so it is only good for read-only questions.
- **Edit Crew's config only while the gateway is stopped, or in the dashboard.** A running gateway rewrote the member's agent back to a default once (found while testing; fixed by setting it again while stopped).
- **Never add an `autoApprove` list** to an agent or `mcp.json`: Crew documents that such tools skip its approval gate **and `PreToolUse` hooks**, which would switch off the shell guard. `npm run crew:check` fails on it.
- **Installed globally, the agents show up in every repo** (`~/.kiro/agents`). Their paths are repo-relative, so elsewhere they just find nothing; use them in this repo. The workspace copy takes precedence here.

### Verified

TODO (you): after the first test, write here the date, whether the redirect and commit probes were refused, and by which layer. After a real task from the phone: the branch name.

## Checks

```bash
npm run quality:agents                     # the gate and 10 unit tests: table, rules, hooks, git rights, one owner per file, installer
node scripts/harness/agents-build.mjs      # rewrite the agent files after editing the table
kiro-cli agent validate --path .kiro/agents/lead-dev.json
npm run crew:check                         # is this Mac ready for Kiro Crew
```
