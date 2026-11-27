# Command Preconditions & Level 2 Tensor GPU Quest: design

Status: see requirements.md

## Pieces

```text
src/contracts/
  events.ts             extend ENTITY_SPAWNED with optional fromX?: number; fromY?: number for prop-dislodged drops
src/game/
  types.ts              add GameSnapshot.skippableDialog?: boolean (mid-level dialog skip button without full terminal lock)
src/chapters/
  script-types.ts       extend ScriptLock (flags?, args?, freeAction?), ScriptCond (ran_command.{flags,args}, dialog_done, flag, not), ScriptStep (set_flag)
  types.ts              extend LevelPickupSpec with optional dropFromX?: number; dropFromY?: number
  script-locks.ts       (new, <120 lines) pure flag/arg matching (reusing hasLsFlags + matchesPattern/patternError), command history matching, lock lookup, and dialog duration calculation via planWordReveal
  script.ts             delegate lock/cond evaluation to script-locks.ts; handle set_flag (including OPENING_KEEP & SKIP_KEEP); advance LevelRuntime.dialogBusyUntilTick on DIALOG_BOX beats; pass pickup dropFromX/dropFromY onto ENTITY_SPAWNED
  session-state.ts      add LevelRuntime.{dialogBusyUntilTick, flags, commandLog} and ChapterSession.finishScriptDialog?()
  session-level.ts      initialize dialogBusyUntilTick = 0, flags = new Set(), commandLog = [] on loadLevel
  session-shell.ts      pass full argv to lock lookup; set g.freeAction = true when a freeAction lock refuses; record successful (code === 0) invocations (including ls) in g.rt.commandLog while keeping g.rt.commandsRun semantics intact
  session-flow.ts       extend skipOpeningDialog() to also skip active mid-level scripted dialogs (clearing dialogBusyUntilTick and flushing kept deferred beats)
  session-snapshot.ts   populate GameSnapshot.skippableDialog = openingActive(g) || scriptDialogActive(g) while keeping openingDialog = openingActive(g)
  session-hints.ts      command-free hint label for hidden tensor_gpu file_absent winRule
  validate-pack.ts      validate ScriptLock.{flags,args}, ran_command.{flags,args} (via patternError), flag/set_flag non-empty names, nested not, and finite pickup.{dropFromX,dropFromY}
  solve.ts              if snapshot().skippableDialog holds before a solutionCommands line, invoke skipOpeningDialog() (simulating clicking "Skip Dialog »")
src/chapter-editor/
  schema.ts             add flags, args, freeAction to SCRIPT locks fields; add dropFromX, dropFromY to PICKUP_FIELDS (also inherited by Terminal Lab)
  schema-script.ts      add dialog_done, flag, not, ran_command.{flags,args} to COND_VARIANTS and set_flag to STEP_VARIANTS
  preview.ts            click/clear active skippable dialog before stepping solutionCommands in /editor Play Solution
src/renderer/
  stage-cast.ts         carry optional fromX/fromY on pendingSpawn entries
  stage-event-cast.ts   forward ENTITY_SPAWNED.{fromX,fromY} into playSpawn / pendingSpawn
  stage-motion.ts       extend dropToGround(stage, a, from?) to arc/tumble from (placeX(fromX), fromY) onto a.home with the 12 fps comic bounce and "DROP!" cue
src/ui/
  hud.ts                show #skip-dialog-btn when Boolean(snap.openingDialog || snap.skippableDialog)
src/play/
  input.ts              sync natural DialogBox queue drain (onClose when pending === 0) with session.finishScriptDialog?.() so reduced-motion never leaves dialog_done stale
chapters/chapter-01-kiroween/
  chapter.manifest.json update summary, mechanicsSummary, and Level 2 teaches (keeping grants free of consumable tensor_gpu)
  story/dialogs.json    update Level 2 banner, hankRungs, and completion for plain ls -> tube_transistor -> post-dialog ls -la -> .tensor_gpu
  levels/level-02-task-ram-heist/level.spec.json
                        rename tensor_gpu -> .tensor_gpu; appearWhen: { kind: "room_swept" } with dropFromX: 3.45, dropFromY: 1.2 -> x: 3.18 (from behind l2_ram_bank); add file_absent(.tensor_gpu) winRule; add Kiro plain-ls & post-tube dialogs + script.locks entry blocking ls flags until any(not(has_item("tube_transistor")), room_swept, dialog_done)
  src/chapters/generated/catalog-data.ts  regenerated via node scripts/harness/generate-chapter.mjs
scripts/harness/
  play-browser.mjs      click #skip-dialog-btn when visible before submitting solutionCommands lines
  props/chapters.mjs    align solution-prefix helpers with skipOpeningDialog() and add non-vacuous properties for flag/arg ScriptLock, dialog_done + freeAction, not, set_flag/flag, ran_command flags, and Level 2 .tensor_gpu reveal
  props/gameplay.mjs    align pickupLevelsOf prep helper with skipOpeningDialog() and verify tensor_gpu idempotence on .tensor_gpu
```

## Decisions

- **Unified `script.locks[]` with `flags`, `args`, and `freeAction` (`src/chapters/script-locks.ts`, Q1 & Q2).**
  - `flags?: string`: `"*"` matches any option token (`arg.startsWith('-') && arg.length > 1`, reusing `hasLsFlags` from `src/game/unix-applets.ts`); specific flag characters (e.g. `"a"`, `"la"`) match bundled short options (so `-la` matches `"a"` or `"la"`) or matching `--` long options.
  - `args?: string`: reuses `matchesPattern` / `patternError` from `src/game/lab-checks.ts` (plain substring or `re:<regex>`) against `argv.slice(1).join(' ')` with zero duplicate regex helpers.
  - `freeAction?: boolean`: when `true`, a refused lock sets `g.freeAction = true` so `exec()` skips `afterCommand` (`0` battle turns consumed), while leaving legacy locks (`freeAction` omitted) unchanged.
  - Extracting `src/chapters/script-locks.ts` keeps `src/chapters/script.ts` comfortably below the 600-line hard limit and avoids touching `src/chapters/session-fs.ts` (currently 595 lines).
- **Orthogonal `ScriptCond` & `ScriptStep` toolkit (`script-types.ts`, `script.ts`, `schema-script.ts`, `validate-pack.ts`, Q5).**
  - `dialog_done`: true when `!openingActive(g) && g.rt.levelTicks >= g.rt.dialogBusyUntilTick`.
  - `ran_command`: keeps existing `g.rt.commandsRun` behavior when `flags` and `args` are omitted (preserving Level 1 Tutorial Step 1 `cwd`-scoped `ls`), and matches recorded `g.rt.commandLog` entries when `flags` or `args` is provided.
  - `set_flag` + `flag`: per-level runtime `Set<string>` (`g.rt.flags`), included in `OPENING_KEEP` and `SKIP_KEEP` so skipping an opening/tutorial preserves script state latches.
  - `not`: recursive `!evalCond(g, c.of)`.
- **Mid-level dialog duration, `"Skip Dialog »"`, and headless runners (Q2).**
  - When `runSteps` emits `DIALOG_BOX` events, `dialogBusyUntilTick` advances by `Math.ceil(planWordReveal(wordCount, ev.holdMs).holdMs / 1000)` seconds from `max(dialogBusyUntilTick, levelTicks)`, matching `DialogBox`'s word-reveal + reading hold duration via shared `src/contracts/word-reveal.ts`.
  - Separating `GameSnapshot.skippableDialog` from `GameSnapshot.openingDialog` keeps `#skip-dialog-btn` visible during active mid-level scripted dialogs without locking the entire terminal (`setDialogLocked` remains tied to `openingDialog` only).
  - Level 2's lock condition `any(not(has_item("tube_transistor")), room_swept, dialog_done)` preserves `LS_FLAGS_LOCKED_MESSAGE` before `tube_transistor` is held, blocks `ls` flags with Kiro's wait message during the post-`tube_transistor` dialog, and clears permanently once the first `ls -la` sets `room_swept`.
  - Automated `solutionCommands` drivers (`solve.ts`, `preview.ts`, `play-browser.mjs`, and `props/{chapters,gameplay}.mjs` prep helpers) invoke `skipOpeningDialog()` (or click `#skip-dialog-btn`) when `skippableDialog` is true before stepping the next command, keeping 0-tick and 2-tick headless runs deterministic while direct `session.exec('ls -la')` calls stay gated until ticks or skip end the dialog.
- **Hidden `.tensor_gpu` immediate listing & rack tumble-drop on first `ls -la` (Q3).**
  - `cmdLs` sets `g.rt.roomSwept = true` before filtering `isNodeHidden`, so `appearWhen: { kind: "room_swept" }` makes `/srv/kiroween/cache_vault/.tensor_gpu` appear immediately in the very first `ls -la` output while keeping it hidden from `cat`, `mv`, `find`, and `Tab` beforehand.
  - `syncScriptTriggers` emits `FILE_CREATED` + `ENTITY_SPAWNED` (`reason: 'script', fromX: 3.45, fromY: 1.2`), causing `dropToGround` to arc `.tensor_gpu` out from behind `l2_ram_bank` (`x: 3.45`) onto `x: 3.18` (with `.vault_beacon` nudged from `2.95` to `2.82` for clean actor spacing) with the 12 fps stepped bounce and `"DROP!"` FX.
- **Level 2 quest objective & `manifest.grants` invariant (Q4 & Req 6).**
  - Adding `{ kind: "file_absent", path: "/srv/kiroween/cache_vault/.tensor_gpu", ... }` to Level 2 `winRules` adds the 6th quest step and guarantees normal campaign runs carry `tensor_gpu` into Hub 1.
  - `chapter.manifest.json -> grants` omits `tensor_gpu` because `tensor_gpu` is consumed in Hub 1 (`take_item`): granting it at `afterLevel: 2` would break Hub 1's direct-entry fallback property (`scripts/harness/props/ritual.mjs`) and leave a consumed item in Levels 5–11 on direct jumps.
  - `computeLevelRank` and `computeRunRank` (`src/chapters/session-state.ts`) include `solutionCommands` length in `par` (`Math.max(8, solutionLen)` and `Math.max(12, count * 6, solTotal)`) so Level 2's 9-step quest and the 68-step campaign retain Rank `S` (`ACH_ZERO_PANIC_RUN`) on a 0-death canonical solve.

## Layers and gates

- **Layer rules (`scripts/quality/check-layers.mjs`):** Zero changes required (`chapters/` already imports `contracts/` and `game/`; `chapter-editor/`, `terminal-lab/`, `renderer/`, `ui/`, and `play/` imports stay within existing boundaries).
- **Four-place chapter vocabulary rule:** Coordinated across `src/chapters/{script-types,types}.ts`, `src/chapters/{script,script-locks}.ts`, `src/chapter-editor/{schema,schema-script}.ts` (and inherited by `src/terminal-lab/`), and `src/chapters/validate-pack.ts`.
- **Asset fingerprint (`npm run quality:fingerprint`):** Must remain 100% byte-identical (no procgen model, texture, shader, or FX preset definitions change).
- **Verification gates:**
  - `node scripts/quality/check-specs.mjs`
  - `node scripts/harness/generate-chapter.mjs --verify`
  - `node .kiro/skills/chapter-implementer/scripts/verify-chapter.mjs`
  - `node scripts/harness/editor-unit-test.mjs`
  - `node scripts/harness/editor-smoke.mjs`
  - `node scripts/harness/terminal-lab-unit.mjs`
  - `node scripts/harness/property-tests.mjs --only chapters,gameplay,terminal`
  - `npm run quality:fingerprint`
  - `npm run quality`
