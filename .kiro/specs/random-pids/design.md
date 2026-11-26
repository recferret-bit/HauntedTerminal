# Random pids: design

Status: done

Covers requirements 1 to 8 of `requirements.md`. The chapter session is the only place that changes; the specs only swap a number for a placeholder.

## Approach

One new pure module, `src/chapters/pids.ts` (chapters layer, no new `src/<area>/`, no dependency):

- `rollPids(enemies, rng)`: for every enemy with a `pid` other than `1`, a random integer in 1100-8899, unique in the level and never `1`, `10`, `777`, `4242` or another fixed PID of the level (the spec's own `pid: 1` boss, a `cron_restorer` at `10`). Returns `Map<enemyId, pid>`.
- `fillPids(text, pids)`: replaces every `{pid:<enemy id>}` with that enemy's PID. An unknown id stays as written (the pack check reports it before a player can see it).
- `fillPidsDeep(value, pids)`: the same over a JSON value (copy, never in place).
- `pidRefs(value)`: every `<enemy id>` named by a placeholder in a JSON value, for the pack check.

### Session wiring (`src/chapters/`)

1. `loadLevel` (`session-level.ts`) rolls the PIDs on every load, so a retry or restart gets new ones (requirement 1). The roll uses `Math.random`, or a seeded generator when the session option `pidSeed` is set (tests and the property suite). Chaos mode's `chaosSeed` PID formula in `levelSpawns` is deleted (requirement 7); `chaosMode` stays for its other effects.
2. `levelSpawns` hands the rolled PID to the `World`, so `ps`, `kill`, `pkill`, `top`, `PROC_SIGNALED` and the stage tags read it from the one place that already holds PIDs (requirement 2). `kill` of the spec number answers `No such process` with no extra code.
3. `g.rt.spec` becomes a filled copy of the level spec (`fillPidsDeep`) except `solutionCommands`, which stay raw. Hints, tutorial prompts and commands, script text, checklist descriptions and the summary all read `g.rt.spec`, so they show the real PID with no change at their call sites (requirement 4).
4. The level's `dialogs.json` entry is filled once at load into `g.rt.dialog`. The five readers of `g.pack.dialogs?.levels[g.rt.spec.id]` (`session-level.ts`, `session-meta.ts`, `session-rules.ts`, `session-snapshot.ts`, `script.ts`) switch to one helper, `levelDialog(g)`.
5. `ChapterSession.exec(line)` runs `fillPids(line, g.rt.pids)` before the shell sees the line. Every consumer of `solutionCommands` (`solve.ts`, the editor's "step the solution", `play-browser.mjs` through `__term.submit`, the property suites, `battle-unit`, `forge` `solve_level`) already passes the lines through `exec` or the terminal's submit, so none of them changes (requirement 5).
6. The PID 1 boss, `777` and `4242` are never in the roll (requirement 3); `session-proc.ts` is untouched.

### Specs and checks

- `validate-pack.ts` (four-place rule, place 4): an error for `{pid:<id>}` naming a missing enemy or one without `pid` (requirement 6), and an error for a literal number equal to a rolled enemy's spec `pid` anywhere in that level's strings or its dialogs entry (`kill -9 1011`), so a stale number cannot slip back in. The chapter editor's check shows both through the existing pack-check path.
- `src/chapter-editor/schema.ts` (place 3): the `pid` field note says the number is only a marker; a hint tells the author to write `{pid:<enemy id>}` in text. No new field kind, so `types.ts` (place 1) only gets a doc comment and the interpreter (place 2) is `session-level.ts` plus `exec`.
- Content: the three levels (1, 3, 8), `story/dialogs.json` and `LEVEL.md` swap `1011`, `2104`, `4108` for placeholders (a `chapters-designer` task, canonical JSON writer, then `generate-chapter.mjs` recompiles `generated/`).

## Cases to decide

- **Labs and drafts.** A Terminal Lab session (`lab` option) does not roll: lab scripts type fixed `kill -9 N` lines and the lab's own enemies carry the PID the author placed. A chapter-editor draft and preview roll like the real game.
- **Typing a placeholder.** A player could type `kill -9 {pid:l1_spider}` and be answered with a PID. Enemy ids are never shown to the player, so I accept this. The alternative (a separate `execSolution` entry) would break the editor preview and `play-browser.mjs`, which type the lines like a player.
- **Classic floors.** `createSession` (`src/game/`) has its own hard-coded PIDs in `floors.ts`; this design does not touch it.

## Risks

- Text built by code (not from the spec), such as the `kiro scan` output, already reads PIDs from the `World`, so it is correct. A literal PID inside engine strings would be a bug; `grep` found none in `src/` besides the protected `777` and `4242`.
- `forge` `write_level` and the editor save strings as written, so a placeholder survives a save unchanged (the canonical writer does not interpret `{}`).
- The visual audit seeds `Math.random`, so its screens keep repeating.

## Verification

Per requirement, as listed in `requirements.md` plus `npm run quality` and `node scripts/harness/property-tests.mjs --only chapters,gameplay` (new property: any `pidSeed` gives unique PIDs in range, `ps` shows exactly them, the solution clears with 0 deaths).

## Open questions

(none: answered 2026-11-26; see Decisions.)

## Decisions

**Q (design round):** classic floors, Terminal Lab sessions, and a typed `{pid:<enemy id>}`.
**A (user, 2026-11-26):** "i approve", given to my three questions and the design. Recorded as the recommended option of each: classic floors keep fixed PIDs; Terminal Lab sessions keep the PIDs the lab author placed; a typed placeholder is accepted. The design itself is approved.
