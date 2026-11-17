# Agent team and property tests (uncommitted working tree)

Two features and three small source fixes, reviewed against `.kiro/specs/agent-team/` and `.kiro/specs/property-based-tests/`. The agent team is seven generated Kiro agents with a write fence, a git deny list, a scope gate and a Stop hook. The property suite is 29 fast-check properties inside `npm run quality`. The fixes are in `session-fs.ts`, `session-code.ts`, `commands-text.ts` and three crash-to-issue wrappers.

Checks run, all read-only:

- `node scripts/quality/check-agents.mjs` exited 0.
- `kiro-cli agent validate --path` exited 0 for all seven agents.
- `node scripts/harness/property-tests.mjs` passed 29 properties in 2.1 s. `--runs 3000` on terminal, chapters and gameplay also passed (11 s).
- A probe of the lab and chapter sessions showed the properties do execute real commands and reach kills and pickups. They are not empty loops.

The property work is sound and honest. The agent team is well built, but several enforcement claims are stronger than what the rules do. The two most important are a lead-dev that can commit on `main`, and the shell allow-list bypassing the write fence. Neither is covered by the gate.

Watch for: shell allow patterns that bypass the fence (confirmed), no guard against committing on `main` (confirmed), `generated/` writable despite requirement 6 (confirmed), property checks that cannot fail after the try/catch fixes (confirmed), and unverified phone and Autopilot claims presented as done.

**Verdict**: NEEDS_CHANGES

## High-level view

The agent fence is real for the `write` tool, and the gate proves the JSON matches the table. The table does not match the requirements. The lead's fence is the union of all six sub-agents' paths. Designers can write `generated/`. The shell allow-list contains commands that write anywhere.

The git deny list stops force-pushes and pushes whose text contains `main`. It does not stop a commit or merge on `main`, `+refspec` pushes, or `git push --delete`. It also blocks legitimate branches such as `agent/maintenance-x`.

The Stop hook is advisory and noisy. In a parallel delegation it flags every sibling agent's files, then remembers them and goes quiet.

The property suite meets the five-feature list in requirement 4 with a few weakened items. Two "never crashes" properties became tautologies once the checkers were wrapped in try/catch. One gameplay property is known not to catch its planted bug. Regression `examples` have the right shape but two are tied to document layout. The three source fixes are correct. The wrappers hide checker bugs behind a generic issue.

<details>
<summary>Issues (22)</summary>

Agent team

1. **[blocker] Shell allow-list bypasses the fence** (confirmed). Remove `find *` and `cat *`, or deny `*>*`, `*-delete*`, `*-exec*`, `*-fprint*`, `git diff*--output*`. See D1.
2. **[blocker] Lead can commit and merge on `main`** (confirmed). Requirement 16 is prompt-only. Add a `PreToolUse` hook or a wrapper that refuses `git commit`/`merge` when the branch is `main`. See D2.
3. **[blocker] Designers can write `generated/`** (confirmed). Requirement 6 says "except generated". Add a deny rule for the generated paths and a check for it. See D3.
4. **[should-fix] Push deny list has gaps and a false positive** (confirmed). `+HEAD:x`, `--delete`, `--mirror`, `HEAD:master` and tag pushes pass. `git push*main*` blocks `agent/maintenance`. See D2.
5. **[should-fix] Lead's fence is the union of all agents' paths** (confirmed). Requirements 6 and 7 are unenforced for lead-dev, except after the fact by the Stop hook. Document it or narrow it. See D4.
6. **[should-fix] Lead owns more than the user decided** (confirmed). Q7 lists six folders. The table adds `src/sandbox`, `src/main.ts`, `src/style.css` and nine `src/game` files. Record it as a decision.
7. **[should-fix] `qa` cannot copy screenshots** (likely). The prompt says to copy PNGs to `docs/qa/media/`, but `cp` is not allowed and `fs_write` is text. Requirement 14 cannot be met. See D5.
8. **[should-fix] The terminal-designer prompt tells it to edit files nobody owns** (confirmed). The property-failure instruction says to add the counterexample to `scripts/harness/props/*.mjs`, which is in no agent's fence. Also unowned: `docs/`, `scripts/`, `.kiro/steering`, `AGENTS.md`, `pages/`. See D6.
9. **[should-fix] Stop hook false positives in parallel work** (confirmed). Sibling agents' files are reported as the caller's. The baseline then hides them. The message "undo that" can push the lead to revert sub-agent work. See D7.
10. **[should-fix] Approval-mode claim is unverified** (likely). `docs/AGENTS_CREW.md` says deny rules hold "in every mode". Commands matching no rule fall to `ask`, and nothing shows what Automatic or Autopilot does with `ask`. See D8.
11. **[should-fix] Overclaims in `README.md` and `docs/SUBMISSION.md`** (confirmed). "Done... usable from the phone" and "Each writes only its own folders". Tasks 7 and 9 and requirements 15 and 17 are unticked, and the Crew path is a TODO. See D9.
12. **[nit] Secrets readable.** `cat *` and `read` can read `~/.kiro/crew/.env` (the Telegram token). Add an `fs_read` deny.
13. **[nit] Installer.** It links `~/.kiro/agents/prompts`. A foreign `prompts` entry clashes and breaks every prompt path. Its `existsSync(source)` check comes after `readdirSync` and never runs.
14. **[nit] `check-agents.mjs` ownership scope.** `OWNED_ROOTS` ignores everything but four roots, so a new top-level folder is silently unowned. The "11 planted failures" in `tasks.md` are not reproducible from the repo.
15. **[nit] `docs/AGENTS_CREW.md` holds a personal absolute path** (`/Users/ferretrec/...`). Replace it with a placeholder.

Property tests and fixes

16. **[should-fix] Two "never crashes" properties cannot fail** (confirmed). `chapters.mjs:72` and `comix.mjs:72-74` assert a list or object comes back, from functions that now catch everything. See P1.
17. **[should-fix] The HP-cap pickup property is known vacuous** (confirmed). `tasks.md` task 8 says the planted bug was not caught because the snapshot clamps HP. The property still counts toward the total. See P2.
18. **[should-fix] The `kiro load` property is weaker than requirement 4** (confirmed). It checks only calls that already failed. It never asserts that a load without the needed core fails. See P3.
19. **[should-fix] Brittle regression examples** (confirmed). `chapters.mjs:62` and `comix.mjs:62` encode `at % slotCount`. Any spec edit changes which field they corrupt, silently. See P4.
20. **[nit] Counts are stale.** README, SUBMISSION and `tasks.md` say 27 properties. The run prints 29.
21. **[nit] Fix parity.** `cmdCp` tests `0o400` and classic `cp` tests `0o444`. Property and fix cover only the chapter shell.
22. **[should-fix] The crash wrappers hide checker bugs** (confirmed). They return one generic message and drop the stack. See F1.

</details>

<details>
<summary>Details</summary>

## Agent team

### D1. Shell allow patterns that write anywhere

`scripts/harness/agents-build.mjs:16-17` allows these for every agent, with no path limit:

- `find *` matches `find . -delete`, `find . -exec rm {} +` and `find . -fprint f`.
- `cat *`, `ls*`, `git status*` and `npm run quality*` are glob prefixes. If Kiro matches the whole command string, a suffix like `> src/x.ts` or `; sed -i ...` also matches. The `rm -rf*` deny only helps when the string starts with it.
- `git diff*` matches `git diff --output=<any path>`.
- `node scripts/*` and `node .kiro/skills/*` run any harness script, including writers such as `generate-chapter.mjs` and `draw-comix.mjs`. This is intended for the compilers but is wider than that.

`team-rules.md` rule 1 promises "do not work around it with the shell". The `fs_write` fence therefore protects against mistakes, not against the model's own shell. The Stop hook only reports after the fact, and Crew may not run it (the docs admit this).

Fix:

- Drop `find *` (use `ls`, `grep -rl`) and `git diff*`. Use `git diff --stat*` and `git diff -- *`.
- Add deny patterns `*>*`, `*;*`, `*&&*`, `*|*` for every agent. Verify first, with a probe agent as in task 1, whether Kiro splits compound commands.
- Narrow `node scripts/*` to the scripts the prompts list.

### D2. Git guard gaps

`NEVER` (line 19) and `GIT_WRITES` (line 21) give the lead these rules:

- **Requirement 16 is prompt-only.** Nothing denies `git commit*` or `git merge*` while on `main`. `git switch main` is allowed through `git switch*`. `git push -u origin agent/x` is the only push the prompt asks for, but `git push*` is allowed wholesale.
- **Pushes that pass the deny list:**
  - `git push origin +agent/x` (force by refspec)
  - `git push origin --delete agent/x`
  - `git push origin HEAD:master`
  - `git push --mirror`
  - `git push origin v1` (a tag)
- **Pushes blocked by mistake:** `git push*main*` matches `git push -u origin agent/maintain-docs`.
- **Commits that pass:**
  - `git add*` allows `git add -A` (the prompt forbids it, the rule does not).
  - `git commit*` allows `--amend`.
- **Not checked by the gate.** `check-agents.mjs:90` requires only five literal deny strings and never exercises the patterns.

Prompts that don't match the rules: `team-rules.md` rule 7 says "never delete files". `find -delete` and `git push --delete` can.

Fix:

- Allow-list instead of deny-list: `git push -u origin agent/*`, `git push origin agent/*`, `git add -- *`, `git commit -m *`, `git switch -c agent/*`, `git switch agent/*`. Deny the rest of `git push*`.
- Enforce "not on `main`" with a `PreToolUse` hook script, `scripts/hooks/agent-branch.mjs`, that exits non-zero when `git branch --show-current` is `main` and the command is `git commit*`, `git merge*` or `git push*`.
- Add a unit check that runs every deny and allow pattern against a list of must-allow and must-deny strings.

### D3. `generated/` is writable

Requirement 6 says `src/chapters/` and `src/cinematic/` "except `generated/`". The table has `src/chapters/**` (line 56) and `src/cinematic/**` (line 49). The prompts and `team-rules.md` rule 3 say never edit them, but nothing denies the write. `check-agents.mjs:23` marks the paths `UNOWNED`, so the gate hides the gap. The compilers run through the shell, so a fence on `generated/` costs nothing.

Fix: add `{ capability: 'fs_write', match: ['src/chapters/generated/**', 'src/cinematic/generated/**', 'chapters/*/story/out/**'], effect: 'deny' }` for non-lead agents, put it first, and confirm a probe write is refused (rule precedence is not documented in the repo).

### D4. The lead's fence

`sessionWrites()` (line 86) puts every designer's path into the lead's allow rule. The comment explains why: Kiro checks a sub-agent's write against the parent session, and a first dry run showed `qa` blocked without it. That is a sound finding, and it is the reason the lead can write `src/ui/**` directly. The `write` tool is in the lead's `tools`, so the lead can also bypass the designers.

Requirement 7 is therefore enforced for six agents and only reported for the seventh. `AGENTS_CREW.md` says "A `deny` permission rule blocks writes outside its paths" without that exception. Fix: state the exception in `AGENTS_CREW.md` and the spec, and give the lead a prompt rule backed by the Stop hook with `--strict` semantics. Alternatively, test whether giving sub-agents their own `toolsSettings` fence lets the lead's own fence stay narrow.

### D5. `qa` cannot do what its prompt says

`qa.md` ends "Copy the screenshot of each visual finding to `docs/qa/media/...`". `qa` has `fs_write` only for `docs/qa/**` and no `cp` or `mkdir` in the shell list, and PNGs are binary. Requirement 14 (screenshots in `docs/qa/media/`) cannot be satisfied. The dry-run report in `docs/qa/2026-11-17-dryrun-laptop.md` had no failures, so the path was never exercised. Fix: allow `cp scripts/harness/out/* docs/qa/media/*` and `mkdir -p docs/qa/media`, or point the report at the `scripts/harness/out/` path.

### D6. Ownership gaps and contradictions

The gate checks only four roots (`check-agents.mjs:21`). Nobody can write `docs/` (other than `docs/qa`), `scripts/`, `pages/`, `.kiro/steering/`, `AGENTS.md`, `package.json` or `public/` outside `assets`. That follows from the fence, but several prompts assume otherwise:

- `terminal-designer.md` ends "add the counterexample to that property's `examples`". The property files are under `scripts/harness/props/`, which no one owns.
- `spec-first.md` "Finish" step says to update steering, `AGENTS.md` and skills. No agent may.
- `team-rules.md` rule 2 says "only `lead-dev` writes specs". That is true for `.kiro/specs`. The designers' prompts say a new feature "needs a spec, so stop and ask", which matches.

Fix: add a `props` and `docs` owner to the table (the lead is the simplest), or say in the prompts that these changes are handoffs to the user.

### D7. Stop hook behaviour

`agent-scope.mjs` compares the whole working tree to the agent's own globs.

- **Parallel work.** The lead delegates to `chapters-designer` and `artist` at once. Each one's hook lists the other's files as "outside". For the lead, every sub-agent's file is outside `ownWrites('lead-dev')`.
- **Misleading message.** "If you changed them, undo that" is read by the model, and a lead that cannot `git checkout` may still revert by hand.
- **Baseline.** Lines 63-64 report a path once and then never again while it stays dirty. If a violation is reported in turn 1 and ignored, turn 2 is silent.
- **Sub-agent coverage.** Whether the hook runs for sub-agents or for Crew sessions is unknown (the docs say so).

Fix: scope the check to files changed since the agent's turn started (record `git status` at `SessionStart` or the first run), and name the owner of each out-of-scope file in the message.

### D8. Unmatched commands and the phone

Each agent defines allow and deny rules only. A command that matches none (`git -c core.x=y push`, `git -C . push origin main`, `rm file`, `sed -i`) falls to `ask`. In a denied-prompt Crew session it is refused. `AGENTS_CREW.md` step 5 says Automatic is the default and Autopilot also respects `deny`. That is not shown anywhere in the repo, and if Automatic or Autopilot auto-approves `ask`, `git -C . push -f origin main` runs. This needs one probe: start a sandbox agent in the mode the phone uses and run an unmatched command. If it runs, add a final deny `shell` rule for `*`, if Kiro evaluates deny after allow, or flip to an allow-only model.

### D9. Claims without a run behind them

- Requirement 15 (a pushed `agent/<task>` branch) and 17 (a Telegram task) are unverified. The tasks file admits it. `docs/SUBMISSION.md` line 68 and `README.md` line 62 say "Done... usable from the phone".
- `tasks.md` says the installer was tested with a temporary `HOME`, and that 11 planted failures were caught. Neither test is saved as a script.
- `AGENTS_CREW.md` is honest about the Crew path and hooks.
- `kiro-cli agent validate` ran clean, and the generated files are byte-equal to the table, so requirements 1 to 3 hold. Requirement 3 limits (32 files, 100,000 characters) are enforced by `check-agents.mjs:70-77`.

Fix: change "Done" to "Built; phone and push path untested", or run the two tasks.

## Property tests

### P1. Tautologies after the crash fixes

`checkPack`, `checkComixPack` and `simulateComixPack` now wrap their bodies in try/catch (see F1). The properties at `chapters.mjs:72` and `comix.mjs:72-74` assert only `Array.isArray(issues)` and `typeof sim.ok === 'boolean'`. Both now hold for any input, so the property can only fail on a hang. It passes at 3000 runs, as expected. The properties no longer test whether the checkers are robust, only that the wrapper exists.

Fix:

- Count how often the wrapper fires. Fail when the issue message starts with "stopped on a malformed spec" or "malformed comix spec" for ops of type `null`, `delete` and `junk`, which a real checker should report as field errors. Keep a short list of exempt shapes.
- Also assert that a corruption that changed the document (`JSON.stringify(broken) !== JSON.stringify(base)`) yields at least as many issues as the original.

### P2. A property that cannot catch its target

`gameplay.mjs` "collecting energy, RAM and SSD ... never pushes HP above max HP" reads `session.exec(...).snapshot`. Task 8 records that removing the HP cap did not fail it, because the snapshot clamps HP. The property cannot detect the bug in its name. It is counted in the 29. Assert against the unclamped value (the session's internal `hp`) or rename it to "snapshot HP is in range after pickups".

### P3. Requirement 4 on `kiro load`

Requirement 4: "`kiro load` without the needed cores never loads a model". The property asserts only when a command already failed with a non-zero code (`(r.code ?? 0) !== 0`). If a refusal returns code 0 with an error line, it passes. If a load for an unowned core succeeds, it passes too, since the check never runs. Fix: derive "owned" from the session's grants, and assert that a load of an unowned core fails and leaves `activeCore` unchanged.

### P4. Regression examples

All `examples` have the right fast-check shape (one array entry per argument, checked against each `fc.property`). But the two corruption examples (`chapters.mjs:62`, `comix.mjs:62`) hold `at: 130820463` and `at: 890130660`. `corrupt()` computes `at % slots(doc).length`, so the field they hit moves whenever a spec changes. After the next level edit they test a different field and still pass. They are no longer regression cases. Fix: record the JSON path (`['levels', 2, 'enemies', 0]`) and the operation, and give `corrupt` a path-based mode.

### P5. Other weaknesses

- **Interesting states are not measured.** `deepPlay` plays part of each solution first, which does reach kills and pickups (the probe saw `ENEMY_KILLED` and `PICKUP_COLLECTED` on level 2). Nothing fails if a future solution change stops that. Add `fc.statistics` or a counter that fails when fewer than a few percent of runs saw a kill, a pickup or a level change.
- **"A level is left only when its win rules hold"** skips compound lines and respawns (`gameplay.mjs`). It checks leaving a level, not that the exit door opens. The name and requirement 4 ("a door opens only when its win rules hold") are close but not the same.
- **Determinism** (`chapters.mjs`). `withFakeClock` freezes `Date.now` only. Both runs share one `world.pack` object, so any mutation of the pack by a session leaks between runs and between properties. Replaying one counterexample alone then may not reproduce it. Possible, not seen. Cheap fix: `structuredClone(pack)` per `open`.
- **Canonical-writer properties read the live `chapters/` and `comix/` files.** A human saving in `/editor` between runs, or an unformatted uncommitted file, fails the gate. It is the point of the property, but the message should say "run the writer" instead of only "not in canonical form".
- **Comix requirement 4** says "random valid pages simulate". The property tunes two shipped packs. It does not generate pages. The title is accurate, the requirement is met only loosely.
- **Terminal properties** run the chapter shell through a lab session. The classic shell (`src/game/commands-*.ts`, owned by `terminal-designer`) has none, although the prompt calls them "two shells, one behaviour".

### P6. `corrupt` limits

`arbitraries.mjs:65-80`. It cannot corrupt the root value. It cannot rename keys, swap two fields, or produce numbers like `NaN`, `1e308` or very long strings, because `jsonValue` is JSON-safe and strings are short. `duplicate` only applies inside arrays and `negate` only to numbers. It touches one file at a time (manifest, one level or the dialogs), which matches the editor's save unit but not a bad merge across files. These are acceptable for a first version. State them in the header comment.

### P7. Watchdog

`kit.mjs:55-72`. A worker thread on its own event loop kills the process with SIGKILL when one property runs more than `--hang-ms` (default 60 s). This works for a synchronous hang on the main thread, which is the case it targets. Two limits: loading suites and Vite startup are not armed, and SIGKILL exits with code 137 and no cleanup. The 60 s limit is also the whole suite budget in requirement 5, though the real run is 2 s. A lower default such as 20 s would fail faster. Not flaky: the seed is fixed and no wall-clock value reaches an assertion.

## The three source fixes

### F1. Crash-to-issue wrappers

`src/chapter-editor/check.ts`, `src/comix-editor/check.ts`, `src/cinematic/simulate.ts`. Correct and safe for the editor and CLI: a hand-edited draft no longer white-screens the Check tab, and per-group guarding in `checkPack` keeps the schema errors visible. Costs:

- The message blames the spec ("malformed spec") even when the cause is a checker bug. The stack is dropped, so a real defect looks like user error.
- `validatePack` and the comix checks still throw on the same inputs. Task 7 calls these "fixed", but the root cause remains.
- 
Fix: log `err.stack` to `console.error` outside production, and open a follow-up to make the walkers null-safe. P1 then becomes the test for that.

### F2. `session-fs.ts` and the sed fix

- `cmdMv` `isWithin` check: correct for the reported loop (`mv .. j`). It uses `parent` links to walk up. When `dst` exists as the same node as `src` (`mv d d`) the message says "into itself", where GNU says "are the same file". Minor.
- `cmdCp` unreadable check: uses `0o400` (owner read), as `cat` does in this file (`session-fs.ts:196`). Classic `cp` (`commands-fs.ts:211`) uses `0o444`. For mode `044` the shells differ. The property covers only `000`.
- `emptySedPattern` in `commands-text.ts`: correct for `s//x/` and any delimiter. Both sed implementations call it before parsing. The message says "char 0", where GNU reports the real position. Cosmetic.

</details>

<details>
<summary>File map</summary>

- `scripts/harness/agents-build.mjs`: the table, shell and git rules, session fence (D1 to D4).
- `scripts/quality/check-agents.mjs`, `agent-rules.mjs`: gate, glob matcher (D3, D6).
- `scripts/hooks/agent-scope.mjs`: Stop hook (D7).
- `scripts/harness/agents-install.mjs`: symlink installer (issue 13).
- `.kiro/agents/prompts/*.md`, `docs/AGENTS_CREW.md`, `docs/qa/README.md`: prompts and docs (D5, D6, D8, D9).
- `scripts/harness/property-tests.mjs`, `props/*.mjs`: the suite (P1 to P7).
- `src/chapters/session-fs.ts`, `session-code.ts`, `src/game/commands-text.ts`: shell fixes (F2).
- `src/cinematic/simulate.ts`, `src/comix-editor/check.ts`, `src/chapter-editor/check.ts`: wrappers (F1).

</details>

**Verdict**: NEEDS_CHANGES
