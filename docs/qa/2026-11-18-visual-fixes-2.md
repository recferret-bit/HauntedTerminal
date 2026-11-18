# QA 2026-11-18: visual fixes (third pass, layout fixes)

Branch: agent/visual-findings-fix (uncommitted: `src/styles/game.css`, `src/styles/landing.css`, `src/renderer/stage-overlay.css`, `src/renderer/stage-overlay.ts`)  ·  Asked by: lead-dev  ·  Scope: full visual audit after the 1024x768 layout fixes, plus the tutorial `OK DONE` stamp.

## Verdict

FAIL (1 finding, low: finding 3, HUD wrap on level 07 @1280x820, owner lead-dev). Findings 1 and 2 are fixed (re-verified, see "Re-check after the `game.css` change" below). The `OK DONE` stamp is still not captured.

Earlier text of this pass (kept for the record):

Every 1024x768 problem from the last pass is gone from the audit: no `overlap` flag on any screen, no `text-overflow` at 1024x768 (caption, locked-neighbour label, terminal panel 21 px, hub `.tty-mini-line` all clear), and I saw the fixes in the stills. 1280x820, 1600x950 and 1920x1080 do not regress on the five screens I opened. Three new low findings came from looking at things the audit does not capture (tutorial card step 2, stats masthead, a HUD wrap). The stamp could not be captured.

## Checks run

| Command | Exit | Notes |
|---|---|---|
| node scripts/harness/visual-audit.mjs | 1 | full: 80 captures, 20 frame probes, 100 flags (same count as last pass, different mix), 577 s. Exit 1 = flags to explain. No `overlap`, `capture-*`, `not-ready`, `blank-frame`, `black-frame`, `horizontal-scroll` flag. 0 long frames on all 20 probes, worst 16.8 ms |
| npm run quality | 0 | ends `property-tests PASS: 35 properties, seed 20261117`; tsc, root, size, layers, declarative, specs (16), dup (0 clones), agents (14 tests), brands, mcp (12 tests) all ok |
| node scripts/harness/generate-chapter.mjs --verify | 0 | `checked [chapter-01-kiroween]: 11 levels, 0 error(s), 0 warning(s)`; `verified: 11 levels cleared, cmds=64, deaths=0`; `generated/` unchanged in `git status` |
| STACK_PORT=5174 npm start / npm stop | 0 / 0 | 5173 belongs to `/Users/ferretrec/work/reddit/vangame` (`npm start` refused), so I used 5174 and stopped it |

Chrome DevTools MCP calls: `new_page` (`http://localhost:5174/play/chapter-01-kiroween?nointro=1`), `wait_for` (`TUTORIAL`, `AGENT PROMPT`: found), `resize_page` (1280x820, 1024x768), `navigate_page` reload, `type_text` `ls` + Enter (twice), `take_screenshot` (twice, to `scripts/harness/out/qa-visual-fixes-2-1280.png` and `-1024.png`), `list_console_messages` (error, warn): only the Vite websocket errors (`ws://localhost:5174`, expected under the fence). No font or request errors.

Not run: `haunted-forge` `validate_level` / `solve_level` (no level spec changed; `--verify` covers all 11), throttled trace (no stutter: 0 long frames), `--update` (forbidden).

## Re-check after the `game.css` change (`.tut-cmd` wraps, `#titleblock` max-width 28% under 1100 px)

Own server `STACK_PORT=5174 npm start` (5173 is another project), stopped at the end (`stack stopped`). MCP: `new_page`, `resize_page` 1024x768 and 1280x820, `wait_for`, `take_screenshot`, `type_text` `ls`+Enter. Screenshots: `media/2026-11-18-visual-fixes-2-4.png` (1024x768 step 2), `-5.png` (1280x820 step 2), `-6.png` (stats @1024x768 from the audit).

**(a) Step 2 card (`mv starter_ram_8gb.dimm ~`).**
- 1024x768: the command box is inside the card and wraps to two lines (`mv starter_ram_8gb.dimm` / `~`); nothing is cut at the right edge. The speech bubble also shows the command whole. The card (right edge, y 248 to 415) covers the lower half of the big `LOCKED` sign, the right edge of the locked door and the `hub_uplink` label. The `CRT / PIXEL / INK / STORM` toggles are below it and not covered (hazard tape sits behind `CRT`, as before). `LOCKED` badge on the door, hero, pickups and HUD are clear.
- 1280x820: command box inside the card, wrapped to three lines (`mv` / `starter_ram_8gb.dimm` / `~`). The card (y 278 to 440) sits just under the big `LOCKED` sign (sign fully visible), covers the right cable of the door and the `hub_uplink` label. Toggles clear.
- Verdict: finding 1 fixed (no clipped command, no covered toggle). Remaining: the card hides the `hub_uplink` label while step 2 shows. It is a transient tutorial card; I judge it acceptable and not a new finding. Say so if you want it moved.

**(b) Stats card @1024x768.** `node scripts/harness/visual-audit.mjs --screens stats --sizes 1024x768` worked (exit 0, 62 s; flags: `diff`, stats motion `jump` as before). In the still the masthead (`HAUNTED TERMINAL`, x 28 to 224) and the caption (`ISSUE CLEAR // Kiroween: Open / Weights & Family Ties`, two full lines, ends x 292) are clear of the results card (starts x 297). The HUD row (y 25 to 48) is above the card (y 52). The card covers `TACTICAL`, which is a modal and expected. Diff image opened: red is the masthead, caption and HUD cells, plus the card text from a one-pixel text shift; nothing broken. Finding 2 fixed.

**(c) `OK DONE` stamp: still not captured.** I typed `ls` + Enter and took the screenshot as the very next call (`media/2026-11-18-visual-fixes-2-4.png`). It already shows step 2/6 and no stamp: the type-then-screenshot round trip is longer than the 1100 ms stamp. Impossible with this toolset. A person must press `ls` on level 01 and look, or `tutorial.ts` (`terminal-designer`) needs a debug hold.

Gates re-run: `npm run quality` exit 0 (`property-tests PASS: 35 properties`); `node scripts/harness/generate-chapter.mjs --verify` exit 0 (`11 levels cleared, cmds=64, deaths=0`).

## Tutorial stamp (`OK DONE`): not captured

I typed `ls` + Enter on level 01 at 1280x820 and at 1024x768 and took a screenshot right after each. Both screenshots already show step 2/6 (`TYPE mv starter_ram_8gb.dimm ~`). The stamp lives `STAMP_MS = 1100` ms (`src/ui/tutorial.ts` line 31) and the MCP type-then-screenshot round trip is longer than that, so I never saw it. I cannot say whether it reads well, is clipped, or covers the command. A person should press `ls` on level 01 at both sizes and look, or `tutorial.ts` needs a debug hold. Evidence of the step 2 card: `media/2026-11-18-visual-fixes-2-3.png` (1280x820) and `-1.png` (1024x768).

## Visual audit

### Previously open items

| Item | Verdict | Evidence |
|---|---|---|
| stage-caption ellipsis, all levels @1024x768 | fixed | no `text-overflow` flag at 1024x768 on any level; caption not cut in the stills I opened |
| masthead over HUD (levels 04/07/10, dialogue) @1024x768 | fixed | no `overlap` flag; level-04 and level-07 stills at 1024x768: masthead ends at x=224, HUD starts at x=307 or later |
| tutorial card over `.st-lock` (level-01) @1024x768 | fixed for step 1 | level-01 still: `LOCKED` badge and `hub_uplink` label are visible beside the card. Step 2 is not fixed, see finding 1 |
| `.st-ncard.locked .lb` cut (level-07) | fixed | level-07 @1024x768 shows `sector_docker_forge` whole; also whole at 1280x820 and 1920x1080 |
| hub `.tty-mini-line` overflow @1024x768 | fixed | no `text-overflow` flag on hub; the lines wrap inside the box (hub stills at 1024 and 1280). The page is taller, see hub row below |
| `COREDUMP!` over the padlock (death-respawn) | fixed | death-respawn @1024x768: `COREDUMP!` sits at the top centre; both padlocks and their `LOCKED` badges are clear. Same at 1280x820 and 1920x1080 |
| terminal-panel text-overflow 21 px @1024x768 | fixed | no flag at 1024x768 now. At 1024 the prompt row (`dev@haunted:...$`) is fully visible on level-01 and level-04. No row the player needs is hidden |
| terminal-panel text-overflow 3 px @1600x950 | expected | last xterm row sits 3 px past the panel edge; the row is empty (screen height `div` after the prompt), so no text is hidden. Unchanged from earlier reports |
| stats@1024x768 summary says `same`, log says `diff` | resolved | this run the summary has a real `diff` and the diff image shows it (opened): the masthead changed to two lines and the HUD cells narrowed. See finding 2 |

### Every flag

| Screen @ size | Flag | Verdict | Reason or finding # |
|---|---|---|---|
| level-01..11, dialogue, damage, death-respawn, boss-fight, stats @1600x950 | text-overflow `#terminal-panel` 3 px | expected | empty last row, see above |
| level-01..11 @1600x950, @1280x820, @1024x768 | diff | intended | masthead now has a sub line (`KIROWEEN SPECIAL ISSUE · CHAPTERS · * STEAM`), HUD cells re-flowed, tutorial card slimmer, locked label wraps. level-01 @1024x768 diff opened: red is the masthead, HUD cells, bubble, tutorial card and `LOCKED`/`hub_uplink` label, and nothing else; the terminal and the room are unchanged |
| level-03 @1920x1080 | diff | not opened | only 1920 level with a diff; not opened, so unjudged. Other levels @1920x1080 are `ok` |
| dialogue, damage, death-respawn @ all four sizes | diff | intended (still opened for death-respawn; dialogue and damage stills not opened) | same masthead and HUD change; death-respawn also shows `COREDUMP!` moved |
| boss-fight @1600x950, @1280x820, @1024x768 | diff | not opened | same masthead and HUD change expected; unjudged |
| stats @ all four sizes | diff | intended at 1024 (diff and still opened); others not opened | masthead two lines, HUD cells narrower. Finding 2 |
| intro-late @ all four sizes | diff | not opened | still the pending meme-label change from the earlier passes (not part of this branch's CSS); unjudged |
| hub @ all four sizes | size-changed | intended, not a regression | the baseline is a different page height now: `.tty-mini-line` wraps, so the page is taller (4841 px at 1024, 4142 px at 1280). There is no diff image; a person must look and approve |
| hub @ all four sizes | font-fallback x3 (Menlo 315, `.SF NS` 6, Hiragino Sans 1) | expected | landing page text (`<p>` about trophies, the `comic-btn` GitHub link, the `⇄ BROWSER ↔ DESKTOP` line): the user's page (`pages/index.html`, `src/hub/`); same family list as last pass |
| laptop @ all four sizes | text-overflow `.lt-screen`, `.lt-taskbtns` | expected | scrolling quest list and 2 px taskbar label, by design as before |
| stats motion | jump x3 | expected | SIGKILL burst and RANK S switch, stepped 12 fps |
| level-01 motion | (no flag this run) | n/a | |

Not flagged this run: the `/favicon.ico` 404 on intro-early and intro-late (finding 4 of the last report); I did not look into why.

### Screens and files I opened

Stills: level-01 @1024x768, @1280x820, @1920x1080; level-04 @1024x768, @1280x820, @1920x1080; level-07 @1024x768, @1280x820, @1920x1080; death-respawn @1024x768, @1280x820, @1920x1080; stats @1024x768; hub @1024x768, @1280x820.
Diff images: `level-01@1024x768-diff.png`, `stats@1024x768-diff.png`.
Filmstrips: none this pass (frame timing clean, 0 `jump` flags except stats).
Not opened: every other still and diff (level-02, 03, 05, 06, 08..11 at all sizes, level-04/07/death-respawn @1600x950, dialogue, damage, boss-fight, intro-late, laptop, hub @1600x950 and @1920x1080, all other diff images).

### Checklist per screen

`p` pass, `F<n>` fail with finding, `-` not opened or n/a. Items 1 to 14 as in the QA prompt.

| Screen | Sizes opened | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| level-01 | 1024, 1280, 1920 | p | p | p | p | p | p | p | p | p | p | p | p | p | p |
| level-01 step 2 (MCP) | 1024, 1280 | F1 | F1 | p | p | p | p | p | p | p | p | p | p | - | F1 |
| level-04 | 1024, 1280, 1920 | p | p | p | p | p | p | p | p | p | p | p | p | p | p |
| level-07 | 1024, 1280, 1920 | p | p | p | p | p | p | p | p | p | F3 | F3 | p | p | p |
| death-respawn | 1024, 1280, 1920 | p | p | p | p | p | p | p | p | p | p | p | p | p | p |
| stats | 1024 | p | F2 | p | p | p | p | p | p | p | p | p | p | p | p |
| hub | 1024, 1280 | p | p | p | p | p | - | p | F(user) | p | p | p | p | p | p |
| other screens | not opened | - | - | - | - | - | - | - | - | - | - | - | - | - | - |

## Findings

Final status: **1 fixed (re-verified)**, **2 fixed (re-verified)**, **3 open** (not re-run; the re-check did not touch level 07). The stamp stays unchecked.

| # | Severity | Feature | Owner | What happens | How to reproduce | Evidence |
|---|---|---|---|---|---|---|
| 1 | low | tutorial card | lead-dev (`src/styles/game.css`); `src/ui/tutorial.ts` is `terminal-designer`'s if the card markup must change | After `ls` the card moves to step 2 and grows (3-line command). At 1024x768 the command `mv starter_ram_8gb.dimm ~` runs to the right edge of the card/viewport (the dark command box is cut at the right), the card covers the `hub_uplink` label and the `CRT` toggle. At 1280x820 the card covers `hub_uplink` and the bottom of `LOCKED`. The audit only captures step 1, so it never flags this | play level 01, type `ls`, 1024x768 and 1280x820 | media/2026-11-18-visual-fixes-2-1.png, -3.png |
| 2 | low | stats screen @1024x768 | lead-dev (`src/styles/game.css`) | The masthead now wraps to two lines (`ISSUE CLEAR // Kiroween: Open Weigh...`) and the end of the text is behind the results card, so it reads as cut. The HUD cells are also narrower and partly hidden by the card. Before, the masthead was a single line | audit `--screens stats --sizes 1024x768` | media/2026-11-18-visual-fixes-2-2.png |
| 3 | low | HUD @1280x820 | lead-dev (`src/styles/game.css`) | On level 07 the timer cell (`0:01`) wraps to the button row, left of `TACTICAL`; on level 04 and level 01 it stays on the first row. Not an overlap; the HUD layout differs by level (cell widths) | audit `--screens level-07 --sizes 1280x820`, compare with level-04 | `scripts/harness/out/visual/level-07@1280x820.png` |

Open question, not filed: the `OK DONE` stamp (see above). It is unchecked, not passed.

## Baselines that need the user's approval

I ran no `--update` and touched nothing in `docs/qa/baselines/`. Every entry below changed against its baseline. Marked: **(opened)** = I looked at the still and judged it intended, **(diff opened)** = I opened the diff image too, **(not opened)** = I did not look; look before approving.

- level-01 @1600x950 (not opened), @1280x820 (opened), @1024x768 (diff opened)
- level-04 @1280x820 (opened), @1024x768 (opened); @1600x950 (not opened)
- level-07 @1280x820 (opened), @1024x768 (opened); @1600x950 (not opened)
- level-02, 03, 05, 06, 08, 09, 10, 11 @1600x950, @1280x820, @1024x768 (not opened)
- level-03 @1920x1080 (not opened)
- death-respawn @1280x820, @1920x1080, @1024x768 (opened); @1600x950 (not opened)
- stats @1024x768 (diff opened; approve after finding 2 is settled); stats @1600x950, @1280x820, @1920x1080 (not opened)
- dialogue @1600x950, @1280x820, @1920x1080, @1024x768 (not opened)
- damage @1600x950, @1280x820, @1920x1080, @1024x768 (not opened)
- boss-fight @1600x950, @1280x820, @1024x768 (not opened)
- intro-late @1600x950, @1280x820, @1920x1080, @1024x768 (not opened; unrelated to this branch's CSS, pending since the earlier passes)
- hub @1600x950, @1280x820 (opened), @1920x1080, @1024x768 (opened): `size-changed` (no pixel diff); the user's page, approve only if the taller layout is wanted

**Final list after the re-check.** Diffs/stills I opened and judge intended, so approvable: level-01 @1024x768 (diff opened), level-01 @1280x820 and level-04, level-07, death-respawn @1280x820 and @1024x768 (stills opened), stats @1024x768 (still and diff opened again after the fix; finding 2 is fixed, approve). Level-01 baselines show step 1 only; step 2 is now judged fine, so finding 1 no longer blocks approval.
Approve only after looking (I did not open them): level-01 @1600x950, level-04/07 @1600x950, level-02, 03, 05, 06, 08..11 (three sizes), level-03 @1920x1080, death-respawn @1600x950, stats @1600x950, 1280x820, 1920x1080, dialogue, damage, boss-fight (all sizes), intro-late (all sizes, pending since earlier passes, not from this branch), hub (all four, `size-changed`, the user's page).
Hold: level-07 @1280x820 until finding 3 is decided (the HUD timer wrap is in that still).

## Played by hand

Level 01 at 1280x820 and 1024x768: `ls` (correct command) advanced the card to step 2/6, the bubble changed to the Kiro Ghost line, the terminal printed `hub_uplink/ kiro_story.txt starter_ram_8gb.dimm`. No typos or wrong commands tried this pass. Console: only the expected Vite websocket errors.
