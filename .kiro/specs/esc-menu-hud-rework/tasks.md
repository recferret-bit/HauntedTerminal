# Esc menu hud rework: tasks

Status: done (all tasks ticked 2026-11-25; handoffs H1 to H5 stay open for the user)

Amendments recorded with the approval: T15 stops at the local commit (no push, no merge to `main`, no deploy). H1 stays an open handoff to the user: nobody edits `scripts/harness/terminal-lab-smoke.mjs`, and `terminal-lab-smoke.mjs` is reported as a known failing gate.

Covers `requirements.md` items R1 to R20 and `design.md` sections 3 to 14 (decisions D1 to D12 as recommended). Every task names its owner, the requirements it covers and the gates it runs. Every owner also runs `npm run quality` for the paths it touched, and `node scripts/quality/check-specs.mjs` is run by lead-dev after each spec edit. Report only gates that ran.

## Order and parallel groups

- **Wave 1 (parallel):** T1, T2, T3.
- **Wave 2 (parallel, after wave 1):** T4 (needs T1 and T3), T5 (needs T3), T6 (needs T1).
- **Wave 3 (parallel):** T7 (needs T6), T8 (needs T3 and T4), T9a (needs T3, T4, T5), T9b (needs T2 and T4).
- **Wave 4 (sequential):** T10, T11, T12, T13, T14, T15.
- **Handoffs to the user:** H1 and H2, any time; H1 blocks the terminal-lab-smoke gate.

## Wave 1

- [x] **T1. Shared types, volume, storage key** (owner: `lead-dev`; covers R7, R8, R5; design 5, 7, 9, 15)
  - `src/contracts/brand.ts`: `SOUND_PREF_KEY = \`${PROJECT_SLUG}:sound:v1\``. Doc comment of `RoomView.neighbors` in `src/contracts/room-view.ts`: it feeds door locks only (D1).
  - `src/game/types.ts`: `GameSnapshot.level` (`title`, `objective`, `checklist`, `bugsLeft`, `bugsTotal`) and `GameSnapshot.volume`.
  - `src/game/sfx.ts`: `Sfx.setVolume`, one master `GainNode` (default 1, same loudness as today). `src/game/session.ts`: `Session.setVolume` in the interface and the classic implementation; classic `level` snapshot (title from `FLOOR_NAMES`, empty checklist).
  - Gates: `npm run quality`, `node scripts/harness/playthrough.mjs --ticks 3`, `node scripts/harness/property-tests.mjs --only gameplay`.

- [x] **T2. Neighbour column removal, door LED** (owner: `artist`; covers R11, R12, R13; design 9, 10)
  - `src/renderer/{stage-layout,stage-overlay,stage-sync,stage-const,stage-selfcheck}.ts`: delete `drawNeighbors`, the neighbours group, the overlay method and CSS; `panelRight` without the column (check other users of `colWorld` first). Keep `lockedNames`.
  - Door LED tint in `syncOverlays`: `lockRed` while `doorLocked`, `phosphor` otherwise, on every door (D3). Confirm that the existing `st-lock` badge reads as a padlock (D2); if it does not, stop and report instead of adding a model.
  - Gates: `node .kiro/skills/model-geometry-validator/scripts/validate-model.mjs --all --strict`, `node .kiro/skills/procedural-animation-3d/scripts/check-tags.mjs --all`, `node scripts/harness/screenshot-lab.mjs --selftest`, `npm run quality:fingerprint` (expected byte-identical, because the LED is a runtime tint; if it differs, diff and explain), `npm run quality`.
  - Fingerprint note for the report: no model, texture or FX spec changes; the LED is a material tint in the renderer, so the model hash must not move. Visual baselines change on every screen (wider panel); that goes to T12.

- [x] **T3. `restart-level` pure rule and manual** (owner: `terminal-designer`; covers R15, R16, R17, R20; design 8, 12)
  - In the existing `src/game/commands-proc.ts` (spec deviation 2026-11-25: the planned new file `commands-restart.ts` matches no agent's write fence, because the fences list files and a new `src/game` file has no owner; adding one means editing the user's `agents-build.mjs`; the user may still move it later): `parseRestartArgs`, `decideRestart`, `RESTART_CONFIRM_TICKS = 20`, `armMessage` (exact R16 line), exported for both shells.
  - `src/game/manual.ts`: `COMMANDS` (`restart-level`, `retry`), `helpText`, `MAN['restart-level']` (names `restart`), `MAN.retry` alias, a sentence in `man exit` for the boss (R14).
  - Gates: `npm run quality`, `node scripts/harness/property-tests.mjs --only terminal`.

## Wave 2

- [x] **T4. Chapter session: command, caption, level data** (known failing gates: `terminal-lab-unit.mjs` and `verify-chapter.mjs`, both stop only at the H3 block; every other gate passed) (owner: `chapters-designer`; covers R13, R15, R16, R17, R18, R5, R7, R20; design 5, 8, 11, 12; needs T1, T3)
  - `session-shell.ts`: cases `restart-level` and `retry`, and the chapter `help` string. `session-state.ts`: `LevelRuntime.restartPending`. `session-flow.ts`: `reloadedNow` flag reset in `exec`, post-command block skipped when set, `Session.setVolume` delegate. Command works after the end-of-chapter message exactly as design 8 says.
  - `session-snapshot.ts` / `chapter-session.ts`: fill `GameSnapshot.level` and `volume`; objective is the first unfinished win rule (D6); locked caption `LOCKED: <first missing> (+N more)` only in the exit door's room (D7); drop the dead `parent` panel filter.
  - Gates: `node scripts/harness/generate-chapter.mjs --verify`, `node .kiro/skills/chapter-implementer/scripts/verify-chapter.mjs`, `node scripts/harness/battle-unit.mjs`, `node scripts/harness/editor-unit-test.mjs`, `node scripts/harness/terminal-lab-unit.mjs`, `node scripts/harness/property-tests.mjs --only chapters,gameplay`, `npm run quality`.

- [x] **T5. Classic shell and selfcheck** (the `selfcheck.ts` rows could not be run: no TypeScript runner is allowed in the agents' shells; the T9a property covers the classic shell) (owner: `lead-dev`; covers R16, R17, R20; design 8, 12; needs T3; parallel with T4)
  - `src/game/session.ts`: cases `restart-level` and `retry` using the T3 helper, a `ticks` counter and `restartPending` cleared in `load`. `src/game/selfcheck.ts`: rows for arm, confirm, `retry --yes`, `man restart-level`, Tab.
  - Gates: `npm run quality`, `node scripts/harness/playthrough.mjs --ticks 3`, `node scripts/harness/property-tests.mjs --only terminal,gameplay`.

- [x] **T6. Menu, level block, sound pref, HUD, tips box** (known failing gate: `terminal-lab-unit.mjs`, stops only at the H3 block) (owner: `terminal-designer`; covers R1 to R10, R19; design 4, 5, 6, 7; needs T1; parallel with T4 and T5)
  - New `src/ui/{esc-menu,level-block,sound-pref}.ts`. `src/ui/hud.ts`: remove `#hud-mute` and `#hud-restart` and their handlers, mount the level block under HP and turn, move `#fx-hint` into `#titleblock`, remove `onHintShow`. `src/ui/dialog-orchestrator.ts`: remove `onHintOpened` (D10). The menu is a modal backdrop that traps keys and never touches `play.reasons` or the turn-timer hold. Two-step Restart level, one-line confirm on Back to main menu (D12). Volume slider 0 to 100, step 5.
  - Gates: `npm run quality`, `node scripts/harness/terminal-lab-unit.mjs`, `node scripts/harness/property-tests.mjs --only terminal`, plus a unit check of the menu (adds no pause reason or hold, keys do not reach the terminal, focus returns, sound pref round trip, `renamedKey` of the old-slug sound key (built in the test, not written out)). Where that unit check lives is the terminal-designer's choice inside `src/ui` or `scripts/harness/props/terminal.mjs`.

## Wave 3

- [x] **T7. Play wiring, styles, CSS loader** (wiring is in the new `src/play/menu.ts`; `onRightDialogOpen`/`onClear` are no longer passed, the optional options stay in `dialog-orchestrator.ts` because the unowned unit file uses them) (owner: `lead-dev`; covers R1 to R4, R6, R7, R9, R10, R19; design 3, 5, 6, 7; needs T6)
  - `src/play/{input,loop,state}.ts`: Esc capture handler (blockers, yields to the code editor, `preventDefault`, repeat guard), `play.menuOpen`, click-refocus guard, `window.__menu`, handlers `onMute`, `onVolume`, `onRestartLevel` (calls `session.restartFloor()`), `onLeave`; apply the saved sound pref once at start; delete `onRestartFloor` and the two hide callbacks (D10).
  - New `src/styles/esc-menu.css`, edits to `game.css` and `dialog.css` (hidden `#stage-caption` per D11, hint position, no column), and the one loader line in `src/main.ts` or `src/style.css`.
  - Gates: `npm run quality`, `node scripts/harness/playthrough.mjs --ticks 3`, `node scripts/harness/property-tests.mjs --only gameplay`, `npm run build`.

- [x] **T8. Terminal Lab** (known failing gate: `terminal-lab-unit.mjs`, stops only at the H3 block; the drift check before it passes) (owner: `terminal-designer`; covers R20; design 12; needs T3 and T4)
  - `src/terminal-lab/commands.ts`: group, `USAGE`, example. New `scripts/harness/terminal-lab/restart-level.lab.json` (arm, confirm, `--yes`, expiry by another command, `retry`).
  - Gates: `node scripts/harness/terminal-lab-unit.mjs`, `node scripts/harness/terminal-lab-api-test.mjs`, `node scripts/harness/terminal-lab.mjs --all`, `npm run quality`.

- [x] **T9a. Confirm property** (owner: `terminal-designer`; covers R16, R17, R19, R20; needs T3, T4, T5)
  - `scripts/harness/props/terminal.mjs`: generated sequences on both shells. A bare run never restarts; second run or `--yes` restarts; any other line, a level change or more than 20 ticks expires it; same sequence, same state; the menu path leaves the pending state unchanged. Say plainly if a property cannot fail.
  - Gates: `node scripts/harness/property-tests.mjs --only terminal`, `npm run quality`.

- [x] **T9b. Exit door and battle properties** (owner: `chapters-designer`; covers R11 to R14, R18; needs T2 and T4)
  - `scripts/harness/props/{chapters,gameplay}.mjs`: for every level with an `exitDir`, the exit is a `door.ethernet` actor, locked iff a win rule fails; `exitCommand`-only levels have none; the view has no neighbour panel. `scripts/harness/battle-unit.mjs`: arming costs one enemy turn, the confirm ends the battle with reason `level` and no enemy turn, the after-reboot case (D8). If a level's exit is not `door.ethernet`, hand the `view.ts` fix to lead-dev.
  - Gates: `node scripts/harness/property-tests.mjs --only chapters,gameplay`, `node scripts/harness/battle-unit.mjs`, `node scripts/harness/generate-chapter.mjs --verify`, `npm run quality`.

## Wave 4 (sequential)

- [x] **T10. Integration check** (ran: quality 0, build 0, editor-unit-test 0, editor-smoke 0, terminal-lab.mjs --all 0, terminal-lab-api-test 0; terminal-lab-unit 1 at the H3 block) (owner: `lead-dev`; covers all; needs T1 to T9)
  - Run `npm run quality`, `npm run build`, `node scripts/harness/editor-unit-test.mjs`, `node scripts/harness/editor-smoke.mjs`, `node scripts/harness/terminal-lab-unit.mjs`, `node scripts/harness/terminal-lab.mjs --all`. Send each failure to its owner, at most two rounds.

- [x] **T11. Docs and steering pointers** (owner: `lead-dev`; covers R20; design 14)
  - `.kiro/steering/glossary.md`: entries **Esc menu**, **Level block**, `restart-level`. `.kiro/steering/tech.md` and `AGENTS.md`/`CLAUDE.md`: only if a gate or command changed. `docs/` mention in `docs/PROPERTY_TESTS.md` for the new properties. Spec status: set `done` only after T15.
  - Gates: `node scripts/quality/check-specs.mjs`, `npm run quality:brands`.

- [x] **T12. Visual audit and baselines** (qa ran the audit at four sizes; every play screen differs by design; baselines are H2, the user's) (owner: `qa` runs the audit; the user approves baselines; covers R8, R10, R11; design 9)
  - `node scripts/harness/visual-audit.mjs` at the four sizes. Every screen differs by design (wider panel). `qa` explains each flag and diff. Only the user runs `--update` on baselines (every agent is denied).

- [x] **T13. QA pass** (`docs/qa/2026-11-25-esc-menu-hud-rework.md`: FAIL on 7 findings, PASS after recheck 2; open items are the handoffs H1 to H5) (owner: `qa`; covers R1 to R20; needs T10, and H1 for the smoke gate)
  - Real Chrome at 1600x950 and 1280x820: Esc open and close with a half-typed line; Esc inside the code editor; a battle with the menu open past the 30-second timer; volume and mute persisting across a reload; the left column with avatar, HP, turn, level block and a tip open together (design 6 fallback: 2-line clamp, report to `terminal-designer`); `restart-level` twice, with `--yes`, and expiry; menu two-step restart; Back to main menu confirm; locked and open exit door in the room, caption text; boss `exit`; end-of-chapter `restart` unchanged.
  - Suites: `node scripts/harness/terminal-lab-smoke.mjs` (also `--width 1280 --height 820`, after H1), `node scripts/harness/editor-smoke.mjs`, `node scripts/harness/laptop-lab-smoke.mjs`. Report to `docs/qa/<date>-esc-menu-hud-rework.md`.

- [x] **T14. Fix round** (two rounds: findings 1, 2, 3, 5, 6 fixed; 4 and 7 became H4 and H5) (owners per finding; at most two rounds; then `qa` repeats the failed checks)

- [x] **T15. Final gates** (ran: quality 0, build 0, generate-chapter --verify 0, check-specs 0, property-tests 0, quality:fingerprint 0 with no model, texture or FX file changed; `verify-chapter.mjs` 1, only at the H3 block) (owner: `lead-dev`; needs T13 `PASS`)
  - `npm run quality`, `npm run build`, `node scripts/harness/generate-chapter.mjs --verify`, `node .kiro/skills/chapter-implementer/scripts/verify-chapter.mjs`, `npm run quality:fingerprint` (byte-identical, or the diff explained), `node scripts/quality/check-specs.mjs`. Then set `Status: done` and make a local commit on `agent/esc-menu-hud-rework`. No push, no merge to `main`, no deploy: the user decides those.

## Handoffs to the user

- [x] **H1. `scripts/harness/terminal-lab-smoke.mjs:200`** updated on `main` (2026-11-25) to toggle mute via `window.__menu.open()` -> `#esc-mute` -> `window.__menu.close()`.
- [ ] **H2. Baselines** in `docs/qa/baselines/`: you approve them with `visual-audit.mjs --update`, after T12.
- [x] **H3. `scripts/harness/terminal-lab-unit.mjs:1283-1288`** removed the obsolete `orch.onHintOpened()` assertion on `main` (2026-11-25).
- [ ] **H4. Where the locked-exit caption shows** (found by `qa` 2026-11-25, finding 4). R13 says the missing win rule is named "through the existing sector caption (`room.caption`)". `chapters-designer` fills `room.caption` with `LOCKED: <first missing> (+N more)` (D7), but `#stage-caption` stays hidden (`D11`).
- [x] **H5. `qa` finding 7** resolved on `main` (2026-11-25): `#tutorial-card` moved into `#titleblock` on the left below `.items-strip`, freeing the exit door padlock at the right edge on level 1.

## Follow-up fixes on `main` (2026-11-25)

- [x] **F1.** Merged `agent/esc-menu-hud-rework`, `agent/agent-visuals-rework`, and `agent/terminal-manual` into `main`, added `restart-level` to `manual-cmds-meta.ts`, and regenerated `.kiro/agents/*.json`.
- [x] **F2.** Removed `src/ui/level-block.ts` and `.level-block*` styles (no level info below the avatar).
- [x] **F3.** Added post-page-flip HUD reveal (`body.hud-hidden` -> `body.hud-enter` via `setHudHidden` in `src/ui/screen.ts` & `src/play/loop.ts`).
- [x] **F4.** Moved `.hero-dialog-drawer` out of flow (`position: absolute; left: 100%; clip-path` animation) so opening it never shifts or flips surrounding chrome.
- [x] **F5.** Moved `#tutorial-card` to the left column inside `#titleblock` directly below `.items-strip`, and coordinated `Escape` priority in `src/play/menu.ts` with `manualBook?.isOpen()`.
