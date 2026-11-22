# QA 2026-11-22: tutorial-rework retest

Branch: agent/tutorial-rework  ·  Asked by: lead-dev  ·  Scope: requirements 1 to 9 of `.kiro/specs/tutorial-rework/`, the cases the first report (`2026-11-22-tutorial-rework.md`) did not cover. The date is taken from the previous report's file time; my shell has no `date`.

## Verdict

FAIL (7 findings: 1 high, 4 medium, 2 low). Every gate passes and the main path works (early `mv`, jumps to levels 2 and 3, level 1 to level 2 with 0 deaths). The FAIL is for the `ls` lock being easy to get around (finding 1), the floor restart leaving a half-reset level (finding 2) and the early-`mv` story and tutorial text running out of order (findings 3, 4).

## Checks run

| Command | Exit | Notes |
|---|---|---|
| `node scripts/harness/generate-chapter.mjs --verify` | 0 | 11 levels, 0 errors, 0 warnings, 11 cleared, deaths=0 |
| `node .kiro/skills/chapter-implementer/scripts/verify-chapter.mjs` | 0 | 5 of 5 steps PASS; includes editor-unit-test (11 suites), terminal-lab-unit (58), terminal-lab-api-test (14), terminal-lab --all (29) |
| `node scripts/harness/editor-smoke.mjs` | 0 | "chapter editor smoke OK" |
| `node scripts/harness/terminal-lab.mjs --all` | 0 | 29 labs passed (also run inside verify-chapter) |
| `node scripts/harness/property-tests.mjs --only chapters,gameplay` | 0 | 26 properties, seed 20261117. Includes the lock, `dialog_box` timing, jump-grants-lantern properties |
| `node scripts/harness/visual-audit.mjs --screens level-01 --sizes 1280x820,1024x768` | 1 | 2 captures, 7 flags, 51 s; motion 0/120 long frames, worst 16.8 ms. Flags explained below. |
| `npm start` | not used | `http://localhost:5173` answered with another project (page title "TerraAgent - Hub"), so I used `STACK_PORT=5174 npm start` (exit 0) and `STACK_PORT=5174 npm stop` (exit 0) |
| `git status --short` after the gates | 0 | empty: `generate-chapter.mjs --verify` rewrote `catalog-data.ts` with identical bytes |

Not run: `npm run quality` (not asked), `haunted-forge` `validate_level` / `solve_level` (the `--verify` solve covers all 11 levels), the full visual audit (by request).

## MCP calls (chrome-devtools, all on `http://localhost:5174`, nothing else opened)

`new_page` x1 (on 5173, the wrong project; navigated away), `navigate_page` x10 (url x6, reload x4), `take_snapshot` x5 (three inline, two to file), `type_text` x38 (commands below), `click` x2 (TACTICAL, RESTART FLOOR), `wait_for` x3 (one timed out on purpose after 15 s), `resize_page` x2 (500x740 and back to 1280x800), `take_screenshot` x13 to `scripts/harness/out/qa-retest-*.png`, `list_console_messages` x1 (errors and warnings). Not used: `press_key`, `emulate`, performance traces.

## Visual audit flags (level-01)

| Screen @ size | Flag | Verdict |
|---|---|---|
| 1280x820 | `capture-unstable` ("frozen screenshot did not answer within 15000 ms") | not checked: a run flag. The still was taken on the real clock instead of the stepped one. Hand to `lead-dev` (owner of the audit). I judged this size by hand in Chrome instead. |
| 1280x820, 1024x768 | `overlap` `#hud` vs `.st-ncard.locked` (238x30 and 189x35 px) | expected: the locked-door card sits under the top bar on every level (same as the first report). |
| 1280x820, 1024x768 | `overlap` `#tutorial-card` vs `.st-ncard.locked` (238x126, 192x129) | expected: the card is meant to sit on the door card. The first report's dialog box over the hero at 1024x768 is gone: the box is top-left, I looked at the 1024x768 still. |
| 1280x820, 1024x768 | `diff` (35 % and 35 % of pixels) | expected, needs a person: baselines predate the strip and the dark start. Intended change. Baselines are a person's. I did not open the diff PNGs (the stills show the intended picture). |

## Findings

| # | Sev | Feature | Owner | What happens | Repro | Evidence |
|---|---|---|---|---|---|---|
| 1 | high | `ls` lock (req 4, 5) | chapters-designer (spec `script.locks` and which commands count), terminal-designer if a shell change is needed | The lock covers `ls` only. Without the lantern a player can still: `find .` prints every file in the room (`starter_ram_8gb.dimm`, `hub_uplink`, ...); `kiro scan` lists the threat (glitch_spark.exe, PID 1011, HP) and switches on the PS_XRAY overlay, so the room view lights up; `cat kiro_story.txt` and `mv starter_ram_8gb.dimm ~` work blind (RAM goes to 16 GB, HP 110, the sector objectives tick `[x]`); `ps` and `kill` work. `hank` and Kiro's lines say "then `ls`", which implies the room is not meant to be explored yet. Refused correctly: `ls`, `ls -a`, `ls ~` ("too dark to see anything"), `tree` (not a command). `help`, `man mv`, `hank`, `tutorial skip` printed sensibly, no crash. Whether `find`, `kiro scan` and blind `mv` should be locked is a design call: the requirement says only `ls`. I did not see `/bin/ls` output (scrolled off), so it is not tested. | Fresh level 1, never `mv lantern ~`: type `find .`, then `kiro scan` | `docs/qa/media/2026-11-22-tutorial-rework-retest-3.png` (`find .` output), `-1.png` (after `kiro scan`: threat list, objectives ticked, RAM 16) |
| 2 | medium | floor restart (req 1, 5) | chapters-designer (`session-*.ts` restart), lead-dev if it is in `src/game/session.ts` | After `RESTART FLOOR` with the lantern held: the monologue replays, the log says "It is pitch black... No lantern, nothing", but the room is lit, the hero holds the lantern, the strip still shows LANTERN highlighted, and `ls` works (the lock does not come back). The lantern file is back on the floor (and `mv lantern ~` collects it again, harmless). The tutorial card stays at 2/7 until the prompts re-run, then jumped to 3/7 after `ls`; the Kiro intro lines and the tutorial 1/7 text print again. HUD time and CMD are not reset (1:07, CMD 7), which may be intended. So the inventory is not reset but the level text is. Either reset the inventory to `startItems` on restart or skip the dark monologue. I did not test the typed `restart` command. | Level 1: `mv lantern ~`, click RESTART FLOOR | `-2.png` |
| 3 | medium | early `mv lantern ~` (before Kiro at tick 13) | chapters-designer | Kiro still appears and speaks, nothing is broken (dark flag off, hero holds the lantern, strip LANTERN highlighted, card at 2/7, CMD 1). But the story reads wrong: after the lantern is taken, Kiro's entrance says "Easy, Vibecoder! I'm Kiro. I found you in the dark." and the log then prints "TUTORIAL 1/7: It is pitch dark! Pull the lantern..." after the 2/7 line and after his ghost line "There! The lantern lights up the wires". The on-stage bubble also shows "PROMPT 1/7 ... mv lantern ~" next to the 2/7 card. Timer showed 0:14 when I looked, so I typed about 8 to 12 s in (tool latency, not 3 s); a faster typist would be earlier still. | open the level, run `mv lantern ~` within about 10 s | `-5.png` |
| 4 | low | tutorial text order | chapters-designer | Same cause as 3: a timed 1/7 prompt fires after step 2 is already done. The card is right (2/7) but the log and bubble are stale. | as 3 | `-5.png` |
| 5 | medium | dialog box at a narrow width (req 2) | terminal-designer (`src/ui` dialog box), lead-dev (`src/styles`) | The page cannot go below 500 px wide here (the window stopped at 500x740, so 360 was **not** reached). At 500 px the dialog box covers the HAUNTED TERMINAL banner, the level label and the left part of the HP bar; the HUD cells wrap and overlap the strip. At 1024 px the box also hides the title banner while it shows (only the empty yellow edge remains next to it), which clears when the box hides. | resize to 500x740, open level 1, look at 8 s | `-4.png` |
| 6 | low | achievement toast over the dialog avatar | lead-dev (`src/styles`), terminal-designer | "TROPHY UNLOCKED" toast covers the speaker avatar of the box and the bubble portrait (seen with Kiro's "BOOM!" line and the Anti-Gravy line on arrival at level 2). Short-lived, the text stays readable in the log. | `kill -9 1011` on level 1, `cd hub_uplink` | seen in my screenshots `qa-retest-10.png`, `qa-retest-11.png` (not copied) |
| 7 | low | visual audit run | lead-dev | The 1280x820 still was `capture-unstable` (see above). Not a game finding. | | summary.json |

## What passed

- Level 1 opens dark: near-black room, faint glow on the terminal, hero without lantern; strip shows TERMINAL highlighted, LANTERN and LAPTOP dim. Dialog box top-left with the DEV avatar, then KIRO with his avatar (`-5.png`).
- Kiro is absent at the start and present by about 0:13 (ghost sprite beside the hero in the 0:28 screenshot; gone again after he "flies ahead").
- `ls` after `mv lantern ~` works; strip LANTERN highlighted (orange), the lantern file on the floor disappears.
- Level 2 by URL (`level-02-task-ram-heist`): lit, hero holds the lantern, strip LANTERN highlighted, RAM 16, HP 110, `ls` works. Level 3 by URL: lit, lantern held, RAM 32, SSD 256, HP 120, `ls` works.
- Level 1 played to the end in tactical mode: `mv lantern ~`, `ls`, `mv starter_ram_8gb.dimm ~`, `cat kiro_story.txt`, `ps`, `kill -9 1011`, `cd hub_uplink`: HP never dropped, BUGS 0/1, rank S, level 2 loaded with the strip correct. 0 deaths.
- Console (errors and warnings): only the Vite websocket failure (2 errors), expected under the fence. No page errors, no font errors seen.

## Not tested

- Pause during title cards: no title card appeared (`?nointro=1`), so I did not check that ticks stop or that the 13 s entrance still lands after a pause. In tactical mode the HUD clock kept running (0:33 to 1:03 in 30 s), but I switched tactical on after Kiro had already arrived, so whether tactical freezes the scripted timeline is **not** known.
- A 360 px wide viewport (the window floor was 500).
- Long dialog lines, two lines arriving close together, the box while the terminal is busy, Tab/Enter while a box shows.
- Typed `restart` command; death and respawn on level 1; the first-frame glide of Kiro (I saw him present, not moving in); the lantern pickup "pop" animation on its strip slot (only the state before and after).
- The strip at 1600x950 and 1920x1080, filmstrip frames, diff images, the other nine levels' visual flags, `/bin/ls`, performance traces.

## Handoffs

- chapters-designer: findings 1, 2, 3, 4.
- terminal-designer and lead-dev: findings 5, 6.
- lead-dev: finding 7 and the baselines (a person approves them).

Spec not changed. Screens copied: `docs/qa/media/2026-11-22-tutorial-rework-retest-{1..5}.png` (1 scan leak, 2 restart, 3 `find`, 4 narrow, 5 early `mv`); the rest stay in `scripts/harness/out/qa-retest-*.png`.

## Fixes after this retest (2026-11-22, main session, not the `qa` agent)

| Finding | Fix | Evidence |
|---|---|---|
| 1 `ls` lock bypass (`find`, `kiro scan`) | two more entries in `script.locks` of level 1 (`find`, `kiro`), same `has_item lantern` condition. `cat`, `mv`, `ps`, `kill` stay open on purpose (the tutorial teaches `mv` first). | `self-test.mjs`: `find .` and `kiro scan` refused, X-ray stays off |
| 2 `RESTART FLOOR` half reset | `ChapterState.entryInventory` is saved when a level is entered and restored by `rebootLevel`; the lantern file comes back with the dark start | `self-test.mjs`: after `restartFloor()` the inventory is the terminal only, `room.dark` is true, `ls` is locked again |
| 3 Early `mv lantern ~` | `script.timed[].unless` (new field, four places): Kiro's reminders and the step-1 card are skipped once the lantern is held; his entrance line says "I found you in the wires" | `self-test.mjs`: one Kiro box, no step-1 card after the lantern |
| 4 Narrow viewport | `max-width: 820px`: the dialog box moves to the bottom of the stage, smaller avatar | Chrome at 500x800: box no longer covers the banner or the HP bar |
| 5 Toast over the avatar | at that width the box is at the bottom and the toast stays at the top | same screenshot |

Gates run: `npm run quality` (exit 0; one `jscpd` run was killed by the OS under load, the rerun found 0 clones), `generate-chapter.mjs --verify` (11 levels, 0 deaths), `verify-chapter.mjs` PASS, `editor-unit-test.mjs`, `terminal-lab-unit.mjs`, `terminal-lab.mjs --all` (29), `editor-smoke.mjs`. Still not tested: title-card pause, 360 px, long lines, tactical mode timeline, the typed `restart` command, the pop animation, `/bin/ls`.
