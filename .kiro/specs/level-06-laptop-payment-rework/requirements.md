# Level 06 laptop payment rework: requirements

Status: done (2026-11-27; requirements, design, and tasks confirmed and delegated by user; all gates verified)

Capability: Rework Level 6 (`level-06-task-logic-purge`) into a two-phase laptop trial and bug-fix encounter: Vibecoder hears Kiro sense the laptop, picks it up, endures a Big Four taunt, completes the three basic JS Pad warmup tasks on the laptop, triggers a follow-up dialog and Big Four taunt that spawns a `bug` enemy, finds the `code` directory with `ls`, turns on the laptop, and fixes the minor-to-major unit rounding bug in `code/payment.js` so the bug dies and the exit door opens.

## Requirements

1. WHEN Vibecoder enters Level 6, THE SYSTEM SHALL deliver Kiro's hint that she senses the laptop nearby, make the `laptop` item pickup available in the room, and persist `laptop` inventory ownership after Level 6 completion.
2. WHEN Vibecoder picks up `laptop` on Level 6 (`mv laptop ~`), THE SYSTEM SHALL play a Big Four taunt dialog and require completion of the three basic JS Pad tutorial tasks (`js-hello`, `js-add`, `js-countdown`) before Phase 2 spawns (enforced via the `laptop_tasks_done` win rule and `appearWhen` conditions, locking `edit`, `nano`, `code`, and `sed` with `freeAction: true` until `has_item laptop`).
3. WHEN the in-game laptop overlay is opened on Level 6 Phase 1, THE SYSTEM SHALL present the pending warmup tasks in Quests, prune stale saved completions if any pending warmup is still required by the chapter session, show an `OK` notice (`Warmups complete (3/3)!`, preserving full rule count across multi-open progress) and `DONE — RETURN [Esc]` close label upon completion, and sync progress to the session on close.
4. WHILE the in-game laptop overlay is open (including during Phase 2 battle), THE SYSTEM SHALL keep the battle turn timer running and NEVER call `holdTurnTimer('laptop', ...)`, preserving the user-approved invariant from `.kiro/specs/play-laptop-overlay/requirements.md` and `.kiro/specs/laptop-rework/requirements.md`, and SHALL close the overlay automatically if a `floor_restart` death strips `laptop` from inventory.
5. WHEN the three laptop warmups are synced to Level 6 (`laptop_tasks_done`), THE SYSTEM SHALL run the follow-up dialog and Big Four taunt and materialize the Phase 2 `bug` enemy and `code/payment.js` file (`appearWhen` + `dialog_done` trigger/enemy gating).
6. WHILE `code/payment.js` has not yet been discovered via terminal listing (`ls` / `ls -la` / `cd code`), THE SYSTEM SHALL withhold the JS Pad `[BUG]` room task and display a `LOCK` notice in Laptop `Quests` directing the player to close the laptop and run `ls` (`isPathDiscovered`).
7. WHEN Vibecoder discovers `code/payment.js` and opens the laptop, THE SYSTEM SHALL expose `Fix payment.js (minors -> majors)` in `Quests` and auto-load `payment.js` into JS Pad so editing `processPayment(amountMinor)` to divide by 100 and round down (`Math.floor(amountMinor / 100)`) validates cleanly (`validatePaymentJs`); during a `customCodeRule` bug battle, battle advice, `rm` veto, and `kill` hints SHALL point to the JS logic fix rather than `sed -i 's/BUG/FIXED/'`.
8. WHEN `payment_js_valid` becomes satisfied (via Laptop JS Pad `Check` saving to the VFS or terminal `sed` / `edit` once unlocked), THE SYSTEM SHALL purge the `bug` enemy, end the battle, open the Level 6 exit door, display an `OK` completion notice (`payment.js fixed!`) in Laptop `Quests`, and update (or initialize on reopen) the overlay close button to `DONE — RETURN [Esc]`.
9. THE SYSTEM SHALL extend the chapter and Terminal Lab four-place vocabulary cleanly (`laptop_tasks_done` and `payment_js_valid` win rules, `dialog_done` and `laptop_tasks_done` script conditions, entity/file/pickup `appearWhen`, `ScriptLock.{flags,args,freeAction}`, and `ran_command` args matching) across `src/chapters/`, `src/chapter-editor/`, `src/terminal-lab/`, and headless solvers/smoke drivers.

## Out of scope

- Multi-chapter expansion beyond Chapter 1.
- Adding new AI brand names or breaking the 1995 *Comix Zone* palette / turn-based battle architecture.
- Pausing or holding the 30s battle turn timer when `#laptop-overlay` is open, or modifying `src/procgen/` 3D models/textures.

## Decisions

- **Q:** What is the core Level 6 sequence and bug-fix goal? **A (user, 2026-11-27):** When Vibecoder reaches Level 6, Kiro says she feels the laptop there and Vibecoder picks it up; then the Big Four taunts; Vibecoder tests the laptop and passes all the same basic JS riddles from the laptop tutorial (`js-hello`, `js-add`, `js-countdown`); when done, a new dialog and Big Four taunt play and a `bug` enemy appears; Vibecoder finds the `code` folder with `ls`, turns the laptop on, opens the code editor, and fixes the payment processing function (`payment.js`) minor/major unit issue (dividing by 100 and rounding down, e.g., entering 100 was paying 100 instead of 1); when done, the bug dies and the door opens.
- **Q:** Does the in-game laptop overlay pause or hold the battle turn timer? **A (user, 2026-11-27, from `play-laptop-overlay` & `laptop-rework`):** No — never call `holdTurnTimer` for the laptop overlay; the turn timer keeps running while coding on the laptop.
- **Q:** What Phase 1 and Phase 2 Big Four speakers, dialog lines, and trigger timings should Level 6 use? **A (user confirmed & delegated, 2026-11-27):** Keep the authored Phase 1 Gork taunt triggered after `mv laptop ~` (`has_item laptop`) and the Phase 2 Vibecoder -> Clod -> Kiro.d `dialog_box` sequence triggered on `laptop_tasks_done` before releasing `holdEnemiesUntil: all(laptop_tasks_done, dialog_done)`, alongside the updated Socratic `hankRungs`, `agentTaunt`, and `completion` in `dialogs.json`.
- **Q:** Should terminal `sed` / `edit` / `nano` / `code` remain allowed once `has_item laptop` unlocks them, or require Laptop JS Pad exclusively? **A (user confirmed & delegated, 2026-11-27):** Keep `edit`, `nano`, `code`, and `sed` locked with `freeAction: true` until `has_item laptop`, then allow either Laptop JS Pad (`Check` saving cleanly to VFS) or terminal `edit`/`vim`/`sed` to fix `code/payment.js` and satisfy `payment_js_valid`.
- **Q:** Should `edit`, `nano`, `code`, and `sed` carry `freeAction: true` locks until `has_item laptop`? **A (user confirmed & delegated, 2026-11-27):** Yes — lock `edit`, `nano`, `code`, and `sed` with `freeAction: true` until `has_item laptop` (matching `.kiro/steering/glossary.md`).
- **Q:** Should running `ls` from `/srv/kiroween/logic_cell` immediately unlock `code/payment.js` in Laptop JS Pad, or require `cd code` / `ls code`? **A (user confirmed & delegated, 2026-11-27):** Running `ls` (or `ls -la`, `cd code`, `cat`, `tree`, `grep -r`) in `/srv/kiroween/logic_cell` marks `code` and `code/payment.js` discovered (`isPathDiscovered`) and unlocks `Fix payment.js (minors -> majors)` in Laptop JS Pad; before discovery, Laptop `Quests` displays a `LOCK` notice telling the player to close the laptop and run `ls`.
- **Q:** Where should `bug_js_l6` live and become visible? **A (user confirmed & delegated, 2026-11-27):** Keep `bug_js_l6` inside `code/payment.js` with `showIn: ["/srv/kiroween/logic_cell"]` so it renders from the room root once Phase 2 spawns and engages turn-based combat on `cd code`.
- **Q:** Which test vectors should `validatePaymentJs` enforce and what enemy cadence should `bug_js_l6` use? **A (user confirmed & delegated, 2026-11-27):** Validate `processPayment(amountMinor)` with `Math.floor(amountMinor / 100)` across `[100->1, 199->1, 250->2, 99->0, 0->0, 1050->10]` (with silent `console` stub), and keep `bug_js_l6` at `1` HP damage cadence while the 30s battle turn timer remains live.
- **Q:** Should prior tutorial laptop completions in `PLAY_LAPTOP_PROGRESS_KEY` be pruned when Level 6 Phase 1 opens? **A (user confirmed & delegated, 2026-11-27):** Yes — `prunePendingLaptopProgress` prunes any saved task IDs still pending in the active level rule when opening the laptop on Level 6 Phase 1 so players always pass `js-hello`, `js-add`, and `js-countdown` there, and `playAgain` clears `PLAY_LAPTOP_PROGRESS_KEY`.
- **Q:** Keep secondary Level 6 room details (`pickup_l6_laptop`, `.spare_parts` `vram.mod` decoy tree, and `afterLevel: 6` grants)? **A (user confirmed & delegated, 2026-11-27):** Yes — keep the floating laptop pickup, `.spare_parts` `vram.mod` decoy tree (`generate`), and `chapter.manifest.json` `afterLevel: 6` grant (`ram: 32, ssd: 512, items: ["laptop"]`).

## Open questions

(none)

## Verification

- `npm run quality` (typecheck, lint, root, size, layers, cycles, deadcode, declarative, specs, dup, agents, brands, mcp, property-tests)
- `npm run test` & `npm run build`
- `node scripts/harness/generate-chapter.mjs --verify --ticks 3`
- `node .kiro/skills/chapter-implementer/scripts/verify-chapter.mjs`
- `node scripts/harness/terminal-lab-unit.mjs` & `node scripts/harness/laptop-unit.mjs`
- `node scripts/harness/terminal-lab.mjs --all` & `node scripts/harness/terminal-lab-smoke.mjs --width 1280 --height 820`
- `node scripts/harness/play-laptop-smoke.mjs` & `node scripts/harness/play-laptop-smoke.mjs --width 1280 --height 820`
- `node scripts/harness/play-browser.mjs --nointro`
