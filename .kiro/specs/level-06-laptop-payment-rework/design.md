# Level 06 laptop payment rework: design

Status: see requirements.md

## Pieces

```text
chapters/chapter-01-kiroween/
  chapter.manifest.json               update Level 6 title, teaches, grants (`afterLevel: 6` includes `laptop`)
  levels/level-06-task-logic-purge/level.spec.json
                                      two-phase rework: `pickup_l6_laptop`, `appearWhen: laptop_tasks_done` on `code/`, `code/payment.js`, and `bug_js_l6` (`showIn: ["/srv/kiroween/logic_cell"]`), `winRules` (`laptop_tasks_done`, `payment_js_valid`, `enemy_neutralized`), `script.arrival` / `timed` / `triggers` (Gork Phase 1 taunt; Vibecoder -> Clod -> Kiro.d Phase 2 dialog & taunt), `locks` (`edit`/`nano`/`code`/`sed` with `freeAction: true` until `has_item laptop`), `holdEnemiesUntil: all(laptop_tasks_done, dialog_done)`, `.spare_parts` `vram.mod` decoy tree, and `solutionCommands`
  story/dialogs.json                  update Level 6 banner, Socratic `hankRungs`, `agentTaunt`, and `completion`
src/chapters/generated/catalog-data.ts
                                      regenerated compiled pack via `node scripts/harness/generate-chapter.mjs`

src/chapters/
  types.ts                            add `laptop_tasks_done` and `payment_js_valid` `WinRule` variants plus optional `appearWhen` on `SpecFile` / `SpecEnemy` / `SpecPickup`
  script-types.ts                     add `laptop_tasks_done` (`tasks: string[]`) `ScriptCondition`
  script.ts & script-locks.ts         evaluate `laptop_tasks_done`, sync conditional spawns (`syncConditionalSpawns`), and honor `ScriptLock.{flags,args,freeAction}`
  validate-pack.ts                    validate `laptop_tasks_done`, `payment_js_valid`, and `appearWhen` structures (four-place vocabulary rule)
  validators.ts                       add `validatePaymentJs` testing `processPayment(amountMinor)` against `[100->1, 199->1, 250->2, 99->0, 0->0, 1050->10]` with silent console stub
  session-state.ts & session-level.ts track `laptopDone`, `discoveredPaths`, and Level 6 runtime state
  session-fs.ts & session-search.ts   record discovered paths (`ls`, `cd`, `cat`, `tree`, `grep -r`) and check `appearWhen` visibility
  session-rules.ts & session-flow.ts  evaluate `laptop_tasks_done` and `payment_js_valid`; mark `codeRuleSolved` and purge `bug_js_l6` upon valid fix; materialize `appearWhen` entities/files on sync
  session-battle.ts & session-hints.ts
                                      supply logic-bug `BattleIntroOverride.advice` (`customCodeRule`) and `pendingLaptopTasksForSpec` hints
  session-snapshot.ts                 expose `laptopDone`, `isPathDiscovered`, and conditional entity/room snapshots
  chapter-session.ts                  expose `completePendingLaptopTasks`, `syncLaptopTasks`, and `isPathDiscovered` on `ChapterSession`
  solve.ts                            automate two-phase laptop warmups + `code/payment.js` fix in headless pack verification

src/chapter-editor/
  schema.ts & schema-script.ts        add exhaustive field tables for `laptop_tasks_done`, `payment_js_valid`, and `appearWhen` (inherited by Terminal Lab)

src/game/
  entities-types.ts, entities.ts, entities-combat.ts, floors.ts
                                      add `customCodeRule` and `codeRuleSolved` flags on `bug` enemies so `sed -i 's/BUG/FIXED/'` cannot cheese custom logic bugs and `rm` veto / `kill` hints point to Laptop JS Pad / logic repair

src/laptop/ui/
  laptop.ts, apps/app-types.ts, apps/catalog.ts, apps/workbench.ts
                                      add `RoomTaskBinding`, `RoomNotice`, `roomTask`, `roomNotice`, `onTaskProgress`, `onRoomChange` / `notifyRoomChange`, `startRoomTask`, and extracted `applySolved`

src/play/
  laptop.ts, loop.ts, input.ts, state.ts
                                      mount Phase 1 warmup tracking (`warmupRuleTasks`, `prunePendingLaptopProgress`, `clearPlayLaptopProgress` on `playAgain`), Phase 2 `buildRoomTask` + `buildRoomNotice` (`LOCK` before `ls`, `OK` `payment.js fixed!` after solve), `DONE — RETURN [Esc]` close label, deferred `syncLaptopProgressToSession` on close, auto-close `play.laptopOverlay.close(true)` when `laptop` leaves inventory, zero `holdTurnTimer` calls, and `__laptopOverlay.runTask` / `__game.completeLaptopTasks` test hooks

src/terminal-lab/
  catalog.ts, context.ts, level-import.ts, templates.ts
                                      add `PAYMENT_JS` sample template, context tips for `payment_js_valid` / `laptop_tasks_done`, and `usesLaptopCond` stripping in `levelToLabScript`

scripts/harness/ & .kiro/skills/
  terminal-lab-unit.mjs, terminal-lab-smoke.mjs, play-laptop-smoke.mjs, play-browser.mjs, props/chapters.mjs, props/gameplay.mjs, .kiro/skills/chapter-level-generator/scripts/self-test.mjs
                                      test coverage for `validatePaymentJs`, two-phase Level 6 progression, `isPathDiscovered`, live battle turn timer during `/play` laptop overlay, 16 placeable win rules in Terminal Lab, and full Chapter 1 browser playthrough
```

## Decisions

- **Two-phase declarative gating via `appearWhen` + `laptop_tasks_done` + `holdEnemiesUntil`.**
  - Rather than adding imperative level-specific hooks in engine code, Phase 1 vs. Phase 2 visibility on `code/`, `code/payment.js`, and `bug_js_l6` is driven by declarative `appearWhen: { kind: "laptop_tasks_done", tasks: ["js-hello", "js-add", "js-countdown"] }` predicates alongside `holdEnemiesUntil: all(laptop_tasks_done, dialog_done)`.
  - Pre-pickup `script.locks` guard `edit`, `nano`, `code`, and `sed` with `freeAction: true` until `has_item laptop`, letting players test the terminal safely before fetching the laptop while keeping both JS Pad and terminal editors available once the laptop is carried.

- **Discovery-gated `RoomTaskBinding` and `RoomNotice` between `ChapterSession` and Laptop UI.**
  - Running `ls`, `cd`, `cat`, `tree`, or `grep -r` in `/srv/kiroween/logic_cell` marks paths in `discoveredPaths` (`isPathDiscovered`). Before `code/payment.js` is discovered, `buildRoomNotice` shows a `LOCK` notice in Laptop `Quests` directing the player to run `ls`; once discovered, `buildRoomTask` auto-loads `payment.js` into JS Pad so clicking `Check` validates via `validatePaymentJs`, writes the fixed file back into the session VFS, updates the close button to `DONE — RETURN [Esc]`, and shows `OK` `payment.js fixed!`.
  - Phase 1 warmup completions are pruned from `PLAY_LAPTOP_PROGRESS_KEY` via `prunePendingLaptopProgress` whenever a warmup task is still pending in the session, and `warmupRuleTasks` tracks progress across multiple overlay opens so the notice accurately displays `Warmups complete (3/3)!`.

- **`customCodeRule` protection on `bug` enemies.**
  - Entities backing `payment_js_valid` carry `customCodeRule` so `sed -i 's/BUG/FIXED/'` cannot defeat the enemy without fixing `processPayment(amountMinor)`, and battle advice, `rm` veto messages, and `kill` hints direct the player toward logic repair rather than canned bug-label substitution.

- **Live turn-timer invariant and safe cleanup.**
  - `src/play/laptop.ts` intentionally omits any `holdTurnTimer` call so the 30s battle turn timer continues ticking during Phase 2 laptop coding (`.kiro/specs/play-laptop-overlay/`, `.kiro/specs/laptop-rework/`). If `floor_restart` strips `laptop` from inventory, `paint()` closes the overlay immediately, and `playAgain` clears `PLAY_LAPTOP_PROGRESS_KEY`.

## Layers and gates

- **Layer rules (`scripts/quality/check-layers.mjs`):** Unchanged (`chapters/` -> `game/` -> `contracts/`; `play/` wires `chapters/`, `laptop/`, `ui/`, and `renderer/`).
- **Four-place chapter vocabulary rule (`npm run quality:declarative`):** Coordinated across `src/chapters/{types,script-types}.ts`, `src/chapters/{script,session-rules}.ts`, `src/chapter-editor/{schema,schema-script}.ts`, and `src/chapters/validate-pack.ts`.
- **Asset fingerprint (`npm run quality:fingerprint`):** Must remain 100% byte-identical (`src/procgen/` untouched).
- **Verification gates:**
  - `node scripts/quality/check-specs.mjs` & `npm run quality:brands`
  - `node scripts/harness/generate-chapter.mjs --verify --ticks 3`
  - `node .kiro/skills/chapter-implementer/scripts/verify-chapter.mjs`
  - `node scripts/harness/terminal-lab-unit.mjs` & `node scripts/harness/laptop-unit.mjs`
  - `node scripts/harness/terminal-lab.mjs --all` & `node scripts/harness/terminal-lab-smoke.mjs --width 1280 --height 820`
  - `node scripts/harness/play-laptop-smoke.mjs` & `node scripts/harness/play-laptop-smoke.mjs --width 1280 --height 820`
  - `node scripts/harness/play-browser.mjs --nointro`
  - `npm run quality`, `npm run test`, `npm run build`
