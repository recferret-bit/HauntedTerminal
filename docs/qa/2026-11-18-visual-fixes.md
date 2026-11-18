# QA 2026-11-18: visual fixes (second pass)

Branch: agent/visual-findings-fix (uncommitted working tree)  ·  Asked by: lead-dev  ·  Scope: re-run of the full visual audit after the glyph replacements (`src/ui/hud.ts`, `tutorial.ts`, `code-editor.ts`, `src/chapters/achievements.ts`, `src/game/kiro.ts`) and the SFX word move. `src/hub/waitlist.ts` was restored on purpose and is not judged.

## Verdict

FAIL (3 findings, none high)

Finding 1 (fallback fonts) is closed on every game screen: level-01, stats and the terminal text no longer have a `font-fallback` flag. The only fallback flags left are on the hub, and all three come from the landing page, which is the user's. Open: the 1024x768 layout problems (finding 2), the SFX word on a lock sprite at 1024x768 (finding 3), and the favicon 404 (finding 4, the user's). Counting only team-owned findings it is 2 findings; the verdict stays FAIL because findings 2 and 3 are not fixed.

## Checks run

| Command | Exit | Notes |
|---|---|---|
| node scripts/harness/visual-audit.mjs | 1 | full: 80 captures, 20 frame probes, 100 flags (111 in the previous pass, 157 before that), 600 s. Exit 1 = flags to explain |
| npm run quality | 0 | ends with `property-tests PASS: 35 properties, seed 20261117` |
| node scripts/harness/generate-chapter.mjs --verify | 0 | `checked [chapter-01-kiroween]: 11 levels, 0 error(s), 0 warning(s)`; `verified: 11 levels cleared, cmds=64, deaths=0` |

Not run: Chrome DevTools MCP (port 5173 belongs to another project, `/Users/ferretrec/work/reddit/vangame`; I did not start a 5174 server this pass, the audit starts its own page server), `haunted-forge` `validate_level` / `solve_level` (no level spec changed; `--verify` covers all 11), throttled trace (0 of 120 long frames on every probe, worst 16.8 ms), `--update` (forbidden).

## Visual audit

Frame timing: 0 long frames on all 20 probes, worst 16.8 ms. No `blank-frame`, `black-frame`, `horizontal-scroll`, `capture-*` or `not-ready` flag.

### Remaining font-fallback flags

| Screen | Family, glyphs | Element | Owner | Verdict |
|---|---|---|---|---|
| hub, all four sizes | `.SF NS`, 14 | `button.comic-btn.steam-cta` (`★ S...` wishlist, `data-open-waitlist`) | the user (`src/hub/waitlist.ts`, `pages/index.html`) | expected: restored on purpose |
| hub, all four sizes | Hiragino Sans, 4 | `a#hero-desktop-cta` (download arrow) | the user (`pages/index.html`) | expected |
| hub, all four sizes | Menlo, 319 | `span.tty-mini-line` (`$ ls -la → Lantern sweeps...`: the `→` drags the line into Menlo) | the user (`pages/index.html`) | expected |

Gone since last pass: level-01 (tutorial check mark), stats (`a#outro-wishlist`, `button#outro-export`, the `★` in the terminal text). I could not confirm which of the hub lines is in `pages/index.html` and which is built in `src/hub/hub.ts` (a grep with a pipe was refused by the shell fence); the `tty-mini-line` text may be built in `src/hub/` (lead-dev), so check that one before you call it the user's.

### Screens I opened

- `stats@1280x820.png`: the outro card. "Play Again" and "Export Save (.json)" are in Chakra Petch, aligned, readable. "* WISHLIST ON STEAM" shows a plain asterisk before the label, legible on the dark button. "HOME" is a light button of a different style than the other three (low: styling, not a bug). The terminal shows `[* ACHIEVEMENT UNLOCKED]` in the mono font, both lines wrap cleanly. Pass.
- `level-01@1280x820.png`: tutorial card (step 1/6, `TYPE ls`), bubble, HUD, terminal all clean; the card and lock label do not overlap at this size.
- `level-01@1280x820-film-1.png` (12 frames): the intro lettering "WHERE AM I?!" and "Kiro Ghost found you in the dark wires!" fades in and out, and the small bubble pops in at frame 2. That is the `jump` flag on level-01 motion: an intended entrance, no blank frame.
- Not opened this pass: other level stills, intro, dialogue, death-respawn, hub, laptop (judged from flags and diffs; the earlier pass opened them and their pictures only moved where listed below).

**Tutorial stamp: not checked.** The stamp (`<i>OK</i> DONE`, `src/ui/tutorial.ts` line 45) shows for a short time after the player types the step's command. No audit still catches it and I did not play step 1 in a browser this pass. The code change is `✓DONE` to `OK DONE`; `font-fallback` no longer flags level-01, but that detector may not see a hidden element. Someone should type `ls` on level-01 and look at the stamp.

### Every baseline diff

| Screen @ size | Changed px | Verdict | Reason |
|---|---|---|---|
| level-04 @1600x950 / @1280x820 / @1024x768 | 33,697 / 27,933 / 25,796 | intended | same as the last pass: bubble moved and re-flowed under the HUD buttons |
| dialogue @ all four sizes | 1.7 to 3.7% | intended | same: the long bubble now clear of the HUD |
| death-respawn @ all four sizes | 1.2 to 4.5% | intended, with finding 3 | SSD line once, "COREDUMP!" at its new place |
| intro-late @ all four sizes | 9,809 at 1600x950, 0.5 to 0.7% | intended | meme labels in Chakra Petch instead of Impact |
| stats @1600x950 / @1280x820 / @1920x1080 | 13,838 (1.3%) / 13,906 (0.7%) / 14,153 (1.8%) | intended | new this pass: the outro buttons lost `★` and `⬇` and the terminal lines lost the star; the picture agrees (buttons "* WISHLIST ON STEAM", "Export Save (.json)", `[* ACHIEVEMENT...]`) |
| stats @1024x768 | log: `diff`; summary entry: `same`, 158 px | not clear | the progress log lists this size as a diff flag but the summary says `same` with 158 px. I did not open `stats@1024x768-diff.png`; treat as unchecked and look before approving |
| level-01, hub, damage, boss-fight, level-02..11, laptop | `same` | none | |

I judge diffs from the images; I did not create or touch baselines.

### Other flags

| Screen @ size | Flag | Verdict | Reason or finding # |
|---|---|---|---|
| level-01..11, dialogue, damage, death-respawn, boss-fight, stats @1600x950 and @1024x768 | text-overflow `#terminal-panel` (3 px at 1600, 21 px at 1024) | expected | last xterm row at the panel edge, as in the earlier reports |
| level-01..11 @1024x768 | text-overflow `#stage-caption` | finding | 2 |
| level-01 @1024x768 | overlap tutorial card over `.st-lock` | finding | 2 |
| level-04, 07, 10, dialogue @1024x768 | overlap `#masthead` over `#hud` | finding | 2 |
| level-07 @1024x768 | text-overflow `.st-ncard.locked > span.lb` | finding | 2 |
| hub @1024x768 | text-overflow x3 `span.tty-mini-line` | finding | 2 (hub, see the owner note above) |
| laptop, all sizes | text-overflow `.lt-screen`, `.lt-taskbtns` | expected | scrolling quest list, truncated taskbar label by design |
| intro-early, intro-late, all sizes | console-error + request-failed (`/favicon.ico` 404) | finding | 4 |
| stats motion | jump x3 | expected | SIGKILL burst and the switch to RANK S, stepped 12 fps |
| level-01 motion | jump | expected | intro lettering and bubble entrance (film strip opened) |

## Findings

| # | Severity | Feature | Owner | What happens | How to reproduce |
|---|---|---|---|---|---|
| 1 | closed | fonts | - | Fixed on level-01, stats and the terminal text. Only the user's landing page still falls back (table above). | - |
| 2 | medium | layout at 1024x768 | lead-dev (`src/play`, `src/styles`) | Unchanged: `#stage-caption` cut on all 11 levels, `#masthead` overlaps `#hud` on levels 04, 07, 10 and dialogue, tutorial card overlaps `.st-lock` on level 01, "sector_docker_fo…" truncated on level 07, hub `.tty-mini-line` overflows. | audit `--sizes 1024x768` |
| 3 | low | SFX word on death card | artist (`src/renderer/stage-avoid.ts`) | Unchanged from the last pass: at 1024x768 "COREDUMP!" covers the left padlock sprite. I did not re-open `death-respawn@1024x768.png` this pass; the pixel diff is the only evidence it moved. | audit `death-respawn` @1024x768 |
| 4 | low | favicon | the user (`pages/`) | `/favicon.ico` 404 on the comix player, 8 captures. | open `/cinematic.html` |

Open question, not filed: intro-late at 1280x820 has an empty paper area in the lower half (see the earlier report); `comix-designer` should confirm if it is layout or capture time.

## Baselines that need the user's approval

I ran no `--update` and touched nothing in `docs/qa/baselines/`. Ready to approve, after you look at `scripts/harness/out/visual/`:

- `level-04@1600x950`, `level-04@1280x820`, `level-04@1024x768`
- `dialogue@1600x950`, `dialogue@1280x820`, `dialogue@1920x1080`, `dialogue@1024x768`
- `intro-late@1600x950`, `intro-late@1280x820`, `intro-late@1920x1080`, `intro-late@1024x768`
- `stats@1600x950`, `stats@1280x820`, `stats@1920x1080` (new this pass)
- `death-respawn@1600x950`, `@1280x820`, `@1920x1080`, `@1024x768`: approve after finding 3 is settled if you want the 1024 word position final
- `stats@1024x768`: only after someone opens its diff image (summary and log disagree)

Do not approve `hub`: it has no diff and its font fallbacks are the user's.
