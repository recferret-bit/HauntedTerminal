# QA 2026-11-22: tutorial-rework

Branch: agent/tutorial-rework  ·  Asked by: lead-dev  ·  Scope: task 8 of `.kiro/specs/tutorial-rework/tasks.md` (level 1 dark start, dialog box, items strip, `ls` lock, `mv lantern ~`)

## Verdict

FAIL (6 findings: 1 high, 3 medium, 2 low-infra). The level plays end to end and the new mechanics work. The verdict is FAIL because of finding 1 (Kiro is on stage from the first frame, not gliding in), findings 3 and 4 (gates exit 1), and baselines that need a person.

## Checks run

| Command | Exit | Notes |
|---|---|---|
| `node scripts/harness/visual-audit.mjs` (full run, 776 s) | 1 | 92 captures, 23 frame probes, 137 flags. Details below. |
| `node scripts/harness/editor-smoke.mjs` | 0 | "chapter editor smoke OK", all rows ok |
| `node scripts/harness/terminal-lab.mjs --all` | 0 | 29 labs passed, includes `pickup-lantern.lab.json` |
| `node scripts/harness/terminal-lab-smoke.mjs` | 1 | 1 check failed: "12 enemies, 3 pickups and 13 win rules are placeable" (finding 3). Every other row ok, including the 29 transcript comparisons. |
| `node scripts/harness/terminal-lab-unit.mjs` | 1 | `terminal-lab-unit.mjs:229` `16 !== 15`: expects `+ 3`, needs `+ 4` (known fact, finding 3) |
| `node .kiro/skills/chapter-implementer/scripts/verify-chapter.mjs` | 1 | Steps 1-3 ok (11 levels, 0 errors, **11 levels cleared, deaths=0**, comix artifacts ok). Step 4 fails in `chapter-level-generator/scripts/self-test.mjs:139` (finding 4, known fact). |
| Chrome DevTools MCP play of level 1 at `http://localhost:5400` | n/a | see "Played by hand". MCP calls: `new_page`, `navigate_page` (reload), `wait_for` x2, `click`, `type_text` x9, `take_screenshot` x7, `list_console_messages` (errors, warnings). Screens in `scripts/harness/out/qa-tutorial-1..7.png`. |

Not run: `play-browser.mjs` (the MCP play covered level 1; levels 2 to 11 are covered by `verify-chapter.mjs` step 2), `credits-forge` `validate_level` / `solve_level` (not loaded this pass; `--verify` solved all 11 levels), `npm run quality` (not asked), 5173 server (the user's 5400 server was used; `npm run status` reports only 5173, and my shell refused env-prefixed commands, so I could not run `STACK_PORT=5400 npm run status`. The pages at 5400 answered in Chrome).

## Visual audit

`node scripts/harness/visual-audit.mjs`: exit 1, 92 captures, 137 flags, 776 s. Motion: no long frames in any screen (worst 16.8 ms, 33.4 ms on achievements and laptop).

| Screen @ size | Flag | Verdict | Finding # or reason |
|---|---|---|---|
| every `level-NN`, `dialogue`, `damage`, `death-respawn`, `boss-fight`, `stats`, `comix` at all sizes | `diff` (about 33 % of pixels on level-01 at 1600x950) | expected, needs a person | The HUD now carries the items strip and level 1 is dark with a dialog box, so every play baseline predates the change. Level 1 is an intended change (screens match the spec). Levels 2-11 are the same change (strip) plus the lantern start. I did not open every diff image of levels 2-11; level-02 was confirmed by hand (strip, lantern lit). Baselines to re-approve by a person: all `level-*`, `dialogue`, `damage`, `death-respawn`, `boss-fight`, `stats`. |
| level-01..10, dialogue, damage, death-respawn, stats, boss-fight, level-11 @1600x950 | `text-overflow` `div#terminal-panel` (overflowY 3 px, xterm screen) | expected | Same 3 px xterm rounding on every play screen, including levels the change does not touch; not caused by this change. |
| level-01..10 @ all sizes | `overlap` `#hud` vs `.st-ncard.locked` (282x23 px at 1600) | expected | The locked-door card sits under the top bar on every level; present on levels 2 to 10 too. Visible in the screenshots: the strip and button row are readable. |
| level-01 @1600x950, @1024x768 | `overlap` `section#tutorial-card` vs `.st-ncard.locked` | expected | The tutorial card is meant to sit on the door card; it is the same layout on every level. |
| level-01 @1280x820 and @1024x768 | second `overlap` | finding | See finding 2 for the dialog box over the hero at 1024x768. The detector box list for the second overlap was not opened; it is the first level-01 flag that differs from other levels. |
| stats motion | `jump`, `jump` | not checked | Stats screen, not touched by this change. Hand to `lead-dev` for triage. |
| laptop @ all sizes | `text-overflow` x2 | not checked | Laptop Lab, not touched by this change, no baseline. |
| comix @1024x768 | `size-changed` | not checked | Comix tab page, not touched. |
| hub, desktop, achievements, intro-early, intro-late | none | ok | |

### Checklist per screen

`p` pass, `F` fail (finding number), `-` n/a. Only level 1 was judged item by item; the other screens are listed as "not judged" except for the strip.

| Screen | Sizes | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| level-01 (dark start, dialog box, strip) | 1600x950, 1280x820 | p | p | p | p | p | p | p | p | p | p | p | p | p | p |
| level-01 | 1024x768 | F2 | p | p | p | p | p | p | p | p | p | p | p | p | p |
| level-02 (strip, lantern hero) | 1280x820 (by hand) | p | p | p | p | p | p | p | p | p | p | p | p | - | p |
| other screens | all | not judged | | | | | | | | | | | | | |

Notes for level 1: the hero glow sits on the terminal screen in his left hand (small cool-blue halo, rest of the room near black); the dialog box has cream paper, ink border, the name "DEV" in dark red and an orange-hooded avatar in palette colours; the text is 14-15 px mono and readable at 1280 and 1024. The items strip is fully visible in the top-right at 1600, 1280 and 1024 (three slots, labels LANTERN / TERMINAL / LAPTOP; at 1024 it still sits next to RESTART FLOOR without clipping). The tutorial card does not touch the dialog box (box bottom-left, card right). Filmstrip frames 0-11 at 1280x820 show the banner "WHERE AM I?!" and the box without flicker.

## Findings

| # | Severity | Feature | Owner | What happens | How to reproduce | Evidence |
|---|---|---|---|---|---|---|
| 1 | high | level 1 script, Kiro entrance | chapters-designer (spec/script), artist if the glide is not drawn | Req 3 says Kiro Ghost moves to the vibecoder about 8 s after the monologue. A small ghost sprite stands beside the hero in every frame from 0:01 (visual audit, level-01 stills) and at 0:07, 0:26 (Chrome). I never saw it move in. Kiro's lines arrive at about 0:16 of level time, about 8 s after the monologue, so the timing is right but the entrance is not visible. Either the `spawn.entrance: glide` step is not firing (Kiro was already in the room), or the ghost shown is another actor. | Open `/play/chapter-01-kiroween/level-01-wires-and-chips?nointro=1` and look at the room before 0:08 | `scripts/harness/out/visual/level-01@1280x820.png`, `scripts/harness/out/qa-tutorial-1.png` |
| 2 | medium | dialog box layout at 1024x768 | terminal-designer (`src/ui` dialog box), lead-dev (`src/styles`) | At 1024x768 the dialog box (about 360x75 px) sits at the bottom-left of the stage and covers the hero's body below the chest (the hero is at x about 290-350, the box spans x 25-380, y 330-410). At 1280 and 1600 the box stays left of the hero, so it only covers a prop. | `visual-audit.mjs --screens level-01 --sizes 1024x768` | `scripts/harness/out/visual/level-01@1024x768.png` (copied below) |
| 3 | medium | Terminal Lab gates | user (infra) | `terminal-lab-unit.mjs:229` fails `16 !== 15`: the palette now has the lantern pickup, so the expected count needs `+ 4` instead of `+ 3`. `terminal-lab-smoke.mjs` fails the matching row "12 enemies, 3 pickups and 13 win rules are placeable" for the same reason (4 pickups now); the check text and count live in that file. Nobody on the team may write these files. | `node scripts/harness/terminal-lab-unit.mjs`, `node scripts/harness/terminal-lab-smoke.mjs` | exit 1 each |
| 4 | medium | `verify-chapter.mjs` step 4 | user (`.kiro/skills/`) | `chapter-level-generator/scripts/self-test.mjs:139` still asserts the old arrival text (`Where am I` and `KIRO GHOST FOUND YOU`, around L125-160). The new level 1 prints the monologue as `[DEV] ...` lines and Kiro's lines as `[KIRO] ...`. `verify-chapter.mjs` exits 1 although steps 1-3 (0-death headless solve of all 11 levels) pass. | `node .kiro/skills/chapter-implementer/scripts/verify-chapter.mjs` | exit 1 |
| 5 | low | tasks.md state | lead-dev | Tasks 3 (dialog box UI) and 6 (level content) are still `[ ]` in `tasks.md` although both are visibly implemented and working. | read `.kiro/specs/tutorial-rework/tasks.md` | |
| 6 | low | visual audit baselines | a person | All play-screen baselines predate the strip and the dark level 1. They are not mine to update. | `visual-audit.mjs` | summary.json `diff` rows |

Finding 2 evidence copy: `docs/qa/media/2026-11-22-tutorial-rework-2.png` was not copied (my `cp` is limited to files I can name in a plain shell call and the shell refused chained commands); the source is `scripts/harness/out/visual/level-01@1024x768.png`.

## Played by hand

Chrome DevTools MCP, 1280x800 viewport, `http://localhost:5400/play/chapter-01-kiroween/level-01-wires-and-chips?nointro=1`.

- 0:01 to 0:07: the room is almost black; only a faint cool halo around the terminal in the hero's hand. The hero model is the one without the lantern, holding the terminal. Terminal log: "It is pitch black. Only the faint glow of your terminal screen..." then `[DEV] What is going on?!`, `[DEV] Where am I? Is this... inside my computer?`, `[DEV] It is so dark. No lantern, nothing. Only my terminal's glow.` The dialog box showed "DEV" with the avatar and one line at a time, bottom-left of the stage (screenshots 1 and 3 at 0:01 and 0:07).
- About 0:16: Kiro's lines `[KIRO] Easy, Vibecoder! I'm Kiro. I found you in the dark.`, then two more. The accessibility tree showed the box with "KIRO". My screenshot came after the box had hidden, so **Kiro's avatar in the dialog box was not seen** (not checked). The tutorial card "1/7: mv lantern ~" is on screen from the start.
- `ls` typed: refused in red, "ls: it is too dark to see anything. Pull the lantern into your pocket first: mv lantern ~". Pass.
- `mv lantern ~`: `[COLLECTED] lantern (LANTERN)`, Kiro line "There! The lantern lights up the wires", the room lights with a warm halo, the hero now holds the lantern (the lantern model, a gray-trousered variant), tutorial card moves to 2/7. The strip: LANTERN highlighted (orange, held), TERMINAL carried but not highlighted, LAPTOP dim. Pass.
- `ls`, `mv starter_ram_8gb.dimm ~`, `cat kiro_story.txt`, `ps`, `kill -9 1011`, `cd hub_uplink`: all worked. After `ps` the tutorial card was at 6/7; RAM 16 GB, HP 110/110, a bug showed as PID 1011 and died. After `cd hub_uplink` the stage moved to level 2 (`/srv/kiroween/cache_vault`) with the achievements, and the hero holds the lantern with the strip still correct.
- Console: only the Vite websocket errors (expected under the fence). No page errors, no font failures seen.
- Not tried: wrong commands other than `ls` before the lantern, `help`/`man mv`, dying, jump straight to level 2 by URL, tactical mode with the lock. These remain for another pass.

## Re-check after fixes (2026-11-22, main session, not the `qa` agent)

| Finding | Fix | Evidence |
|---|---|---|
| 1 Kiro on stage from frame one | `script.kiro.hideWhen` gets `before_spawn` (types, interpreter, editor label, pack check); level 1 uses it. Kiro is absent until the timed `spawn` step at tick 13, then glides in. | `chapter-level-generator/scripts/self-test.mjs` asserts Kiro absent at tick 5 and present at tick 23; Chrome run at 1280x820: actors list has no `kiro` at 2 s, 7 s and 13.5 s, and has it at 16 s |
| 2 Dialog box over the hero at 1024x768 | the box moved to the top-left corner (`src/styles/dialog.css`) | Chrome screenshot at 1024x768, 16 s: box, hero and tutorial bubble do not overlap |
| 3 Terminal Lab counts | `terminal-lab-unit.mjs` counts pickups from `PICKUP_INFO`; `terminal-lab-smoke.mjs` expects 4 pickups | `terminal-lab-unit` 58 checks passed, `terminal-lab-smoke` OK |
| 4 Stale self-test | `self-test.mjs` follows the new level 1 (dark start, locked `ls`, `mv lantern ~`, seven steps) | `verify-chapter.mjs` PASS |
| 5 tasks.md | ticked | |
| 6 Baselines | still a person's call: every play baseline predates the strip and the dark level 1 | not touched |

Also changed: the dark start is darker (`DARK_DEF.dark` 0.93 -> 1.4 in `src/renderer/stage-light.ts`; the room is near black, the terminal glow lights him). Gates run: `npm run quality` (exit 0, 45 properties), `generate-chapter.mjs --verify` (11 levels, 0 deaths), `editor-unit-test.mjs`, `editor-smoke.mjs`, `terminal-lab.mjs --all` (29 labs), `terminal-lab-smoke.mjs`, `quality:fingerprint` runs; no change under `src/procgen`, `src/shaders` or `public/assets`.

Verdict after the re-check: PASS for requirements 1 to 9, except the visual-audit baselines, which a person approves.
