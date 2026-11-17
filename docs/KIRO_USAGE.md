# How Kiro was used

Haunted Terminal is built around one idea: **Kiro works best when knowledge, procedures and enforcement live in separate, machine-checked places.** Everything is in [`.kiro/`](../.kiro) and in the scripts it calls. Design rationale: [`kiro-best-practice.md`](kiro-best-practice.md).

| Role | Place | Count |
|---|---|---|
| People | `.kiro/agents/` | 7 custom agents (a lead, 4 feature designers, an artist, QA) |
| Facts | `.kiro/steering/` | 15 files |
| Capabilities | `.kiro/specs/<name>/` | 7 spec families (inventory has 3 child specs), 10 spec folders |
| Procedures | `.kiro/skills/` | 24 skills, each with validator scripts |
| Enforcement | `.kiro/hooks/` + `scripts/quality/` | 15 hooks plus 3 per agent, 9 quality gates (including agents and properties) |

## Custom agents

The game is tuned by a team of seven Kiro CLI custom agents, one per major feature ([`docs/AGENTS_CREW.md`](AGENTS_CREW.md), spec `.kiro/specs/agent-team/`):

- **`lead-dev`** is the entry point. It splits a request by owner, delegates (it can start only the six named agents), has `qa` check the result, sends findings back for at most two rounds, then commits on an `agent/<task>` branch and pushes. Never `main`, never with force.
- **`terminal-designer`, `laptop-designer`, `comix-designer`, `chapters-designer`** each own one feature and its LEVEL GEN skills and gates.
- **`artist`** owns every procedural asset and the 14 ASSET PCG skills.
- **`qa`** plays the chapter in real Chrome, runs every suite of the affected features, looks at the screenshots, and writes `docs/qa/<date>-<scope>.md`.

Ownership is enforced, not only described. Each agent has a `deny` rule on every path outside its own; a `Stop` hook reports files a shell command changed outside them; and `npm run quality:agents` fails unless every source file has exactly one owner. All seven files are generated from one table (`scripts/harness/agents-build.mjs`), so they cannot drift.

The same team runs from a phone: a Kiro Crew gateway on the Mac, the Telegram channel, and `lead-dev` as the member's agent.

What we learned from Kiro CLI 3.3.0 while building it (each one is checked by the gate now):

- A profile with `permissions` but no `allowedTools` is silently dropped ("Mode not found").
- `kiro-cli agent validate` checks types, not capability names.
- A sub-agent's write and shell command are checked against the parent session too, so the lead's fence and allow-list must cover its sub-agents'.
- A command that matches no rule just runs under auto-approve, so the shell allow-list is also written as a catch-all `deny *` that excludes it.
- Shell rules see command words only: a redirect or a git refspec needs a `PreToolUse` hook.
- Every workspace agent sees all workspace skills.

## Property-based testing

32 fast-check properties cover the five major features, run inside `npm run quality` with a fixed seed (spec `.kiro/specs/property-based-tests/`):

- **Terminal:** the shell never throws on any line; `cp`, `mv`, `chmod` and `rm` keep their unix meaning.
- **Laptop:** the state machine with timers firing at any moment; the window manager; the loop guard; saved progress.
- **Comix:** tuned and corrupted intro and outro; the canonical writer; cue arithmetic.
- **Chapters:** random play on all 11 levels; determinism; the writer; corrupted packs.
- **Gameplay:** HP bounds; dead enemies stay dead; pickups once; inventory; exits only when win rules hold; refused Kiro cores.

They found six real bugs that 11 levels of example tests had missed:

- `mv .. j` made the virtual file system a loop, which crashed or hung the game.
- `ls -l <file>` printed only the name in chapter levels.
- `sed 's//x/g'` inserted `x` between every character, and `cp` copied a file `cat` could not read.
- A level-10 Kiro core alias was accepted by `kiro load` but not by the win rule, which would have left the exit locked.
- The comix check and simulator crashed on a hand-edited draft, and so did the chapter check.
- A chapter spec file was not in canonical form.

A planted bug in each feature makes its property fail, and a planted hang is killed by a watchdog. An independent review (a Kiro sub-agent) also found properties that could not fail; they were rewritten, and a guard now fails when random play stops reaching kills, pickups and exits. How to use them: `docs/PROPERTY_TESTS.md`.

## Spec-driven development

Every new feature or big refactor starts as a spec (`requirements.md` in EARS syntax, `design.md`, `tasks.md`) with a `Status:` that moves `draft` → `requirements-approved` → `design-approved` → `approved` → `done`. The `feature-spec-grill` skill interviews the user in rounds of at most five questions with a recommended default, records answers under `## Decisions`, and never fills gaps with guesses. Specs: declarative chapter runtime, chapter editor, declarative comix runtime, comix editor, and the inventory (lantern, terminal, laptop).

Compared with vibe coding: the specs became the contract that the validators check. The `inventory` spec family, for example, was implemented task by task and closed only after every quality gate passed.

## Steering

Steering holds only short, non-overlapping facts and one exact vocabulary (`glossary.md`, so the agent never invents synonyms). Path-scoped steering (`inclusion: fileMatch`) loads the asset rules only when `src/procgen` is touched, the level rules only for `chapters/`, and so on. The biggest win was the **declarative rule**: engine code may not name a chapter, level or comic page, and `npm run quality:declarative` rejects it.

## Skills

24 skills in three categories: `[WORKFLOW]` (spec grill), `[ASSET PCG]` (art direction, models, malware, rooms, textures, shaders, lighting, animation, particles, validators, visual QA) and `[LEVEL GEN]` (chapter intake, comic drawer, compiler, implementer, editor, and the same chain for 3D comix). Each skill is paired with a deterministic script, so "done" means a validator passed.

## Hooks

15 hooks in `.kiro/hooks/` (and three per team agent):

- `spec-first-on-prompt`: reminds the agent when a prompt reads like a feature.
- `guard-spec-first`: blocks new `src/<area>/` and `pages/*.html` until a spec is approved.
- `guard-chapter-files`: protects compiled `generated/` files and the four-place vocabulary rule.
- `typecheck-on-save`, `validate-chapters-on-save`, `validate-comix-on-save`, `validate-labs-on-save`: validators run when specs or labs are saved.
- `asset-dryrun-*` (model, texture, effect, character): dry-run an asset before it is accepted.
- `chapter-gates-on-stop`, `spec-status-on-stop`: verification gate and spec report at the end of a turn.

## What was verified by machines, not by eye

- 11 levels solved headlessly with 0 deaths; intro and outro simulated at 60 fps.
- 28 Terminal Lab scripts where no damage may be absorbed.
- Layer rules, file size (600 lines), function size (130 lines), zero duplicate blocks, zero `any`.
- A fingerprint of every model, texture and effect, so refactors must leave assets byte-identical.

## Evidence judges can check in the repo

- `.kiro/specs/inventory/` (and its three child specs): every design choice is a `**A (user, 2026-11-17):**` line, the record of a grill round.
- `git log`: 38 commits with spec, steering and hook changes next to the code they govern.
- `npm run quality` and the `--verify` scripts: the gates the hooks call.

## Coverage of the Kiro features the rules ask about

| Feature | State | Plan |
|---|---|---|
| Custom agents | done: 7 agents in `.kiro/agents/` | TODO (you): note one real task you ran through `lead-dev` |
| Property-based testing | done: 32 properties, 6 bugs found | none |
| MCP | `.kiro/settings/mcp.json` is empty by choice | optional, see `docs/SUBMISSION.md` |
| Powers | none installed | Skip unless one genuinely fits. Do not fake it. |

TODO (you): add the parts only you know.
- Which Kiro surfaces you used (IDE, CLI, Web, Crew), what each was good and bad at, and which one wrote what.
- One concrete before/after story, for example a bug a hook or gate caught, or a rule you added to steering after an agent got something wrong.
- Spec-driven against vibe coding: what you tried first and what changed.
