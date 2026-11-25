# QA 2026-11-25: esc-menu-hud-rework

Branch: agent/esc-menu-hud-rework (uncommitted working tree)  ·  Asked by: lead-dev  ·  Scope: spec `.kiro/specs/esc-menu-hud-rework` R1-R20, tasks T12 and T13

## Verdict

**After recheck 2 (final): PASS.** Only the known handoffs remain: H1 (`terminal-lab-smoke.mjs`), H3 (`terminal-lab-unit.mjs`), H4 (finding 4, locked caption), H5 (finding 7, tutorial card over padlock) and H2 (baselines, user only). Findings 1, 2, 3, 5 and 6 are fixed; no defect is open. See "Recheck 2" at the end.

After recheck 1: FAIL (4 open: 2 defects, 2 handoffs). Findings 1, 5, 6 are fixed. Finding 2 (tips box) is much better but still clips at 1280x820 and covers F2: open, medium. Finding 3 (Esc menu) shows the MENU tag and level name, but the last button is still cut by a few pixels at 1280x820: open, low. Findings 4 (H4) and 7 (H5) stay open as handoffs. See "Recheck 1" at the end.

First pass verdict: FAIL (7 findings: 3 high, 2 medium, 2 low). The rules work: Esc menu, sound, `restart-level`, battle timer, no neighbour column, boss `exit`. The failures were layout and visibility on screen.

## Checks run

| Command | Exit | Notes |
|---|---|---|
| `npm run quality` | 0 | all gates; 62 properties pass, seed 20261117 (includes terminal, chapters, gameplay) |
| `npm run build` | 0 | |
| `node scripts/harness/generate-chapter.mjs --verify` | 0 | 11 levels, 0 errors, cmds=65, deaths=0 |
| `node scripts/harness/battle-unit.mjs` | 0 | 14 checks, includes restart-level in a battle and after reboot |
| `node scripts/harness/editor-unit-test.mjs` | 0 | 11 suites |
| `node scripts/harness/editor-smoke.mjs` | 0 | |
| `node scripts/harness/laptop-lab-smoke.mjs` | 0 | |
| `node scripts/harness/terminal-lab.mjs --all` | 0 | 30 labs, includes `restart-level.lab.json`, 0 absorbed damage |
| `node scripts/harness/terminal-lab-api-test.mjs` | 0 | 14 checks |
| `node scripts/harness/terminal-lab-unit.mjs` | 1 | KNOWN H3: 61 checks ok, then `TypeError: orch.onHintOpened is not a function` (`terminal-lab-unit.mjs` ~1283). Not a regression. |
| `node scripts/harness/terminal-lab-smoke.mjs` | 1 | KNOWN H1: the only failure is `rapid driver toggle during wait ... preserves mute` (the `#hud-mute` click). Every other check ok, so the 1280x820 run was not repeated. |
| `npm run quality:fingerprint` | 0 | prints hashes only, no stored baseline to diff. `git status` shows no change under `src/procgen` or `src/shaders`, so the model hashes cannot have moved. |
| `node scripts/quality/check-specs.mjs` | 0 | 27 specs |
| `node scripts/harness/play-browser.mjs --nointro` | 0 | 11 levels to the stats screen, no errors (`out/play-end.png`) |
| `node scripts/harness/visual-audit.mjs` | 1 | 96 captures, 24 frame probes, 274 flags, 463 s. See below. |
| `npm start` / `npm stop` | 0 / 0 | port 5400 |

Not run:
- `verify-chapter.mjs`: it runs `terminal-lab-unit.mjs`, which stops at H3. `generate-chapter.mjs --verify` ran instead.
- `terminal-lab-smoke.mjs --width 1280 --height 820`: the first run showed only H1.
- `src/game/selfcheck.ts` rows: no harness runs them (known).
- `credits-forge` `validate_level` / `solve_level`: no level spec changed.
- `visual-audit.mjs --update`: never run; baselines are the user's (H2).
- End-of-chapter `restart` was not typed by hand. Covered by the gameplay property and `battle-unit`; the stats screen still shows Play Again (`out/play-end.png`).

MCP calls (`chrome-devtools`): `new_page`, `resize_page` (1600x950 and 1280x820), `take_snapshot`, `take_screenshot`, `type_text`, `press_key`, `click`, `fill`, `navigate_page`, `wait_for`, `list_console_messages`, `list_network_requests`. `list_console_messages` (error, warn): only the Vite websocket errors (expected under the fence). `list_network_requests` (font): 4 self-hosted `.woff2`, all 304, no failure.

## Visual audit

`node scripts/harness/visual-audit.mjs`: exit 1, 96 captures, 274 flags, 463 s. Every flag:

| Screen @ size | Flag | Verdict | Finding # or reason |
|---|---|---|---|
| level-01..11 @ all four | diff | expected | the stage panel is wider (no neighbour column), the avatar card has a level block, `#stage-caption` is hidden, the tip box moved. Every play screen differs by design. Not a baseline update: the user approves (H2). |
| level-01..11, dialogue, damage, death-respawn, boss-fight, stats, battle-start @ all four | text-overflow `b#level-block-title`, `span#level-block-objective` | finding | 1 (box about 56 px wide, title overflows 11 px, objective 40 px x and 56 px y) |
| same screens | text-overflow `div#terminal-panel` (xterm rows, overflowY 3) | expected, unverified | 3 px of the xterm screen rows below the panel, in the file the spec did not touch (`terminal-panel` and `xterm` are not in the change list). Not compared with a pre-change run. |
| level-01 @ all four | overlap `section#tutorial-card` over `st-lock` | finding | 7 |
| level-09 @ 1600x950, 1280x820, 1920x1080 (and 1024x768) | text-overflow `div#stage-wrapper`, `div.st-overlay` (culprit `st-lock`, 50-52 px out on the right) | finding | 6 |
| battle-start @ all four | no-baseline | expected | no baseline approved yet |
| damage, boss-fight @ 1600x950 and others | capture-unstable | not checked | run flag, handed to lead-dev (owner of the audit); the 1280x820 damage capture was stable and has the same level-block flag only |
| desktop @ all four | diff | not attributed | landing page, `src/hub` and `hub.css` untouched by this change; not opened. Hand to lead-dev. |
| hub, achievements @ all four | size-changed | not attributed | same: pages not touched by this change; not opened. Hand to lead-dev. |
| laptop @ all four | text-overflow `lt-screen`, `lt-taskbtns` | expected | `src/laptop` untouched (`git status`); `laptop-lab-smoke.mjs` passes |
| intro-late, dialogue @ all four | diff | not checked | I did not open these two diffs. Dialogue shares the level-block flag. |
| stats motion | jump x7 | not attributed | the stats screen filmstrip; I did not open the filmstrips. Hand to lead-dev. |
| damage, death-respawn, boss-fight, level-11 motion | 3 to 5 long frames, worst 50 to 66.7 ms | expected | throttled capture; the same screens without the menu open; no menu involved |

### Checklist per screen

Items: 1 overlap, 2 clipped text, 3 contrast, 4 off-palette colour, 5 z-fighting, 6 floating parts, 7 missing ink outlines, 8 wrong font, 9 blank or black frame, 10 misaligned panels, 11 inconsistent style, 12 stale text, 13 flicker and stutter, 14 layout at size. `p` pass, `F` fail (finding), `-` not checked. Only the stills I opened (level-01 at 1600x950 and 1280x820, level-09 at 1280x820) and the screens I played in Chrome are judged; the other screens carry the same flags and are marked from the flag list, not from a look.

| Screen | Sizes | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| level-01 | all four | F7 | F1 | p | p | p | p | p | p | p | p | p | p | p | p |
| level-02..08, 10, 11 | all four | - | F1 | - | - | - | - | - | p | - | - | - | - | p | - |
| level-09 | all four | - | F1, F6 | - | - | - | - | - | p | - | - | - | - | p | F6 |
| play at 1280x820 (hint open, menu open) | 1280x820 | F2 | F2, F3 | p | p | p | p | p | p | p | F2 | p | p | p | F3 |
| battle, boss, stats, dialogue, damage, death | all four | - | F1 | - | - | - | - | - | p | - | - | - | - | - | - |
| hub, desktop, achievements, laptop | all four | - | - | - | - | - | - | - | p | - | - | - | - | - | - |

## Findings

Status after recheck 2: **1 fixed**, **2 fixed**, **3 fixed**, **4 open (handoff H4)**, **5 fixed**, **6 fixed**, **7 open (handoff H5)**.

Status after recheck 1 (history): **1 fixed**, **2 open (partly fixed, medium)**, **3 open (mostly fixed, low)**, **4 open (handoff H4)**, **5 fixed**, **6 fixed**, **7 open (handoff H5)**.

| # | Severity | Feature | Owner | What happens | How to reproduce | Evidence |
|---|---|---|---|---|---|---|
| 1 | high | level block (R8) | terminal-designer (`src/ui/level-block.ts`); lead-dev if the fix is in `src/styles` | The level block is about 56 to 66 px wide at every size and every level. The title shows `Wires, Chips & Th…` and the objective `Practice 'mv' by…`: the objective is cut to one clipped line, so the block never says what to do. The objective is also not readable in the spec's intent ("name plus a one-line objective"). | Open `/play?nointro=1` at 1600x950 or 1280x820, look under the HP bar. | media/2026-11-25-esc-menu-hud-rework-1.png |
| 2 | high | tips box (R10) | terminal-designer (`src/ui/hud.ts`); lead-dev for `src/styles/game.css` | After `mv lantern ~` the `? HINT` click opens the tip note in the left column, but it is a strip about 50 px wide: one word per line, the text runs below the stage bottom and covers the F2 button. Unreadable at 1280x820. Not checked at 1600x950. Design 6 fallback (2-line clamp) is not in place. The left column does not hold avatar, HP, turn, level block and a tip together. | `/play?nointro=1` at 1280x820, run `mv lantern ~`, click `? HINT`. | media/2026-11-25-esc-menu-hud-rework-2.png |
| 3 | high | Esc menu (R5) | terminal-designer (`src/ui/esc-menu.ts`); lead-dev for `src/styles/esc-menu.css` | At 1280x820 the menu is taller than the stage on a level with a long checklist: the `MENU` tag and the level name are cut off above the panel. At 1600x950 it fits with about 20 px to spare. Needs a `max-height` and an inner scroll. | `/play/chapter-01-kiroween/level-09-task-compose-mesh?nointro=1` at 1280x820, press Esc. | media/2026-11-25-esc-menu-hud-rework-3.png |
| 4 | medium | locked caption (R13) | lead-dev (`src/play`, `src/ui`) with chapters-designer (text in `session-snapshot.ts`) | `LOCKED: <first missing> (+N more)` is built in `session-snapshot.ts` into `room.caption`, but nothing on screen shows `room.caption`: `#stage-caption` is hidden (`esc-menu.css:4`), and a search of `src/play`, `src/ui` and `src/renderer` finds no other use. On levels 1, 2 and 9 the locked door shows red LED, padlock and `LOCKED`, but never says what is missing (the a11y snapshot has no such text either). I could not check whether this was visible before the change. | Level 2 (`level-02-task-ram-heist`), look at the stage and the page text. | media/2026-11-25-esc-menu-hud-rework-4.png |
| 5 | low | Esc menu (R5) | terminal-designer (`src/ui/esc-menu.ts`) | Every checklist row starts `[ ] [ ]`: the menu adds a `[ ] ` text node and the rule description already starts with `[ ] `. The first objective line is also repeated as the first row. | Press Esc on any level. | media/2026-11-25-esc-menu-hud-rework-5.png |
| 6 | medium | exit door badge (R12) | artist (`src/renderer/stage-overlay.ts`) | On level 9 the door is at the right edge and its `LOCKED` badge sticks about 50 px out of the stage: `LOCKED` is cut at the stage edge (flag `text-overflow` on `#stage-wrapper`, culprit `st-lock`, at three sizes). | `/play/chapter-01-kiroween/level-09-task-compose-mesh?nointro=1`, look at the door on the right. | media/2026-11-25-esc-menu-hud-rework-6.png |
| 7 | low | tutorial card / door | lead-dev (`src/play`, `src/styles`) | On level 1 the tutorial card covers the exit door's padlock badge (`overlap` flag at all four sizes). | `/play?nointro=1`, look at the right edge. | `out/visual/level-01@*.png` |

Known, not findings: H1 (`terminal-lab-smoke.mjs`), H3 (`terminal-lab-unit.mjs`, so `verify-chapter.mjs`), H2 (baselines, user only), `selfcheck.ts` rows cannot be run.

## Played by hand

Real Chrome through DevTools MCP at 1600x950 and 1280x820 on `http://localhost:5400`:

- **R1-R4 pass.** Typed `echo half`, Esc opened the centered menu with the terminal visible behind it. Esc closed it and typing `!` then Enter ran `echo half!`: the half-typed line is kept and the focus is back in the terminal. The game clock kept running under the menu (HUD time 0:22 to 0:52).
- **Esc in the code editor.** `edit kiro_story.txt`, then Esc: the editor closed and no menu opened. A second Esc opened the menu.
- **Battle with the menu open, level 9.** Esc during a battle (turn timer 0:11), waited 30 s with the menu open, then another look: game time had moved from 0:24 to 1:56, the turn timer had cycled (0:09), HP went from 150 to 138 and then 126. The enemy turns ran, the menu stayed usable and Esc closed it. Typing after the close worked.
- **Sound.** Volume 40 and mute set in the menu; after a reload the menu showed `Sound: muted` and volume 40. The HUD has no mute or restart button (only `? HINT` and F2). Reset to on and 100 afterwards.
- **Menu Restart level.** Two steps (`Confirm restart`, `Cancel`). Esc cancels the second step and the next open shows step one again. Confirm printed `[RETRY] Reloaded Wires, Chips & The Kiro Ghost` and closed the menu.
- **`restart-level`, `retry`, `--yes`.** Bare run printed the exact `[RESTART] This reloads "Wires, Chips & The Kiro Ghost" and drops its progress. Run restart-level again, or restart-level --yes, to confirm.` line and cost one enemy turn. `restart-level` then `pwd` then `retry` armed again (expiry by another line). Two `retry` in a row: the second reloaded. `restart-level --yes` reloaded at once. One `retry` after a pause of more than 20 s armed again, as the 20-tick expiry says. `man restart-level` names `restart` as the end-of-chapter command. After a reload the HUD CMD and TIME counters keep counting; the spec does not say they reset.
- **Back to main menu.** One confirm line (`This level's progress is not saved. Cleared levels are.`, `Leave` and `Stay`); `Leave` went to `/chapters.html?chapter=chapter-01-kiroween&level=level-01-tutorial-awakening`.
- **Exit door.** Locked (levels 1, 2, 9): red LED, padlock and `LOCKED` badge. After `kill -9 1011` on level 1 the log says `[EXIT GATE UNLOCKED] cd hub_uplink is now open!` and the door in the right of the room shows green LEDs and no padlock; it is dark and small. No neighbour column on any screen I opened.
- **Boss, level 11.** No door in the room. `man exit` says there is no door on the last level and that `exit` ends the chapter.
- **Hint in the dark.** On level 1 before the lantern, `? HINT` showed no note. I did not check whether that is intended.
- **Not tried by hand:** the end-of-chapter `restart` command (see above), a dead hero with `restart-level`, CPU-throttled traces.

## Recheck 1 (after fix round 1)

Fixes under test: level block 156 px wide with 2-line title and 3-line objective clamps (`esc-menu.css`); tips box 300 px wide, max-height 40vh, under the level block (`game.css`); Esc menu `preventScroll`, scroll reset, objective hidden when the checklist repeats it, one `[ ]` per row (`esc-menu.ts`); LOCKED badge x clamped into the stage (`stage-overlay.ts`). No game file or baseline was touched by me.

### Commands and calls

| Command / call | Result |
|---|---|
| `npm start` / `npm stop` | exit 0 / 0, port 5400 |
| `node scripts/harness/visual-audit.mjs --help` | exit 0, but the script has no help: it ran a full audit and printed its flag list (not read; superseded by the scoped run) |
| `node scripts/harness/visual-audit.mjs --screens level-09 --sizes 1600x950,1280x820,1920x1080,1024x768` | exit 0, 4 captures, 13 flags, 18 s; `summary.json` read |
| Chrome DevTools MCP: `new_page`, `resize_page` (1280x820, 1600x950, 1024x768), `navigate_page`, `type_text`, `click`, `press_key`, `wait_for`, `take_snapshot`, `take_screenshot` | all returned; screenshots in `docs/qa/media/` |
| `cp` of 5 screenshots to `docs/qa/media/` | exit 0 |

Not run: `editor-smoke.mjs`, `laptop-lab-smoke.mjs` (nothing in their area changed, as the lead said), `npm run quality` and the other gates (the lead asked for a visual recheck only). Console messages were not listed this round.

### Results per finding

| # | Status | What I saw |
|---|---|---|
| 1 level block | **fixed** | Card is now about 170 px wide at 1280x820, 1600x950 and 1024x768. Title reads on 2 lines (`Wires, Chips & The Kiro Ghost`), objective on 3 lines, ending `(`mv…` (clamped with an ellipsis, so the command in the objective is still cut). Nothing overlaps the avatar card; the VIBECODER drawer sits beside it, and the HUD cells start further right. On level 9 the 2-line title ends `Buffer Shield & Multi-…` and the objective `Starve `port_hijack.bin` by making `proxy.buf`…`. The audit still reports `text-overflow` for `b#level-block-title` (overflowY 14) and `span#level-block-objective` (overflowY 24) at all four sizes on level 9: this is the line clamp working (hidden overflow), expected, not a defect. |
| 2 tips box | **open, partly fixed (medium)** | Width is fixed: 300 px, readable text. At 1280x820 the box starts under the level block (y about 237) but the stage is only about 250 px high below that, so the box runs past the stage bottom: of the rung 3/3 text and 3 objectives, the second row is cut and the third is not visible (`Read Kiro Ghost's story...` half under F2). It still covers the F2 button. The paper tag at the top of the box is half hidden behind the bottom of the level block. At 1600x950 the box fits inside the stage; the last objective line is cut by about a line (`kill -9 1011` half visible) and `click to close` is visible. F2 is still covered. It does not touch HP, turn or the avatar; it overlaps only the bottom 10 px of the level block's shadow. Max-height 40vh is larger than the space under the block at 1280x820 (about 250 px); it needs a clamp of the available stage height (about 30vh), an inner scroll, or a position that leaves F2 free. Owner: lead-dev for `game.css`, terminal-designer for `hud.ts`. Evidence: media/2026-11-25-esc-menu-hud-rework-r1-hint-1280.png, ...-r1-hint-1600.png |
| 3 Esc menu on level 9 | **open, mostly fixed (low)** | At 1280x820 the MENU tag and the level name now show from the top, and the checklist reads in full. The menu box ends at the stage bottom: `Back to main menu` is cut at its lower border by roughly 10 to 15 px (the box scrolls inside, I did not scroll it). So it is still too tall by about 15 px. Its content (tag, name, path, 4 objectives, BUGS, sound row, 2 buttons) would fit with one fewer line or a 8 px smaller padding. Evidence: ...-r1-menu-1280.png. |
| 4 locked caption | **open, handoff H4** | Not retested, as agreed (no UI surface for `room.caption`; tracked in `tasks.md`). |
| 5 double marker | **fixed** | Each row has one `[ ]`, and the first objective is no longer repeated above the list. |
| 6 level 9 badge | **fixed** | `LOCKED` badge sits at x 1200 to 1262, inside the stage (right edge 1272) at 1280x820. The scoped audit on level-09 shows no `text-overflow` flag on `#stage-wrapper` or `.st-overlay` at any of the four sizes. Its only flags are the level block clamp (above), `div#terminal-panel` at 1600x950 (3 px xterm rows, unchanged from pass 1, not part of this change) and `diff` (design change, no approved baseline: H2). |
| 7 tutorial card over padlock | **open, handoff H5** | Not retested. On level 1 the card still sits at the stage right edge; the level-01 audit overlap flag was not rerun this round. |

### Hero card at level 1

- 1280x820: avatar card plus VIBECODER drawer fits (drawer ends at x 427, HUD cells start at x 595). Pass.
- 1024x768: the drawer ends at x 343 and the HUD cells wrap to two rows starting x 490, so nothing collides. NPC dialog docks right (GORK) and does not touch the card. Pass.
- Evidence: ...-r1-level1-1280.png, ...-r1-level1-1024.png.

### Checklist changes

| Screen | Sizes | Item | Before | Now |
|---|---|---|---|---|
| level-01..11 | 1280x820, 1600x950, 1024x768 (level 1 opened) | 2 clipped text | F1 | p (clamp, readable; objective ends with an ellipsis by design) |
| level-09 | all four | 14 layout at size, 2 | F6 | p (no stage-wrapper flag) |
| play, hint open | 1280x820 | 1 overlap, 2 clipped text, 10 misaligned | F2 | F2 (box cut at the stage bottom, covers F2, tag under the level block) |
| play, hint open | 1600x950 | 1 overlap, 2 | not checked | F2 (covers F2; last line slightly cut) |
| play, Esc menu | 1280x820 | 2 clipped text, 14 | F3 | F3, smaller (about 15 px of the last button) |

### Verdict after recheck 1

FAIL (4 open). Defects: #2 (medium, lead-dev `game.css` / terminal-designer `hud.ts`) and #3 (low, terminal-designer / lead-dev `esc-menu.css`). Handoffs: #4 (H4) and #7 (H5). Fixed: #1, #5, #6.

## Recheck 2 (after fix round 2, last round)

Fixes under test (CSS only, by lead-dev; `git diff --stat -- src/styles` showed `game.css` changed): `.hint-note` now has `max-height: 200px` and `overflow-y: auto` (`game.css` 436-447); the Esc menu is tighter (`esc-menu.css`: padding, gaps, 12px font, smaller buttons). I touched no game file and no baseline.

### Commands and calls

| Command / call | Result |
|---|---|
| `npm start` / `npm stop` | exit 0 / 0, port 5400 |
| Chrome DevTools MCP: `new_page`, `resize_page` (1280x820, 1600x950, 1024x768), `navigate_page` (level 1, level 9, one reload), `take_snapshot`, `type_text` (`mv lantern ~` + Enter), `click` (`? HINT`), `press_key` (Escape), `take_screenshot` | all returned; 8 screenshots copied to `docs/qa/media/2026-11-25-esc-menu-hud-rework-r2-*.png` |
| `cp` of 8 screenshots to `docs/qa/media/` | exit 0 (the first attempt used wrong source names and copied nothing, exit 1; repeated with the right names) |

Not run: the visual audit, `npm run quality` and the other gates (the lead asked for a visual recheck of CSS only; no source or spec changed). Console and network lists were not read this round.

### Tip box (finding 2)

| Case | Size | Result |
|---|---|---|
| Level 1, after `mv lantern ~`, `? HINT` | 1280x820 | **pass.** Box is about 300 px wide, from y 237 to 440, inside the stage (stage bottom y about 490). F2 (y 450-472) is not covered. Text is readable and scrolls inside: rung 1/3 text is cut at the bottom edge of the box (`[ ] Practice mv by pocketing the`), the rest is reached by scrolling. The orange HINT tag is half hidden behind the bottom of the level block (cosmetic, same as in recheck 1). Evidence: media/...-r2-hint-1280-l1.png |
| Level 1, same | 1600x950 | **pass.** Box y 240 to 437, F2 (y about 541) free, rung 2/3 text and the objective fit, last line ends with `starter_ram_8gb.dimm ~')`. Evidence: ...-r2-hint-1600-l1.png |
| Level 9, `? HINT` | 1600x950 | **pass.** Box y 240 to 437, F2 free, text scrolls inside (cut after `[ ] Fix` on the second objective). `LOCKED` badge inside the stage. Evidence: ...-r2-hint-1600-l9.png |
| Level 9, `? HINT` | 1280x820 | **pass.** Box y 237 to 437, F2 free, scrolling text. Evidence: ...-r2-hint-1280-l9.png |

Observation, not a finding: at 1280x820 on level 9, two of my first clicks on `? HINT` (right after a resize and after a reload) showed no note in the screenshot, and the third click showed rung 2/3, so the first click had opened and advanced the ladder. At 1600x950 and on level 1 the first click showed the note. I could not tell whether the note closes by itself or my screenshot came too late; resizing the window also closed it once. A click on `? HINT` with the note open advances the rung (rung 3/3 showed in the next screenshot) instead of closing it. I did not look into it further. Hand to lead-dev if wanted; it does not change the verdict.

### Esc menu (finding 3)

Pixels that do not fit: none in any case. Every menu shows the MENU tag, the level name, the path, the checklist, BUGS, the sound row, Restart level, Back to main menu and Back to game (Esc), with space between the last button and the stage bottom.

| Level | Size | Menu top to bottom | Stage bottom | Cut |
|---|---|---|---|---|
| 9 | 1280x820 | y 52 to 447 | about 490 | 0 px |
| 9 | 1024x768 | y 35 to 432 | about 460 | 0 px |
| 1 | 1280x820 | y 62 to 438 | about 490 | 0 px |
| 1 | 1024x768 | y 44 to 422 | about 460 | 0 px |

The menu opened with the title visible every time and needed no scroll. On level 9 at 1280x820 the tip note was still open behind the menu (the menu is on top and legible). Evidence: ...-r2-menu-1280-l9.png, ...-r2-menu-1024-l9.png, ...-r2-menu-1280-l1.png, ...-r2-menu-1024-l1.png.

### Status of every finding

| # | Status | Note |
|---|---|---|
| 1 level block | fixed (recheck 1) | seen again in every screenshot this round: 2-line title, clamped objective |
| 2 tips box | **fixed** | ends above F2, inside the stage, scrolls, at both sizes and levels 1 and 9 |
| 3 Esc menu | **fixed** | 0 px cut at 1280x820 and 1024x768 on levels 1 and 9 |
| 4 locked caption | open, handoff H4 | not retested |
| 5 double marker | fixed | rows show one `[ ]` |
| 6 level 9 badge | fixed | `LOCKED` inside the stage at 1280x820 and 1600x950 |
| 7 tutorial card over padlock | open, handoff H5 | not retested |

### Checklist changes

| Screen | Sizes | Item | Before | Now |
|---|---|---|---|---|
| play, hint open (levels 1 and 9) | 1280x820, 1600x950 | 1 overlap, 2 clipped text, 10 misaligned | F2 | p (scroll inside the box is by design) |
| play, Esc menu (levels 1 and 9) | 1280x820, 1024x768 | 2 clipped text, 14 layout at size | F3 | p |

### Final verdict

**PASS.** Open items are only the known handoffs: H1 (`terminal-lab-smoke.mjs`, `#hud-mute` check), H3 (`terminal-lab-unit.mjs`, `orch.onHintOpened`), H4 (finding 4, locked caption has no surface), H5 (finding 7, tutorial card over the level 1 padlock) and H2 (visual baselines, approved by the user only). No defect is open.
