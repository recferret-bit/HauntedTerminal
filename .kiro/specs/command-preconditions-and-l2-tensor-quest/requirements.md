# Command Preconditions & Level 2 Tensor GPU Quest: requirements

Status: approved (requirements, design, and tasks approved by the user 2026-11-27)

Capability: Extend declarative level scripts (`level.spec.json -> script`) with reusable command-availability preconditions across the four-place chapter vocabulary (`src/chapters/script-types.ts`, `src/chapters/script.ts`, `src/chapter-editor/schema*.ts`, `src/chapters/validate-pack.ts`), and rework Chapter 1 Level 2 (`level-02-task-ram-heist`) so: (1) `tensor_gpu` is a hidden dotfile (`.tensor_gpu`) that appears from behind a Cache Vault rack right on the very first `ls -la`, rather than dropping on `enemy_dead`; (2) Level 2 adds an additional quest step (pocketing `.tensor_gpu` in `winRules`) where Kiro.d tells the Vibecoder a Tensor GPU must be somewhere here and asks him to try plain `ls` (which misses it); and (3) after obtaining `tube_transistor`, Kiro.d asks the Vibecoder to try `ls -la`, while running `ls` flags (`-la`, `-a`, `-l`, etc.) is refused as a free action until that dialog finishes (or is skipped via `Skip Dialog »`).

User's words, 2026-11-27: "at level 2 make tensor gpu to appear from somewhere after very first ls -la, me this file hidden. Lets add one moe quest step on this level, lets make kiro to tell the vibecoder that gpu tensor has to be somewhere here, try ls. it wont work, then after abtaining the tube > kiro must ask vibecoder to try ls -la, make it not possuble to run -la untill dialog stops. lets add some commands availablity pre conditions, make it a part of specs, so i can reuse it later too."

## Findings (from code, read-only, 2026-11-27)

- **`chapters/chapter-01-kiroween/levels/level-02-task-ram-heist/level.spec.json`:** Currently defines non-hidden `/srv/kiroween/cache_vault/tensor_gpu` (`pickup_l2_tensor_gpu`) with `appearWhen: { kind: "enemy_dead", enemyId: "trojan_l2" }`, alongside `.vault_beacon` and 5 `winRules` (reading `vault_notes.txt`, petrifying `trojan_l2`, pocketing `tube_transistor`, `ram_16gb.dimm`, and `ssd_256gb.img`; `tensor_gpu` is in `solutionCommands` but not in `winRules`).
- **`chapters/chapter-01-kiroween/chapter.manifest.json`:** Currently lists `grants` at `afterLevel: 2` (`ram: 16, ssd: 256, items: ["tube_transistor"]`) without `tensor_gpu`, since `tensor_gpu` was not previously in Level 2 `winRules`.
- **`src/chapters/script-types.ts` & `src/chapters/session-shell.ts`:** `ScriptLock` (`{ command, until, message }`) matches only the canonical first word (`argv[0]`, mapping `kiro.d` to `kiro`), so it cannot lock specific flags/arguments such as `ls -la` while allowing bare `ls`. `ScriptCond` has `ran_command` (`session-shell.ts:149` skips recording `'ls'` while `cmdLs` in `src/chapters/session-fs.ts:79` adds `'ls'` when listing `cwd`), `has_item`, `room_swept`, etc., and lacks negation (`not`), flag-aware `ran_command`, custom script flags, or dialog-finished conditions.
- **`src/chapters/script.ts`, `src/contracts/word-reveal.ts`, & `src/ui/dialog-box.ts`:** `dialog_box` steps emit `DIALOG_BOX` kernel events with `holdMs`, while `DialogBox` reveals words via `planWordReveal` (`src/contracts/word-reveal.ts`). Currently `LevelRuntime` tracks `openingSec` (`openingActive` + `skipOpeningDialog`), not mid-level trigger dialog completion.
- **`src/chapters/session-fs.ts` (`cmdLs`) & `src/renderer/stage-motion.ts` (`playSpawn` / `dropToGround`):** `cmdLs` sets `g.rt.roomSwept = true` before filtering `isNodeHidden`, and `syncScriptTriggers` emits `FILE_CREATED` + `ENTITY_SPAWNED` (`reason: 'script'`) after the command step.
- **`src/chapters/solve.ts`:** Headless `solvePack` advances `ticks` seconds (`default 2`) between `solutionCommands`, so any mid-level dialog precondition must remain deterministic and solvable headlessly with 0 deaths.

## Requirements

1. **Unified `script.locks[]` command-availability preconditions:**
   WHEN a level spec declares an entry in `level.spec.json -> script.locks[]`, THE SYSTEM SHALL support optional flag/argument matching alongside first-word command matching and evaluate its `until` `ScriptCond` generically (with zero hardcoded chapter or level names), refusing locked invocations with the configured message, exit code `1`, and `locked` audio cue while allowing non-matching invocations (such as bare `ls`) to run normally.

2. **Orthogonal `ScriptCond` & `ScriptStep` precondition toolkit:**
   THE SYSTEM SHALL add reusable, composable primitives to the chapter script vocabulary — `dialog_done` condition (holding when no active scripted dialog beat blocks it), optional flag/argument matching on `ran_command`, script flags (`set_flag` step + `flag` condition), and `not` (negation condition) — synchronized across the four-place rule (`src/chapters/script-types.ts`, `src/chapters/script.ts`, `src/chapter-editor/schema*.ts`, `src/chapters/validate-pack.ts`) and `src/terminal-lab/`.

3. **Free-action lock refusal & `Skip Dialog »` during gated dialog beats:**
   WHILE a scripted dialog beat is actively running and a `script.locks[]` entry blocks a command or flag until `dialog_done`, THE SYSTEM SHALL refuse that locked command/flag invocation as a free action (consuming `0` battle turns and printing the configured in-world wait message) without blocking unrelated commands, AND SHALL show `"Skip Dialog »"` so players can fast-forward the active dialog beat and clear the lock cleanly.

4. **Level 2 Kiro.d quest dialogs & plain `ls` beat:**
   WHEN playing Level 2 (`level-02-task-ram-heist`), THE SYSTEM SHALL have Kiro.d tell the Vibecoder that a Tensor GPU must be hidden somewhere in the Cache Vault and suggest trying plain `ls` (which does not show hidden dotfiles); AND WHEN the Vibecoder obtains `tube_transistor`, Kiro.d SHALL ask the Vibecoder to try `ls -la` while `ls` option flags (`-la`, `-a`, `-l`, etc.) remain locked via `script.locks[]` until that dialog finishes (or is skipped).

5. **Level 2 hidden `.tensor_gpu` reveal & drop on very first `ls -la`:**
   THE SYSTEM SHALL store Level 2's Tensor GPU pickup as hidden dotfile `/srv/kiroween/cache_vault/.tensor_gpu` (`appearWhen` tied to the first `ls -la` reveal rather than `enemy_dead`); WHEN the Vibecoder runs the very first `ls -la` (once allowed by the preconditions), THE SYSTEM SHALL immediately include `.tensor_gpu` in that `ls -la` output AND animate it tumbling/dropping out from behind a Cache Vault rack prop onto the floor with a comic bounce so the Vibecoder can pocket it right away with `mv .tensor_gpu ~`.

6. **Level 2 additional quest step & chapter progression consistency:**
   THE SYSTEM SHALL add pocketing `.tensor_gpu` (`mv .tensor_gpu ~`) to Level 2's `winRules` checklist, update `vault_notes.txt`, `dialogs.json`, `solutionCommands`, and `chapter.manifest.json` (`summary`, `mechanicsSummary`, and `teaches`; `grants` stays free of the Hub-1-consumed `tensor_gpu` so direct Hub 1 entry continues to exercise the no-GPU fallback beat and Levels 5–11 never carry a consumed card), keep Level 4 (`level-04-hub-model-one`) Tensor GPU ritual and fallback beat working, and clear Level 2 and the entire chapter headlessly with 0 deaths (`generate-chapter.mjs --verify`).

7. **Tooling, property tests, and quality gates:**
   THE SYSTEM SHALL pass `check-specs.mjs`, `editor-unit-test.mjs`, `editor-smoke.mjs`, `terminal-lab-unit.mjs`, `property-tests.mjs`, byte-identical asset fingerprint (`npm run quality:fingerprint`), and `npm run quality`.

## Out of scope

- Replacing `script.locks[]` with a separate `script.preconditions[]` array.
- Locking the entire terminal input on mid-level dialogs (only the precondition-matched command/flags are refused).
- Reworking Level 4 (`level-04-hub-model-one`) Tensor GPU ritual or removing Hub 1's no-GPU fallback beat.
- Creating new 3D asset geometry or modifying `npm run quality:fingerprint` (reuses existing `item.tensor_gpu` and existing Cache Vault rack props).
- Adding a second chapter or changing Terminal Lab behavior when a `.lab.json` script defines no `locks`.

## Decisions

- **Q1: How should reusable command-availability preconditions be represented in `level.spec.json -> script`?**
  **A (user, 2026-11-27):** Extend `script.locks[]` with optional args/flag matching (e.g. flags/argv pattern) + richer `ScriptCond`s — keeps one unified lock table in JSON and `/editor` for both whole commands and specific flags like `ls -la` `(Recommended)`.
- **Q2: While Kiro's post-Tube-Transistor dialog is still playing, how should blocking `-la` behave if the player acts early?**
  **A (user, 2026-11-27):** Refuse `ls` flags (`-la`, `-a`, `-l`) with an in-world "wait for Kiro.d" message (free action, costs 0 turns) AND show `"Skip Dialog »"` so players can also skip — blocks early `-la` cleanly without punishing fast players `(Recommended)`.
- **Q3: How should hidden `.tensor_gpu` "appear from somewhere" on the very first `ls -la` in Level 2?**
  **A (user, 2026-11-27):** Show `.tensor_gpu` immediately in that first `ls -la` output AND tumble/drop it out from behind a Cache Vault rack prop onto the floor with a comic bounce — feels physically dislodged from hiding and can be pocketed right away with `mv .tensor_gpu ~` `(Recommended)`.
- **Q4: What should the new quest step in Level 2's checklist (`winRules`) and progression require?**
  **A (user, 2026-11-27):** Add pocketing `.tensor_gpu` (`mv .tensor_gpu ~`) to `winRules`, while Kiro's dialogs guide: try plain `ls` (misses GPU) -> petrify gargoyle & grab `tube_transistor` -> finish Kiro dialog -> `ls -la` -> `mv .tensor_gpu ~` — adds 1 clear objective and naturally requires `ls -la` `(Recommended)`.
- **Q5: Which reusable `ScriptCond` building blocks should we add to the spec vocabulary now so you can reuse preconditions across later levels?**
  **A (user, 2026-11-27):** Orthogonal toolkit: `dialog_done` (no active scripted dialog), `ran_command` flag/arg filter, script flags (`set_flag` step + `flag` cond), and `not` (negation) — composes into any future command/step gate without code changes `(Recommended)`.
- **Requirements approval (user, 2026-11-27):** Explicit approval of `requirements.md` ("i approve").
- **Design approval (user, 2026-11-27):** Explicit approval of `design.md` ("i approve").
- **Tasks approval (user, 2026-11-27):** Explicit approval of `tasks.md` ("i approve").

## Open questions

(none)

## Verification

- `node scripts/quality/check-specs.mjs`
- `node scripts/harness/generate-chapter.mjs --verify`
- `node scripts/harness/editor-unit-test.mjs`
- `node scripts/harness/editor-smoke.mjs`
- `node scripts/harness/terminal-lab-unit.mjs`
- `node scripts/harness/property-tests.mjs --only chapters,gameplay,terminal`
- `npm run quality:fingerprint`
- `npm run quality`
